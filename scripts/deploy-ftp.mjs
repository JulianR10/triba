import { Client } from "basic-ftp";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf-8")
      .split("\n")
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("#"))
      .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
  );
}

const env = loadEnv();

const config = {
  host: env.FTP_HOST || "72.60.93.159",
  user: env.FTP_USER || "u518395272",
  password: env.FTP_PASSWORD || "",
  appDir: env.FTP_APP_DIR || "triba",
};

if (!config.password) {
  console.error("Falta FTP_PASSWORD en .env");
  process.exit(1);
}

const localDist = resolve(root, "dist");
if (!existsSync(localDist)) {
  console.error("No existe dist/. Ejecutá: npm run build");
  process.exit(1);
}

const client = new Client();
client.ftp.verbose = false;

try {
  await client.access({
    host: config.host,
    user: config.user,
    password: config.password,
    secure: false,
  });

  console.log(`Conectado — subiendo a ~/${config.appDir}`);

  await client.ensureDir(config.appDir);
  await client.clearWorkingDir();
  await client.uploadFromDir(localDist);

  console.log("✅ Deploy completado");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  client.close();
}
