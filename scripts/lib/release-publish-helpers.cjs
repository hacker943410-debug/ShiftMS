const fs = require("node:fs");
const path = require("node:path");

const RELEASE_MANIFEST_ASSET_NAME = "RELEASE_MANIFEST.json";

const buildReleaseTag = (version) => `v${String(version ?? "").trim()}`;

const parseReleaseManifestText = (text) => {
  const parsed = JSON.parse(text);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("RELEASE_MANIFEST.json 형식이 올바르지 않습니다.");
  }

  const version = String(parsed.version ?? "").trim();
  const headline = String(parsed.headline ?? "").trim();
  const publishedAt = String(parsed.publishedAt ?? "").trim();
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.map((note) => String(note).trim()).filter(Boolean)
    : [];

  if (!version || !headline || !publishedAt) {
    throw new Error("RELEASE_MANIFEST.json 필수 필드가 누락되었습니다.");
  }

  return {
    version,
    required: Boolean(parsed.required),
    headline,
    notes,
    requiresDbBackup: Boolean(parsed.requiresDbBackup),
    publishedAt
  };
};

const resolveReleasePublishContext = (projectRoot) => {
  const packageJsonPath = path.resolve(projectRoot, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error("package.json을 찾을 수 없습니다.");
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const version = String(packageJson.version ?? "").trim();

  if (!version) {
    throw new Error("package.json 버전을 확인하지 못했습니다.");
  }

  const releaseDir = path.resolve(projectRoot, "artifacts", "releases", `v${version}`);
  const releaseDocPath = path.resolve(projectRoot, "docs", `release-${version}.md`);
  const releaseManifestPath = path.resolve(releaseDir, RELEASE_MANIFEST_ASSET_NAME);

  if (!fs.existsSync(releaseDir)) {
    throw new Error(`릴리즈 폴더를 찾을 수 없습니다: ${releaseDir}`);
  }

  if (!fs.existsSync(releaseDocPath)) {
    throw new Error(`릴리즈 문서를 찾을 수 없습니다: ${releaseDocPath}`);
  }

  if (!fs.existsSync(releaseManifestPath)) {
    throw new Error(`릴리즈 매니페스트를 찾을 수 없습니다: ${releaseManifestPath}`);
  }

  const releaseBody = fs.readFileSync(releaseDocPath, "utf8");
  const manifestText = fs.readFileSync(releaseManifestPath, "utf8");
  const manifest = parseReleaseManifestText(manifestText);

  if (manifest.version !== version) {
    throw new Error(
      `RELEASE_MANIFEST.json 버전(${manifest.version})과 package.json 버전(${version})이 다릅니다.`
    );
  }

  return {
    version,
    tagName: buildReleaseTag(version),
    releaseDir,
    releaseDocPath,
    releaseBody,
    releaseManifestPath,
    releaseManifestText: `${JSON.stringify(manifest, null, 2)}\n`,
    releaseManifest: manifest,
    releaseManifestAssetName: RELEASE_MANIFEST_ASSET_NAME
  };
};

module.exports = {
  RELEASE_MANIFEST_ASSET_NAME,
  buildReleaseTag,
  parseReleaseManifestText,
  resolveReleasePublishContext
};
