import { describe, expect, it } from "vitest";

import type {
  PerformanceApprovalRecord,
  PerformanceEntryRecord
} from "../../shared/domain/performance-file";
import {
  isWageDerivedAlert,
  resolvePerformanceEntryApprovalState
} from "./performance-approval-resolution-service";

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

const EMPLOYMENT_PERIOD_ALERT_MESSAGE =
  "2026-03-01 근무는 가람(EMP-001)의 입사일(2026-04-01) 이전입니다. 고용 기간 밖 근무는 승인할 수 없습니다. 입사일이 잘못됐다면 인력 관리에서 고치세요. 고치면 이 파일을 다시 읽습니다.";

// The exact shape schedule-return-performance-parser writes today (createEntrySourceSignature +
// toScheduleItemSource). Written out verbatim so the comparison is exercised against the real
// signature format - the payload holds times such as "08:00", which is why the prefix must be
// stripped by pattern and never by splitting on ":".
interface ScheduleItemSource {
  employeeCode: string;
  employeeName: string;
  workDate: string;
  dutyCode: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  teamLabel: string;
  sortOrder: number;
}

const createScheduleItemSource = (
  overrides?: Partial<ScheduleItemSource>
): ScheduleItemSource => ({
  employeeCode: "EMP-001",
  employeeName: "가람",
  workDate: "2026-03-01",
  dutyCode: "D",
  startTime: "06:00",
  endTime: "18:00",
  breakMinutes: 60,
  teamLabel: "A조",
  sortOrder: 3,
  ...overrides
});

const createHolidaySignature = (scheduleItem: ScheduleItemSource | null) =>
  `returned-schedule-source:v1:legal-holiday:${JSON.stringify({
    rowNumber: 12,
    slotIndex: 0,
    workDate: "2026-03-01",
    dutyCode: "D",
    holidayFill: "FFFFD1D1",
    regularColumn: "C",
    changedColumn: "",
    regularName: "가람",
    changedName: "",
    scheduleItem
  })}`;

const createSubstituteSignature = (directScheduleItem: ScheduleItemSource | null) =>
  `returned-schedule-source:v1:substitute:${JSON.stringify({
    rowNumber: 30,
    workDate: "2026-03-01",
    originalWorker: "나래",
    substituteWorker: "가람",
    reason: "교육",
    evidence: "대체증적",
    directScheduleItem,
    virtualFoundNoneMarker: false,
    virtualScheduleItem: null,
    slotDutyCode: "",
    slotRowNumber: 0,
    slotIndex: -1,
    slotRegularName: "",
    slotChangedName: "",
    slotScheduleItem: null
  })}`;

const createSubstituteEntry = (overrides?: Partial<TestPerformanceEntryRecord>) =>
  createEntry({
    logicalKey: "2026-03:boramaedc:substitute:30",
    section: "substitute",
    workType: "substitute",
    sourceSignature: createSubstituteSignature(createScheduleItemSource()),
    ...overrides
  });

const MIGRATION_WAGE_ALERT_MESSAGES = [
  "Access 원본에서 시급을 복원하지 못했습니다. 시급미반영항목으로 분류하고 금액 기준으로 수당 이력을 복원했습니다.",
  "Access 원본에서 시급을 복원하지 못했습니다. 시급미반영항목으로 분류했습니다."
];

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

  // T-2: a wage corrected after approval used to flip the approved row back to review on the next
  // refresh, for every approved row of a partly approved file at once.
  it("should not require reapproval when only the hourly rate changed", () => {
    const approvedEntry = createEntry({ id: "entry-approved", hourlyRate: 13200 });
    const currentEntry = createEntry({ id: "entry-current", hourlyRate: 14500 });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
    // The amount that was paid is the snapshot's, not what the file reads now.
    expect(resolved.approvedEntry?.hourlyRate).toBe(13200);
  });

  it("should not require reapproval when only the hourly rate changed on a legacy entry without a source signature", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      hourlyRate: 13200,
      sourceSignature: undefined
    });
    const currentEntry = createEntry({
      id: "entry-current",
      hourlyRate: 14500,
      sourceSignature: undefined
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

  it("should require reapproval when a source edit changes allowance overtime minutes", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: "source:holiday:overtime-before",
      overtimeMinutes: 0,
      totalWorkMinutes: 480,
      baseWorkMinutes: 480
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: "source:holiday:overtime-after",
      overtimeMinutes: 180,
      totalWorkMinutes: 660,
      baseWorkMinutes: 480
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

  it("should not require reapproval when only the overtime calc formula changed for the same source", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      section: "overtime",
      workType: "overtime",
      dutyCode: "OT",
      sourceSignature: "source:overtime:same",
      startTime: "18:00",
      endTime: "22:00",
      breakMinutes: 0,
      totalWorkMinutes: 240,
      baseWorkMinutes: 0,
      overtimeMinutes: 240,
      nightMinutes: 0
    });
    const currentEntry = createEntry({
      id: "entry-current",
      section: "overtime",
      workType: "overtime",
      dutyCode: "OT",
      sourceSignature: "source:overtime:same",
      startTime: "18:00",
      endTime: "22:00",
      breakMinutes: 0,
      totalWorkMinutes: 240,
      baseWorkMinutes: 0,
      // Same raw source, but a calc-formula change re-derived a different overtime/night split.
      overtimeMinutes: 220,
      nightMinutes: 20
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    // Old code compared overtime by full derived fields and would have fired a false reapproval.
    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
  });

  it("should require reapproval when an overtime source edit changes the signature", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      section: "overtime",
      workType: "overtime",
      dutyCode: "OT",
      sourceSignature: "source:overtime:before",
      startTime: "18:00",
      endTime: "22:00",
      overtimeMinutes: 240
    });
    const currentEntry = createEntry({
      id: "entry-current",
      section: "overtime",
      workType: "overtime",
      dutyCode: "OT",
      sourceSignature: "source:overtime:after",
      startTime: "18:00",
      endTime: "23:00",
      overtimeMinutes: 300
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(true);
    expect(resolved.satisfied).toBe(false);
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

  // F7: a wage line closed after the approval raises a missing-wage error on a row whose source
  // workbook never moved. Approvals written before source signatures existed fall back to the full
  // field comparison, which used to see that alert and send the approved row back to review - the
  // very flip T-2 removed the wage itself to prevent.
  it("should not require reapproval when a legacy approval only gained a missing-wage alert", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: undefined,
      hourlyRate: 13200,
      alerts: []
    });
    const currentEntry = createEntry({
      id: "entry-current",
      hourlyRate: undefined,
      alerts: [
        {
          severity: "error",
          reasonCode: "wage-missing-effective-rate",
          message:
            "가람의 2026-03-01 기준 적용 시급을 찾지 못했습니다. 현재 등록 시작일: 2026-03-21"
        }
      ]
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
    // The amount stays the one the approval paid, not the re-read row's missing wage.
    expect(resolved.approvedEntry?.hourlyRate).toBe(13200);
  });

  // The same must hold the other way round: a wage line added back clears the alert, and an
  // approval taken while the alert stood must not flip because the alert went away.
  it("should not require reapproval when a legacy approval only lost a missing-wage alert", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: undefined,
      alerts: [
        {
          severity: "error",
          message: "가람의 시급 이력이 없습니다."
        }
      ]
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: undefined,
      alerts: []
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
  });

  it("should require reapproval when a legacy approval gains an employment period error", () => {
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
          severity: "error",
          reasonCode: "employment-period-violation",
          message: EMPLOYMENT_PERIOD_ALERT_MESSAGE
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

  it("should require reapproval when a missing-wage alert comes with a changed source time", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: undefined,
      alerts: [],
      totalWorkMinutes: 660
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: undefined,
      totalWorkMinutes: 480,
      alerts: [
        {
          severity: "error",
          reasonCode: "wage-missing-history",
          message: "가람의 시급 이력이 없습니다."
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

  it("should keep a manual-rate approval satisfied when the re-read row reports a missing wage", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: undefined,
      hourlyRate: 15500,
      alerts: []
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: undefined,
      hourlyRate: undefined,
      alerts: [
        {
          severity: "error",
          reasonCode: "wage-missing-effective-rate",
          message:
            "가람의 2026-03-01 기준 적용 시급을 찾지 못했습니다. 현재 등록 시작일: 2026-03-21"
        }
      ]
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
    expect(resolved.approvedEntry?.hourlyRate).toBe(15500);
  });

  // The migration writes two wordings for the same verdict. A keyword filter split them apart;
  // both must land on the same side, and it is the side that still counts as a change.
  it("should classify both Access migration wage notes the same way", () => {
    const verdicts = MIGRATION_WAGE_ALERT_MESSAGES.map((message) => {
      const resolved = resolvePerformanceEntryApprovalState({
        entry: createEntry({
          id: "entry-current",
          sourceSignature: undefined,
          alerts: [{ severity: "warning", message }]
        }),
        latestApproval: createApproval(
          createEntry({ id: "entry-approved", sourceSignature: undefined, alerts: [] })
        )
      });

      return resolved.needsReapproval;
    });

    expect(verdicts).toEqual([true, true]);
  });

  // Mass-reapproval guard. A stored snapshot keeps only severity and message, so its alerts never
  // carry a reason code while the freshly parsed row now does. If the code entered the comparison,
  // every approved row holding any coded alert would look changed at once.
  it("should ignore the alert reason code when comparing against a snapshot written without one", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: undefined,
      alerts: [{ severity: "error", message: EMPLOYMENT_PERIOD_ALERT_MESSAGE }]
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: undefined,
      alerts: [
        {
          severity: "error",
          reasonCode: "employment-period-violation",
          message: EMPLOYMENT_PERIOD_ALERT_MESSAGE
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

  // G9 - display-only / employee-master fields inside a raw source signature.
  //
  // COMPATIBILITY GUARD, read this one first. The stored signature string is never rewritten, so
  // an approval taken before this change still holds a signature that carries employeeCode,
  // employeeName, teamLabel and sortOrder. Re-reading the same workbook against the same schedule
  // must leave it satisfied - if the reduction were applied to only one side, or the stored
  // signature were backfilled, every signed approval in the database would flip at once.
  it("should keep a pre-change signature satisfied when nothing about the source moved", () => {
    const storedSignature = createHolidaySignature(createScheduleItemSource());
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: storedSignature
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: storedSignature
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
  });

  // 조원 순서 정리 -> 근무표 재생성 -> 자동 재독. The workbook never moved.
  it("should not require reapproval when only the schedule sort order moved", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: createHolidaySignature(createScheduleItemSource({ sortOrder: 3 }))
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: createHolidaySignature(createScheduleItemSource({ sortOrder: 11 }))
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
  });

  it("should not require reapproval when only the team label of a holiday row changed", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: createHolidaySignature(createScheduleItemSource({ teamLabel: "A조" }))
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: createHolidaySignature(createScheduleItemSource({ teamLabel: "P조" }))
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
  });

  it("should not require reapproval when the employee master changed the schedule row name or code", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: createHolidaySignature(
        createScheduleItemSource({ employeeCode: "EMP-001", employeeName: "가람" })
      )
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: createHolidaySignature(
        createScheduleItemSource({ employeeCode: "EMP-777", employeeName: "BP(가람)" })
      )
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
  });

  it("should not require reapproval when only the employee code on the entry changed", () => {
    const signature = createHolidaySignature(createScheduleItemSource());
    const approvedEntry = createEntry({
      id: "entry-approved",
      employeeCode: "EMP-001",
      sourceSignature: signature
    });
    const currentEntry = createEntry({
      id: "entry-current",
      employeeCode: "EMP-777",
      sourceSignature: signature
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
  });

  // isPoolWorker is a live employment-type readout. It decides payment on a substitute row only.
  it("should not require reapproval when the pool flag changed on a holiday row", () => {
    const signature = createHolidaySignature(createScheduleItemSource());
    const approvedEntry = createEntry({
      id: "entry-approved",
      isPoolWorker: false,
      sourceSignature: signature
    });
    const currentEntry = createEntry({
      id: "entry-current",
      isPoolWorker: true,
      sourceSignature: signature
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
  });

  // Counter-tests. Everything that decides the minutes, and the presence of the schedule row
  // itself, must still send the approval back to review.
  it("should require reapproval when the schedule start time changed", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: createHolidaySignature(createScheduleItemSource({ startTime: "06:00" }))
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: createHolidaySignature(createScheduleItemSource({ startTime: "08:00" }))
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(true);
    expect(resolved.satisfied).toBe(false);
  });

  it("should require reapproval when the schedule break minutes changed", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: createHolidaySignature(createScheduleItemSource({ breakMinutes: 60 }))
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: createHolidaySignature(createScheduleItemSource({ breakMinutes: 90 }))
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(true);
    expect(resolved.satisfied).toBe(false);
  });

  // A schedule row that vanishes (object -> null) is a real change, not a display change. This
  // also pins the known remaining gap: an employment-type edit that hides the row from the parser
  // still requires reapproval, which is why the BP name matching is a separate release.
  it("should require reapproval when the schedule row is no longer found", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      sourceSignature: createHolidaySignature(createScheduleItemSource())
    });
    const currentEntry = createEntry({
      id: "entry-current",
      sourceSignature: createHolidaySignature(null)
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(true);
    expect(resolved.satisfied).toBe(false);
  });

  // On a substitute row the team label picks the target work type, which decides whether the
  // substitute allowance is payable at all - it is not display-only there and must stay compared.
  it("should require reapproval when the team label of a substitute row changed", () => {
    const approvedEntry = createSubstituteEntry({
      id: "entry-approved",
      sourceSignature: createSubstituteSignature(createScheduleItemSource({ teamLabel: "A조" }))
    });
    const currentEntry = createSubstituteEntry({
      id: "entry-current",
      sourceSignature: createSubstituteSignature(createScheduleItemSource({ teamLabel: "P조" }))
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(true);
    expect(resolved.satisfied).toBe(false);
  });

  it("should require reapproval when the pool flag changed on a substitute row", () => {
    const signature = createSubstituteSignature(createScheduleItemSource());
    const approvedEntry = createSubstituteEntry({
      id: "entry-approved",
      isPoolWorker: false,
      sourceSignature: signature
    });
    const currentEntry = createSubstituteEntry({
      id: "entry-current",
      isPoolWorker: true,
      sourceSignature: signature
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(true);
    expect(resolved.satisfied).toBe(false);
  });

  // T-2 on a signed row: a wage corrected after the approval must not flip it, and the amount
  // stays the one the approval paid.
  it("should not require reapproval when only the hourly rate changed on a signed row", () => {
    const signature = createHolidaySignature(createScheduleItemSource());
    const approvedEntry = createEntry({
      id: "entry-approved",
      hourlyRate: 13200,
      sourceSignature: signature
    });
    const currentEntry = createEntry({
      id: "entry-current",
      hourlyRate: 14500,
      sourceSignature: signature
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
    expect(resolved.approvedEntry?.hourlyRate).toBe(13200);
  });

  // A signature that carries the prefix but an unreadable payload falls back to a byte comparison.
  it("should compare an unreadable signature payload byte for byte", () => {
    const brokenSignature = "returned-schedule-source:v1:legal-holiday:{not-json";
    const sameResolved = resolvePerformanceEntryApprovalState({
      entry: createEntry({ id: "entry-current", sourceSignature: brokenSignature }),
      latestApproval: createApproval(
        createEntry({ id: "entry-approved", sourceSignature: brokenSignature })
      )
    });
    const changedResolved = resolvePerformanceEntryApprovalState({
      entry: createEntry({
        id: "entry-current",
        sourceSignature: `${brokenSignature}-after`
      }),
      latestApproval: createApproval(
        createEntry({ id: "entry-approved", sourceSignature: brokenSignature })
      )
    });

    expect(sameResolved.satisfied).toBe(true);
    expect(changedResolved.needsReapproval).toBe(true);
  });

  // The legacy fallback (no signature at all) is deliberately untouched: it still compares the
  // full field set, employee code included.
  it("should still compare a legacy approval without a signature by its full fields", () => {
    const approvedEntry = createEntry({
      id: "entry-approved",
      employeeCode: "EMP-001",
      sourceSignature: undefined
    });
    const currentEntry = createEntry({
      id: "entry-current",
      employeeCode: "EMP-777",
      sourceSignature: undefined
    });

    const resolved = resolvePerformanceEntryApprovalState({
      entry: currentEntry,
      latestApproval: createApproval(approvedEntry)
    });

    expect(resolved.needsReapproval).toBe(true);
    expect(resolved.satisfied).toBe(false);
  });
});

describe("isWageDerivedAlert", () => {
  // Pinned against the sentences the code actually writes today. Everything but the two wage
  // lookup messages must stay OUT of the set - the equivalence comparison drops what lands in it.
  it.each([
    [
      true,
      "가람의 2026-03-01 기준 적용 시급을 찾지 못했습니다. 현재 등록 시작일: 2026-03-21"
    ],
    [true, "가람의 시급 이력이 없습니다."],
    [false, EMPLOYMENT_PERIOD_ALERT_MESSAGE],
    [
      false,
      "2026-03-01 근무는 가람(EMP-001)의 퇴사 처리일(2026-02-01) 당일이거나 그 뒤입니다. 고용 기간 밖 근무는 승인할 수 없습니다."
    ],
    [
      false,
      "가람의 2026-03-01 인력 정보가 동명이인 2명과 매칭되어 사번을 확정할 수 없습니다. 후보: 가람(EMP-001), 가람(EMP-002)"
    ],
    [false, "가람 인력 정보를 찾지 못했습니다."],
    [
      false,
      "가람은 Pool 대체근무 표시로 인식했지만 등록 인력 정보를 찾지 못했습니다."
    ],
    [false, "근무시간 기준을 찾지 못했습니다."],
    [false, MIGRATION_WAGE_ALERT_MESSAGES[0]],
    [false, MIGRATION_WAGE_ALERT_MESSAGES[1]]
  ])("should return %s for %s", (expected, message) => {
    expect(isWageDerivedAlert({ severity: "error", message })).toBe(expected);
  });

  it("should recognise a wage alert by its reason code even if the wording changes", () => {
    expect(
      isWageDerivedAlert({
        severity: "error",
        reasonCode: "wage-missing-history",
        message: "이 사람에게 적용할 급여 기준이 아직 등록되지 않았습니다."
      })
    ).toBe(true);
  });
});
