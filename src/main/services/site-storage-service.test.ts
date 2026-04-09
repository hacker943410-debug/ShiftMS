import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import {
  deleteStoredSite,
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
      customerName: "테스트 고객사",
      status: "active",
      timezone: "Asia/Seoul"
    });

    expect(saved.siteCode).toBe("SITE-NEW");
    expect(saved.customerName).toBe("테스트 고객사");
    expect(listStoredSites().some((site) => site.siteCode === "SITE-NEW")).toBe(true);
  });

  it("should auto assign a site code when omitted", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "sites.test.sqlite")
    });

    const saved = saveStoredSite({
      siteCode: "",
      name: "김포센터",
      status: "active",
      timezone: "Asia/Seoul"
    });

    expect(saved.siteCode).toBe("SITE-001");
  });

  it("should hide a deleted site from the visible list while preserving the stored row", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "sites.test.sqlite")
    });

    const targetSite = listStoredSites().find((site) => site.name === "동탄센터");

    expect(targetSite).toBeDefined();

    const deleted = deleteStoredSite(targetSite!.id);

    expect(deleted.id).toBe(targetSite!.id);
    expect(listStoredSites().some((site) => site.id === targetSite!.id)).toBe(false);
    expect(listStoredSites({ includeDeleted: true }).some((site) => site.id === targetSite!.id)).toBe(true);
  });

  it("should resolve a new automatic code when a deleted site still owns a previous code", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "sites.test.sqlite")
    });

    const targetSite = saveStoredSite({
      siteCode: "SITE-050",
      name: "수원센터",
      status: "active",
      timezone: "Asia/Seoul"
    });

    deleteStoredSite(targetSite.id);

    const saved = saveStoredSite({
      siteCode: "SITE-050",
      name: "부천센터",
      status: "active",
      timezone: "Asia/Seoul"
    });

    expect(saved.siteCode).toBe("SITE-051");
  });
});
