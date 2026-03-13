import { randomUUID } from "node:crypto";

import type { SiteUpsertInput } from "../../shared/bridge/contracts";
import type { SiteRecord } from "../../shared/domain/model";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

const defaultSites: SiteUpsertInput[] = [
  {
    siteCode: "SITE-BRM",
    name: "보라매DC",
    status: "active",
    timezone: "Asia/Seoul"
  },
  {
    siteCode: "SITE-DTN",
    name: "동탄센터",
    status: "active",
    timezone: "Asia/Seoul"
  },
  {
    siteCode: "SITE-ICH",
    name: "인천허브",
    status: "inactive",
    timezone: "Asia/Seoul"
  }
];

const toSiteRecord = (row: Record<string, unknown>): SiteRecord => ({
  id: String(row.id),
  siteCode: String(row.site_code),
  name: String(row.name),
  status: row.status as SiteRecord["status"],
  timezone: String(row.timezone),
  createdAt: String(row.created_at),
  updatedAt: row.updated_at ? String(row.updated_at) : undefined
});

const normalizeSiteCode = (value: string | undefined) => value?.trim().toUpperCase() ?? "";

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
    INSERT INTO sites (id, site_code, name, status, timezone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  defaultSites.forEach((site) => {
    insert.run(
      randomUUID(),
      site.siteCode,
      site.name,
      site.status,
      site.timezone,
      now,
      now
    );
  });
};

export const listStoredSites = (): SiteRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureSiteSeed();

  const rows = database.prepare(`
    SELECT *
    FROM sites
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
  const resolvedSiteCode =
    normalizeSiteCode(input.siteCode) ||
    (existing ? String(existing.site_code) : buildNextAutoSiteCode(database));

  database.prepare(`
    INSERT INTO sites (id, site_code, name, status, timezone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      site_code = excluded.site_code,
      name = excluded.name,
      status = excluded.status,
      timezone = excluded.timezone,
      updated_at = excluded.updated_at
  `).run(
    id,
    resolvedSiteCode,
    input.name,
    input.status,
    input.timezone,
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

export const resetSiteStorageForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM sites;");
  }
};
