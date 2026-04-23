export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export interface ReleaseManifest {
  version: string;
  required: boolean;
  headline: string;
  notes: string[];
  requiresDbBackup: boolean;
  publishedAt: string;
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
  releaseNotesToShow?: ReleaseManifest | null;
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
