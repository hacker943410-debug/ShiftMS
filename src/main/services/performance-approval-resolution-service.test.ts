import { describe, expect, it } from "vitest";

import type {
  PerformanceApprovalRecord,
  PerformanceEntryRecord
} from "../../shared/domain/performance-file";
import { resolvePerformanceEntryApprovalState } from "./performance-approval-resolution-service";

type TestPerformanceEntryRecord = PerformanceEntryRecord & {
  sourceSignature?: string;
};

const createEntry = (overrides?: Partial<TestPerformanceEntryRecord>): TestPerformanceEntryRecord => ({
  id: "entry-current",
  performanceFileId: "file-current",
  logicalKey: "2026-03:boramaedc:holiday:12:D:0",
  scheduleMonth: "2026-03",
  scheduleKey: "2026-03:boramaedc",
  siteName: "보라매DC",
  employeeCode: "EMP-001",
  employeeName: "가람",
  workDate: "2026-03-01",
  workType: "holiday",
  section: "legal-holiday",
  dutyCode: "D",
  startTime: "06:00",
  endTime: "18:00",
  breakMinutes: 60,
  totalWorkMinutes: 660,
  baseWorkMinutes: 480,
  overtimeMinutes: 180,
  nightMinutes: 0,
  sourceRowNumber: 12,
  sortOrder: 10000,
  alerts: [],
  status: "pending",
  hourlyRate: 13200,
  note: undefined,
  workHours: 11,
  employeeRank: "사원",
  department: "보라매DC",
  category: "legal-holiday",
  isPoolWorker: false,
  sourceSignature: "source:holiday:2026-03-01:D:0:가람",
  ...overrides
});

const createApproval = (entry: PerformanceEntryRecord): PerformanceApprovalRecord => ({
  id: "approval-previous",
  fileId: "file-approved",
  entryId: entry.id,
  logicalKey: entry.logicalKey,
  fileName: "approved.xlsx",
  scheduleKey: entry.scheduleKey,
  employeeCode: entry.employeeCode,
  employeeName: entry.employeeName,
  workDate: entry.workDate,
  workType: entry.workType,
  decision: "approved",
  processedAt: "2026-06-11T00:00:00.000Z",
  processedBy: "admin",
  processedByName: "관리자",
  snapshotJson: JSON.stringify({
    fileId: "file-approved",
    fileName: "approved.xlsx",
    filePath: "C:/approved/approved.xlsx",
    scheduleMonth: entry.scheduleMonth,
    siteName: entry.siteName,
    scheduleKey: entry.scheduleKey,
    templateKind: "returned-schedule",
    templateVariant: "sample1",
    sheetName: "교대 근무 계획표",
    duplicateKey: "",
    receivedAt: "2026-06-10T00:00:00.000Z",
    entry
  })
});

describe("performance-approval-resolution-service", () => {
  it("should not require reapproval when only parser notes changed", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      note: "구 파서 메모"
    });
    const currentEntry = createEntry({
      id: "entry-current",
      note: "신 파서 메모"
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
  });

  it("should not require reapproval when only schedule-derived holiday time changed", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: "source:holiday:same",
      startTime: "08:00",
      endTime: "17:00",
      breakMinutes: 60,
      totalWorkMinutes: 480,
      baseWorkMinutes: 480,
      overtimeMinutes: 0,
      nightMinutes: 0
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: "source:holiday:same",
      startTime: "06:00",
      endTime: "18:00",
      breakMinutes: 60,
      totalWorkMinutes: 660,
      baseWorkMinutes: 480,
      overtimeMinutes: 180,
      nightMinutes: 0
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
  });

  it("should require reapproval when a schedule-derived source signature changed", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: "source:holiday:before-edit",
      startTime: "08:00",
      endTime: "17:00",
      breakMinutes: 60,
      totalWorkMinutes: 480,
      baseWorkMinutes: 480,
      overtimeMinutes: 0,
      nightMinutes: 0
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: "source:holiday:after-edit",
      startTime: "06:00",
      endTime: "18:00",
      breakMinutes: 60,
      totalWorkMinutes: 660,
      baseWorkMinutes: 480,
      overtimeMinutes: 180,
      nightMinutes: 0
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(true);
    expect(resolved.satisfied).toBe(false);
  });

  it("should require reapproval when only a schedule-derived source signature changed", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: "source:holiday:before-edit"
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: "source:holiday:after-edit"
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(true);
    expect(resolved.satisfied).toBe(false);
  });

  it("should require reapproval when a legacy entry without source signatures gets a new parser alert", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: undefined,
      alerts: []
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: undefined,
      alerts: [
        {
          severity: "warning",
          message: "근무시간 기준을 찾지 못했습니다."
        }
      ]
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(true);
    expect(resolved.satisfied).toBe(false);
  });

  it("should not require reapproval when only parser alerts changed for the same source", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: "source:holiday:same",
      alerts: []
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: "source:holiday:same",
      alerts: [
        {
          severity: "warning",
          message: "근무열 기준을 찾지 못해 투입자 원래 근무시간을 사용했습니다."
        }
      ]
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
  });

  it("should require review when the current approval snapshot cannot be parsed", () => {
    const currentEntry = createEntry({
      id: "entry-current",
      performanceFileId: "file-approved"
    });
    const approval = {
      ...createApproval(
        createEntry({
          id: "entry-current",
          performanceFileId: "file-approved"
        })
      ),
      fileId: "file-approved",
      entryId: "entry-current",
      snapshotJson: "{not-json"
    };

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: approval
    });

    expect(resolved.approvedEntry).toBeNull();
    expect(resolved.needsReapproval).toBe(true);
    expect(resolved.satisfied).toBe(false);
  });

  it("should not spread an unreadable approval snapshot to a different pending file", () => {
    const currentEntry = createEntry({
      id: "entry-current"
    });
    const approval = {
      ...createApproval(
        createEntry({
          id: "entry-approved"
        })
      ),
      snapshotJson: "{not-json"
    };

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: approval
    });

    expect(resolved.approvedEntry).toBeNull();
    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(false);
  });
});
