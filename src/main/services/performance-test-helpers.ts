import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import type { AuthSession } from "../../shared/domain/model";
import type { ShiftPatternTeamSettingInput } from "../../shared/bridge/contracts";
import type { SchedulePlanTemplateVariant } from "../../shared/domain/schedule-plan";
import {
  acknowledgeReparseMarker,
  peekReparseMarker,
  saveStoredAppSettings
} from "./app-settings-storage-service";
import { saveStoredEmployee } from "./employee-storage-service";
import {
  getStoredPerformanceFileDetail,
  listStoredPendingPerformanceFiles
} from "./performance-file-storage-service";
import { syncPendingPerformanceFilesToStorage } from "./performance-file-intake-service";
import {
  resetMonthlyScheduleStorageForTest,
  saveStoredMonthlySchedule
} from "./monthly-schedule-storage-service";
import { listStoredDocumentTemplateVersions } from "./operations-storage-service";
import { exportMonthlySchedulePlan } from "./schedule-plan-export-service";
import { listStoredSites } from "./site-storage-service";
import { saveStoredShiftPattern } from "./shift-pattern-storage-service";
import { initializeSqliteStorage } from "./sqlite-storage-service";

const TEST_SITE_NAME = "보라매DC";
const TEST_SCHEDULE_MONTH = "2026-03";

export const testAdminSession: AuthSession = {
  userId: "user-admin",
  loginId: "admin",
  role: "admin",
  displayName: "관리자",
  expiresAt: "2026-03-11T18:00:00+09:00",
  sessionToken: "session-token",
  passwordChangeRequired: false
};

interface CreatedEmployee {
  employeeCode: string;
  name: string;
  rank: string;
}

export interface PreparedReturnedScheduleFixture {
  approvedDir: string;
  dbPath: string;
  exportDir: string;
  exportedPath: string;
  fileId: string;
  fileName: string;
  filePath: string;
  pendingDir: string;
  rootDir: string;
  scheduleKey: string;
  siteName: string;
  templateVariant: SchedulePlanTemplateVariant;
  userDataPath: string;
  workers: {
    holiday: CreatedEmployee;
    holidayReplacement: CreatedEmployee;
    overtime: CreatedEmployee;
    substituteOriginal: CreatedEmployee;
    substituteReplacement: CreatedEmployee;
  };
}

const createEmployee = (input: {
  employeeCode: string;
  name: string;
  siteId: string;
  shiftGroup: string;
  hourlyRate: number;
}): CreatedEmployee => {
  const employee = saveStoredEmployee({
    employeeCode: input.employeeCode,
    name: input.name,
    rank: "사원",
    employmentType: "정규",
    status: "active",
    hireDate: "2024-01-01",
    siteId: input.siteId,
    shiftGroup: input.shiftGroup,
    hourlyRate: input.hourlyRate
  });

  return {
    employeeCode: employee.employeeCode,
    name: employee.name,
    rank: employee.rank ?? "사원"
  };
};

const createSample1Pattern = (
  siteId: string,
  useNonStandardDutyCodes = false,
  teamSettings?: ShiftPatternTeamSettingInput[]
) => {
  // When useNonStandardDutyCodes is true the pattern uses non-D/E/N duty letters (A/B/C, like the
  // real SKB동작국사 5조3교대) with the SAME working windows. The schedule grid still encodes shifts
  // by D/E/N position, so restore must classify A/B/C by time — this exercises the duty-code mapping.
  const day = useNonStandardDutyCodes ? "A" : "D";
  const evening = useNonStandardDutyCodes ? "B" : "E";
  const night = useNonStandardDutyCodes ? "C" : "N";

  return saveStoredShiftPattern({
    siteId,
    name: "실적 테스트 4조 3교대",
    teamCount: 4,
    patternCode: `${day}${evening}${night}X`,
    startIndexRule: "team-sequence",
    patternStartDate: "2024-01-01",
    status: "active",
    steps: [
      { stepIndex: 0, dutyCode: day, startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
      { stepIndex: 1, dutyCode: evening, startTime: "14:00", endTime: "22:00", breakMinutes: 60 },
      { stepIndex: 2, dutyCode: night, startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
      { stepIndex: 3, dutyCode: "X", breakMinutes: 0 }
    ],
    teamIndexes: Array.from({ length: 4 }, (_, index) => ({
      teamLabel: `${String.fromCharCode(65 + index)}조`,
      index
    })),
    teamSettings,
    poolEnabled: false,
    poolBreakMinutes: 0
  });
};

const createSample2Pattern = (siteId: string, teamSettings?: ShiftPatternTeamSettingInput[]) =>
  saveStoredShiftPattern({
    siteId,
    teamSettings,
    name: "실적 테스트 6조 2교대",
    teamCount: 6,
    patternCode: "DNXXXX",
    startIndexRule: "team-sequence",
    patternStartDate: "2024-01-01",
    status: "active",
    steps: [
      { stepIndex: 0, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
      { stepIndex: 1, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
      { stepIndex: 2, dutyCode: "X", breakMinutes: 0 },
      { stepIndex: 3, dutyCode: "X", breakMinutes: 0 },
      { stepIndex: 4, dutyCode: "X", breakMinutes: 0 },
      { stepIndex: 5, dutyCode: "X", breakMinutes: 0 }
    ],
    teamIndexes: Array.from({ length: 6 }, (_, index) => ({
      teamLabel: `${String.fromCharCode(65 + index)}조`,
      index
    })),
    cycles: [
      {
        cycleKey: "cycle-1",
        name: "Cycle 1",
        order: 0,
        shiftCount: 2,
        patternCode: "DNXXXX",
        patternStartDate: "2024-01-01",
        steps: [
          { stepIndex: 0, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
          { stepIndex: 1, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
          { stepIndex: 2, dutyCode: "X", breakMinutes: 0 },
          { stepIndex: 3, dutyCode: "X", breakMinutes: 0 },
          { stepIndex: 4, dutyCode: "X", breakMinutes: 0 },
          { stepIndex: 5, dutyCode: "X", breakMinutes: 0 }
        ],
        teamIndexes: Array.from({ length: 6 }, (_, index) => ({
          teamLabel: `${String.fromCharCode(65 + index)}조`,
          index
        }))
      }
    ],
    teamCycleAssignments: Array.from({ length: 6 }, (_, index) => ({
      teamLabel: `${String.fromCharCode(65 + index)}조`,
      cycleKey: "cycle-1"
    })),
    poolEnabled: false,
    poolBreakMinutes: 0
  });

const writeReturnedScheduleAdjustments = async (input: {
  exportedPath: string;
  outputPath: string;
  templateVariant: SchedulePlanTemplateVariant;
  workers: PreparedReturnedScheduleFixture["workers"];
  withHolidayWarning: boolean;
}) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(input.exportedPath);
  const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

  if (input.templateVariant === "sample1") {
    if (input.withHolidayWarning) {
      worksheet.getCell("AL12").value = input.workers.holidayReplacement.name;
    }

    worksheet.getCell("BA11").value = "2026-03-02";
    worksheet.getCell("BC11").value = input.workers.substituteOriginal.name;
    worksheet.getCell("BE11").value = input.workers.substituteReplacement.name;
    worksheet.getCell("BG11").value = "교육";
    worksheet.getCell("BJ11").value = "대체증적";

    worksheet.getCell("BA34").value = "2026-03-03";
    worksheet.getCell("BC34").value = 20;
    worksheet.getCell("BD34").value = 0;
    worksheet.getCell("BE34").value = 1;
    worksheet.getCell("BF34").value = 0;
    worksheet.getCell("BG34").value = input.workers.overtime.name;
    worksheet.getCell("BH34").value = "긴급복구";
    worksheet.getCell("BJ34").value = "연장증적";
  } else {
    if (input.withHolidayWarning) {
      worksheet.getCell("AP12").value = input.workers.holidayReplacement.name;
    }

    worksheet.getCell("BI11").value = "2026-03-02";
    worksheet.getCell("BK11").value = input.workers.substituteOriginal.name;
    worksheet.getCell("BM11").value = input.workers.substituteReplacement.name;
    worksheet.getCell("BO11").value = "교육";
    worksheet.getCell("BR11").value = "대체증적";

    worksheet.getCell("BI34").value = "2026-03-03";
    worksheet.getCell("BK34").value = 20;
    worksheet.getCell("BL34").value = 0;
    worksheet.getCell("BM34").value = 1;
    worksheet.getCell("BN34").value = 0;
    worksheet.getCell("BO34").value = input.workers.overtime.name;
    worksheet.getCell("BP34").value = "긴급복구";
    worksheet.getCell("BR34").value = "연장증적";
  }

  await workbook.xlsx.writeFile(input.outputPath);
};

export const prepareReturnedScheduleFixture = async (input: {
  rootDir: string;
  templateVariant?: SchedulePlanTemplateVariant;
  withHolidayWarning?: boolean;
  substituteReplacementShiftGroup?: string;
  useNonStandardPatternDutyCodes?: boolean;
  teamSettings?: ShiftPatternTeamSettingInput[];
  // 대체 투입자에게도 같은 날 자기 근무를 깔아 둔다(추가근무 판정 확인용).
  substituteReplacementOwnDutyCode?: "D" | "E" | "N";
}) : Promise<PreparedReturnedScheduleFixture> => {
  const templateVariant = input.templateVariant ?? "sample1";
  const withHolidayWarning = input.withHolidayWarning ?? false;
  const rootDir = path.resolve(input.rootDir);
  const dbPath = path.resolve(rootDir, "performance.test.sqlite");
  const pendingDir = path.resolve(rootDir, "imports", "pending");
  const approvedDir = path.resolve(rootDir, "imports", "approved");
  const exportDir = path.resolve(rootDir, "exports");
  const userDataPath = path.resolve(rootDir, "user-data");

  rmSync(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  mkdirSync(pendingDir, { recursive: true });
  mkdirSync(approvedDir, { recursive: true });
  mkdirSync(exportDir, { recursive: true });
  mkdirSync(userDataPath, { recursive: true });

  initializeSqliteStorage({ dbPath });
  resetMonthlyScheduleStorageForTest();
  saveStoredAppSettings(
    {
      holidayApiBaseUrl: "https://example.com/holidays",
      pendingDir,
      approvedDir,
      scheduleExportDir: exportDir,
      allowanceProposalExportDir: path.resolve(rootDir, "exports", "allowance", "proposal"),
      allowanceAttachment1ExportDir: path.resolve(rootDir, "exports", "allowance", "attachment1"),
      allowanceAttachment2ExportDir: path.resolve(rootDir, "exports", "allowance", "attachment2"),
      databaseBackupDir: path.resolve(rootDir, "backups"),
      databaseBackupSchedule: "daily",
      databaseBackupTime: "02:00",
      migrationFilePath: ""
    },
    { userDataPath }
  );

  const site = listStoredSites().find((item) => item.name === TEST_SITE_NAME);

  if (!site) {
    throw new Error("테스트용 근무지를 찾지 못했습니다.");
  }

  const templateLabel = templateVariant === "sample1" ? "근무표 양식 1" : "근무표 양식 2";
  const template = listStoredDocumentTemplateVersions("schedule").find(
    (item) => item.versionLabel === templateLabel
  );

  if (!template) {
    throw new Error("테스트용 근무표 템플릿을 찾지 못했습니다.");
  }

  const workers = {
    holiday: createEmployee({
      employeeCode: templateVariant === "sample1" ? "EMP-PF-T1-H" : "EMP-PF-T2-H",
      name: "가람",
      siteId: site.id,
      shiftGroup: "A조",
      hourlyRate: 13200
    }),
    holidayReplacement: createEmployee({
      employeeCode: templateVariant === "sample1" ? "EMP-PF-T1-W" : "EMP-PF-T2-W",
      name: "라온",
      siteId: site.id,
      shiftGroup: "B조",
      hourlyRate: 13400
    }),
    substituteOriginal: createEmployee({
      employeeCode: templateVariant === "sample1" ? "EMP-PF-T1-S1" : "EMP-PF-T2-S1",
      name: "나래",
      siteId: site.id,
      shiftGroup: "B조",
      hourlyRate: 12800
    }),
    substituteReplacement: createEmployee({
      employeeCode: templateVariant === "sample1" ? "EMP-PF-T1-S2" : "EMP-PF-T2-S2",
      name: "다온",
      siteId: site.id,
      shiftGroup: input.substituteReplacementShiftGroup ?? "C조",
      hourlyRate: 12900
    }),
    overtime: createEmployee({
      employeeCode: templateVariant === "sample1" ? "EMP-PF-T1-O" : "EMP-PF-T2-O",
      name: "마루",
      siteId: site.id,
      shiftGroup: "D조",
      hourlyRate: 14100
    })
  };

  const pattern =
    templateVariant === "sample1"
      ? createSample1Pattern(
          site.id,
          input.useNonStandardPatternDutyCodes ?? false,
          input.teamSettings
        )
      : createSample2Pattern(site.id, input.teamSettings);
  const schedule = saveStoredMonthlySchedule({
    siteId: site.id,
    scheduleMonth: TEST_SCHEDULE_MONTH,
    patternId: pattern.id,
    generatedBy: "admin",
    templateVersionId: template.id,
    items: [
      {
        employeeCode: workers.holiday.employeeCode,
        teamLabel: "A조",
        workDate: "2026-03-01",
        dutyCode: "D",
        startTime: "06:00",
        endTime: "18:00",
        breakMinutes: 60
      },
      {
        employeeCode: workers.substituteOriginal.employeeCode,
        teamLabel: "B조",
        workDate: "2026-03-02",
        dutyCode: templateVariant === "sample1" ? "E" : "D",
        startTime: templateVariant === "sample1" ? "14:00" : "06:00",
        endTime: templateVariant === "sample1" ? "22:00" : "18:00",
        breakMinutes: 60
      },
      ...(input.substituteReplacementOwnDutyCode
        ? [
            {
              employeeCode: workers.substituteReplacement.employeeCode,
              teamLabel: input.substituteReplacementShiftGroup ?? "C조",
              workDate: "2026-03-02",
              dutyCode: input.substituteReplacementOwnDutyCode,
              startTime: input.substituteReplacementOwnDutyCode === "D" ? "06:00" : "14:00",
              endTime: input.substituteReplacementOwnDutyCode === "D" ? "18:00" : "22:00",
              breakMinutes: 60
            }
          ]
        : [])
    ]
  });

  const exported = await exportMonthlySchedulePlan({
    scheduleId: schedule.id,
    userDataPath,
    outputDir: exportDir
  });

  if (!exported) {
    throw new Error("테스트용 근무표 export에 실패했습니다.");
  }

  const fileName = exported.outputFileName;
  const filePath = path.resolve(pendingDir, fileName);

  await writeReturnedScheduleAdjustments({
    exportedPath: exported.outputPath,
    outputPath: filePath,
    templateVariant,
    workers,
    withHolidayWarning
  });

  return {
    rootDir,
    dbPath,
    pendingDir,
    approvedDir,
    exportDir,
    exportedPath: exported.outputPath,
    userDataPath,
    fileName,
    filePath,
    fileId: "",
    siteName: site.name,
    scheduleKey: `${TEST_SCHEDULE_MONTH}:${site.name.replace(/\s+/g, "").toLowerCase()}`,
    templateVariant,
    workers
  };
};

export const syncPreparedReturnedSchedule = async (
  fixture: PreparedReturnedScheduleFixture
) => {
  await syncPendingPerformanceFilesToStorage({
    settings: {
      pendingDir: fixture.pendingDir,
      approvedDir: fixture.approvedDir
    },
    scheduleMonth: TEST_SCHEDULE_MONTH
  });

  // Registering the fixture's people, its shift settings and its monthly schedule left reparse
  // markers of their own. The app's first overview spends them right after this very read; the
  // helper does the same, so a test starts from "parsed, and nothing changed since" the way the
  // old tests assume. The substitute policy marker is left alone: a test that sets the policy
  // date before this read is asking for exactly that re-read.
  for (const kind of ["employee-master", "team-work-type", "monthly-schedule", "wage-rate"] as const) {
    const token = peekReparseMarker(kind);

    if (token) {
      acknowledgeReparseMarker(kind, token);
    }
  }

  const queued = listStoredPendingPerformanceFiles().find((item) => item.fileName === fixture.fileName);

  if (!queued) {
    throw new Error(`실적 대기열에서 파일을 찾지 못했습니다: ${fixture.fileName}`);
  }

  const detail = getStoredPerformanceFileDetail(queued.id);

  if (!detail) {
    throw new Error(`실적 상세를 찾지 못했습니다: ${queued.id}`);
  }

  fixture.fileId = queued.id;

  return detail;
};

export const resetPreparedReturnedScheduleRoot = (rootDir: string) => {
  try {
    rmSync(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Ignore transient Windows file locks during test teardown.
  }
};

export const restageReturnedScheduleFixture = async (
  fixture: PreparedReturnedScheduleFixture,
  options?: { withHolidayWarning?: boolean }
) => {
  await new Promise((resolve) => setTimeout(resolve, 20));

  await writeReturnedScheduleAdjustments({
    exportedPath: fixture.exportedPath,
    outputPath: fixture.filePath,
    templateVariant: fixture.templateVariant,
    workers: fixture.workers,
    withHolidayWarning: options?.withHolidayWarning ?? false
  });
};
