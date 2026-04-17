import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";

import type { AppSettingsSnapshot, DatabaseBackupSummary } from "../../shared/bridge/contracts";
import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import { resolveConfiguredAccessSourceState } from "./database-file-policy-service";
import { getSqliteDatabase } from "./sqlite-storage-service";

interface BackupRuntimeState {
  interval: NodeJS.Timeout | null;
  lastTriggeredSlot: string | null;
}

const runtimeState: BackupRuntimeState = {
  interval: null,
  lastTriggeredSlot: null
};

const backupTickIntervalMs = 30_000;

interface BackupTableSnapshot {
  name: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

const getTimestampSegment = (date = new Date()) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate()
  ).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}${String(
    date.getMinutes()
  ).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;

const quoteSqlIdentifier = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;

const listUserTableNames = () => {
  const database = getSqliteDatabase();

  if (!database) {
    throw new Error("데이터베이스가 초기화되지 않았습니다.");
  }

  return database
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `
    )
    .all() as Array<{ name: string }>;
};

const listBackupTableSnapshots = (): BackupTableSnapshot[] => {
  const database = getSqliteDatabase();

  if (!database) {
    throw new Error("데이터베이스가 초기화되지 않았습니다.");
  }

  return listUserTableNames().map(({ name }) => {
    const columns = (
      database.prepare(`PRAGMA table_info(${quoteSqlIdentifier(name)})`).all() as Array<{
        name: string;
      }>
    ).map((column) => column.name);

    const rows = database.prepare(`SELECT * FROM ${quoteSqlIdentifier(name)}`).all() as Array<
      Record<string, unknown>
    >;

    return {
      name,
      columns,
      rows
    };
  });
};

const buildJsonBackupSnapshot = (input: {
  createdAt: string;
  tables: BackupTableSnapshot[];
}) => {
  const tables = input.tables.reduce<Record<string, Array<Record<string, unknown>>>>(
    (accumulator, table) => {
      accumulator[table.name] = table.rows;
      return accumulator;
    },
    {}
  );

  return {
    schemaVersion: 1,
    createdAt: input.createdAt,
    tables
  };
};

const trimBackupSheetName = (value: string) => value.replace(/[\\/*?:[\]]/g, "-").trim() || "table";

const resolveUniqueBackupSheetName = (value: string, usedNames: Set<string>) => {
  const baseName = trimBackupSheetName(value);
  let candidate = baseName.slice(0, 31) || "table";
  let duplicateIndex = 1;

  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = `_${String(duplicateIndex).padStart(2, "0")}`;
    const trimmedBaseName = baseName.slice(0, Math.max(31 - suffix.length, 1)) || "table";
    candidate = `${trimmedBaseName}${suffix}`;
    duplicateIndex += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
};

const toExcelCellValue = (value: unknown): ExcelJS.CellValue => {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("base64");
  }

  return JSON.stringify(value);
};

const stringifyExcelCellValue = (value: unknown) => {
  const normalized = toExcelCellValue(value);
  return normalized instanceof Date ? normalized.toISOString() : String(normalized);
};

const writeExcelBackupSnapshot = async (input: {
  createdAt: string;
  outputPath: string;
  tables: BackupTableSnapshot[];
}) => {
  const workbook = new ExcelJS.Workbook();
  const usedNames = new Set<string>();

  workbook.creator = "ShiftMgmt";
  workbook.lastModifiedBy = "ShiftMgmt database backup";
  workbook.created = new Date(input.createdAt);
  workbook.modified = new Date(input.createdAt);

  input.tables.forEach((table) => {
    const worksheet = workbook.addWorksheet(resolveUniqueBackupSheetName(table.name, usedNames));
    const headerRow = worksheet.addRow(table.columns);

    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    headerRow.font = {
      bold: true,
      color: { argb: "FF1B2D45" }
    };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFF3F9" }
    };

    table.rows.forEach((row) => {
      worksheet.addRow(table.columns.map((column) => toExcelCellValue(row[column])));
    });

    table.columns.forEach((column, index) => {
      const maxLength = Math.max(
        column.length,
        ...table.rows.map((row) => stringifyExcelCellValue(row[column]).length)
      );

      worksheet.getColumn(index + 1).width = Math.min(Math.max(maxLength + 2, 12), 40);
    });
  });

  await workbook.xlsx.writeFile(input.outputPath);
};

const shouldRunForSchedule = (
  schedule: AppSettingsSnapshot["databaseBackupSchedule"],
  now: Date
) => {
  if (schedule === "daily") {
    return true;
  }

  if (schedule === "weekly") {
    return now.getDay() === 1;
  }

  return now.getDate() === 1;
};

const getScheduleSlotKey = (
  schedule: AppSettingsSnapshot["databaseBackupSchedule"],
  backupTime: string,
  now: Date
) =>
  `${schedule}:${backupTime}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;

export const runDatabaseBackupNow = async (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}): Promise<DatabaseBackupSummary> => {
  const settings = getStoredAppSettingsSnapshot(input);
  const timestamp = getTimestampSegment();
  const createdAt = new Date().toISOString();
  const tableSnapshots = listBackupTableSnapshots();
  const jsonDir = path.resolve(settings.databaseBackupDir, "json");
  const excelDir = path.resolve(settings.databaseBackupDir, "excel");
  const accessDir = path.resolve(settings.databaseBackupDir, "access");
  const jsonBackupPath = path.resolve(jsonDir, `shiftmgmt-backup-${timestamp}.json`);
  const excelBackupPath = path.resolve(excelDir, `shiftmgmt-backup-${timestamp}.xlsx`);
  const accessSourceState = resolveConfiguredAccessSourceState(settings);
  const warningMessages: string[] = [];

  await mkdir(jsonDir, { recursive: true });
  await mkdir(excelDir, { recursive: true });
  await mkdir(accessDir, { recursive: true });

  const jsonBackupPromise = writeFile(
    jsonBackupPath,
    JSON.stringify(
      buildJsonBackupSnapshot({
        createdAt,
        tables: tableSnapshots
      }),
      null,
      2
    ),
    "utf8"
  );
  const excelBackupPromise = writeExcelBackupSnapshot({
    createdAt,
    outputPath: excelBackupPath,
    tables: tableSnapshots
  });

  const accessBackupPromise = (async () => {
    if (accessSourceState.status === "missing-config") {
      warningMessages.push("Access 원본 경로가 설정되지 않아 Access 백업은 생략했습니다.");
      return undefined;
    }

    if (accessSourceState.status === "not-access") {
      warningMessages.push("현재 복원 파일 경로가 Access(.accdb)가 아니어서 Access 원본 백업은 생략했습니다.");
      return undefined;
    }

    if (accessSourceState.status === "missing-file") {
      warningMessages.push("설정된 Access 원본 파일을 찾을 수 없어 Access 백업은 생략했습니다.");
      return undefined;
    }

    if (accessSourceState.status === "not-file") {
      warningMessages.push("설정된 Access 원본 경로가 파일이 아니어서 Access 백업은 생략했습니다.");
      return undefined;
    }

    const accessBackupPath = path.resolve(accessDir, `access-backup-${timestamp}.accdb`);
    await copyFile(accessSourceState.filePath, accessBackupPath);
    return accessBackupPath;
  })();

  const [, , accessBackupPath] = await Promise.all([
    jsonBackupPromise,
    excelBackupPromise,
    accessBackupPromise
  ]);

  return {
    createdAt,
    jsonBackupPath,
    excelBackupPath,
    accessBackupPath,
    warningMessages
  };
};

const checkAndRunScheduledBackup = async (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}) => {
  const settings = getStoredAppSettingsSnapshot(input);
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;

  if (currentTime !== settings.databaseBackupTime) {
    return;
  }

  if (!shouldRunForSchedule(settings.databaseBackupSchedule, now)) {
    return;
  }

  const slotKey = getScheduleSlotKey(
    settings.databaseBackupSchedule,
    settings.databaseBackupTime,
    now
  );

  if (runtimeState.lastTriggeredSlot === slotKey) {
    return;
  }

  runtimeState.lastTriggeredSlot = slotKey;

  try {
    await runDatabaseBackupNow(input);
  } catch (error) {
    console.error("[database-backup] scheduled backup failed", error);
  }
};

export const restartDatabaseBackupRuntime = (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}) => {
  if (runtimeState.interval) {
    clearInterval(runtimeState.interval);
    runtimeState.interval = null;
  }

  runtimeState.lastTriggeredSlot = null;
  runtimeState.interval = setInterval(() => {
    void checkAndRunScheduledBackup(input);
  }, backupTickIntervalMs);
};

export const stopDatabaseBackupRuntime = () => {
  if (runtimeState.interval) {
    clearInterval(runtimeState.interval);
    runtimeState.interval = null;
  }

  runtimeState.lastTriggeredSlot = null;
};
