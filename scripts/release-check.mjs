import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

const requiredFiles = [
  ".env.example",
  "dist/index.html",
  "dist-electron/main/main.js",
  "package.json"
];

const missingFiles = requiredFiles.filter((filePath) => !existsSync(path.resolve(projectRoot, filePath)));

if (missingFiles.length > 0) {
  console.error(`RELEASE_CHECK_FAILED missing=${missingFiles.join(", ")}`);
  process.exit(1);
}

const requiredEnvKeys = [
  "APP_NAME",
  "HOLIDAY_API_BASE_URL",
  "DATA_DIR",
  "WATCH_PENDING_DIR",
  "WATCH_APPROVED_DIR"
];

let envExampleText = null;

try {
  envExampleText = readFileSync(path.resolve(projectRoot, ".env.example"), "utf8");
} catch {
  envExampleText = null;
}

if (!envExampleText) {
  console.error("RELEASE_CHECK_FAILED env=.env.example");
  process.exit(1);
}

const missingEnvKeys = requiredEnvKeys.filter((key) => !envExampleText.includes(`${key}=`));

if (missingEnvKeys.length > 0) {
  console.error(`RELEASE_CHECK_FAILED envKeys=${missingEnvKeys.join(", ")}`);
  process.exit(1);
}

console.log("RELEASE_CHECK_OK");
