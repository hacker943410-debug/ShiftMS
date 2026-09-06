import type { Stats } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type {
  PerformanceFileDetail,
  PerformanceFileSyncIssue,
  PerformanceFileSyncStateSnapshot
} from "../../shared/domain/performance-file";
import { isPoolSubstitutePerformanceEntry } from "../../shared/domain/performance-file";
import type { AppSettings } from "./app-settings-service";
import { inspectExcelTemplate } from "./excel-template-parser";
import { toFileWatchEvent } from "./file-watch-service";
import {
  createPerformanceFileMetadataRecord,
  updatePerformanceFileMetadataStatus
} from "./performance-file-metadata-service";
import {
  backfillPerformanceApprovalSnapshotSourceSignatures,
  getLatestPerformanceApprovalByFileId,
  getPerformanceApprovalHistoryByFileId,
  hasApprovedSnapshotMissingSourceSignature,
  rebaselinePerformanceApprovalSnapshotScheduleEntries
} from "./performance-approval-service";
import {
  deleteStoredPerformanceFileByPath,
  deleteStoredPerformanceFile,
  getStoredPerformanceFileDetail,
  getStoredPerformanceFileDetailByPath,
  isApprovedPerformanceSourceProtectedError,
  isUnreadPerformanceFileDetail,
  listStoredPerformanceFileDetails,
  upsertPerformanceFileDetail
} from "./performance-file-storage-service";
import { buildApprovedPerformanceArchiveDirectory } from "./performance-file-archive-service";
import { parseReturnedSchedulePerformanceFile } from "./schedule-return-performance-parser";
import { isSqliteStorageReady } from "./sqlite-storage-service";
import { getLatestAllowanceCalculationByApprovalId } from "./approved-allowance-calculation-service";

const supportedFileExtensions = new Set([".xlsx", ".xlsm", ".xls"]);
const fullPendingSyncParseLimit = 20;
// 파싱 사이의 인위적 지연을 없앤다(여러 사이트 재조회 시 체감 속도 향상). 0이면 대기는 즉시 반환된다.
// 정확성·파싱 결과에는 영향이 없으며, 향후 파일 감시 디바운스가 필요하면 이 값만 올리면 된다.
const performanceParsePaceDelayMs = 0;

let activePerformanceSyncId = 0;
let performanceFileSyncState: PerformanceFileSyncStateSnapshot = {
  status: "idle",
  totalCount: 0,
  processedCount: 0,
  parsedCount: 0,
  skippedCount: 0,
  issueCount: 0,
  message: ""
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "실적 파일 처리 중 오류가 발생했습니다.";

const normalizeFileId = (value: string) => value.split(path.sep).join("/");

// NOTE: the file id deliberately preserves the path's original case. Case-insensitive de-duplication
// of the SAME physical file (Report.xlsx vs report.xlsx on Windows) is handled at the lookup layer —
// getStoredPerformanceFileDetailByPath matches file_path COLLATE NOCASE and reuses the existing row's
// id — so an already-stored id is never recomputed. Lower-casing the id here instead would orphan
// rows created by older versions (whose ids are mixed-case) on the case-sensitive `WHERE id = ?`
// lookups, risking duplicate rows and lost is_effective flags on upgrade.
const createPerformanceFileId = (
  filePath: string,
  rootDir: string,
  modifiedTimeMs: number
) => {
  const relativePath = path.relative(rootDir, filePath);
  const versionToken = String(Math.trunc(modifiedTimeMs));

  if (!relativePath || relativePath.startsWith("..")) {
    return `${path.basename(filePath)}::${versionToken}`;
  }

  return `${normalizeFileId(relativePath)}::${versionToken}`;
};

const isSupportedPerformanceFile = (filePath: string) =>
  supportedFileExtensions.has(path.extname(filePath).toLowerCase()) &&
  !path.basename(filePath).startsWith("~$");

const splitScheduleMonth = (scheduleMonth?: string) => {
  const matched = scheduleMonth?.match(/^(\d{4})-(\d{2})$/);

  if (!matched) {
    return null;
  }

  return {
    year: matched[1],
    month: matched[2],
    monthNumber: Number(matched[2])
  };
};

const normalizeScheduleMonth = (year: string, month: string | number) =>
  `${year}-${String(Number(month)).padStart(2, "0")}`;

const inferScheduleMonthFromPath = (filePath: string, rootDir: string) => {
  const fileName = path.basename(filePath);
  const fileNameMatch = fileName.match(/^(\d{4})_(\d{1,2})_/);

  if (fileNameMatch) {
    return normalizeScheduleMonth(fileNameMatch[1]!, fileNameMatch[2]!);
  }

  const segments = path.relative(rootDir, filePath).split(path.sep);

  for (let index = 0; index < segments.length - 1; index += 1) {
    const yearMatch = segments[index]?.match(/^(\d{4})년$/);
    const monthMatch = segments[index + 1]?.match(/^(\d{1,2})월$/);

    if (yearMatch && monthMatch) {
      return normalizeScheduleMonth(yearMatch[1]!, monthMatch[1]!);
    }
  }

  return "";
};

const createDetail = (
  input: {
    metadata: Omit<
      PerformanceFileDetail,
      | "id"
      | "previewRows"
      | "entries"
      | "alerts"
      | "approvalHistory"
      | "latestApproval"
    >;
    fileId: string;
    previewRows: PerformanceFileDetail["previewRows"];
    entries: PerformanceFileDetail["entries"];
    alerts: PerformanceFileDetail["alerts"];
  }
): PerformanceFileDetail => ({
  ...input.metadata,
  id: input.fileId,
  previewRows: input.previewRows,
  entries: input.entries,
  alerts: input.alerts,
  approvalHistory: getPerformanceApprovalHistoryByFileId(input.fileId),
  latestApproval: getLatestPerformanceApprovalByFileId(input.fileId)
});

const resolvePendingDetailStatus = (input: {
  existingDetail: PerformanceFileDetail | null;
  existingPathDetail: PerformanceFileDetail | null;
  fallbackStatus: PerformanceFileDetail["status"];
}) =>
  hasRejectedAllowanceCalculationForApprovedDetail(input.existingDetail)
    ? "rejected"
    : input.existingDetail?.status === "rejected" || input.existingPathDetail?.status === "rejected"
    ? "rejected"
    : input.fallbackStatus;

const hasRejectedAllowanceCalculationForApprovedDetail = (detail: PerformanceFileDetail | null) =>
  detail?.directoryType === "approved" &&
  getPerformanceApprovalHistoryByFileId(detail.id).some(
    (approval) =>
      approval.decision === "approved" &&
      getLatestAllowanceCalculationByApprovalId(approval.id)?.status === "rejected"
  );

// A folder that is simply not there is an empty folder, and removing its stored rows is right.
// Anything else - permission denied, an offline share, a path that is no longer a folder - means
// the listing is unknown, not empty, and must never be read as "every file was deleted".
const isMissingPathError = (error: unknown) =>
  (error as NodeJS.ErrnoException | null)?.code === "ENOENT";

const readDirectoryEntries = async (directoryPath: string) => {
  try {
    return { entries: await readdir(directoryPath, { withFileTypes: true }), failed: false };
  } catch (error) {
    return { entries: [], failed: !isMissingPathError(error) };
  }
};

const listFilesRecursiveWithFailures = async (
  directoryPath: string
): Promise<{ files: string[]; failed: boolean }> => {
  const listing = await readDirectoryEntries(directoryPath);
  const files: string[] = [];
  let failed = listing.failed;

  for (const entry of listing.entries) {
    const resolvedPath = path.resolve(directoryPath, entry.name);

    if (entry.isDirectory()) {
      const nested = await listFilesRecursiveWithFailures(resolvedPath);

      files.push(...nested.files);
      failed = failed || nested.failed;
      continue;
    }

    if (entry.isFile()) {
      files.push(resolvedPath);
    }
  }

  return { files, failed };
};

const listFilesRecursive = async (directoryPath: string): Promise<string[]> =>
  (await listFilesRecursiveWithFailures(directoryPath)).files;

const listDirectFilesWithFailures = async (directoryPath: string) => {
  const listing = await readDirectoryEntries(directoryPath);

  return {
    files: listing.entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.resolve(directoryPath, entry.name)),
    failed: listing.failed
  };
};

const inspectDirectory = async (directoryPath: string) => {
  try {
    const stats = await stat(directoryPath);

    return { exists: stats.isDirectory(), failed: false };
  } catch (error) {
    return { exists: false, failed: !isMissingPathError(error) };
  }
};

const statScannedFile = async (filePath: string) => {
  try {
    const stats = await stat(filePath);

    return { stats: stats.isFile() ? stats : null, failed: false };
  } catch (error) {
    return { stats: null, failed: !isMissingPathError(error) };
  }
};

const createUniqueFileList = (filePaths: string[]) => [...new Set(filePaths.map((filePath) => path.resolve(filePath)))];

const sortPendingFilePaths = (rootDir: string, filePaths: string[]) =>
  [...filePaths].sort((left, right) => {
    const leftMonth = inferScheduleMonthFromPath(left, rootDir);
    const rightMonth = inferScheduleMonthFromPath(right, rootDir);

    return rightMonth.localeCompare(leftMonth) || left.localeCompare(right, "ko");
  });

const listPendingPerformanceFilePaths = async (input: {
  pendingDir: string;
  scheduleMonth?: string;
}) => {
  const monthParts = splitScheduleMonth(input.scheduleMonth);

  if (monthParts) {
    const targetDirectory = path.resolve(
      input.pendingDir,
      `${monthParts.year}년`,
      `${monthParts.monthNumber}월`
    );
    const targetDirectoryState = await inspectDirectory(targetDirectory);
    const monthListing = targetDirectoryState.exists
      ? await listFilesRecursiveWithFailures(targetDirectory)
      : { files: [], failed: false };
    const rootListing = await listDirectFilesWithFailures(input.pendingDir);
    const filePaths = createUniqueFileList([...monthListing.files, ...rootListing.files])
      .filter(isSupportedPerformanceFile)
      .filter(
        (filePath) =>
          inferScheduleMonthFromPath(filePath, input.pendingDir) === input.scheduleMonth
      );

    return {
      filePaths: sortPendingFilePaths(input.pendingDir, filePaths),
      // 폴더를 열지 못했으면 "파일이 없다"가 아니라 "모른다"이다. 이번 조회에서는 목록 정리를 하지 않는다.
      canPruneMissingFiles:
        !targetDirectoryState.failed && !monthListing.failed && !rootListing.failed,
      isFullPeriodSync: false
    };
  }

  const listing = await listFilesRecursiveWithFailures(input.pendingDir);
  const filePaths = listing.files.filter(isSupportedPerformanceFile);

  return {
    filePaths: sortPendingFilePaths(input.pendingDir, filePaths),
    canPruneMissingFiles: !listing.failed,
    isFullPeriodSync: true
  };
};

const hasSameFileVersion = (
  detail: Pick<PerformanceFileDetail, "fileSize" | "modifiedTimeMs">,
  fileStats: Stats
) =>
  detail.fileSize === fileStats.size &&
  Math.abs(detail.modifiedTimeMs - fileStats.mtimeMs) < 1;

const canReuseStoredDetail = (detail: PerformanceFileDetail, fileStats: Stats) =>
  hasSameFileVersion(detail, fileStats) &&
  !(
    detail.directoryType === "pending" &&
    (detail.status === "approved" || detail.status === "rejected")
  );

const createUnsupportedTemplateMessage = (input: {
  sheetName: string;
  templateKind: PerformanceFileDetail["templateKind"];
}) =>
  [
    "실적 파일 파싱 규격이 일치하지 않습니다.",
    "첫 번째 시트가 '교대 근무 계획표'인 근무표 회신 양식이어야 합니다.",
    `현재 시트: ${input.sheetName || "시트 없음"} / 감지 형식: ${input.templateKind}`
  ].join(" ");

const createSyncIssue = (input: {
  detail?: PerformanceFileDetail;
  filePath: string;
  message: string;
  severity?: PerformanceFileSyncIssue["severity"];
  directoryType?: PerformanceFileSyncIssue["directoryType"];
  scheduleMonth?: string;
  kind?: PerformanceFileSyncIssue["kind"];
}): PerformanceFileSyncIssue => ({
  filePath: input.filePath,
  fileName: path.basename(input.filePath),
  directoryType: input.detail?.directoryType ?? input.directoryType ?? "unknown",
  severity: input.severity ?? "error",
  message: input.message,
  scheduleMonth: input.detail?.scheduleMonth || input.scheduleMonth,
  kind: input.kind
});

// A save that failed left nothing behind, so this file was not re-read no matter what the scan
// reported. A refusal to rebaseline an approved archive is the opposite: a deliberate, repeatable
// verdict, and marking it as a failed save would hold the re-read markers open forever.
const resolvePersistIssueKind = (error: unknown): PerformanceFileSyncIssue["kind"] =>
  isApprovedPerformanceSourceProtectedError(error) ? undefined : "persist-failed";

const createReadFailureMessage = (filePath: string) =>
  [
    `${path.basename(filePath)} 파일을 여는 데 실패해 직전 분석 결과를 그대로 두었습니다.`,
    "파일이 다른 프로그램에서 열려 있거나 네트워크 연결이 끊겼는지 확인한 뒤 새로고침(↻)하세요.",
    "화면의 금액은 예전 기준일 수 있습니다."
  ].join(" ");

const createRepeatedReadFailureMessage = (filePath: string) =>
  [
    `${path.basename(filePath)} 파일을 여러 번 여는 데 실패해 이번에는 다시 열지 않았습니다.`,
    "직전 분석 결과를 그대로 쓰고 있으니, 파일을 확인한 뒤 새로고침(↻)을 누르면 다시 시도합니다."
  ].join(" ");

const readFailureRetryLimit = 5;
// Keyed by the exact version on disk, so a file that changes starts its own retry count.
const readFailureAttempts = new Map<string, number>();

const createReadFailureKey = (filePath: string, fileStats: Stats) =>
  `${path.resolve(filePath)}::${fileStats.size}::${Math.trunc(fileStats.mtimeMs)}`;

const getReadFailureCount = (filePath: string, fileStats: Stats) =>
  readFailureAttempts.get(createReadFailureKey(filePath, fileStats)) ?? 0;

// A file that could not be opened is read again on the next scan even when its bytes did not
// change: the stored analysis was made from an older wage table, and only a re-read applies the
// new one. The debt is capped so one permanently broken workbook cannot re-open itself on every
// refresh forever - the operator's 새로고침(↻) starts the count over.
const hasOpenReadFailureDebt = (filePath: string, fileStats: Stats) => {
  const attempts = getReadFailureCount(filePath, fileStats);

  return attempts > 0 && attempts < readFailureRetryLimit;
};

const hasExhaustedReadFailureRetries = (filePath: string, fileStats: Stats) =>
  getReadFailureCount(filePath, fileStats) >= readFailureRetryLimit;

const recordReadFailureOutcome = (filePath: string, fileStats: Stats, readFailed: boolean) => {
  const key = createReadFailureKey(filePath, fileStats);

  if (!readFailed) {
    readFailureAttempts.delete(key);
    return;
  }

  readFailureAttempts.set(
    key,
    Math.min((readFailureAttempts.get(key) ?? 0) + 1, readFailureRetryLimit)
  );
};

export const resetPerformanceFileReadFailureLedgerForTest = () => {
  readFailureAttempts.clear();
};

const waitForParsingPace = async (enabled?: boolean) => {
  if (!enabled || performanceParsePaceDelayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, performanceParsePaceDelayMs));
};

const updatePerformanceFileSyncState = (
  syncId: number,
  patch: Partial<PerformanceFileSyncStateSnapshot>
) => {
  if (syncId <= 0 || activePerformanceSyncId !== syncId) {
    return;
  }

  performanceFileSyncState = {
    ...performanceFileSyncState,
    ...patch,
    updatedAt: new Date().toISOString()
  };
};

const beginPerformanceFileSync = (input: {
  directoryType: PerformanceFileSyncStateSnapshot["directoryType"];
  scheduleMonth?: string;
  message: string;
}) => {
  activePerformanceSyncId += 1;
  const syncId = activePerformanceSyncId;
  const now = new Date().toISOString();

  performanceFileSyncState = {
    status: "scanning",
    directoryType: input.directoryType,
    scheduleMonth: input.scheduleMonth,
    totalCount: 0,
    processedCount: 0,
    parsedCount: 0,
    skippedCount: 0,
    issueCount: 0,
    message: input.message,
    startedAt: now,
    updatedAt: now
  };

  return syncId;
};

const completePerformanceFileSync = (
  syncId: number,
  input: {
    status?: Extract<PerformanceFileSyncStateSnapshot["status"], "completed" | "error">;
    issueCount: number;
    message: string;
  }
) => {
  const completedAt = new Date().toISOString();

  updatePerformanceFileSyncState(syncId, {
    status: input.status ?? "completed",
    currentFileName: undefined,
    currentFilePath: undefined,
    issueCount: input.issueCount,
    message: input.message,
    completedAt
  });
};

export const getPerformanceFileSyncStateSnapshot = (): PerformanceFileSyncStateSnapshot => ({
  ...performanceFileSyncState
});

export const buildPerformanceFileDetailFromPath = async (input: {
  filePath: string;
  settings: Pick<AppSettings, "pendingDir" | "approvedDir">;
  fileStats?: Stats;
  receivedAt?: string;
  forceReparse?: boolean;
}): Promise<PerformanceFileDetail | null> => {
  if (!isSupportedPerformanceFile(input.filePath)) {
    return null;
  }

  const fileStats = input.fileStats ?? (await stat(input.filePath).catch(() => null));

  if (!fileStats?.isFile()) {
    return null;
  }

  const state = {
    pendingDir: input.settings.pendingDir,
    approvedDir: input.settings.approvedDir,
    isRunning: false
  };
  const watchEvent = toFileWatchEvent({
    type: "file-added",
    filePath: input.filePath,
    state,
    size: fileStats.size,
    modifiedTimeMs: fileStats.mtimeMs
  });
  const rootDir =
    watchEvent.directoryType === "approved" ? input.settings.approvedDir : input.settings.pendingDir;
  const isApprovedDirectory = watchEvent.directoryType === "approved";
  const existingPathDetail = isSqliteStorageReady()
    ? getStoredPerformanceFileDetailByPath(input.filePath, watchEvent.directoryType)
    : null;

  if (
    !input.forceReparse &&
    existingPathDetail &&
    existingPathDetail.directoryType === watchEvent.directoryType &&
    canReuseStoredDetail(existingPathDetail, fileStats) &&
    // A row that only ever recorded a failed read is not an analysis to reuse, and a file that
    // owes a retry is opened again even when its bytes are unchanged - the reading it carries was
    // made against an older wage table.
    !isUnreadPerformanceFileDetail(existingPathDetail) &&
    !hasOpenReadFailureDebt(input.filePath, fileStats)
  ) {
    return existingPathDetail;
  }

  const fileId =
    existingPathDetail?.id ??
    createPerformanceFileId(input.filePath, rootDir, fileStats.mtimeMs);
  const existingDetail = isSqliteStorageReady() ? getStoredPerformanceFileDetail(fileId) : null;
  const isReenteredPendingCycle =
    watchEvent.directoryType === "pending" && existingDetail?.directoryType === "approved";
  const receivedAt =
    input.receivedAt ??
    (isReenteredPendingCycle
      ? new Date().toISOString()
      : existingDetail?.receivedAt ?? existingPathDetail?.receivedAt);

  try {
    const inspection = await inspectExcelTemplate(input.filePath);

    if (inspection.templateKind !== "schedule-plan") {
      const metadata = updatePerformanceFileMetadataStatus(
        createPerformanceFileMetadataRecord({
          watchEvent,
          inspection,
          fileSize: fileStats.size,
          modifiedTimeMs: fileStats.mtimeMs,
          receivedAt
        }),
        "error",
        createUnsupportedTemplateMessage({
          sheetName: inspection.sheetName,
          templateKind: inspection.templateKind
        })
      );

      return createDetail({
        metadata,
        fileId,
        previewRows: [],
        entries: [],
        alerts: [
          {
            severity: "error",
            message: metadata.errorMessage ?? "실적 파일 파싱 규격이 일치하지 않습니다."
          }
        ]
      });
    }

    const metadata = createPerformanceFileMetadataRecord({
      watchEvent,
      inspection,
      fileSize: fileStats.size,
      modifiedTimeMs: fileStats.mtimeMs,
      receivedAt
    });

    if (inspection.templateKind === "schedule-plan") {
      const parsed = await parseReturnedSchedulePerformanceFile({
        filePath: input.filePath,
        fileId
      });
      const effectiveEntries = parsed.entries.filter(
        (entry) => !isPoolSubstitutePerformanceEntry(entry)
      );
      const effectiveWarningCount =
        parsed.alerts.length +
        effectiveEntries.reduce((sum, entry) => sum + entry.alerts.length, 0);

      return createDetail({
        metadata: {
          ...metadata,
          templateVariant: parsed.templateVariant,
          scheduleMonth: parsed.scheduleMonth,
          siteName: parsed.siteName,
          scheduleKey: parsed.scheduleKey,
          entryCount: effectiveEntries.length,
          approvedEntryCount:
            isApprovedDirectory ? existingDetail?.approvedEntryCount ?? effectiveEntries.length : 0,
          warningCount: effectiveWarningCount,
          isEffective: existingDetail?.isEffective ?? false,
          status: isApprovedDirectory
            ? existingDetail?.status ?? "approved"
            : resolvePendingDetailStatus({
                existingDetail,
                existingPathDetail,
                fallbackStatus: metadata.status
              })
        },
        fileId,
        previewRows: parsed.previewRows,
        entries: parsed.entries,
        alerts: parsed.alerts
      });
    }

    return createDetail({
      metadata: {
        ...metadata,
        scheduleMonth: "",
        siteName: "",
        scheduleKey: "",
        entryCount: 0,
        approvedEntryCount: isApprovedDirectory ? existingDetail?.approvedEntryCount ?? 0 : 0,
        warningCount: 0,
        isEffective: existingDetail?.isEffective ?? false,
        status: isApprovedDirectory
          ? existingDetail?.status ?? "approved"
          : resolvePendingDetailStatus({
              existingDetail,
              existingPathDetail,
              fallbackStatus: metadata.status
            })
      },
      fileId,
      previewRows: [],
      entries: [],
      alerts: []
    });
  } catch (error) {
    const metadata = updatePerformanceFileMetadataStatus(
      createPerformanceFileMetadataRecord({
        watchEvent,
        fileSize: fileStats.size,
        modifiedTimeMs: fileStats.mtimeMs,
        receivedAt
      }),
      "error",
      getErrorMessage(error)
    );

    return createDetail({
      metadata,
      fileId,
      previewRows: [],
      entries: [],
      alerts: [
        {
          severity: "error",
          message: metadata.errorMessage ?? "실적 파일 처리 중 오류가 발생했습니다."
        }
      ]
    });
  }
};

export const applyPerformanceFileWatchEventToStorage = async (input: {
  type: "file-added" | "file-changed" | "file-removed";
  filePath: string;
  settings: Pick<AppSettings, "pendingDir" | "approvedDir">;
}): Promise<PerformanceFileSyncIssue | null> => {
  if (!isSqliteStorageReady()) {
    return null;
  }

  if (!isSupportedPerformanceFile(input.filePath)) {
    return null;
  }

  const directoryType = toFileWatchEvent({
    type: input.type,
    filePath: input.filePath,
    state: {
      pendingDir: input.settings.pendingDir,
      approvedDir: input.settings.approvedDir,
      isRunning: false
    }
  }).directoryType;

  if (directoryType !== "pending") {
    return null;
  }

  if (input.type === "file-removed") {
    deleteStoredPerformanceFileByPath(input.filePath, "pending");
    return null;
  }

  const detail = await buildPerformanceFileDetailFromPath({
    filePath: input.filePath,
    settings: input.settings
  });

  if (!detail) {
    return null;
  }

  try {
    const upsertResult = upsertPerformanceFileDetail(detail);

    if (upsertResult.keptExistingAnalysis) {
      return createSyncIssue({
        detail,
        filePath: input.filePath,
        severity: "warning",
        kind: "read-failure",
        message: createReadFailureMessage(input.filePath)
      });
    }

    return detail.status === "error"
      ? createSyncIssue({
          detail,
          filePath: input.filePath,
          kind: isUnreadPerformanceFileDetail(detail) ? "read-failure" : "parse",
          message: detail.errorMessage ?? "실적 파일 파싱 규격이 일치하지 않습니다."
        })
      : null;
  } catch (error) {
    return createSyncIssue({
      detail,
      filePath: input.filePath,
      message: getErrorMessage(error),
      kind: resolvePersistIssueKind(error)
    });
  }
};

export const syncPendingPerformanceFilesToStorage = async (input: {
  settings: Pick<AppSettings, "pendingDir" | "approvedDir">;
  scheduleMonth?: string;
  forceReparse?: boolean;
  showProgress?: boolean;
  paceParsing?: boolean;
}): Promise<PerformanceFileSyncIssue[]> => {
  if (!isSqliteStorageReady()) {
    return [];
  }

  const syncId = input.showProgress
    ? beginPerformanceFileSync({
        directoryType: "pending",
        scheduleMonth: input.scheduleMonth,
        message: input.scheduleMonth
          ? `${input.scheduleMonth} 승인대기 폴더를 확인하는 중입니다.`
          : "승인대기 폴더 전체를 확인하는 중입니다."
      })
    : 0;
  const scanResult = await listPendingPerformanceFilePaths({
    pendingDir: input.settings.pendingDir,
    scheduleMonth: input.scheduleMonth
  });
  const filePaths = scanResult.filePaths;
  const activeFileIds = new Set<string>();
  const issues: PerformanceFileSyncIssue[] = [];
  const parseLimit = scanResult.isFullPeriodSync ? fullPendingSyncParseLimit : Number.POSITIVE_INFINITY;
  let parsedNewFileCount = 0;
  let parsedFileCount = 0;
  let processedCount = 0;
  let skippedCount = 0;
  let reportedParseLimit = false;
  // Seeded by the folder listing: a scan that could not see the whole folder must not conclude
  // that the files it did not see are gone.
  let hasScanFailure = !scanResult.canPruneMissingFiles;

  if (input.showProgress) {
    updatePerformanceFileSyncState(syncId, {
      status: "parsing",
      totalCount: filePaths.length,
      message:
        filePaths.length > 0
          ? `승인대기 Excel ${filePaths.length}개를 순서대로 확인합니다.`
          : "확인할 승인대기 Excel 파일이 없습니다."
    });
  }

  try {
    for (const filePath of filePaths) {
      updatePerformanceFileSyncState(syncId, {
        currentFileName: path.basename(filePath),
        currentFilePath: filePath,
        message: `${path.basename(filePath)} 파일을 확인하는 중입니다.`
      });

      const scannedFile = await statScannedFile(filePath);

      if (!scannedFile.stats) {
        hasScanFailure = hasScanFailure || scannedFile.failed;
        skippedCount += 1;
        processedCount += 1;
        updatePerformanceFileSyncState(syncId, {
          processedCount,
          skippedCount,
          message: `${path.basename(filePath)} 파일을 건너뛰었습니다.`
        });
        continue;
      }

      const fileStats = scannedFile.stats;
      const existingPathDetail = getStoredPerformanceFileDetailByPath(filePath, "pending", {
        resolveApprovalFields: false,
        resolveEntryApprovalStatus: false
      });
      // A row that only ever recorded a failed read is not an analysis, and a file that owes a
      // retry is read again even when its bytes are unchanged - the wage table behind the stored
      // reading may have moved on.
      const canReuseExistingDetail = Boolean(
        existingPathDetail &&
          canReuseStoredDetail(existingPathDetail, fileStats) &&
          !isUnreadPerformanceFileDetail(existingPathDetail) &&
          !hasOpenReadFailureDebt(filePath, fileStats)
      );
      const isKnownChangedFile = Boolean(
        existingPathDetail && (input.forceReparse || !canReuseExistingDetail)
      );

      if (existingPathDetail && !input.forceReparse && canReuseExistingDetail) {
        activeFileIds.add(existingPathDetail.id);

        if (existingPathDetail.status === "error" && existingPathDetail.errorMessage) {
          issues.push(
            createSyncIssue({
              detail: existingPathDetail,
              filePath,
              message: existingPathDetail.errorMessage
            })
          );
        }

        skippedCount += 1;
        processedCount += 1;
        updatePerformanceFileSyncState(syncId, {
          processedCount,
          skippedCount,
          issueCount: issues.length,
          message: `${path.basename(filePath)} 파일은 변경이 없어 기존 분석 결과를 사용합니다.`
        });
        continue;
      }

      if (
        existingPathDetail &&
        !input.forceReparse &&
        hasExhaustedReadFailureRetries(filePath, fileStats)
      ) {
        activeFileIds.add(existingPathDetail.id);
        issues.push(
          createSyncIssue({
            detail: existingPathDetail,
            filePath,
            severity: "warning",
            kind: "read-failure",
            message: createRepeatedReadFailureMessage(filePath)
          })
        );
        skippedCount += 1;
        processedCount += 1;
        updatePerformanceFileSyncState(syncId, {
          processedCount,
          skippedCount,
          issueCount: issues.length,
          message: `${path.basename(filePath)} 파일을 여러 번 열지 못해 이번 조회에서는 건너뜁니다.`
        });
        continue;
      }

      if (!isKnownChangedFile && parsedNewFileCount >= parseLimit) {
        if (!reportedParseLimit) {
          issues.push(
            createSyncIssue({
              filePath: input.settings.pendingDir,
              directoryType: "pending",
              severity: "warning",
              scheduleMonth: input.scheduleMonth,
              message: [
                "전체 기간 승인대기 조회에서 새 파일 파싱을 일부 중단했습니다.",
                `성능 보호를 위해 한 번에 최대 ${fullPendingSyncParseLimit}개 파일만 새로 분석합니다.`,
                "연도와 월을 선택한 뒤 새로고침하면 해당 월 폴더를 우선 분석합니다."
              ].join(" ")
            })
          );
          reportedParseLimit = true;
        }

        skippedCount += 1;
        processedCount += 1;
        updatePerformanceFileSyncState(syncId, {
          processedCount,
          skippedCount,
          issueCount: issues.length,
          message: "전체 기간 성능 보호 기준에 따라 나머지 파일은 이번 조회에서 건너뜁니다."
        });
        continue;
      }

      if (!isKnownChangedFile) {
        parsedNewFileCount += 1;
      }
      await waitForParsingPace(input.paceParsing);

      const detail = await buildPerformanceFileDetailFromPath({
        filePath,
        fileStats,
        settings: input.settings,
        forceReparse: input.forceReparse
      });
      parsedFileCount += 1;

      if (!detail) {
        skippedCount += 1;
        processedCount += 1;
        updatePerformanceFileSyncState(syncId, {
          processedCount,
          skippedCount,
          message: `${path.basename(filePath)} 파일은 실적 파일 대상이 아니어서 건너뛰었습니다.`
        });
        continue;
      }

      const readFailed = isUnreadPerformanceFileDetail(detail);

      recordReadFailureOutcome(filePath, fileStats, readFailed);
      activeFileIds.add(detail.id);

      try {
        const upsertResult = upsertPerformanceFileDetail(detail);

        if (upsertResult.keptExistingAnalysis) {
          issues.push(
            createSyncIssue({
              detail: existingPathDetail ?? detail,
              filePath,
              severity: "warning",
              kind: "read-failure",
              message: createReadFailureMessage(filePath)
            })
          );
        } else if (detail.status === "error") {
          issues.push(
            createSyncIssue({
              detail,
              filePath,
              severity: readFailed ? "warning" : "error",
              kind: readFailed ? "read-failure" : "parse",
              message: detail.errorMessage ?? "실적 파일 파싱 규격이 일치하지 않습니다."
            })
          );
        }
      } catch (error) {
        issues.push(
          createSyncIssue({
            detail,
            filePath,
            message: getErrorMessage(error),
            kind: resolvePersistIssueKind(error)
          })
        );
      }

      processedCount += 1;
      updatePerformanceFileSyncState(syncId, {
        processedCount,
        parsedCount: parsedFileCount,
        issueCount: issues.length,
        message: `${path.basename(filePath)} 파일 분석을 완료했습니다.`
      });
      await waitForParsingPace(input.paceParsing);
    }

    if (hasScanFailure) {
      issues.push(
        createSyncIssue({
          filePath: input.settings.pendingDir,
          directoryType: "pending",
          severity: "warning",
          scheduleMonth: input.scheduleMonth,
          kind: "read-failure",
          message: [
            "승인대기 폴더를 읽지 못해 이번에는 목록 정리를 건너뛰었습니다.",
            "폴더 연결과 접근 권한을 확인한 뒤 새로고침(↻)하세요."
          ].join(" ")
        })
      );
    }

    if (scanResult.canPruneMissingFiles && !hasScanFailure) {
      listStoredPerformanceFileDetails(
        {
          directoryTypes: ["pending"],
          scheduleMonth: input.scheduleMonth
        },
        {
          resolveApprovalFields: false,
          resolveEntryApprovalStatus: false
        }
      )
        .filter(
          (detail) =>
            detail.status !== "approved" &&
            detail.status !== "rejected" &&
            !activeFileIds.has(detail.id)
        )
        .forEach((detail) => {
          deleteStoredPerformanceFile(detail.id);
        });
    }

    completePerformanceFileSync(syncId, {
      issueCount: issues.length,
      message:
        issues.length > 0
          ? `승인대기 파일 확인이 끝났습니다. 확인 필요 ${issues.length}건이 있습니다.`
          : "승인대기 파일 확인이 끝났습니다."
    });

    return issues;
  } catch (error) {
    completePerformanceFileSync(syncId, {
      status: "error",
      issueCount: issues.length,
      message: getErrorMessage(error)
    });
    throw error;
  }
};

export const syncApprovedPerformanceFilesToStorage = async (input: {
  settings: Pick<AppSettings, "pendingDir" | "approvedDir">;
  scheduleMonth?: string;
  showProgress?: boolean;
  paceParsing?: boolean;
  forceReparse?: boolean;
}): Promise<PerformanceFileSyncIssue[]> => {
  if (!isSqliteStorageReady()) {
    return [];
  }

  const syncId = input.showProgress
    ? beginPerformanceFileSync({
        directoryType: "approved",
        scheduleMonth: input.scheduleMonth,
        message: input.scheduleMonth
          ? `${input.scheduleMonth} 승인완료 보관본을 확인하는 중입니다.`
          : "승인완료 보관본 전체를 확인하는 중입니다."
      })
    : 0;
  const targetDirectory = input.scheduleMonth
    ? buildApprovedPerformanceArchiveDirectory(input.settings.approvedDir, {
        scheduleMonth: input.scheduleMonth
      })
    : input.settings.approvedDir;
  const filePaths = (await listFilesRecursive(targetDirectory)).filter(isSupportedPerformanceFile);
  const issues: PerformanceFileSyncIssue[] = [];
  let processedCount = 0;
  let parsedCount = 0;
  let skippedCount = 0;

  if (input.showProgress) {
    updatePerformanceFileSyncState(syncId, {
      status: "parsing",
      totalCount: filePaths.length,
      message:
        filePaths.length > 0
          ? `승인완료 Excel ${filePaths.length}개를 순서대로 확인합니다.`
          : "확인할 승인완료 Excel 파일이 없습니다."
    });
  }

  try {
    for (const filePath of filePaths) {
      let reusableApprovedDetailMissingSourceSignature: PerformanceFileDetail | null = null;

      updatePerformanceFileSyncState(syncId, {
        currentFileName: path.basename(filePath),
        currentFilePath: filePath,
        message: `${path.basename(filePath)} 파일을 확인하는 중입니다.`
      });

      const fileStats = await stat(filePath).catch(() => null);

      if (!fileStats?.isFile()) {
        skippedCount += 1;
        processedCount += 1;
        updatePerformanceFileSyncState(syncId, {
          processedCount,
          skippedCount,
          message: `${path.basename(filePath)} 파일을 건너뛰었습니다.`
        });
        continue;
      }

      const existingPathDetail = getStoredPerformanceFileDetailByPath(filePath, "approved", {
        resolveApprovalFields: false,
        resolveEntryApprovalStatus: false
      });

      // An archive row that only ever recorded a failed read is read again even though the file
      // has not changed. Without this it stayed frozen: the failed read had stored the file's real
      // size and modified time, so every later scan called it "unchanged" and reused the failure.
      if (
        existingPathDetail &&
        !input.forceReparse &&
        canReuseStoredDetail(existingPathDetail, fileStats) &&
        !isUnreadPerformanceFileDetail(existingPathDetail) &&
        !hasOpenReadFailureDebt(filePath, fileStats)
      ) {
        backfillPerformanceApprovalSnapshotSourceSignatures(existingPathDetail);

        if (!hasApprovedSnapshotMissingSourceSignature(existingPathDetail.id)) {
          if (existingPathDetail.status === "error" && existingPathDetail.errorMessage) {
            issues.push(
              createSyncIssue({
                detail: existingPathDetail,
                filePath,
                message: existingPathDetail.errorMessage
              })
            );
          }

          skippedCount += 1;
          processedCount += 1;
          updatePerformanceFileSyncState(syncId, {
            processedCount,
            skippedCount,
            issueCount: issues.length,
            message: `${path.basename(filePath)} 파일은 변경이 없어 기존 분석 결과를 사용합니다.`
          });
          continue;
        }

        reusableApprovedDetailMissingSourceSignature = existingPathDetail;
      }

      if (
        existingPathDetail &&
        !input.forceReparse &&
        hasExhaustedReadFailureRetries(filePath, fileStats)
      ) {
        issues.push(
          createSyncIssue({
            detail: existingPathDetail,
            filePath,
            severity: "warning",
            kind: "read-failure",
            message: createRepeatedReadFailureMessage(filePath)
          })
        );
        skippedCount += 1;
        processedCount += 1;
        updatePerformanceFileSyncState(syncId, {
          processedCount,
          skippedCount,
          issueCount: issues.length,
          message: `${path.basename(filePath)} 파일을 여러 번 열지 못해 이번 조회에서는 건너뜁니다.`
        });
        continue;
      }

      await waitForParsingPace(input.paceParsing);

      const detail = await buildPerformanceFileDetailFromPath({
        filePath,
        fileStats,
        settings: input.settings,
        forceReparse: input.forceReparse || Boolean(reusableApprovedDetailMissingSourceSignature)
      });

      if (!detail) {
        skippedCount += 1;
        processedCount += 1;
        updatePerformanceFileSyncState(syncId, {
          processedCount,
          skippedCount,
          message: `${path.basename(filePath)} 파일은 실적 파일 대상이 아니어서 건너뛰었습니다.`
        });
        continue;
      }

      recordReadFailureOutcome(filePath, fileStats, isUnreadPerformanceFileDetail(detail));

      // A re-read that came back with no rows must not replace an archive that has them. The save
      // below deletes every entry, blanks the schedule month and drops the effective-copy flag, and
      // an approved archive has no second copy of those: only re-approving the month restores them.
      // The test is "no rows now, rows before" rather than the status, because a workbook that
      // opens but yields an empty grid reports no error at all.
      if (detail.entries.length === 0 && (existingPathDetail?.entries.length ?? 0) > 0) {
        issues.push(
          createSyncIssue({
            detail: existingPathDetail ?? detail,
            filePath,
            severity: "warning",
            kind: "read-failure",
            message: createReadFailureMessage(filePath)
          })
        );
        skippedCount += 1;
        processedCount += 1;
        updatePerformanceFileSyncState(syncId, {
          processedCount,
          skippedCount,
          issueCount: issues.length,
          message: `${path.basename(filePath)} 파일을 다시 읽지 못해 기존 분석 결과를 그대로 둡니다.`
        });
        continue;
      }

      try {
        const sourceBackfillDetail = reusableApprovedDetailMissingSourceSignature
          ? {
              id: reusableApprovedDetailMissingSourceSignature.id,
              entries: detail.entries
            }
          : detail;

        if (reusableApprovedDetailMissingSourceSignature) {
          backfillPerformanceApprovalSnapshotSourceSignatures(sourceBackfillDetail);
        }

        upsertPerformanceFileDetail({
          ...detail,
          // Rows came back, so the archive is readable again: an "error" inherited from a frozen
          // row is dropped instead of being written back for another scan to inherit.
          status: detail.entries.length > 0 ? "approved" : detail.status === "error" ? "error" : "approved",
          approvedEntryCount: detail.entryCount ?? detail.entries.length
        }, {
          allowApprovedSourceRebaseline: Boolean(input.forceReparse)
        });
        rebaselinePerformanceApprovalSnapshotScheduleEntries(sourceBackfillDetail);
        backfillPerformanceApprovalSnapshotSourceSignatures(sourceBackfillDetail);

        if (detail.status === "error" && detail.entries.length === 0) {
          issues.push(
            createSyncIssue({
              detail,
              filePath,
              severity: isUnreadPerformanceFileDetail(detail) ? "warning" : "error",
              kind: isUnreadPerformanceFileDetail(detail) ? "read-failure" : "parse",
              message: detail.errorMessage ?? "실적 파일 파싱 규격이 일치하지 않습니다."
            })
          );
        }
      } catch (error) {
        issues.push(
          createSyncIssue({
            detail,
            filePath,
            message: getErrorMessage(error),
            kind: resolvePersistIssueKind(error)
          })
        );
      }

      processedCount += 1;
      parsedCount += 1;
      updatePerformanceFileSyncState(syncId, {
        processedCount,
        parsedCount,
        issueCount: issues.length,
        message: `${path.basename(filePath)} 파일 확인을 완료했습니다.`
      });
      await waitForParsingPace(input.paceParsing);
    }

    completePerformanceFileSync(syncId, {
      issueCount: issues.length,
      message:
        issues.length > 0
          ? `승인완료 파일 확인이 끝났습니다. 확인 필요 ${issues.length}건이 있습니다.`
          : "승인완료 파일 확인이 끝났습니다."
    });

    return issues;
  } catch (error) {
    completePerformanceFileSync(syncId, {
      status: "error",
      issueCount: issues.length,
      message: getErrorMessage(error)
    });
    throw error;
  }
};
