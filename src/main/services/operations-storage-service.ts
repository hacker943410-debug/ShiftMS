import { randomUUID } from "node:crypto";
import path from "node:path";

import { allowanceRateVersionFixtures } from "../../shared/domain/allowance-rate-fixtures";
import {
  allowanceRateAxisLabels,
  allowanceRateAxisOrder,
  createAllowanceRateItems
} from "../../shared/domain/allowance-rate-matrix";
import type {
  DocumentTemplateProfile,
  DocumentTemplateValidationSnapshot
} from "../../shared/domain/document-template";
import type {
  AllowanceRateVersion,
  DocumentTemplateHistoryAction,
  DocumentTemplateHistoryRecord,
  DocumentTemplateVersion,
  HolidayCalendar,
  HolidayItem,
  TemplateType,
  UserRecord
} from "../../shared/domain/model";
import {
  getDefaultDocumentTemplateOutputFileNamePattern,
  normalizeDocumentTemplateOutputFileNamePattern
} from "./document-template-output-file-name-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface HolidayCalendarSeed extends Omit<HolidayCalendar, "items"> {
  items: Array<Omit<HolidayItem, "id"> & { id: string; createdAt: string }>;
}

const defaultHolidayCalendars: HolidayCalendarSeed[] = [
  {
    id: "holiday-calendar-2026",
    year: 2026,
    sourceName: "system-seed",
    sourceVersion: "2026.1",
    createdAt: "2026-01-01T00:00:00+09:00",
    items: [
      {
        id: "holiday-2026-01-01",
        holidayDate: "2026-01-01",
        name: "신정",
        isSubstitute: false,
        createdAt: "2026-01-01T00:00:00+09:00"
      },
      {
        id: "holiday-2026-03-01",
        holidayDate: "2026-03-01",
        name: "삼일절",
        isSubstitute: false,
        createdAt: "2026-01-01T00:00:00+09:00"
      },
      {
        id: "holiday-2026-05-05",
        holidayDate: "2026-05-05",
        name: "어린이날",
        isSubstitute: false,
        createdAt: "2026-01-01T00:00:00+09:00"
      }
    ]
  }
];

const defaultUsers: UserRecord[] = [
  {
    id: "user-admin",
    loginId: "admin",
    displayName: "관리자",
    role: "admin",
    status: "active",
    extensionNumber: "7250",
    contact: "010-1111-2222",
    email: "admin@company.local",
    createdAt: "2026-01-01T09:00:00+09:00",
    updatedAt: "2026-01-01T09:00:00+09:00"
  },
  {
    id: "user-operator",
    loginId: "operator",
    displayName: "운영담당",
    role: "operator",
    status: "active",
    extensionNumber: "7251",
    contact: "010-2222-3333",
    email: "operator@company.local",
    createdAt: "2026-01-01T09:00:00+09:00",
    updatedAt: "2026-01-01T09:00:00+09:00"
  },
  {
    id: "user-pending-review",
    loginId: "reviewer",
    displayName: "승인담당",
    role: "operator",
    status: "pending",
    extensionNumber: "7252",
    contact: "010-3333-4444",
    email: "reviewer@company.local",
    createdAt: "2026-01-03T09:00:00+09:00",
    updatedAt: "2026-01-03T09:00:00+09:00"
  }
];

const defaultDocumentTemplateVersions = (): DocumentTemplateVersion[] => {
  const sampleDir = path.resolve(process.cwd(), "양식샘플");

  return [
    {
      id: "template-schedule-sample1-2026-1",
      templateType: "schedule",
      versionLabel: "근무표 양식 1",
      sourcePath: path.resolve(sampleDir, "근무표_템플릿1.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "{siteName}_{scheduleMonth}_{patternName}.xlsx",
      createdAt: "2026-03-17T12:00:00+09:00",
      updatedAt: "2026-03-17T12:00:00+09:00",
      approvedAt: "2026-03-17T12:00:00+09:00"
    },
    {
      id: "template-schedule-sample2-2026-1",
      templateType: "schedule",
      versionLabel: "근무표 양식 2",
      sourcePath: path.resolve(sampleDir, "근무표_템플릿2.xlsx"),
      status: "approved",
      isDefault: false,
      outputFileNamePattern: "{siteName}_{scheduleMonth}_{patternName}.xlsx",
      createdAt: "2026-01-01T00:00:00+09:00",
      updatedAt: "2026-01-01T00:00:00+09:00",
      approvedAt: "2026-01-01T00:00:00+09:00"
    },
    {
      id: "template-proposal-2026-1",
      templateType: "proposal",
      versionLabel: "2026.2",
      sourcePath: path.resolve(sampleDir, "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "품의서_{workMonth}.xlsx",
      createdAt: "2026-01-01T00:00:00+09:00",
      updatedAt: "2026-01-01T00:00:00+09:00",
      approvedAt: "2026-01-01T00:00:00+09:00"
    },
    {
      id: "template-attachment1-2026-1",
      templateType: "attachment1",
      versionLabel: "2026.1",
      sourcePath: path.resolve(sampleDir, "별첨1_샘플.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "별첨1_{workMonth}.xlsx",
      createdAt: "2026-01-01T00:00:00+09:00",
      updatedAt: "2026-01-01T00:00:00+09:00",
      approvedAt: "2026-01-01T00:00:00+09:00"
    },
    {
      id: "template-attachment2-2026-1",
      templateType: "attachment2",
      versionLabel: "2026.1",
      sourcePath: path.resolve(sampleDir, "별첨2_샘플.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "별첨2_{workMonth}.xlsx",
      createdAt: "2026-01-01T00:00:00+09:00",
      updatedAt: "2026-01-01T00:00:00+09:00",
      approvedAt: "2026-01-01T00:00:00+09:00"
    }
  ];
};

const preferredDefaultTemplateIdByType: Record<TemplateType, string> = {
  schedule: "template-schedule-sample1-2026-1",
  proposal: "template-proposal-2026-1",
  attachment1: "template-attachment1-2026-1",
  attachment2: "template-attachment2-2026-1"
};

const normalizeRequiredText = (value: string, label: string) => {
  const normalized = String(value).trim();

  if (normalized.length === 0) {
    throw new Error(`${label}을(를) 입력해 주세요.`);
  }

  return normalized;
};

const normalizeOptionalText = (value?: string | null) => {
  const normalized = String(value ?? "").trim();

  return normalized.length > 0 ? normalized : undefined;
};

const normalizeIsoDate = (value: string, label: string) => {
  const normalized = String(value).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${label} 형식이 올바르지 않습니다.`);
  }

  return normalized;
};

const normalizeOptionalIsoDate = (value: string | undefined, label: string) => {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return undefined;
  }

  return normalizeIsoDate(normalized, label);
};

const normalizeAllowanceMultiplier = (value: number, label: string) => {
  const normalized = Number(value);

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${label}은(는) 0 이상의 숫자여야 합니다.`);
  }

  return normalized;
};

const normalizeAllowanceRateStatus = (value: AllowanceRateVersion["status"]) => {
  if (value === "draft" || value === "active" || value === "retired") {
    return value;
  }

  throw new Error("요율 상태가 올바르지 않습니다.");
};

const normalizeUserRole = (value: UserRecord["role"]) => {
  if (value === "admin" || value === "operator") {
    return value;
  }

  throw new Error("사용자 권한이 올바르지 않습니다.");
};

const normalizeUserStatus = (value: UserRecord["status"]) => {
  if (value === "active" || value === "inactive" || value === "pending") {
    return value;
  }

  throw new Error("사용자 상태가 올바르지 않습니다.");
};

const toHolidayCalendar = (
  row: Record<string, unknown>,
  itemRows: Array<Record<string, unknown>>
): HolidayCalendar => ({
  id: String(row.id),
  year: Number(row.year),
  sourceName: String(row.source_name),
  sourceVersion: row.source_version ? String(row.source_version) : undefined,
  createdAt: String(row.created_at),
  items: itemRows
    .filter((item) => String(item.calendar_id) === String(row.id))
    .map((item) => ({
      id: String(item.id),
      holidayDate: String(item.holiday_date),
      name: String(item.name),
      isSubstitute: Number(item.is_substitute) === 1
    }))
});

const normalizeHolidayDate = (value: string, year: number) => {
  const normalized = String(value).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("공휴일 날짜 형식이 올바르지 않습니다.");
  }

  if (!normalized.startsWith(`${year}-`)) {
    throw new Error(`${year}년 공휴일만 등록할 수 있습니다.`);
  }

  return normalized;
};

const normalizeHolidayName = (value: string) => {
  const normalized = String(value).trim();

  if (normalized.length === 0) {
    throw new Error("공휴일명을 입력해 주세요.");
  }

  return normalized;
};

const getHolidayCalendarRowsByYear = (year: number) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  return database.prepare(`
    SELECT *
    FROM holiday_calendars
    WHERE year = ?
    ORDER BY created_at DESC
  `).all(year) as Array<Record<string, unknown>>;
};

const getHolidayItemRowById = (holidayItemId: string) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  return database.prepare(`
    SELECT *
    FROM holiday_items
    WHERE id = ?
  `).get(holidayItemId) as Record<string, unknown> | undefined;
};

const ensureEditableHolidayCalendar = (
  year: number,
  sourceName = "manual-entry",
  sourceVersion = `${year}.manual`
) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  const existing = getHolidayCalendarRowsByYear(year)[0];

  if (existing) {
    return existing;
  }

  const calendarId = `holiday-calendar-${year}-${randomUUID()}`;
  const createdAt = new Date().toISOString();

  database.prepare(`
    INSERT INTO holiday_calendars (id, year, source_name, source_version, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(calendarId, year, sourceName, sourceVersion, createdAt);

  return {
    id: calendarId,
    year,
    source_name: sourceName,
    source_version: sourceVersion,
    created_at: createdAt
  } satisfies Record<string, unknown>;
};

const ensureNoHolidayDateConflict = (
  calendarId: string,
  holidayDate: string,
  ignoreItemId?: string
) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  const query = ignoreItemId
    ? `
      SELECT id
      FROM holiday_items
      WHERE calendar_id = ? AND holiday_date = ? AND id <> ?
    `
    : `
      SELECT id
      FROM holiday_items
      WHERE calendar_id = ? AND holiday_date = ?
    `;
  const existing = ignoreItemId
    ? database.prepare(query).get(calendarId, holidayDate, ignoreItemId)
    : database.prepare(query).get(calendarId, holidayDate);

  if (existing) {
    throw new Error("같은 날짜의 공휴일이 이미 등록되어 있습니다.");
  }
};

const toAllowanceRateVersion = (
  row: Record<string, unknown>,
  itemRows: Array<Record<string, unknown>>
): AllowanceRateVersion => ({
  id: String(row.id),
  year: Number(row.year),
  versionLabel: String(row.version_label),
  status: row.status as AllowanceRateVersion["status"],
  effectiveFrom: String(row.effective_from),
  effectiveTo: row.effective_to ? String(row.effective_to) : undefined,
  createdAt: String(row.created_at),
  updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  items: itemRows
    .filter((item) => String(item.version_id) === String(row.id))
    .map((item) => ({
      id: String(item.id),
      allowanceCode: String(item.allowance_code),
      multiplier: Number(item.multiplier),
      roundingPolicy: String(item.rounding_policy)
    }))
});

const toUserRecord = (row: Record<string, unknown>): UserRecord => ({
  id: String(row.id),
  loginId: String(row.login_id),
  displayName: String(row.display_name),
  role: row.role as UserRecord["role"],
  status: row.status as UserRecord["status"],
  extensionNumber: row.extension_number ? String(row.extension_number) : undefined,
  contact: row.contact ? String(row.contact) : undefined,
  email: row.email ? String(row.email) : undefined,
  createdAt: String(row.created_at),
  updatedAt: row.updated_at ? String(row.updated_at) : undefined
});

const toDocumentTemplateVersion = (row: Record<string, unknown>): DocumentTemplateVersion => ({
  id: String(row.id),
  templateType: row.template_type as TemplateType,
  versionLabel: String(row.version_label),
  sourcePath: String(row.source_path),
  status: (row.status as DocumentTemplateVersion["status"]) ?? "approved",
  isDefault: Number(row.is_default ?? 0) === 1,
  outputFileNamePattern: row.output_file_name_pattern
    ? String(row.output_file_name_pattern)
    : getDefaultDocumentTemplateOutputFileNamePattern(row.template_type as TemplateType),
  profileSchemaVersion: row.profile_schema_version ? String(row.profile_schema_version) : undefined,
  profile: row.profile_json ? (JSON.parse(String(row.profile_json)) as DocumentTemplateProfile) : undefined,
  validation: row.validation_json
    ? (JSON.parse(String(row.validation_json)) as DocumentTemplateValidationSnapshot)
    : undefined,
  checksum: row.checksum ? String(row.checksum) : undefined,
  createdAt: String(row.created_at),
  updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  approvedAt: row.approved_at ? String(row.approved_at) : undefined
});

const toDocumentTemplateHistoryRecord = (
  row: Record<string, unknown>
): DocumentTemplateHistoryRecord => ({
  id: String(row.id),
  templateId: String(row.template_id),
  templateType: row.template_type as TemplateType,
  versionLabel: String(row.version_label),
  actionType: row.action_type as DocumentTemplateHistoryAction,
  detail: row.detail ? String(row.detail) : undefined,
  occurredAt: String(row.occurred_at)
});

const appendDocumentTemplateHistory = (input: {
  templateId: string;
  templateType: TemplateType;
  versionLabel: string;
  actionType: DocumentTemplateHistoryAction;
  detail?: string;
}) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  database.prepare(`
    INSERT INTO document_template_history (
      id,
      template_id,
      template_type,
      version_label,
      action_type,
      detail,
      occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    `template-history-${randomUUID()}`,
    input.templateId,
    input.templateType,
    input.versionLabel,
    input.actionType,
    input.detail ?? null,
    new Date().toISOString()
  );
};

const ensureHolidaySeed = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const countRow = database.prepare("SELECT COUNT(*) as count FROM holiday_calendars").get() as {
    count: number;
  };

  if (countRow.count > 0) {
    return;
  }

  const insertCalendar = database.prepare(`
    INSERT INTO holiday_calendars (id, year, source_name, source_version, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertItem = database.prepare(`
    INSERT INTO holiday_items (id, calendar_id, holiday_date, name, is_substitute, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  defaultHolidayCalendars.forEach((calendar) => {
    insertCalendar.run(
      calendar.id,
      calendar.year,
      calendar.sourceName,
      calendar.sourceVersion ?? null,
      calendar.createdAt
    );

    calendar.items.forEach((item) => {
      insertItem.run(
        item.id,
        calendar.id,
        item.holidayDate,
        item.name,
        item.isSubstitute ? 1 : 0,
        item.createdAt
      );
    });
  });
};

const ensureAllowanceRateSeed = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const countRow = database.prepare(
    "SELECT COUNT(*) as count FROM allowance_rate_versions"
  ).get() as {
    count: number;
  };

  if (countRow.count > 0) {
    return;
  }

  const insertVersion = database.prepare(`
    INSERT INTO allowance_rate_versions (
      id,
      year,
      version_label,
      status,
      effective_from,
      effective_to,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = database.prepare(`
    INSERT INTO allowance_rate_items (
      id,
      version_id,
      allowance_code,
      multiplier,
      rounding_policy
    ) VALUES (?, ?, ?, ?, ?)
  `);

  allowanceRateVersionFixtures.forEach((version) => {
    insertVersion.run(
      version.id,
      version.year,
      version.versionLabel,
      version.status,
      version.effectiveFrom,
      version.effectiveTo ?? null,
      version.createdAt,
      version.updatedAt ?? null
    );

    version.items.forEach((item) => {
      insertItem.run(
        item.id,
        version.id,
        item.allowanceCode,
        item.multiplier,
        item.roundingPolicy
      );
    });
  });
};

const ensureAllowanceRateSeedUpgrade = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const futureDefault = database.prepare(`
    SELECT id, status
    FROM allowance_rate_versions
    WHERE id = 'rate-2027-1'
    LIMIT 1
  `).get() as { id: string; status: AllowanceRateVersion["status"] } | undefined;

  if (futureDefault?.status !== "active") {
    return;
  }

  database.prepare(`
    UPDATE allowance_rate_versions
    SET status = 'draft',
        updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), futureDefault.id);
};

const ensureUserSeed = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const countRow = database.prepare("SELECT COUNT(*) as count FROM app_users").get() as {
    count: number;
  };

  if (countRow.count > 0) {
    return;
  }

  const insertUser = database.prepare(`
    INSERT INTO app_users (
      id,
      login_id,
      display_name,
      role,
      status,
      extension_number,
      contact,
      email,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  defaultUsers.forEach((user) => {
    insertUser.run(
      user.id,
      user.loginId,
      user.displayName,
      user.role,
      user.status,
      user.extensionNumber ?? null,
      user.contact ?? null,
      user.email ?? null,
      user.createdAt,
      user.updatedAt ?? null
    );
  });
};

const ensureTemplateSeed = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const countRow = database.prepare(
    "SELECT COUNT(*) as count FROM document_template_versions"
  ).get() as {
    count: number;
  };

  if (countRow.count > 0) {
    return;
  }

  const insertTemplate = database.prepare(`
    INSERT INTO document_template_versions (
      id,
      template_type,
      version_label,
      source_path,
      status,
      is_default,
      output_file_name_pattern,
      profile_schema_version,
      profile_json,
      validation_json,
      checksum,
      created_at,
      updated_at,
      approved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  defaultDocumentTemplateVersions().forEach((template) => {
    insertTemplate.run(
      template.id,
      template.templateType,
      template.versionLabel,
      template.sourcePath,
      template.status,
      template.isDefault ? 1 : 0,
      template.outputFileNamePattern ??
        getDefaultDocumentTemplateOutputFileNamePattern(template.templateType),
      template.profileSchemaVersion ?? null,
      template.profile ? JSON.stringify(template.profile) : null,
      template.validation ? JSON.stringify(template.validation) : null,
      template.checksum ?? null,
      template.createdAt,
      template.updatedAt ?? null,
      template.approvedAt ?? null
    );
  });
};

const ensureTemplateDefaultSelection = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  (["schedule", "proposal", "attachment1", "attachment2"] as const).forEach((templateType) => {
    const approvedRows = database.prepare(`
      SELECT id, approved_at, created_at, is_default
      FROM document_template_versions
      WHERE template_type = ?
        AND status = 'approved'
      ORDER BY
        CASE WHEN id = ? THEN 0 ELSE 1 END ASC,
        CASE WHEN approved_at IS NULL THEN created_at ELSE approved_at END DESC,
        created_at DESC
    `).all(templateType, preferredDefaultTemplateIdByType[templateType]) as Array<{
      id: string;
      approved_at?: string | null;
      created_at: string;
      is_default: number;
    }>;

    if (approvedRows.length === 0) {
      database.prepare(`
        UPDATE document_template_versions
        SET is_default = 0
        WHERE template_type = ?
      `).run(templateType);
      return;
    }

    const chosenId =
      approvedRows.find((row) => Number(row.is_default ?? 0) === 1)?.id ?? approvedRows[0]!.id;

    database.prepare(`
      UPDATE document_template_versions
      SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END
      WHERE template_type = ?
    `).run(chosenId, templateType);
  });
};

const ensureProposalTemplateUpgrade = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const upgradedSourcePath = path.resolve(
    process.cwd(),
    "양식샘플",
    "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx"
  );
  const current = database.prepare(`
    SELECT id, source_path
    FROM document_template_versions
    WHERE id = 'template-proposal-2026-1'
    LIMIT 1
  `).get() as { id: string; source_path: string } | undefined;

  if (!current) {
    return;
  }

  if (path.resolve(current.source_path) === path.resolve(upgradedSourcePath)) {
    return;
  }

  database.prepare(`
    UPDATE document_template_versions
    SET version_label = ?,
        source_path = ?,
        updated_at = ?
    WHERE id = ?
  `).run("2026.2", upgradedSourcePath, new Date().toISOString(), current.id);
};

const ensureOperationsSeed = () => {
  ensureHolidaySeed();
  ensureAllowanceRateSeed();
  ensureAllowanceRateSeedUpgrade();
  ensureUserSeed();
  ensureTemplateSeed();
  ensureProposalTemplateUpgrade();
  ensureTemplateDefaultSelection();
};

export const listStoredHolidayCalendars = (year?: number): HolidayCalendar[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureOperationsSeed();

  const calendarRows = database.prepare(`
    SELECT *
    FROM holiday_calendars
    ORDER BY year DESC, created_at DESC
  `).all() as Array<Record<string, unknown>>;
  const itemRows = database.prepare(`
    SELECT *
    FROM holiday_items
    ORDER BY holiday_date ASC, name ASC
  `).all() as Array<Record<string, unknown>>;

  return calendarRows
    .filter((row) => (year ? Number(row.year) === year : true))
    .map((row) => toHolidayCalendar(row, itemRows));
};

export const saveStoredHolidayItem = (input: {
  year: number;
  holidayDate: string;
  name: string;
  isSubstitute?: boolean;
}): HolidayCalendar => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureOperationsSeed();

  const holidayDate = normalizeHolidayDate(input.holidayDate, input.year);
  const holidayName = normalizeHolidayName(input.name);
  const calendarRow = ensureEditableHolidayCalendar(input.year);

  ensureNoHolidayDateConflict(String(calendarRow.id), holidayDate);

  database.prepare(`
    INSERT INTO holiday_items (id, calendar_id, holiday_date, name, is_substitute, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    `holiday-item-${randomUUID()}`,
    String(calendarRow.id),
    holidayDate,
    holidayName,
    input.isSubstitute ? 1 : 0,
    new Date().toISOString()
  );

  return listStoredHolidayCalendars(input.year)[0]!;
};

export const renameStoredHolidayItem = (input: {
  holidayItemId: string;
  name: string;
}): HolidayCalendar => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureOperationsSeed();

  const holidayItemRow = getHolidayItemRowById(input.holidayItemId);

  if (!holidayItemRow) {
    throw new Error("수정할 공휴일을 찾을 수 없습니다.");
  }

  database.prepare(`
    UPDATE holiday_items
    SET name = ?
    WHERE id = ?
  `).run(normalizeHolidayName(input.name), input.holidayItemId);

  const calendarId = String(holidayItemRow.calendar_id);
  const calendarRow = database.prepare(`
    SELECT *
    FROM holiday_calendars
    WHERE id = ?
  `).get(calendarId) as Record<string, unknown> | undefined;

  if (!calendarRow) {
    throw new Error("공휴일 달력 정보를 찾을 수 없습니다.");
  }

  return listStoredHolidayCalendars(Number(calendarRow.year))[0]!;
};

export const deleteStoredHolidayItem = (input: {
  holidayItemId: string;
}): HolidayCalendar => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureOperationsSeed();

  const holidayItemRow = getHolidayItemRowById(input.holidayItemId);

  if (!holidayItemRow) {
    throw new Error("삭제할 공휴일을 찾을 수 없습니다.");
  }

  database.prepare(`
    DELETE FROM holiday_items
    WHERE id = ?
  `).run(input.holidayItemId);

  const calendarId = String(holidayItemRow.calendar_id);
  const calendarRow = database.prepare(`
    SELECT *
    FROM holiday_calendars
    WHERE id = ?
  `).get(calendarId) as Record<string, unknown> | undefined;

  if (!calendarRow) {
    throw new Error("공휴일 달력 정보를 찾을 수 없습니다.");
  }

  return listStoredHolidayCalendars(Number(calendarRow.year))[0]!;
};

export const replaceStoredHolidayCalendar = (input: {
  year: number;
  sourceName?: string;
  sourceVersion?: string;
  items: Array<Pick<HolidayItem, "holidayDate" | "name" | "isSubstitute">>;
}): HolidayCalendar => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureOperationsSeed();

  const normalizedItems = input.items
    .map((item) => ({
      holidayDate: normalizeHolidayDate(item.holidayDate, input.year),
      name: normalizeHolidayName(item.name),
      isSubstitute: item.isSubstitute === true
    }))
    .sort((left, right) => left.holidayDate.localeCompare(right.holidayDate));
  const seenDates = new Set<string>();

  normalizedItems.forEach((item) => {
    if (seenDates.has(item.holidayDate)) {
      throw new Error("같은 날짜의 공휴일이 중복되어 전체 반영을 진행할 수 없습니다.");
    }

    seenDates.add(item.holidayDate);
  });

  const sourceName = input.sourceName?.trim() || "holiday-api";
  const sourceVersion = input.sourceVersion?.trim() || `${input.year}.api`;

  database.exec("BEGIN");

  try {
    const calendarRows = getHolidayCalendarRowsByYear(input.year);

    calendarRows.forEach((calendarRow) => {
      database.prepare(`
        DELETE FROM holiday_items
        WHERE calendar_id = ?
      `).run(String(calendarRow.id));
    });

    database.prepare(`
      DELETE FROM holiday_calendars
      WHERE year = ?
    `).run(input.year);

    const calendarId = `holiday-calendar-${input.year}-${randomUUID()}`;
    const createdAt = new Date().toISOString();

    database.prepare(`
      INSERT INTO holiday_calendars (id, year, source_name, source_version, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(calendarId, input.year, sourceName, sourceVersion, createdAt);

    const insertItem = database.prepare(`
      INSERT INTO holiday_items (id, calendar_id, holiday_date, name, is_substitute, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    normalizedItems.forEach((item) => {
      insertItem.run(
        `holiday-item-${randomUUID()}`,
        calendarId,
        item.holidayDate,
        item.name,
        item.isSubstitute ? 1 : 0,
        createdAt
      );
    });

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return listStoredHolidayCalendars(input.year)[0]!;
};

export const listStoredAllowanceRateVersions = (
  year?: number
): AllowanceRateVersion[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureOperationsSeed();

  const versionRows = database.prepare(`
    SELECT *
    FROM allowance_rate_versions
    ORDER BY year DESC, effective_from DESC
  `).all() as Array<Record<string, unknown>>;
  const itemRows = database.prepare(`
    SELECT *
    FROM allowance_rate_items
    ORDER BY allowance_code ASC
  `).all() as Array<Record<string, unknown>>;

  return versionRows
    .filter((row) => (year ? Number(row.year) === year : true))
    .map((row) => toAllowanceRateVersion(row, itemRows));
};

export const saveStoredAllowanceRateVersion = (input: {
  id?: string;
  year: number;
  versionLabel: string;
  status: AllowanceRateVersion["status"];
  effectiveFrom: string;
  effectiveTo?: string;
  items: Array<{
    allowanceCode: string;
    multiplier: number;
    roundingPolicy?: string;
  }>;
}): AllowanceRateVersion => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureOperationsSeed();

  const existing = input.id
    ? (database.prepare(`
        SELECT *
        FROM allowance_rate_versions
        WHERE id = ?
        LIMIT 1
      `).get(input.id) as Record<string, unknown> | undefined)
    : undefined;

  const year = Number(input.year);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("적용 연도는 2000년부터 2100년 사이여야 합니다.");
  }

  const versionLabel = normalizeRequiredText(input.versionLabel, "버전명");
  const status = normalizeAllowanceRateStatus(input.status);
  const effectiveFrom = normalizeIsoDate(input.effectiveFrom, "적용 시작일");
  const effectiveTo = normalizeOptionalIsoDate(input.effectiveTo, "적용 종료일");

  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new Error("적용 종료일은 시작일보다 빠를 수 없습니다.");
  }

  const duplicate = input.id
    ? database.prepare(`
        SELECT id
        FROM allowance_rate_versions
        WHERE year = ? AND version_label = ? AND id <> ?
        LIMIT 1
      `).get(year, versionLabel, input.id)
    : database.prepare(`
        SELECT id
        FROM allowance_rate_versions
        WHERE year = ? AND version_label = ?
        LIMIT 1
      `).get(year, versionLabel);

  if (duplicate) {
    throw new Error("같은 연도에 동일한 버전명이 이미 등록되어 있습니다.");
  }

  const id = existing ? String(existing.id) : `rate-${year}-${randomUUID()}`;
  const itemByCode = new Map(input.items.map((item) => [item.allowanceCode, item]));
  const normalizedItems = createAllowanceRateItems(id).map((defaultItem) => {
    const item = itemByCode.get(defaultItem.allowanceCode);
    const axis = allowanceRateAxisOrder.find((currentAxis) =>
      defaultItem.allowanceCode.endsWith(`:${currentAxis}`)
    );

    return {
      allowanceCode: defaultItem.allowanceCode,
      multiplier: normalizeAllowanceMultiplier(
        item?.multiplier ?? defaultItem.multiplier,
        `${axis ? allowanceRateAxisLabels[axis] : defaultItem.allowanceCode} 요율`
      ),
      roundingPolicy: normalizeOptionalText(item?.roundingPolicy) ?? defaultItem.roundingPolicy
    };
  });
  const createdAt = existing ? String(existing.created_at) : new Date().toISOString();
  const updatedAt = new Date().toISOString();
  const retiredEffectiveTo = updatedAt.slice(0, 10);

  database.exec("BEGIN");

  try {
    database.prepare(`
      INSERT INTO allowance_rate_versions (
        id,
        year,
        version_label,
        status,
        effective_from,
        effective_to,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        year = excluded.year,
        version_label = excluded.version_label,
        status = excluded.status,
        effective_from = excluded.effective_from,
        effective_to = excluded.effective_to,
        updated_at = excluded.updated_at
    `).run(
      id,
      year,
      versionLabel,
      status,
      effectiveFrom,
      effectiveTo ?? null,
      createdAt,
      updatedAt
    );

    if (status === "active") {
      database.prepare(`
        UPDATE allowance_rate_versions
        SET status = 'retired',
            effective_to = CASE
              WHEN effective_to IS NULL OR effective_to = '' THEN ?
              ELSE effective_to
            END,
            updated_at = ?
        WHERE id <> ?
          AND status = 'active'
      `).run(retiredEffectiveTo, updatedAt, id);
    }

    database.prepare(`
      DELETE FROM allowance_rate_items
      WHERE version_id = ?
    `).run(id);

    const insertItem = database.prepare(`
      INSERT INTO allowance_rate_items (
        id,
        version_id,
        allowance_code,
        multiplier,
        rounding_policy
      ) VALUES (?, ?, ?, ?, ?)
    `);

    normalizedItems.forEach((item) => {
      insertItem.run(
        `rate-item-${id}-${item.allowanceCode}`,
        id,
        item.allowanceCode,
        item.multiplier,
        item.roundingPolicy
      );
    });

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  const saved = listStoredAllowanceRateVersions().find((version) => version.id === id);

  if (!saved) {
    throw new Error("요율 버전을 저장하지 못했습니다.");
  }

  return saved;
};

export const deleteStoredAllowanceRateVersion = (rateVersionId: string) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureOperationsSeed();

  const target = database.prepare(`
    SELECT id
    FROM allowance_rate_versions
    WHERE id = ?
    LIMIT 1
  `).get(rateVersionId) as { id: string } | undefined;

  if (!target) {
    throw new Error("삭제할 요율 버전을 찾을 수 없습니다.");
  }

  const usage = database.prepare(`
    SELECT COUNT(*) as count
    FROM allowance_calculations
    WHERE rate_version_id = ?
  `).get(rateVersionId) as { count: number };

  if (usage.count > 0) {
    throw new Error("이미 계산 이력에 사용된 요율 버전은 삭제할 수 없습니다.");
  }

  database.exec("BEGIN");

  try {
    database.prepare(`
      DELETE FROM allowance_rate_items
      WHERE version_id = ?
    `).run(rateVersionId);

    database.prepare(`
      DELETE FROM allowance_rate_versions
      WHERE id = ?
    `).run(rateVersionId);

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
};

export const listStoredOperationUsers = (): UserRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureOperationsSeed();

  const rows = database.prepare(`
    SELECT *
    FROM app_users
    ORDER BY display_name ASC
  `).all() as Array<Record<string, unknown>>;

  return rows.map(toUserRecord);
};

export const saveStoredOperationUser = (input: {
  id?: string;
  loginId: string;
  displayName: string;
  role: UserRecord["role"];
  status: UserRecord["status"];
  extensionNumber?: string;
  contact?: string;
  email?: string;
}): UserRecord => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureOperationsSeed();

  const loginId = normalizeRequiredText(input.loginId, "계정명");
  const duplicateLogin = database.prepare(`
    SELECT id
    FROM app_users
    WHERE login_id = ?
    ${input.id ? "AND id <> ?" : ""}
    LIMIT 1
  `).get(...(input.id ? [loginId, input.id] : [loginId]));

  if (duplicateLogin) {
    throw new Error("같은 계정명이 이미 등록되어 있습니다.");
  }

  const displayName = normalizeRequiredText(input.displayName, "이름");
  const role = normalizeUserRole(input.role);
  const status = normalizeUserStatus(input.status);
  const extensionNumber = normalizeOptionalText(input.extensionNumber);
  const contact = normalizeOptionalText(input.contact);
  const email = normalizeOptionalText(input.email);

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("메일주소 형식이 올바르지 않습니다.");
  }

  if (!input.id) {
    const createdAt = new Date().toISOString();
    const id = `user-${randomUUID()}`;

    database.prepare(`
      INSERT INTO app_users (
        id,
        login_id,
        display_name,
        role,
        status,
        extension_number,
        contact,
        email,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      loginId,
      displayName,
      role,
      status,
      extensionNumber ?? null,
      contact ?? null,
      email ?? null,
      createdAt,
      createdAt
    );

    const created = listStoredOperationUsers().find((user) => user.id === id);

    if (!created) {
      throw new Error("사용자 정보를 저장하지 못했습니다.");
    }

    return created;
  }

  const existing = database.prepare(`
    SELECT *
    FROM app_users
    WHERE id = ?
    LIMIT 1
  `).get(input.id) as Record<string, unknown> | undefined;

  if (!existing) {
    throw new Error("수정할 사용자를 찾을 수 없습니다.");
  }

  if (String(existing.role) === "admin" && role !== "admin") {
    const adminCount = database.prepare(`
      SELECT COUNT(*) as count
      FROM app_users
      WHERE role = 'admin'
    `).get() as { count: number };

    if (adminCount.count <= 1) {
      throw new Error("최소 1명의 관리자 계정은 유지해야 합니다.");
    }
  }

  const updatedAt = new Date().toISOString();
  database.prepare(`
    UPDATE app_users
    SET login_id = ?,
        display_name = ?,
        role = ?,
        status = ?,
        extension_number = ?,
        contact = ?,
        email = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    loginId,
    displayName,
    role,
    status,
    extensionNumber ?? null,
    contact ?? null,
    email ?? null,
    updatedAt,
    input.id
  );

  const saved = listStoredOperationUsers().find((user) => user.id === input.id);

  if (!saved) {
    throw new Error("사용자 정보를 저장하지 못했습니다.");
  }

  return saved;
};

export const deleteStoredOperationUser = (userId: string) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureOperationsSeed();

  const target = database.prepare(`
    SELECT id, role
    FROM app_users
    WHERE id = ?
    LIMIT 1
  `).get(userId) as { id: string; role: UserRecord["role"] } | undefined;

  if (!target) {
    throw new Error("삭제할 사용자를 찾을 수 없습니다.");
  }

  if (target.role === "admin") {
    const adminCount = database.prepare(`
      SELECT COUNT(*) as count
      FROM app_users
      WHERE role = 'admin'
    `).get() as { count: number };

    if (adminCount.count <= 1) {
      throw new Error("최소 1명의 관리자 계정은 유지해야 합니다.");
    }
  }

  database.prepare(`
    DELETE FROM app_users
    WHERE id = ?
  `).run(userId);
};

export const listStoredDocumentTemplateVersions = (
  templateType?: TemplateType
): DocumentTemplateVersion[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureOperationsSeed();

  const rows = database.prepare(`
    SELECT *
    FROM document_template_versions
    ORDER BY template_type ASC, is_default DESC, created_at DESC
  `).all() as Array<Record<string, unknown>>;

  return rows
    .filter((row) => (templateType ? row.template_type === templateType : true))
    .map(toDocumentTemplateVersion);
};

export const listStoredDocumentTemplateHistory = (
  templateType?: TemplateType
): DocumentTemplateHistoryRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureOperationsSeed();

  const rows = database.prepare(`
    SELECT *
    FROM document_template_history
    ${templateType ? "WHERE template_type = ?" : ""}
    ORDER BY occurred_at DESC
    LIMIT 40
  `).all(...(templateType ? [templateType] : [])) as Array<Record<string, unknown>>;

  return rows.map(toDocumentTemplateHistoryRecord);
};

export const listStoredApprovedDocumentTemplateVersions = (
  templateType?: TemplateType
): DocumentTemplateVersion[] =>
  listStoredDocumentTemplateVersions(templateType).filter((template) => template.status === "approved");

export const resolveStoredDefaultDocumentTemplateVersion = (
  templateType: TemplateType
): DocumentTemplateVersion | null => {
  const approvedTemplates = listStoredApprovedDocumentTemplateVersions(templateType);

  return approvedTemplates.find((template) => template.isDefault) ?? approvedTemplates[0] ?? null;
};

export const saveStoredDocumentTemplateVersion = (input: {
  id?: string;
  templateType: TemplateType;
  versionLabel: string;
  sourcePath: string;
  status: DocumentTemplateVersion["status"];
  isDefault?: boolean;
  outputFileNamePattern?: string;
  profileSchemaVersion?: string;
  profile?: DocumentTemplateProfile;
  validation?: DocumentTemplateValidationSnapshot;
  checksum?: string;
}): DocumentTemplateVersion => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  const existing = input.id
    ? (database.prepare(`
        SELECT *
        FROM document_template_versions
        WHERE id = ?
        LIMIT 1
      `).get(input.id) as Record<string, unknown> | undefined)
    : undefined;
  const id = existing ? String(existing.id) : `template-${input.templateType}-${randomUUID()}`;
  const createdAt = existing ? String(existing.created_at) : new Date().toISOString();
  const updatedAt = new Date().toISOString();
  const approvedDefaultCountRow = database.prepare(`
    SELECT COUNT(*) as count
    FROM document_template_versions
    WHERE template_type = ?
      AND status = 'approved'
      AND is_default = 1
      AND id != ?
  `).get(input.templateType, id) as { count: number };
  const shouldMarkAsDefault =
    input.status === "approved" &&
    (input.isDefault === true ||
      (existing ? Number(existing.is_default ?? 0) === 1 : false) ||
      approvedDefaultCountRow.count === 0);
  const outputFileNamePattern = normalizeDocumentTemplateOutputFileNamePattern(
    input.templateType,
    input.outputFileNamePattern ??
      (existing?.output_file_name_pattern ? String(existing.output_file_name_pattern) : undefined)
  );
  const approvedAt =
    input.status === "approved"
      ? existing?.approved_at
        ? String(existing.approved_at)
        : updatedAt
      : null;

  database.prepare(`
    INSERT INTO document_template_versions (
      id,
      template_type,
      version_label,
      source_path,
      status,
      is_default,
      output_file_name_pattern,
      profile_schema_version,
      profile_json,
      validation_json,
      checksum,
      created_at,
      updated_at,
      approved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      template_type = excluded.template_type,
      version_label = excluded.version_label,
      source_path = excluded.source_path,
      status = excluded.status,
      is_default = excluded.is_default,
      output_file_name_pattern = excluded.output_file_name_pattern,
      profile_schema_version = excluded.profile_schema_version,
      profile_json = excluded.profile_json,
      validation_json = excluded.validation_json,
      checksum = excluded.checksum,
      updated_at = excluded.updated_at,
      approved_at = excluded.approved_at
  `).run(
    id,
    input.templateType,
    input.versionLabel,
    input.sourcePath,
    input.status,
    shouldMarkAsDefault ? 1 : 0,
    outputFileNamePattern,
    input.profileSchemaVersion ?? null,
    input.profile ? JSON.stringify(input.profile) : null,
    input.validation ? JSON.stringify(input.validation) : null,
    input.checksum ?? null,
    createdAt,
    updatedAt,
    approvedAt
  );

  if (shouldMarkAsDefault) {
    database.prepare(`
      UPDATE document_template_versions
      SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END
      WHERE template_type = ?
    `).run(id, input.templateType);
  }

  const saved = listStoredDocumentTemplateVersions().find((template) => template.id === id);

  if (!saved) {
    throw new Error("양식 버전을 저장하지 못했습니다.");
  }

  appendDocumentTemplateHistory({
    templateId: saved.id,
    templateType: saved.templateType,
    versionLabel: saved.versionLabel,
    actionType: existing ? "updated" : "registered",
    detail: existing ? "양식 프로필과 좌표를 수정했습니다." : "새 양식 버전을 등록했습니다."
  });

  return saved;
};

export const approveStoredDocumentTemplateVersion = (
  templateId: string
): DocumentTemplateVersion => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  const current = database.prepare(`
    SELECT id, template_type
    FROM document_template_versions
    WHERE id = ?
    LIMIT 1
  `).get(templateId) as { id: string; template_type: TemplateType } | undefined;

  if (!current) {
    throw new Error("승인할 양식 버전을 찾을 수 없습니다.");
  }

  const approvedDefaultCountRow = database.prepare(`
    SELECT COUNT(*) as count
    FROM document_template_versions
    WHERE template_type = ?
      AND status = 'approved'
      AND is_default = 1
      AND id != ?
  `).get(current.template_type, templateId) as { count: number };
  const updatedAt = new Date().toISOString();
  const result = database.prepare(`
    UPDATE document_template_versions
    SET status = 'approved',
        is_default = ?,
        updated_at = ?,
        approved_at = ?
    WHERE id = ?
  `).run(approvedDefaultCountRow.count === 0 ? 1 : 0, updatedAt, updatedAt, templateId);

  if (Number(result.changes ?? 0) === 0) {
    throw new Error("승인할 양식 버전을 찾을 수 없습니다.");
  }

  const approved = listStoredDocumentTemplateVersions().find((template) => template.id === templateId)!;

  appendDocumentTemplateHistory({
    templateId: approved.id,
    templateType: approved.templateType,
    versionLabel: approved.versionLabel,
    actionType: "approved",
    detail: approved.isDefault
      ? "승인과 동시에 기본 사용 양식으로 지정했습니다."
      : "양식을 승인해 사용 후보로 전환했습니다."
  });

  return approved;
};

export const updateStoredDocumentTemplateOutputFileNamePattern = (input: {
  templateId: string;
  outputFileNamePattern: string;
}): DocumentTemplateVersion => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  const current = database.prepare(`
    SELECT id, template_type, version_label
    FROM document_template_versions
    WHERE id = ?
    LIMIT 1
  `).get(input.templateId) as {
    id: string;
    template_type: TemplateType;
    version_label: string;
  } | undefined;

  if (!current) {
    throw new Error("파일명 규칙을 수정할 양식 버전을 찾을 수 없습니다.");
  }

  const normalizedPattern = normalizeDocumentTemplateOutputFileNamePattern(
    current.template_type,
    input.outputFileNamePattern
  );
  const updatedAt = new Date().toISOString();
  const result = database.prepare(`
    UPDATE document_template_versions
    SET output_file_name_pattern = ?,
        updated_at = ?
    WHERE id = ?
  `).run(normalizedPattern, updatedAt, input.templateId);

  if (Number(result.changes ?? 0) === 0) {
    throw new Error("파일명 규칙을 수정할 양식 버전을 찾을 수 없습니다.");
  }

  const updated = listStoredDocumentTemplateVersions().find(
    (template) => template.id === input.templateId
  );

  if (!updated) {
    throw new Error("파일명 규칙을 수정한 양식 버전을 불러오지 못했습니다.");
  }

  appendDocumentTemplateHistory({
    templateId: updated.id,
    templateType: updated.templateType,
    versionLabel: updated.versionLabel,
    actionType: "updated",
    detail: `출력 파일명 규칙을 변경했습니다. ${normalizedPattern}`
  });

  return updated;
};

export const setStoredDefaultDocumentTemplateVersion = (
  templateId: string
): DocumentTemplateVersion => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  const current = database.prepare(`
    SELECT id, template_type, status
    FROM document_template_versions
    WHERE id = ?
    LIMIT 1
  `).get(templateId) as { id: string; template_type: TemplateType; status: DocumentTemplateVersion["status"] } | undefined;

  if (!current) {
    throw new Error("기본 사용으로 전환할 양식 버전을 찾을 수 없습니다.");
  }

  if (current.status !== "approved") {
    throw new Error("승인된 양식만 기본 사용으로 전환할 수 있습니다.");
  }

  const updatedAt = new Date().toISOString();
  database.prepare(`
    UPDATE document_template_versions
    SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END,
        updated_at = CASE WHEN id = ? THEN ? ELSE updated_at END
    WHERE template_type = ?
  `).run(templateId, templateId, updatedAt, current.template_type);

  const selected = listStoredDocumentTemplateVersions().find((template) => template.id === templateId)!;

  appendDocumentTemplateHistory({
    templateId: selected.id,
    templateType: selected.templateType,
    versionLabel: selected.versionLabel,
    actionType: "set-default",
    detail: "기본 사용 양식으로 전환했습니다."
  });

  return selected;
};

export const deleteStoredDocumentTemplateVersion = (templateId: string) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  const target = database.prepare(`
    SELECT id, template_type, version_label, is_default
    FROM document_template_versions
    WHERE id = ?
    LIMIT 1
  `).get(templateId) as {
    id: string;
    template_type: TemplateType;
    version_label: string;
    is_default: number;
  } | undefined;

  if (!target) {
    throw new Error("삭제할 양식 버전을 찾을 수 없습니다.");
  }

  const monthlyScheduleUsage = database.prepare(`
    SELECT COUNT(*) as count
    FROM monthly_schedules
    WHERE template_version_id = ?
  `).get(templateId) as { count: number };
  const allowanceUsage = database.prepare(`
    SELECT COUNT(*) as count
    FROM allowance_document_exports
    WHERE proposal_template_version_id = ?
       OR attachment1_template_version_id = ?
       OR attachment2_template_version_id = ?
  `).get(templateId, templateId, templateId) as { count: number };

  if (monthlyScheduleUsage.count > 0 || allowanceUsage.count > 0) {
    throw new Error("이미 사용 중인 양식 버전은 삭제할 수 없습니다.");
  }

  database.prepare(`
    DELETE FROM document_template_versions
    WHERE id = ?
  `).run(templateId);

  appendDocumentTemplateHistory({
    templateId: target.id,
    templateType: target.template_type,
    versionLabel: target.version_label,
    actionType: "deleted",
    detail: Number(target.is_default ?? 0) === 1 ? "기본 사용 양식을 삭제했습니다." : "양식을 삭제했습니다."
  });

  if (Number(target.is_default ?? 0) === 1) {
    const replacement = database.prepare(`
      SELECT id
      FROM document_template_versions
      WHERE template_type = ?
        AND status = 'approved'
      ORDER BY approved_at DESC, created_at DESC
      LIMIT 1
    `).get(target.template_type) as { id: string } | undefined;

    if (replacement) {
      database.prepare(`
        UPDATE document_template_versions
        SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END
        WHERE template_type = ?
      `).run(replacement.id, target.template_type);

      const replacementTemplate = listStoredDocumentTemplateVersions().find(
        (template) => template.id === replacement.id
      );

      if (replacementTemplate) {
        appendDocumentTemplateHistory({
          templateId: replacementTemplate.id,
          templateType: replacementTemplate.templateType,
          versionLabel: replacementTemplate.versionLabel,
          actionType: "set-default",
          detail: "기존 기본 양식 삭제로 인해 기본 사용 양식으로 자동 전환했습니다."
        });
      }
    }
  }
};

export const resetOperationsStorageForTest = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  database.exec("DELETE FROM holiday_items;");
  database.exec("DELETE FROM holiday_calendars;");
  database.exec("DELETE FROM allowance_rate_items;");
  database.exec("DELETE FROM allowance_rate_versions;");
  database.exec("DELETE FROM app_users;");
  database.exec("DELETE FROM document_template_history;");
  database.exec("DELETE FROM document_template_versions;");
};
