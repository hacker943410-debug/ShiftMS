import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { parseReleaseManifestText } = require("./lib/release-publish-helpers.cjs");

const projectRoot = process.cwd();
const packageJsonPath = path.resolve(projectRoot, "package.json");
const maxReleaseSummaryLength = 220;
const maxReleaseNoteLength = 120;
const maxReleaseItemDetailLength = 240;

const requiredFiles = [
  ".env.example",
  "dist/index.html",
  "dist-electron/main/main.js",
  "package.json",
  "dev-app-update.yml"
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
  packageJsonText = readFileSync(packageJsonPath, "utf8");
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

const releaseManifestPath = path.resolve(
  projectRoot,
  "artifacts",
  "releases",
  `v${packageJson.version}`,
  "RELEASE_MANIFEST.json"
);

if (!existsSync(releaseManifestPath)) {
  console.error(`RELEASE_CHECK_FAILED releaseManifest=${releaseManifestPath}`);
  process.exit(1);
}

let releaseManifest = null;

try {
  releaseManifest = parseReleaseManifestText(readFileSync(releaseManifestPath, "utf8"));
} catch (error) {
  console.error(
    `RELEASE_CHECK_FAILED releaseManifest=parse message=${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exit(1);
}

if ((releaseManifest.summary?.length ?? 0) > maxReleaseSummaryLength) {
  console.error(
    `RELEASE_CHECK_FAILED releaseManifestSummary=tooLong length=${releaseManifest.summary.length} max=${maxReleaseSummaryLength}`
  );
  process.exit(1);
}

if (!releaseManifest.sections || releaseManifest.sections.length === 0) {
  console.error("RELEASE_CHECK_FAILED releaseManifestSections=missing");
  process.exit(1);
}

const numberedNote = releaseManifest.notes.find((note) => /^\d+\./.test(note));

if (numberedNote) {
  console.error("RELEASE_CHECK_FAILED releaseManifestNotes=numbered");
  process.exit(1);
}

const longNote = releaseManifest.notes.find((note) => note.length > maxReleaseNoteLength);

if (longNote) {
  console.error(
    `RELEASE_CHECK_FAILED releaseManifestNote=tooLong length=${longNote.length} max=${maxReleaseNoteLength}`
  );
  process.exit(1);
}

const longSectionItem = releaseManifest.sections
  .flatMap((section) => section.items ?? [])
  .find((item) => (item.detail?.length ?? 0) > maxReleaseItemDetailLength);

if (longSectionItem) {
  console.error(
    `RELEASE_CHECK_FAILED releaseManifestItemDetail=tooLong title=${longSectionItem.title} length=${longSectionItem.detail?.length} max=${maxReleaseItemDetailLength}`
  );
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
