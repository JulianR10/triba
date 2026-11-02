import { createRequire } from "module";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const zipPath = resolve(root, "triba-app.zip");

// Check if zip exists
if (!existsSync(zipPath)) {
  console.error("triba-app.zip not found. Run git archive first.");
  process.exit(1);
}

// We need to use adm-zip or a similar library to append to existing zip
// Let's use a workaround: unzip, add file, rezip

const { execSync } = require("child_process");

// Extract the zip to temp dir
const tmpDir = resolve(root, ".tmp-zip");
execSync(`powershell -Command "Remove-Item -Path '${tmpDir}' -Recurse -Force -ErrorAction SilentlyContinue; New-Item -Path '${tmpDir}' -ItemType Directory -Force | Out-Null"`);
execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tmpDir}' -Force"`);

// Copy .env into the extracted dir
execSync(`copy ".env" "${tmpDir}\\.env"`);

// Remove the old zip
execSync(`del "${zipPath}"`);

// Re-zip everything from temp dir
execSync(`powershell -Command "Compress-Archive -Path '${tmpDir}\\*' -DestinationPath '${zipPath}' -Force"`);

// Clean up temp dir
execSync(`powershell -Command "Remove-Item -Path '${tmpDir}' -Recurse -Force -ErrorAction SilentlyContinue"`);

console.log(".env added to triba-app.zip");
