import { randomUUID } from "node:crypto";

import type { SiteUpsertInput } from "../../shared/bridge/contracts";
import type { SiteRecord } from "../../shared/domain/model";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

const DEFAULT_SITE_TIMEZONE = "Asia/Seoul";

const defaultSites: SiteUpsertInput[] = [
  {
    siteCode: "SITE-BRM",
    name: "보라매DC",
    customerName: "SK telecom",
    status: "active",
    timezone: DEFAULT_SITE_TIMEZONE
  },
  {
    siteCode: "SITE-DTN",
    name: "동탄센터",
    status: "active",
    timezone: DEFAULT_SITE_TIMEZONE
  },
  {
    siteCode: "SITE-ICH",
    name: "인천허브",
    status: "inactive",
    timezone: DEFAULT_SITE_TIMEZONE
  }
];

const toSiteRecord = (row: Record<string, unknown>): SiteRecord => ({
  id: String(row.id),
  siteCode: String(row.site_code),
  name: String(row.name),
  customerName: row.customer_name ? String(row.customer_name) : undefined,
  status: row.status as SiteRecord["status"],
  timezone: String(row.timezone),
  createdAt: String(row.created_at),
  updatedAt: row.updated_at ? String(row.updated_at) : undefined
});

const normalizeSiteCode = (value: string | undefined) => value?.trim().toUpperCase() ?? "";

const resolveUniqueSiteCode = (
  database: NonNullable<ReturnType<typeof getSqliteDatabase>>,
  requestedSiteCode: string,
  siteId?: string
) => {
  const normalizedSiteCode = normalizeSiteCode(requestedSiteCode);

  if (!normalizedSiteCode) {
    return buildNextAutoSiteCode(database);
  }

  const conflict = database.prepare(`
    SELECT id
    FROM sites
    WHERE site_code = ?
    LIMIT 1
  `).get(normalizedSiteCode) as { id: string } | undefined;

  if (!conflict || conflict.id === siteId) {
    return normalizedSiteCode;
  }

  return buildNextAutoSiteCode(database);
};

const buildNextAutoSiteCode = (database: NonNullable<ReturnType<typeof getSqliteDatabase>>) => {
  const rows = database
    .prepare(`
      SELECT site_code
      FROM sites
      ORDER BY site_code ASC
    `)
    .all() as Array<{ site_code: string }>;

  const maxIndex = rows.reduce((currentMax, row) => {
    const matched = String(row.site_code)
      .trim()
      .toUpperCase()
      .match(/^SITE-(\d+)$/);

    if (!matched) {
      return currentMax;
    }

    return Math.max(currentMax, Number(matched[1]));
  }, 0);

  return `SITE-${String(maxIndex + 1).padStart(3, "0")}`;
};

const ensureSiteSeed = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const row = database.prepare("SELECT COUNT(*) as count FROM sites").get() as {
    count: number;
  };

  if (row.count > 0) {
    return;
  }

  const now = new Date().toISOString();
  const insert = database.prepare(`
    INSERT INTO sites (id, site_code, name, customer_name, status, timezone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  defaultSites.forEach((site) => {
    insert.run(
      randomUUID(),
      site.siteCode,
      site.name,
      site.customerName?.trim() || null,
      site.status,
      site.timezone,
      now,
      now
    );
  });
};

export const listStoredSites = (options?: { includeDeleted?: boolean }): SiteRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureSiteSeed();

  const rows = database.prepare(`
    SELECT *
    FROM sites
    ${options?.includeDeleted ? "" : "WHERE deleted_at IS NULL"}
    ORDER BY name ASC
  `).all() as Array<Record<string, unknown>>;

  return rows.map(toSiteRecord);
};

export const saveStoredSite = (input: SiteUpsertInput): SiteRecord => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureSiteSeed();

  const existing = input.id
    ? (database.prepare(`
        SELECT *
        FROM sites
        WHERE id = ?
        LIMIT 1
      `).get(input.id) as Record<string, unknown> | undefined)
    : undefined;

  const id = existing ? String(existing.id) : randomUUID();
  const createdAt = existing ? String(existing.created_at) : new Date().toISOString();
  const updatedAt = new Date().toISOString();
  const resolvedSiteCode = existing
    ? resolveUniqueSiteCode(database, input.siteCode || String(existing.site_code), id)
    : resolveUniqueSiteCode(database, input.siteCode);

  database.prepare(`
    INSERT INTO sites (id, site_code, name, customer_name, status, timezone, deleted_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      site_code = excluded.site_code,
      name = excluded.name,
      customer_name = excluded.customer_name,
      status = excluded.status,
      timezone = excluded.timezone,
      deleted_at = excluded.deleted_at,
      updated_at = excluded.updated_at
  `).run(
    id,
    resolvedSiteCode,
    input.name,
    input.customerName?.trim() || null,
    input.status,
    input.timezone || DEFAULT_SITE_TIMEZONE,
    null,
    createdAt,
    updatedAt
  );

  const row = database.prepare(`
    SELECT *
    FROM sites
    WHERE id = ?
    LIMIT 1
  `).get(id) as Record<string, unknown>;

  return toSiteRecord(row);
};

export const deleteStoredSite = (siteId: string): SiteRecord => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureSiteSeed();

  const existing = database.prepare(`
    SELECT *
    FROM sites
    WHERE id = ?
    LIMIT 1
  `).get(siteId) as Record<string, unknown> | undefined;

  if (!existing) {
    throw new Error("삭제할 근무지를 찾을 수 없습니다.");
  }

  if (existing.deleted_at) {
    throw new Error("이미 삭제된 근무지입니다.");
  }

  const deletedAt = new Date().toISOString();

  database.prepare(`
    UPDATE sites
    SET status = 'inactive',
        deleted_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(deletedAt, deletedAt, siteId);

  const deletedRow = database.prepare(`
    SELECT *
    FROM sites
    WHERE id = ?
    LIMIT 1
  `).get(siteId) as Record<string, unknown>;

  return toSiteRecord(deletedRow);
};

export const resetSiteStorageForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM sites;");
  }
};
