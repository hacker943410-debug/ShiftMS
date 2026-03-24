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
let packageJsonText = null;

try {
  envExampleText = readFileSync(path.resolve(projectRoot, ".env.example"), "utf8");
} catch {
  envExampleText = null;
}

try {
  packageJsonText = readFileSync(path.resolve(projectRoot, "package.json"), "utf8");
} catch {
  packageJsonText = null;
}

if (!envExampleText) {
  console.error("RELEASE_CHECK_FAILED env=.env.example");
  process.exit(1);
}

if (!packageJsonText) {
  console.error("RELEASE_CHECK_FAILED package=package.json");
  process.exit(1);
}

let packageJson = null;

try {
  packageJson = JSON.parse(packageJsonText);
} catch {
  packageJson = null;
}

if (!packageJson) {
  console.error("RELEASE_CHECK_FAILED packageJson=parse");
  process.exit(1);
}

const missingEnvKeys = requiredEnvKeys.filter((key) => !envExampleText.includes(`${key}=`));

if (missingEnvKeys.length > 0) {
  console.error(`RELEASE_CHECK_FAILED envKeys=${missingEnvKeys.join(", ")}`);
  process.exit(1);
}

const requiredScripts = [
  "package:dir",
  "package:win",
  "release:package",
  "smoke:electron:operations-config",
  "smoke:electron:operations-migration",
  "smoke:electron:packaged",
  "smoke:electron:installer",
  "release:verify-package"
];
const missingScripts = requiredScripts.filter((scriptName) => !packageJson.scripts?.[scriptName]);

if (missingScripts.length > 0) {
  console.error(`RELEASE_CHECK_FAILED scripts=${missingScripts.join(", ")}`);
  process.exit(1);
}

if (packageJson.build?.directories?.output !== "release") {
  console.error("RELEASE_CHECK_FAILED buildOutput=release");
  process.exit(1);
}

const winTargets = Array.isArray(packageJson.build?.win?.target)
  ? packageJson.build.win.target
  : [];

if (!winTargets.includes("nsis")) {
  console.error("RELEASE_CHECK_FAILED winTarget=nsis");
  process.exit(1);
}

console.log("RELEASE_CHECK_OK");
