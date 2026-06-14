import { constants } from "node:fs";
import { access, readdir, rmdir } from "node:fs/promises";
import path from "node:path";

import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

// Startup reconciliation for on-disk performance files left inconsistent by an interrupted
// (force-quit) archive move. Two NON-DESTRUCTIVE-to-data reconciliations only:
//   1. SURFACE — an in-use (is_effective = 1) approved record whose source workbook has vanished.
//      It is reported through the startup recovery banner so the missing month stops silently
//      reading 0 minutes. Nothing is deleted; the database/approval/pay records are untouched.
//   2. TIDY — empty directories left behind by an interrupted move are removed.
// We deliberately do NOT auto-delete "leftover" pending workbooks: a (basename + size) heuristic
// cannot tell a true crash-leftover from a legitimate freshly-dropped file, and deleting a real
// submission in a payroll system is unacceptable. A stray cross-volume leftover is simply
// re-processed by the normal sync, exactly as before this service existed.

export interface OrphanPerformanceFileHealingSummary {
  missingEffectiveSourceCount: number;
  removedEmptyDirectoryCount: number;
  issueMessages: string[];
}

const pathExists = async (target: string) => {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

// readdir(withFileTypes) but never throws — a missing directory simply yields no entries.
const readDirectoryEntries = async (dir: string) => {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
};

// Removes empty directories beneath (but never including) `root`. Returns how many were removed.
// Symlinked directories are treated as content and never followed, so a symlink cycle cannot drive
// the recursion (which would otherwise hang startup).
const removeEmptyDirectories = async (root: string): Promise<number> => {
  let removed = 0;

  // Returns true when `dir` ends up empty AND was removed.
  const walk = async (dir: string, isRoot: boolean): Promise<boolean> => {
    const entries = await readDirectoryEntries(dir);

    if (!entries) {
      return false; // unreadable — treat as non-empty and leave it alone
    }

    let hasRemainingChild = false;

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        const becameEmpty = await walk(path.join(dir, entry.name), false);
        if (!becameEmpty) {
          hasRemainingChild = true;
        }
      } else {
        // Files (and symlinks, which we never follow or remove) count as remaining content.
        hasRemainingChild = true;
      }
    }

    if (!isRoot && !hasRemainingChild) {
      try {
        await rmdir(dir);
        removed += 1;
        return true;
      } catch {
        return false;
      }
    }

    return false;
  };

  await walk(root, true);
  return removed;
};

export const healOrphanPerformanceFiles = async (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
  pendingDir?: string;
  approvedDir?: string;
}): Promise<OrphanPerformanceFileHealingSummary> => {
  const summary: OrphanPerformanceFileHealingSummary = {
    missingEffectiveSourceCount: 0,
    removedEmptyDirectoryCount: 0,
    issueMessages: []
  };
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return summary;
  }

  // Never throw: a failure here must not prevent the startup recovery status from being recorded
  // (that status is the user's only window into unrecovered months).
  try {
    const settings =
      input.pendingDir && input.approvedDir
        ? { pendingDir: input.pendingDir, approvedDir: input.approvedDir }
        : getStoredAppSettingsSnapshot({ userDataPath: input.userDataPath, env: input.env });
    const pendingDir = path.resolve(settings.pendingDir);
    const approvedDir = path.resolve(settings.approvedDir);

    // 1) SURFACE: in-use approved records whose source workbook is missing on disk.
    const effectiveRows = database
      .prepare(
        `SELECT id, file_name, file_path, schedule_month, site_name
         FROM performance_files
         WHERE directory_type = 'approved' AND status = 'approved' AND is_effective = 1`
      )
      .all() as Array<{
      id: string;
      file_name: string;
      file_path: string | null;
      schedule_month: string | null;
      site_name: string | null;
    }>;

    for (const row of effectiveRows) {
      if (!row.file_path) {
        continue;
      }

      if (!(await pathExists(row.file_path))) {
        summary.missingEffectiveSourceCount += 1;
        const label = [row.site_name?.trim() || row.file_name, row.schedule_month?.trim()]
          .filter(Boolean)
          .join(" ");
        summary.issueMessages.push(
          `승인완료본의 원본 파일을 찾을 수 없습니다: ${label}. 해당 실적의 원본 엑셀을 다시 넣어 주세요.`
        );
      }
    }

    // 2) TIDY: empty directories left by an interrupted move.
    summary.removedEmptyDirectoryCount =
      (await removeEmptyDirectories(approvedDir)) + (await removeEmptyDirectories(pendingDir));
  } catch {
    summary.issueMessages.push(
      "실적 원본 파일 점검 중 문제가 발생해 일부 점검을 건너뛰었습니다."
    );
  }

  return summary;
};
