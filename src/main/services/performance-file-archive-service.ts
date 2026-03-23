import { access, copyFile, mkdir, rename, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

import type { PerformanceFileDetail } from "../../shared/domain/performance-file";
import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";

const sanitizeFileSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "_");

const normalizeMonthLabel = (month: number) => `${month}월`;

const resolveArchiveYearMonth = (input: {
  scheduleMonth?: string;
  fileName?: string;
  receivedAt?: string;
}) => {
  if (input.scheduleMonth) {
    const matched = input.scheduleMonth.match(/^(\d{4})-(\d{1,2})$/);

    if (matched) {
      const month = Number(matched[2]);

      if (month >= 1 && month <= 12) {
        return {
          yearLabel: `${matched[1]}년`,
          monthLabel: normalizeMonthLabel(month)
        };
      }
    }
  }

  if (input.fileName) {
    const matched = path.basename(input.fileName).match(/(20\d{2})[.\-_/년\s]*([01]?\d)/);

    if (matched) {
      const month = Number(matched[2]);

      if (month >= 1 && month <= 12) {
        return {
          yearLabel: `${matched[1]}년`,
          monthLabel: normalizeMonthLabel(month)
        };
      }
    }
  }

  if (input.receivedAt) {
    const receivedDate = new Date(input.receivedAt);

    if (!Number.isNaN(receivedDate.getTime())) {
      return {
        yearLabel: `${receivedDate.getFullYear()}년`,
        monthLabel: normalizeMonthLabel(receivedDate.getMonth() + 1)
      };
    }
  }

  return null;
};

export const buildApprovedPerformanceArchiveDirectory = (
  approvedDir: string,
  input: {
    scheduleMonth?: string;
    fileName?: string;
    receivedAt?: string;
  }
) => {
  const resolved = resolveArchiveYearMonth(input);

  if (!resolved) {
    return path.resolve(approvedDir, "misc");
  }

  return path.resolve(approvedDir, resolved.yearLabel, resolved.monthLabel);
};

const buildDuplicatePath = (directoryPath: string, fileName: string, duplicateIndex: number) => {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);

  return path.resolve(
    directoryPath,
    `${baseName}_dup${String(duplicateIndex).padStart(2, "0")}${extension}`
  );
};

const pathExists = async (targetPath: string) => {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const moveFile = async (sourcePath: string, targetPath: string) => {
  try {
    await rename(sourcePath, targetPath);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EXDEV") {
      throw error;
    }

    await copyFile(sourcePath, targetPath, constants.COPYFILE_EXCL);
    await unlink(sourcePath);
  }
};

export const archiveApprovedPerformanceFile = async (input: {
  detail: PerformanceFileDetail;
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
  outputDir?: string;
}) => {
  const settings = getStoredAppSettingsSnapshot({
    userDataPath: input.userDataPath,
    env: input.env
  });
  const outputDir =
    input.outputDir ??
    buildApprovedPerformanceArchiveDirectory(settings.approvedDir, {
      scheduleMonth: input.detail.scheduleMonth || input.detail.entries[0]?.workDate.slice(0, 7),
      fileName: input.detail.fileName,
      receivedAt: input.detail.receivedAt
    });

  await mkdir(outputDir, { recursive: true });

  const baseFileName = sanitizeFileSegment(path.basename(input.detail.filePath));
  let archivedPath = path.resolve(outputDir, baseFileName);
  let duplicateIndex = 1;

  while (await pathExists(archivedPath)) {
    if (archivedPath.toLowerCase() === input.detail.filePath.toLowerCase()) {
      break;
    }

    archivedPath = buildDuplicatePath(outputDir, baseFileName, duplicateIndex);
    duplicateIndex += 1;
  }

  if (archivedPath.toLowerCase() !== input.detail.filePath.toLowerCase()) {
    await moveFile(input.detail.filePath, archivedPath);
  }

  return {
    archivedFileName: path.basename(archivedPath),
    archivedFilePath: archivedPath
  };
};
