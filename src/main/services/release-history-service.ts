import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ReleaseHistoryListQuery } from "../../shared/bridge/contracts";
import type {
  ReleaseManifest,
  ReleaseManifestChangeItem,
  ReleaseManifestSection,
  ReleaseManifestTable
} from "../../shared/domain/app-update";
import {
  buildReleaseManifestSearchText,
  compareAppVersions,
  normalizeReleaseSearchText
} from "../../shared/domain/app-update";

const RELEASE_MANIFEST_FILE_NAME = "RELEASE_MANIFEST.json";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getProcessResourcesPath = () => {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return typeof resourcesPath === "string" && resourcesPath.trim().length > 0
    ? resourcesPath
    : undefined;
};

const listReleaseHistoryRootCandidates = () => {
  const resourcesPath = getProcessResourcesPath();

  return [
    resourcesPath ? path.resolve(resourcesPath, "release-history") : undefined,
    path.resolve(process.cwd(), "release-history"),
    path.resolve(process.cwd(), "artifacts", "releases")
  ].filter((candidate): candidate is string => Boolean(candidate));
};

const normalizeString = (value: unknown) => String(value ?? "").trim();

const parseReleaseManifestChangeItem = (value: unknown): ReleaseManifestChangeItem | null => {
  if (typeof value === "string") {
    const title = normalizeString(value);
    return title ? { title } : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const title = normalizeString(value.title);
  const detail = normalizeString(value.detail);

  if (!title) {
    return null;
  }

  return detail ? { title, detail } : { title };
};

const parseReleaseManifestTable = (value: unknown): ReleaseManifestTable | null => {
  if (!isRecord(value)) {
    return null;
  }

  const columns = Array.isArray(value.columns)
    ? value.columns.map((column) => normalizeString(column)).filter((column) => column.length > 0)
    : [];
  const rows = Array.isArray(value.rows)
    ? value.rows
        .map((row) =>
          Array.isArray(row)
            ? row.map((cell) => normalizeString(cell))
            : []
        )
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

const parseReleaseManifestSection = (value: unknown): ReleaseManifestSection | null => {
  if (!isRecord(value)) {
    return null;
  }

  const title = normalizeString(value.title);
  const description = normalizeString(value.description);
  const items = Array.isArray(value.items)
    ? value.items
        .map((item) => parseReleaseManifestChangeItem(item))
        .filter((item): item is ReleaseManifestChangeItem => item !== null)
    : [];
  const tables = Array.isArray(value.tables)
    ? value.tables
        .map((table) => parseReleaseManifestTable(table))
        .filter((table): table is ReleaseManifestTable => table !== null)
    : [];

  if (!title || (items.length === 0 && tables.length === 0 && description.length === 0)) {
    return null;
  }

  return {
    title,
    description: description || undefined,
    items: items.length > 0 ? items : undefined,
    tables: tables.length > 0 ? tables : undefined
  };
};

export const parseReleaseManifest = (value: unknown): ReleaseManifest | null => {
  if (!isRecord(value)) {
    return null;
  }

  const version = normalizeString(value.version);
  const headline = normalizeString(value.headline);
  const summary = normalizeString(value.summary);
  const publishedAt = normalizeString(value.publishedAt);
  const notes = Array.isArray(value.notes)
    ? value.notes.map((note) => normalizeString(note)).filter((note) => note.length > 0)
    : [];
  const sections = Array.isArray(value.sections)
    ? value.sections
        .map((section) => parseReleaseManifestSection(section))
        .filter((section): section is ReleaseManifestSection => section !== null)
    : [];

  if (!version || !headline || !publishedAt) {
    return null;
  }

  return {
    version,
    required: Boolean(value.required),
    headline,
    summary: summary || undefined,
    notes,
    sections: sections.length > 0 ? sections : undefined,
    requiresDbBackup: Boolean(value.requiresDbBackup),
    publishedAt
  };
};

const listReleaseManifestPathsFromRoot = (rootPath: string) => {
  if (!existsSync(rootPath)) {
    return [];
  }

  return readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("v"))
    .map((entry) => path.resolve(rootPath, entry.name, RELEASE_MANIFEST_FILE_NAME))
    .filter((candidatePath) => existsSync(candidatePath));
};

const readReleaseManifestFromFile = (filePath: string) => {
  try {
    const fileText = readFileSync(filePath, "utf8");
    return parseReleaseManifest(JSON.parse(fileText));
  } catch {
    return null;
  }
};

const sortReleaseManifestsDescending = (manifests: ReleaseManifest[]) =>
  [...manifests].sort((left, right) => compareAppVersions(right.version, left.version));

const sortReleaseManifestsAscending = (manifests: ReleaseManifest[]) =>
  [...manifests].sort((left, right) => compareAppVersions(left.version, right.version));

export const listBundledReleaseManifests = () => {
  const manifestMap = new Map<string, ReleaseManifest>();

  for (const rootPath of listReleaseHistoryRootCandidates()) {
    for (const manifestPath of listReleaseManifestPathsFromRoot(rootPath)) {
      const manifest = readReleaseManifestFromFile(manifestPath);

      if (!manifest || manifestMap.has(manifest.version)) {
        continue;
      }

      manifestMap.set(manifest.version, manifest);
    }
  }

  return sortReleaseManifestsDescending(Array.from(manifestMap.values()));
};

const matchesRequiredFilter = (
  manifest: ReleaseManifest,
  requiredFilter: ReleaseHistoryListQuery["requiredFilter"]
) => {
  if (!requiredFilter || requiredFilter === "all") {
    return true;
  }

  if (requiredFilter === "required") {
    return manifest.required;
  }

  return !manifest.required;
};

const matchesBackupFilter = (
  manifest: ReleaseManifest,
  backupFilter: ReleaseHistoryListQuery["backupFilter"]
) => {
  if (!backupFilter || backupFilter === "all") {
    return true;
  }

  if (backupFilter === "required") {
    return manifest.requiresDbBackup;
  }

  return !manifest.requiresDbBackup;
};

export const listReleaseHistory = (query?: ReleaseHistoryListQuery) => {
  const keyword = normalizeReleaseSearchText(query?.keyword ?? "");

  return listBundledReleaseManifests().filter((manifest) => {
    if (!matchesRequiredFilter(manifest, query?.requiredFilter)) {
      return false;
    }

    if (!matchesBackupFilter(manifest, query?.backupFilter)) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    return normalizeReleaseSearchText(buildReleaseManifestSearchText(manifest)).includes(keyword);
  });
};

export const listReleaseNotesBetweenVersions = (input: {
  currentVersion: string;
  lastSeenVersion?: string | null;
}) => {
  const allManifests = listBundledReleaseManifests();

  if (!input.lastSeenVersion) {
    const currentManifest = allManifests.find((manifest) => manifest.version === input.currentVersion);
    return currentManifest ? [currentManifest] : [];
  }

  return sortReleaseManifestsAscending(
    allManifests.filter(
      (manifest) =>
        compareAppVersions(manifest.version, input.lastSeenVersion ?? "0.0.0") > 0 &&
        compareAppVersions(manifest.version, input.currentVersion) <= 0
    )
  );
};
