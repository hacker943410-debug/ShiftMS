import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import {
  listStoredSites,
  resetSiteStorageForTest,
  saveStoredSite
} from "./site-storage-service";

describe("site-storage-service", () => {
  afterEach(() => {
    resetSiteStorageForTest();
    resetSqliteStorageForTest();
  });

  it("should seed and list default sites", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "sites.test.sqlite")
    });

    const sites = listStoredSites();

    expect(sites.length).toBeGreaterThanOrEqual(3);
    expect(sites.some((site) => site.name === "보라매DC")).toBe(true);
  });

  it("should insert a new site record", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "sites.test.sqlite")
    });

    const saved = saveStoredSite({
      siteCode: "SITE-NEW",
      name: "김포센터",
      status: "active",
      timezone: "Asia/Seoul"
    });

    expect(saved.siteCode).toBe("SITE-NEW");
    expect(listStoredSites().some((site) => site.siteCode === "SITE-NEW")).toBe(true);
  });
});
