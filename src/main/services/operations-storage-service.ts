import path from "node:path";

import { allowanceRateVersionFixtures } from "../../shared/domain/allowance-rate-fixtures";
import type {
  AllowanceRateVersion,
  DocumentTemplateVersion,
  HolidayCalendar,
  HolidayItem,
  TemplateType,
  UserRecord
} from "../../shared/domain/model";
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
      id: "template-schedule-2026-1",
      templateType: "schedule",
      versionLabel: "2026.1",
      sourcePath: path.resolve(sampleDir, "배포_근무표샘플.xlsx"),
      createdAt: "2026-01-01T00:00:00+09:00"
    },
    {
      id: "template-proposal-2026-1",
      templateType: "proposal",
      versionLabel: "2026.1",
      sourcePath: path.resolve(sampleDir, "품위서_샘플.xlsx"),
      createdAt: "2026-01-01T00:00:00+09:00"
    },
    {
      id: "template-attachment1-2026-1",
      templateType: "attachment1",
      versionLabel: "2026.1",
      sourcePath: path.resolve(sampleDir, "별첨1_샘플.xlsx"),
      createdAt: "2026-01-01T00:00:00+09:00"
    },
    {
      id: "template-attachment2-2026-1",
      templateType: "attachment2",
      versionLabel: "2026.1",
      sourcePath: path.resolve(sampleDir, "별첨2_샘플.xlsx"),
      createdAt: "2026-01-01T00:00:00+09:00"
    }
  ];
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
  checksum: row.checksum ? String(row.checksum) : undefined,
  createdAt: String(row.created_at)
});

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
      checksum,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  defaultDocumentTemplateVersions().forEach((template) => {
    insertTemplate.run(
      template.id,
      template.templateType,
      template.versionLabel,
      template.sourcePath,
      template.checksum ?? null,
      template.createdAt
    );
  });
};

const ensureOperationsSeed = () => {
  ensureHolidaySeed();
  ensureAllowanceRateSeed();
  ensureUserSeed();
  ensureTemplateSeed();
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
    ORDER BY template_type ASC, created_at DESC
  `).all() as Array<Record<string, unknown>>;

  return rows
    .filter((row) => (templateType ? row.template_type === templateType : true))
    .map(toDocumentTemplateVersion);
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
  database.exec("DELETE FROM document_template_versions;");
};
