const fs = require("node:fs");
const path = require("node:path");

const RELEASE_MANIFEST_ASSET_NAME = "RELEASE_MANIFEST.json";

const buildReleaseTag = (version) => `v${String(version ?? "").trim()}`;

const normalizeString = (value) => String(value ?? "").trim();

const parseChangeItem = (value) => {
  if (typeof value === "string") {
    const title = normalizeString(value);
    return title ? { title } : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const title = normalizeString(value.title);
  const detail = normalizeString(value.detail);

  if (!title) {
    return null;
  }

  return detail ? { title, detail } : { title };
};

const parseTable = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const columns = Array.isArray(value.columns)
    ? value.columns.map((column) => normalizeString(column)).filter(Boolean)
    : [];
  const rows = Array.isArray(value.rows)
    ? value.rows
        .map((row) => (Array.isArray(row) ? row.map((cell) => normalizeString(cell)) : []))
        .filter((row) => row.length > 0)
    : [];
  const title = normalizeString(value.title);

  if (columns.length === 0 || rows.length === 0) {
    return null;
  }

  return {
    title: title || undefined,
    columns,
    rows
  };
};

const parseSection = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const title = normalizeString(value.title);
  const description = normalizeString(value.description);
  const items = Array.isArray(value.items)
    ? value.items.map((item) => parseChangeItem(item)).filter(Boolean)
    : [];
  const tables = Array.isArray(value.tables)
    ? value.tables.map((table) => parseTable(table)).filter(Boolean)
    : [];

  if (!title || (description.length === 0 && items.length === 0 && tables.length === 0)) {
    return null;
  }

  return {
    title,
    description: description || undefined,
    items: items.length > 0 ? items : undefined,
    tables: tables.length > 0 ? tables : undefined
  };
};

const parseReleaseManifestText = (text) => {
  const parsed = JSON.parse(text);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("RELEASE_MANIFEST.json 형식이 올바르지 않습니다.");
  }

  const version = normalizeString(parsed.version);
  const headline = normalizeString(parsed.headline);
  const summary = normalizeString(parsed.summary);
  const publishedAt = normalizeString(parsed.publishedAt);
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.map((note) => normalizeString(note)).filter(Boolean)
    : [];
  const sections = Array.isArray(parsed.sections)
    ? parsed.sections.map((section) => parseSection(section)).filter(Boolean)
    : [];

  if (!version || !headline || !publishedAt) {
    throw new Error("RELEASE_MANIFEST.json 필수 필드가 누락되었습니다.");
  }

  return {
    version,
    required: Boolean(parsed.required),
    headline,
    summary: summary || undefined,
    notes,
    sections: sections.length > 0 ? sections : undefined,
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
