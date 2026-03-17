import { randomUUID } from "node:crypto";
import path from "node:path";

import { allowanceRateVersionFixtures } from "../../shared/domain/allowance-rate-fixtures";
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
      versionLabel: "2026.1",
      sourcePath: path.resolve(sampleDir, "품위서_샘플.xlsx"),
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
      contact,
      email,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  defaultUsers.forEach((user) => {
    insertUser.run(
      user.id,
      user.loginId,
      user.displayName,
      user.role,
      user.status,
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

const ensureOperationsSeed = () => {
  ensureHolidaySeed();
  ensureAllowanceRateSeed();
  ensureUserSeed();
  ensureTemplateSeed();
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
