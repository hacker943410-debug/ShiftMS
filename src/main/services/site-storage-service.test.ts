import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { acknowledgeReparseMarker, peekReparseMarker } from "./app-settings-storage-service";
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

  // R11 self-check: the parser finds a file's schedule and narrows same-name people by the site
  // NAME, so a rename or a removal must make the next overview read the pending files again. A
  // save that keeps the name must not.
  it("leaves the employee master reparse marker when a site is renamed or removed, not on a plain save", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "sites.test.sqlite")
    });

    const spendMarker = () => {
      const token = peekReparseMarker("employee-master");

      if (token) {
        acknowledgeReparseMarker("employee-master", token);
      }

      return Boolean(token);
    };

    spendMarker();

    const site = saveStoredSite({
      siteCode: "SITE-060",
      name: "안양센터",
      status: "active",
      timezone: "Asia/Seoul"
    });

    // A new site has no rows of its own yet; nothing already parsed reads differently.
    expect(spendMarker()).toBe(false);

    saveStoredSite({
      id: site.id,
      siteCode: "SITE-060",
      name: "안양센터",
      customerName: "고객사",
      status: "active",
      timezone: "Asia/Seoul"
    });
    expect(spendMarker()).toBe(false);

    saveStoredSite({
      id: site.id,
      siteCode: "SITE-060",
      name: "안양물류센터",
      status: "active",
      timezone: "Asia/Seoul"
    });
    expect(spendMarker()).toBe(true);

    deleteStoredSite(site.id);
    expect(spendMarker()).toBe(true);
  });
});
