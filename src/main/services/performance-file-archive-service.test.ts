import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { restorePendingPerformanceFileToApprovedPath } from "./performance-file-archive-service";

describe("performance-file-archive-service", () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = path.resolve(
      process.cwd(),
      "artifacts",
      "tests",
      `archive-helper-${randomUUID()}`
    );
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    if (testRoot && existsSync(testRoot)) {
      await rm(testRoot, { recursive: true, force: true });
    }
  });

  it("restores a pending file to the exact approved path without leaving the pending copy", async () => {
    const pendingDir = path.resolve(testRoot, "pending");
    const approvedDir = path.resolve(testRoot, "approved", "2026년", "3월");
    await mkdir(pendingDir, { recursive: true });

    const pendingPath = path.resolve(pendingDir, "test-schedule.xlsx");
    const approvedPath = path.resolve(approvedDir, "test-schedule.xlsx");
    const fileContent = "dummy-performance-data-v1";

    await writeFile(pendingPath, fileContent, "utf-8");

    const result = await restorePendingPerformanceFileToApprovedPath({
      pendingFilePath: pendingPath,
      approvedFilePath: approvedPath
    });

    expect(result.restoredFilePath).toBe(approvedPath);
    expect(existsSync(pendingPath)).toBe(false);
    expect(existsSync(approvedPath)).toBe(true);
    expect(await readFile(approvedPath, "utf-8")).toBe(fileContent);
  });

  it("refuses to overwrite when approved path already exists and keeps both files intact", async () => {
    const pendingDir = path.resolve(testRoot, "pending");
    const approvedDir = path.resolve(testRoot, "approved");
    await mkdir(pendingDir, { recursive: true });
    await mkdir(approvedDir, { recursive: true });

    const pendingPath = path.resolve(pendingDir, "conflict.xlsx");
    const approvedPath = path.resolve(approvedDir, "conflict.xlsx");
    const pendingContent = "pending-content-to-restore";
    const approvedContent = "existing-approved-content";

    await writeFile(pendingPath, pendingContent, "utf-8");
    await writeFile(approvedPath, approvedContent, "utf-8");

    await expect(
      restorePendingPerformanceFileToApprovedPath({
        pendingFilePath: pendingPath,
        approvedFilePath: approvedPath
      })
    ).rejects.toThrow(/덮어쓸 수 없습니다/);

    expect(existsSync(pendingPath)).toBe(true);
    expect(existsSync(approvedPath)).toBe(true);
    expect(await readFile(pendingPath, "utf-8")).toBe(pendingContent);
    expect(await readFile(approvedPath, "utf-8")).toBe(approvedContent);
  });
});
