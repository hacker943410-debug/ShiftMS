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
  AllowanceRateHistoryAction,
  AllowanceRateHistoryRecord,
  AllowanceRateVersion,
  DocumentTemplateHistoryAction,
  DocumentTemplateHistoryRecord,
  DocumentTemplateVersion,
  HolidayCalendar,
  HolidayItem,
  SiteNameOptionRecord,
  TemplateType,
  UserRecord
} from "../../shared/domain/model";
import {
  getCurrentDocumentTemplateProfileSchemaVersion,
  normalizeDocumentTemplateProfile,
  normalizeDocumentTemplateValidationSnapshot
} from "./document-template-profile-service";
import { resolveBundledSeedDocumentTemplatePath } from "./document-template-source-path-service";
import {
  getDefaultDocumentTemplateOutputFileNamePattern,
  normalizeDocumentTemplateOutputFileNamePattern
} from "./document-template-output-file-name-service";
import {
  createBootstrapPasswordHash,
  createPasswordHash,
  isPasswordHashValid,
  validatePasswordInput
} from "./auth-password-service";
import { ensureAuthBootstrapCredentials } from "./auth-bootstrap-service";
import { seededOperationUsers } from "./auth-seed-users";
import {
  getSqliteDatabase,
  getSqliteStorageContext,
  isSqliteStorageReady
} from "./sqlite-storage-service";

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

const defaultUsers: UserRecord[] = seededOperationUsers;

const SITE_NAME_OPTIONS_SETTING_KEY = "site_name_options_json";

const defaultSiteNameOptions: SiteNameOptionRecord[] = [
  {
    id: "site-name-option-sk-telecom",
    name: "SK telecom",
    usageCount: 0,
    createdAt: "2026-01-01T00:00:00+09:00",
    updatedAt: "2026-01-01T00:00:00+09:00"
  }
];

const defaultDocumentTemplateVersions = (): DocumentTemplateVersion[] => {
  return [
    {
      id: "template-schedule-sample1-2026-1",
      templateType: "schedule",
      versionLabel: "근무표 양식 1",
      sourcePath: resolveBundledSeedDocumentTemplatePath("근무표_템플릿1.xlsx"),
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
      sourcePath: resolveBundledSeedDocumentTemplatePath("근무표_템플릿2.xlsx"),
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
      sourcePath: resolveBundledSeedDocumentTemplatePath(
        "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx"
      ),
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
      sourcePath: resolveBundledSeedDocumentTemplatePath("별첨1_샘플.xlsx"),
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
      sourcePath: resolveBundledSeedDocumentTemplatePath("별첨2_샘플.xlsx"),
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
  if (
    value === "admin" ||
    value === "planner" ||
    value === "reviewer" ||
    value === "operator"
  ) {
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

const normalizeSiteNameOptionName = (value: string) => {
  const normalized = String(value).trim();

  if (normalized.length === 0) {
    throw new Error("사이트 명을 입력해 주세요.");
  }

  return normalized;
};

const getSiteNameOptionKey = (value: string) =>
  normalizeSiteNameOptionName(value).toLocaleLowerCase("ko-KR");

const cloneDefaultSiteNameOptions = () =>
  defaultSiteNameOptions.map((option) => ({
    ...option
  }));

const normalizeSiteNameOptionPayload = (payload: unknown): SiteNameOptionRecord[] => {
  if (!Array.isArray(payload)) {
    return cloneDefaultSiteNameOptions();
  }

  const seenKeys = new Set<string>();
  const now = new Date().toISOString();
  const options: SiteNameOptionRecord[] = [];

  payload.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const record = item as Partial<SiteNameOptionRecord>;
    const rawName = typeof record.name === "string" ? record.name.trim() : "";

    if (!rawName) {
      return;
    }

    const optionKey = rawName.toLocaleLowerCase("ko-KR");

    if (seenKeys.has(optionKey)) {
      return;
    }

    seenKeys.add(optionKey);
    options.push({
      id:
        typeof record.id === "string" && record.id.trim()
          ? record.id.trim()
          : `site-name-option-${index}-${randomUUID()}`,
      name: rawName,
      usageCount: 0,
      createdAt:
        typeof record.createdAt === "string" && record.createdAt.trim()
          ? record.createdAt
          : now,
      updatedAt:
        typeof record.updatedAt === "string" && record.updatedAt.trim()
          ? record.updatedAt
          : undefined
    });
  });

  return options;
};

const readStoredSiteNameOptions = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return null;
  }

  const row = database.prepare(`
    SELECT value
    FROM app_setting_entries
    WHERE setting_key = ?
    LIMIT 1
  `).get(SITE_NAME_OPTIONS_SETTING_KEY) as { value: string } | undefined;

  if (!row) {
    return null;
  }

  try {
    return normalizeSiteNameOptionPayload(JSON.parse(row.value));
  } catch {
    return cloneDefaultSiteNameOptions();
  }
};

const writeStoredSiteNameOptions = (options: SiteNameOptionRecord[]) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  database.prepare(`
    INSERT INTO app_setting_entries (
      setting_key,
      value,
      updated_at
    ) VALUES (?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(
    SITE_NAME_OPTIONS_SETTING_KEY,
    JSON.stringify(
      options.map((option) => ({
        id: option.id,
        name: option.name,
        createdAt: option.createdAt,
        updatedAt: option.updatedAt
      }))
    ),
    new Date().toISOString()
  );
};

const countSiteNameUsage = (siteName: string) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return 0;
  }

  const row = database.prepare(`
    SELECT COUNT(*) as count
    FROM sites
    WHERE deleted_at IS NULL
      AND customer_name = ?
  `).get(siteName) as { count: number } | undefined;

  return Number(row?.count ?? 0);
};

const withSiteNameUsage = (options: SiteNameOptionRecord[]) =>
  options
    .map((option) => ({
      ...option,
      usageCount: countSiteNameUsage(option.name)
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "ko"));

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
  changeReason: row.change_reason ? String(row.change_reason) : undefined,
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

const toAllowanceRateHistoryRecord = (
  row: Record<string, unknown>
): AllowanceRateHistoryRecord => ({
  id: String(row.id),
  rateVersionId: String(row.rate_version_id),
  year: Number(row.year),
  versionLabel: String(row.version_label),
  actionType: row.action_type as AllowanceRateHistoryAction,
  reason: String(row.reason),
  detail: row.detail ? String(row.detail) : undefined,
  occurredAt: String(row.occurred_at)
});

const appendAllowanceRateHistory = (input: {
  rateVersionId: string;
  year: number;
  versionLabel: string;
  actionType: AllowanceRateHistoryAction;
  reason: string;
  detail?: string;
  occurredAt?: string;
}) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  database.prepare(`
    INSERT INTO allowance_rate_history (
      id,
      rate_version_id,
      year,
      version_label,
      action_type,
      reason,
      detail,
      occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `rate-history-${randomUUID()}`,
    input.rateVersionId,
    input.year,
    input.versionLabel,
    input.actionType,
    input.reason,
    input.detail ?? null,
    input.occurredAt ?? new Date().toISOString()
  );
};

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

type StoredOperationAuthRecord = UserRecord & {
  passwordHash?: string;
  mustChangePassword: boolean;
  signInFailureCount: number;
  signInLockedUntil?: string;
};

const toStoredOperationAuthRecord = (row: Record<string, unknown>): StoredOperationAuthRecord => ({
  ...toUserRecord(row),
  passwordHash: row.password_hash ? String(row.password_hash) : undefined,
  mustChangePassword: Number(row.must_change_password ?? 0) === 1,
  signInFailureCount: Number(row.sign_in_failure_count ?? 0),
  signInLockedUntil: row.sign_in_locked_until ? String(row.sign_in_locked_until) : undefined
});

const AUTH_SIGN_IN_LOCKOUT_THRESHOLD = 5;
const AUTH_SIGN_IN_LOCKOUT_DURATION_MS = 1000 * 60 * 15;

const parseIsoTimestamp = (value?: string) => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? null : parsed;
};

const toDocumentTemplateVersion = (row: Record<string, unknown>): DocumentTemplateVersion => {
  const templateType = row.template_type as TemplateType;
  const rawValidation = row.validation_json
    ? (JSON.parse(String(row.validation_json)) as unknown as DocumentTemplateValidationSnapshot)
    : undefined;
  const rawProfile = row.profile_json ? JSON.parse(String(row.profile_json)) : undefined;
  const profile = normalizeDocumentTemplateProfile(
    templateType,
    rawProfile,
    rawValidation?.primarySheetName
  );
  const validation = normalizeDocumentTemplateValidationSnapshot({
    templateType,
    validation: rawValidation,
    profile,
    primarySheetName:
      rawValidation?.primarySheetName ??
      (profile && profile.kind !== "schedule" ? profile.primarySheetName : "Sheet1")
  });

  return {
    id: String(row.id),
    templateType,
    versionLabel: String(row.version_label),
    sourcePath: String(row.source_path),
    status: (row.status as DocumentTemplateVersion["status"]) ?? "approved",
    isDefault: Number(row.is_default ?? 0) === 1,
    outputFileNamePattern: row.output_file_name_pattern
      ? String(row.output_file_name_pattern)
      : getDefaultDocumentTemplateOutputFileNamePattern(templateType),
    profileSchemaVersion: row.profile_schema_version
      ? String(row.profile_schema_version)
      : profile
        ? getCurrentDocumentTemplateProfileSchemaVersion()
        : undefined,
    profile,
    validation,
    checksum: row.checksum ? String(row.checksum) : undefined,
    createdAt: String(row.created_at),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
    approvedAt: row.approved_at ? String(row.approved_at) : undefined
  };
};

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
      change_reason,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      version.changeReason ?? null,
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

const ensureAllowanceRateHistorySeed = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const historyCountRow = database.prepare(
    "SELECT COUNT(*) as count FROM allowance_rate_history"
  ).get() as {
    count: number;
  };

  if (historyCountRow.count > 0) {
    return;
  }

  const versionRows = database.prepare(`
    SELECT id, year, version_label, status, change_reason, created_at, updated_at
    FROM allowance_rate_versions
    ORDER BY created_at ASC
  `).all() as Array<Record<string, unknown>>;

  versionRows.forEach((row) => {
    const status = row.status as AllowanceRateVersion["status"];
    const occurredAt = row.updated_at ? String(row.updated_at) : String(row.created_at);
    const reason =
      row.change_reason && String(row.change_reason).trim().length > 0
        ? String(row.change_reason)
        : status === "active"
          ? "이력 기능 도입 이전의 적용 요율입니다."
          : "이력 기능 도입 이전에 저장된 요율 버전입니다.";

    appendAllowanceRateHistory({
      rateVersionId: String(row.id),
      year: Number(row.year),
      versionLabel: String(row.version_label),
      actionType: status === "active" ? "applied" : "registered",
      reason,
      detail: "기존 저장 데이터를 기준으로 초기 이력을 구성했습니다.",
      occurredAt
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
      password_hash,
      must_change_password,
      extension_number,
      contact,
      email,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const bootstrapCredentials = ensureAuthBootstrapCredentials(getSqliteStorageContext() ?? {}, {
    reactivateRetiredUsers: true
  });

  defaultUsers.forEach((user) => {
    insertUser.run(
      user.id,
      user.loginId,
      user.displayName,
      user.role,
      user.status,
      createBootstrapPasswordHash(bootstrapCredentials.credentials[user.id].password),
      1,
      user.extensionNumber ?? null,
      user.contact ?? null,
      user.email ?? null,
      user.createdAt,
      user.updatedAt ?? null
    );
  });
};

const ensureSeedUserPasswords = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const selectUser = database.prepare(`
    SELECT id, password_hash, must_change_password
    FROM app_users
    WHERE id = ?
    LIMIT 1
  `);
  const updatePasswordHash = database.prepare(`
    UPDATE app_users
    SET password_hash = ?,
        must_change_password = 1,
        updated_at = ?
    WHERE id = ?
  `);
  const markPasswordChangeRequired = database.prepare(`
    UPDATE app_users
    SET must_change_password = 1,
        updated_at = ?
    WHERE id = ?
  `);
  const bootstrapCredentials = ensureAuthBootstrapCredentials(getSqliteStorageContext() ?? {});

  Object.entries(bootstrapCredentials.credentials).forEach(([userId, entry]) => {
    const existing = selectUser.get(userId) as
      | { id: string; password_hash?: string | null; must_change_password?: number | null }
      | undefined;

    if (!existing) {
      return;
    }

    if (!existing.password_hash) {
      updatePasswordHash.run(
        createBootstrapPasswordHash(entry.password),
        new Date().toISOString(),
        userId
      );
      return;
    }

    if (
      Number(existing.must_change_password ?? 0) !== 1 &&
      isPasswordHashValid(entry.password, String(existing.password_hash))
    ) {
      markPasswordChangeRequired.run(new Date().toISOString(), userId);
    }
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
  ensureAllowanceRateHistorySeed();
  ensureUserSeed();
  ensureSeedUserPasswords();
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

export const listStoredAllowanceRateHistory = (): AllowanceRateHistoryRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureOperationsSeed();

  const rows = database.prepare(`
    SELECT *
    FROM allowance_rate_history
    ORDER BY occurred_at DESC
    LIMIT 40
  `).all() as Array<Record<string, unknown>>;

  return rows.map(toAllowanceRateHistoryRecord);
};

export const saveStoredAllowanceRateVersion = (input: {
  id?: string;
  year: number;
  versionLabel: string;
  status: AllowanceRateVersion["status"];
  effectiveFrom: string;
  effectiveTo?: string;
  changeReason?: string;
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
  const changeReason = existing
    ? normalizeRequiredText(input.changeReason ?? "", "변경 사유")
    : normalizeOptionalText(input.changeReason);
  const todayIso = new Date().toISOString().slice(0, 10);

  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new Error("적용 종료일은 시작일보다 빠를 수 없습니다.");
  }

  if (existing) {
    const existingEffectiveFrom = String(existing.effective_from);

    if (existingEffectiveFrom < todayIso && effectiveFrom !== existingEffectiveFrom) {
      throw new Error("이미 시작된 요율의 적용 시작일은 변경할 수 없습니다.");
    }

    if (effectiveFrom < todayIso && effectiveFrom !== existingEffectiveFrom) {
      throw new Error("요율 수정 시 적용 시작일은 오늘 이전으로 변경할 수 없습니다.");
    }
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
  const historyActionType: AllowanceRateHistoryAction =
    status === "active" && (!existing || existing.status !== "active")
      ? "applied"
      : !existing
        ? "registered"
        : "updated";
  const historyReason = changeReason ?? "신규 등록";

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
        change_reason,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        year = excluded.year,
        version_label = excluded.version_label,
        status = excluded.status,
        effective_from = excluded.effective_from,
        effective_to = excluded.effective_to,
        change_reason = excluded.change_reason,
        updated_at = excluded.updated_at
    `).run(
      id,
      year,
      versionLabel,
      status,
      effectiveFrom,
      effectiveTo ?? null,
      changeReason ?? null,
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

    appendAllowanceRateHistory({
      rateVersionId: id,
      year,
      versionLabel,
      actionType: historyActionType,
      reason: historyReason,
      detail:
        historyActionType === "applied"
          ? "요율 적용 상태를 활성으로 전환했습니다."
          : historyActionType === "updated"
            ? "요율 버전 내용을 수정했습니다."
            : "새 요율 버전을 등록했습니다.",
      occurredAt: updatedAt
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
  password?: string;
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
  const nextPassword = input.password ?? "";

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("메일주소 형식이 올바르지 않습니다.");
  }

  if (!input.id) {
    if (nextPassword.length === 0) {
      throw new Error("초기 비밀번호를 입력해주세요.");
    }

    validatePasswordInput(nextPassword, "초기 비밀번호");

    const createdAt = new Date().toISOString();
    const id = `user-${randomUUID()}`;

    database.prepare(`
      INSERT INTO app_users (
        id,
        login_id,
        display_name,
        role,
        status,
        password_hash,
        must_change_password,
        extension_number,
        contact,
        email,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      loginId,
      displayName,
      role,
      status,
      createPasswordHash(nextPassword),
      1,
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

  if (nextPassword.length > 0) {
    validatePasswordInput(nextPassword, "비밀번호");
  }

  const updatedAt = new Date().toISOString();
  database.prepare(`
    UPDATE app_users
    SET login_id = ?,
        display_name = ?,
        role = ?,
        status = ?,
        password_hash = COALESCE(?, password_hash),
        must_change_password = COALESCE(?, must_change_password),
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
    nextPassword.length > 0 ? createPasswordHash(nextPassword) : null,
    nextPassword.length > 0 ? 1 : null,
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

export const findStoredOperationAuthByLoginId = (
  loginId: string
): StoredOperationAuthRecord | null => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return null;
  }

  ensureOperationsSeed();

  const normalizedLoginId = String(loginId).trim();

  if (normalizedLoginId.length === 0) {
    return null;
  }

  const row = database.prepare(`
    SELECT *
    FROM app_users
    WHERE login_id = ?
    LIMIT 1
  `).get(normalizedLoginId) as Record<string, unknown> | undefined;

  return row ? toStoredOperationAuthRecord(row) : null;
};

export const findStoredOperationAuthByUserId = (
  userId: string
): StoredOperationAuthRecord | null => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return null;
  }

  ensureOperationsSeed();

  const row = database.prepare(`
    SELECT *
    FROM app_users
    WHERE id = ?
    LIMIT 1
  `).get(userId) as Record<string, unknown> | undefined;

  return row ? toStoredOperationAuthRecord(row) : null;
};

export const clearStoredOperationAuthFailures = (userId: string) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  ensureOperationsSeed();

  database.prepare(`
    UPDATE app_users
    SET sign_in_failure_count = 0,
        sign_in_locked_until = NULL
    WHERE id = ?
  `).run(userId);
};

export const recordStoredOperationAuthFailure = (
  userId: string,
  now = Date.now()
): StoredOperationAuthRecord | null => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return null;
  }

  ensureOperationsSeed();

  const currentRow = database.prepare(`
    SELECT *
    FROM app_users
    WHERE id = ?
    LIMIT 1
  `).get(userId) as Record<string, unknown> | undefined;

  if (!currentRow) {
    return null;
  }

  const current = toStoredOperationAuthRecord(currentRow);
  const activeLockExpiresAt = parseIsoTimestamp(current.signInLockedUntil);
  const baseFailureCount =
    activeLockExpiresAt && activeLockExpiresAt <= now ? 0 : current.signInFailureCount;
  const nextFailureCount = baseFailureCount + 1;
  const nextLockedUntil =
    nextFailureCount >= AUTH_SIGN_IN_LOCKOUT_THRESHOLD
      ? new Date(now + AUTH_SIGN_IN_LOCKOUT_DURATION_MS).toISOString()
      : null;

  database.prepare(`
    UPDATE app_users
    SET sign_in_failure_count = ?,
        sign_in_locked_until = ?
    WHERE id = ?
  `).run(
    nextFailureCount,
    nextLockedUntil,
    userId
  );

  const updatedRow = database.prepare(`
    SELECT *
    FROM app_users
    WHERE id = ?
    LIMIT 1
  `).get(userId) as Record<string, unknown> | undefined;

  return updatedRow ? toStoredOperationAuthRecord(updatedRow) : null;
};

export const changeStoredOperationAuthPassword = (input: {
  userId: string;
  nextPassword: string;
  mustChangePassword?: boolean;
}): StoredOperationAuthRecord => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureOperationsSeed();

  const existing = database.prepare(`
    SELECT *
    FROM app_users
    WHERE id = ?
    LIMIT 1
  `).get(input.userId) as Record<string, unknown> | undefined;

  if (!existing) {
    throw new Error("사용자 정보를 찾을 수 없습니다.");
  }

  validatePasswordInput(input.nextPassword, "새 비밀번호");

  database.prepare(`
    UPDATE app_users
    SET password_hash = ?,
        must_change_password = ?,
        sign_in_failure_count = 0,
        sign_in_locked_until = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(
    createPasswordHash(input.nextPassword),
    input.mustChangePassword === true ? 1 : 0,
    new Date().toISOString(),
    input.userId
  );

  const updated = findStoredOperationAuthByUserId(input.userId);

  if (!updated) {
    throw new Error("사용자 정보를 저장하지 못했습니다.");
  }

  return updated;
};

export const listStoredSiteNameOptions = (): SiteNameOptionRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureOperationsSeed();

  return withSiteNameUsage(readStoredSiteNameOptions() ?? cloneDefaultSiteNameOptions());
};

export const saveStoredSiteNameOption = (input: {
  id?: string;
  name: string;
}): SiteNameOptionRecord => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureOperationsSeed();

  const optionName = normalizeSiteNameOptionName(input.name);
  const optionKey = getSiteNameOptionKey(optionName);
  const currentOptions = readStoredSiteNameOptions() ?? cloneDefaultSiteNameOptions();
  const existingOption = input.id
    ? currentOptions.find((option) => option.id === input.id)
    : undefined;

  if (input.id && !existingOption) {
    throw new Error("수정할 사이트 명을 찾을 수 없습니다.");
  }

  const duplicate = currentOptions.find(
    (option) => option.id !== input.id && getSiteNameOptionKey(option.name) === optionKey
  );

  if (duplicate) {
    throw new Error("같은 사이트 명이 이미 등록되어 있습니다.");
  }

  const now = new Date().toISOString();
  const savedOption: SiteNameOptionRecord = {
    id: existingOption?.id ?? `site-name-option-${randomUUID()}`,
    name: optionName,
    usageCount: 0,
    createdAt: existingOption?.createdAt ?? now,
    updatedAt: now
  };
  const nextOptions = existingOption
    ? currentOptions.map((option) => (option.id === savedOption.id ? savedOption : option))
    : [...currentOptions, savedOption];

  writeStoredSiteNameOptions(nextOptions);

  const stored = listStoredSiteNameOptions().find((option) => option.id === savedOption.id);

  if (!stored) {
    throw new Error("사이트 명을 저장하지 못했습니다.");
  }

  return stored;
};

export const deleteStoredSiteNameOption = (input: { optionId: string }) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureOperationsSeed();

  const currentOptions = readStoredSiteNameOptions() ?? cloneDefaultSiteNameOptions();
  const target = currentOptions.find((option) => option.id === input.optionId);

  if (!target) {
    throw new Error("삭제할 사이트 명을 찾을 수 없습니다.");
  }

  if (countSiteNameUsage(target.name) > 0) {
    throw new Error("현재 근무지에서 사용하는 사이트 명은 삭제할 수 없습니다.");
  }

  writeStoredSiteNameOptions(currentOptions.filter((option) => option.id !== input.optionId));
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

  const normalizedProfile = input.profile
    ? normalizeDocumentTemplateProfile(
        input.templateType,
        input.profile,
        input.validation?.primarySheetName
      )
    : undefined;
  const normalizedValidation = normalizeDocumentTemplateValidationSnapshot({
    templateType: input.templateType,
    validation: input.validation,
    profile: normalizedProfile,
    primarySheetName:
      input.validation?.primarySheetName ??
      (normalizedProfile && normalizedProfile.kind !== "schedule"
        ? normalizedProfile.primarySheetName
        : path.basename(input.sourcePath))
  });

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
    input.profileSchemaVersion ??
      (normalizedProfile ? getCurrentDocumentTemplateProfileSchemaVersion() : null),
    normalizedProfile ? JSON.stringify(normalizedProfile) : null,
    normalizedValidation ? JSON.stringify(normalizedValidation) : null,
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
    detail: existing ? "양식 프로필과 문서 위치 기준을 수정했습니다." : "새 양식 버전을 등록했습니다."
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
  database.exec("DELETE FROM allowance_rate_history;");
  database.exec("DELETE FROM allowance_rate_versions;");
  database.exec("DELETE FROM app_users;");
  database.exec("DELETE FROM document_template_history;");
  database.exec("DELETE FROM document_template_versions;");
  database.prepare(`
    DELETE FROM app_setting_entries
    WHERE setting_key = ?
  `).run(SITE_NAME_OPTIONS_SETTING_KEY);
};
