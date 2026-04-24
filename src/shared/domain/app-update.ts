export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export interface ReleaseManifestChangeItem {
  title: string;
  detail?: string;
}

export interface ReleaseManifestTable {
  title?: string;
  columns: string[];
  rows: string[][];
}

export interface ReleaseManifestSection {
  title: string;
  description?: string;
  items?: ReleaseManifestChangeItem[];
  tables?: ReleaseManifestTable[];
}

export interface ReleaseManifest {
  version: string;
  required: boolean;
  headline: string;
  summary?: string;
  notes: string[];
  sections?: ReleaseManifestSection[];
  requiresDbBackup: boolean;
  publishedAt: string;
}

export interface ReleaseNotesBundle {
  fromVersion?: string | null;
  toVersion: string;
  manifests: ReleaseManifest[];
}

export interface UpdateStateSnapshot {
  enabled: boolean;
  status: AppUpdateStatus;
  currentVersion: string;
  targetVersion?: string;
  downloadProgress?: number;
  required?: boolean;
  headline?: string;
  errorMessage?: string;
  checkedAt?: string;
  availableManifest?: ReleaseManifest | null;
  releaseNotesToShow?: ReleaseNotesBundle | null;
}

const parseVersionSegments = (version: string) =>
  version
    .trim()
    .split(/[.-]/)
    .map((segment) => Number.parseInt(segment, 10))
    .filter((segment) => Number.isFinite(segment));

export const compareAppVersions = (left: string, right: string) => {
  const leftSegments = parseVersionSegments(left);
  const rightSegments = parseVersionSegments(right);
  const maxLength = Math.max(leftSegments.length, rightSegments.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftSegments[index] ?? 0;
    const rightValue = rightSegments[index] ?? 0;

    if (leftValue === rightValue) {
      continue;
    }

    return leftValue > rightValue ? 1 : -1;
  }

  return 0;
};

export const isAppVersionNewer = (candidate: string, baseline?: string | null) =>
  compareAppVersions(candidate, baseline ?? "0.0.0") > 0;

const normalizeReleaseText = (value: string) => value.trim();

export const getReleaseManifestSections = (manifest: ReleaseManifest): ReleaseManifestSection[] => {
  if (Array.isArray(manifest.sections) && manifest.sections.length > 0) {
    return manifest.sections;
  }

  if (manifest.notes.length === 0) {
    return [];
  }

  return [
    {
      title: "이번 버전에서 달라진 점",
      items: manifest.notes.map((note) => ({
        title: note
      }))
    }
  ];
};

const collectReleaseManifestItemTexts = (manifest: ReleaseManifest) =>
  getReleaseManifestSections(manifest).flatMap((section) =>
    (section.items ?? []).map((item) =>
      item.detail ? `${normalizeReleaseText(item.title)} ${normalizeReleaseText(item.detail)}` : item.title
    )
  );

export const getReleaseManifestPreviewNotes = (manifest: ReleaseManifest, limit = 3) => {
  const collected = collectReleaseManifestItemTexts(manifest);

  if (collected.length > 0) {
    return collected.slice(0, limit);
  }

  if (manifest.summary) {
    return [manifest.summary];
  }

  return manifest.notes.slice(0, limit);
};

export const buildReleaseManifestSearchText = (manifest: ReleaseManifest) => {
  const sectionTexts = getReleaseManifestSections(manifest).flatMap((section) => [
    section.title,
    section.description ?? "",
    ...(section.items ?? []).flatMap((item) => [item.title, item.detail ?? ""]),
    ...(section.tables ?? []).flatMap((table) => [
      table.title ?? "",
      ...table.columns,
      ...table.rows.flat()
    ])
  ]);

  return [
    manifest.version,
    manifest.headline,
    manifest.summary ?? "",
    ...manifest.notes,
    ...sectionTexts
  ]
    .map((item) => normalizeReleaseText(item))
    .filter((item) => item.length > 0)
    .join(" ");
};

export const normalizeReleaseSearchText = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
