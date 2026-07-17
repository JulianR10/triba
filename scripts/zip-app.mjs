import { createWriteStream, existsSync, readFileSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const archiver = require("archiver");

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const zipPath = resolve(root, "triba-app.zip");

if (existsSync(zipPath)) unlinkSync(zipPath);

const output = createWriteStream(zipPath);
const archive = new archiver.Archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  console.log(`triba-app.zip creado (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
});

archive.pipe(output);

archive.directory(resolve(root, "src"), "src");
archive.directory(resolve(root, "public"), "public");
archive.directory(resolve(root, "scripts"), "scripts");

const rootFiles = [
  "package.json",
  "package-lock.json",
  "astro.config.mjs",
  "tailwind.config.mjs",
  "tsconfig.json",
  ".env.example",
];

for (const f of rootFiles) {
  const fp = resolve(root, f);
  if (existsSync(fp)) archive.file(fp, { name: f });
}

archive.finalize();
