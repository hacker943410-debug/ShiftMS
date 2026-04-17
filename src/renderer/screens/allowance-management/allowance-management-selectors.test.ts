import { describe, expect, it } from "vitest";

import type { AllowanceDocumentExportRecord } from "@shared/domain/allowance-document";
import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import type {
  AllowanceApprovalRecord,
  AllowanceProposalApprovalRecord
} from "@shared/domain/allowance-workflow";
import type { AllowanceRateVersion, EmployeeRecord } from "@shared/domain/model";

import {
  buildHistoryRows,
  buildOverviewGroups,
  buildSiteDistribution,
  buildVisibleHistoryRows,
  buildVisibleProposalApprovals,
  buildVisibleResults,
  buildWorkTypeDistribution,
  createEmployeeCurrentStatusResolver,
  resolveDisplayedRateVersion
} from "./allowance-management-selectors";

const createResult = (
  input: Partial<AllowanceCalculationResultRecord> & {
    id: string;
    employeeName: string;
    siteName: string;
    workDate: string;
  }
): AllowanceCalculationResultRecord =>
  ({
    id: input.id,
    fileId: input.fileId ?? `file-${input.id}`,
    fileName: input.fileName ?? `${input.siteName}-schedule.xlsx`,
    entryId: input.entryId ?? `entry-${input.id}`,
    employeeCode: input.employeeCode ?? `EMP-${input.id}`,
    employeeName: input.employeeName,
    siteName: input.siteName,
    workDate: input.workDate,
    workType: input.workType ?? "overtime",
    hourlyRate: input.hourlyRate ?? 15000,
    rateVersionId: input.rateVersionId ?? "rate-2026-a",
    rateVersionLabel: input.rateVersionLabel ?? "2026 상반기",
    status: input.status ?? "approved",
    earlyPayoutDate: input.earlyPayoutDate,
    signature: input.signature ?? `signature-${input.id}`,
    snapshot:
      input.snapshot ??
      ({
        id: `snapshot-${input.id}`,
        performanceApprovalId: `perf-${input.id}`,
        calculationVersion: 1,
        businessCategoryCode: "weekday-overtime",
        businessCategoryLabel: "평일 연장",
        breakdown: {
          totalWorkMinutes: 180,
          baseWorkMinutes: 60,
          overtimeMinutes: 120,
          nightMinutes: 0,
          holidayMinutes: 0,
          substituteMinutes: 0
        },
        lines: [],
        totalAllowanceAmount: 45000,
        createdAt: `${input.workDate}T09:00:00.000Z`
      } as AllowanceCalculationResultRecord["snapshot"])
  }) satisfies AllowanceCalculationResultRecord;

const createApprovalRecord = (
  input: Partial<AllowanceApprovalRecord> & { id: string; calculationId: string; processedAt: string }
): AllowanceApprovalRecord =>
  ({
    id: input.id,
    calculationId: input.calculationId,
    workMonth: input.workMonth ?? "2026-04",
    siteName: input.siteName ?? "본관",
    employeeCode: input.employeeCode ?? "EMP-1",
    employeeName: input.employeeName ?? "홍길동",
    workDate: input.workDate ?? "2026-04-10",
    workType: input.workType ?? "overtime",
    decision: input.decision ?? "approved",
    processedAt: input.processedAt,
    processedBy: input.processedBy ?? "admin",
    processedByName: input.processedByName ?? "관리자",
    comment: input.comment
  }) satisfies AllowanceApprovalRecord;

const createExportRecord = (
  input: Partial<AllowanceDocumentExportRecord> & { id: string; exportedAt: string; calculationIds: string[] }
): AllowanceDocumentExportRecord =>
  ({
    id: input.id,
    workMonth: input.workMonth ?? "2026-04",
    outputFormat: input.outputFormat ?? "xlsx",
    calculationIds: input.calculationIds,
    calculationCount: input.calculationCount ?? input.calculationIds.length,
    employeeCount: input.employeeCount ?? input.calculationIds.length,
    totalAllowanceAmount: input.totalAllowanceAmount ?? 45000,
    proposalFileName: input.proposalFileName ?? "proposal.xlsx",
    proposalPath: input.proposalPath ?? "C:/temp/proposal.xlsx",
    attachment1FileName: input.attachment1FileName ?? "attachment1.xlsx",
    attachment1Path: input.attachment1Path ?? "C:/temp/attachment1.xlsx",
    attachment2FileName: input.attachment2FileName ?? "attachment2.xlsx",
    attachment2Path: input.attachment2Path ?? "C:/temp/attachment2.xlsx",
    exportedAt: input.exportedAt
  }) satisfies AllowanceDocumentExportRecord;

const createProposalApprovalRecord = (
  input: Partial<AllowanceProposalApprovalRecord> & {
    id: string;
    approvedAt: string;
    calculationIds: string[];
  }
): AllowanceProposalApprovalRecord =>
  ({
    id: input.id,
    workMonth: input.workMonth ?? "2026-04",
    calculationIds: input.calculationIds,
    calculationCount: input.calculationCount ?? input.calculationIds.length,
    employeeCount: input.employeeCount ?? input.calculationIds.length,
    totalAllowanceAmount: input.totalAllowanceAmount ?? 45000,
    regularTotalAllowanceAmount: input.regularTotalAllowanceAmount ?? 45000,
    earlyPayoutTotalAllowanceAmount: input.earlyPayoutTotalAllowanceAmount ?? 0,
    exportRecordId: input.exportRecordId ?? "export-1",
    outputFormat: input.outputFormat ?? "xlsx",
    approvedAt: input.approvedAt,
    approvedBy: input.approvedBy ?? "admin",
    approvedByName: input.approvedByName ?? "관리자",
    comment: input.comment,
    previewSnapshot:
      input.previewSnapshot ??
      {
        workMonth: "2026-04",
        generatedAt: `${input.approvedAt}`,
        calculationCount: input.calculationIds.length,
        employeeCount: input.calculationIds.length,
        totalAllowanceAmount: 45000,
        regularTotalAllowanceAmount: 45000,
        earlyPayoutTotalAllowanceAmount: 0,
        rows: [
          {
            calculationId: input.calculationIds[0] ?? "calc-1",
            siteName: "본관",
            employeeCode: "EMP-1",
            employeeName: "홍길동",
            workDate: "2026-04-10",
            workType: "overtime",
            businessCategoryLabel: "평일 연장",
            totalWorkMinutes: 180,
            totalAllowanceAmount: 45000
          }
        ],
        regularSiteSummaries: [],
        earlyPayoutSiteSummaries: []
      },
    backupSummary:
      input.backupSummary ??
      {
        createdAt: input.approvedAt,
        jsonBackupPath: "C:/temp/backup.json",
        warningMessages: []
      }
  }) satisfies AllowanceProposalApprovalRecord;

const createRateVersion = (
  input: Partial<AllowanceRateVersion> & { id: string; year: number; effectiveFrom: string }
): AllowanceRateVersion =>
  ({
    id: input.id,
    year: input.year,
    versionLabel: input.versionLabel ?? `${input.year} 버전`,
    status: input.status ?? "active",
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
    items: input.items ?? [],
    createdAt: input.createdAt ?? `${input.year}-01-01T00:00:00.000Z`
  }) satisfies AllowanceRateVersion;

const employees: EmployeeRecord[] = [
  {
    id: "emp-1",
    employeeCode: "EMP-1",
    name: "홍길동",
    employmentType: "정규직",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "emp-2",
    employeeCode: "EMP-2",
    name: "김영희",
    employmentType: "정규직",
    status: "retired",
    createdAt: "2026-01-01T00:00:00.000Z"
  }
];

describe("allowance-management-selectors", () => {
  it("should filter visible results and keep overview sort order", () => {
    const rows = buildVisibleResults({
      results: [
        createResult({
          id: "calc-1",
          employeeName: "홍길동",
          siteName: "본관",
          workDate: "2026-04-10",
          workType: "overtime"
        }),
        createResult({
          id: "calc-2",
          employeeName: "김영희",
          siteName: "본관",
          workDate: "2026-04-10",
          workType: "substitute"
        }),
        createResult({
          id: "calc-3",
          employeeName: "박철수",
          siteName: "별관",
          workDate: "2026-03-31"
        })
      ],
      selectedYear: "2026",
      selectedMonth: "04",
      selectedSite: "본관",
      keyword: "본관"
    });

    expect(rows.map((row) => row.id)).toEqual(["calc-2", "calc-1"]);
  });

  it("should build overview groups and site distribution totals", () => {
    const visibleResults = [
      createResult({
        id: "calc-1",
        employeeName: "홍길동",
        siteName: "본관",
        workDate: "2026-04-10",
        status: "pending",
        snapshot: {
          breakdown: {
            totalWorkMinutes: 180,
            baseWorkMinutes: 60,
            overtimeMinutes: 120,
            nightMinutes: 0,
            holidayMinutes: 0,
            substituteMinutes: 0
          },
          totalAllowanceAmount: 30000,
          createdAt: "2026-04-10T09:00:00.000Z"
        } as AllowanceCalculationResultRecord["snapshot"]
      }),
      createResult({
        id: "calc-2",
        employeeName: "김영희",
        siteName: "본관",
        workDate: "2026-04-11",
        status: "proposal-approved",
        snapshot: {
          breakdown: {
            totalWorkMinutes: 240,
            baseWorkMinutes: 120,
            overtimeMinutes: 60,
            nightMinutes: 60,
            holidayMinutes: 0,
            substituteMinutes: 0
          },
          totalAllowanceAmount: 60000,
          createdAt: "2026-04-11T09:00:00.000Z"
        } as AllowanceCalculationResultRecord["snapshot"]
      }),
      createResult({
        id: "calc-3",
        employeeName: "박철수",
        siteName: "별관",
        workDate: "2026-04-09",
        status: "approved",
        snapshot: {
          breakdown: {
            totalWorkMinutes: 120,
            baseWorkMinutes: 60,
            overtimeMinutes: 60,
            nightMinutes: 0,
            holidayMinutes: 0,
            substituteMinutes: 0
          },
          totalAllowanceAmount: 20000,
          createdAt: "2026-04-09T09:00:00.000Z"
        } as AllowanceCalculationResultRecord["snapshot"]
      })
    ];

    const groups = buildOverviewGroups(visibleResults);
    const distribution = buildSiteDistribution(visibleResults);

    expect(groups[0]?.siteName).toBe("본관");
    expect(groups[0]?.pendingCount).toBe(1);
    expect(groups[0]?.proposalApprovedCount).toBe(1);
    expect(groups[0]?.totalAllowanceAmount).toBe(90000);
    expect(distribution[0]).toMatchObject({
      siteName: "본관",
      amount: 90000,
      employeeCount: 2
    });
    expect(distribution[0]?.ratio).toBe(1);
  });

  it("should build work type distribution summary", () => {
    const distribution = buildWorkTypeDistribution([
      createResult({
        id: "calc-1",
        employeeName: "홍길동",
        siteName: "본관",
        workDate: "2026-04-10",
        workType: "substitute",
        snapshot: {
          breakdown: {
            totalWorkMinutes: 120,
            baseWorkMinutes: 60,
            overtimeMinutes: 60,
            nightMinutes: 0,
            holidayMinutes: 0,
            substituteMinutes: 0
          },
          totalAllowanceAmount: 20000,
          createdAt: "2026-04-10T09:00:00.000Z"
        } as AllowanceCalculationResultRecord["snapshot"]
      }),
      createResult({
        id: "calc-2",
        employeeName: "김영희",
        siteName: "본관",
        workDate: "2026-04-10",
        workType: "holiday",
        snapshot: {
          breakdown: {
            totalWorkMinutes: 300,
            baseWorkMinutes: 120,
            overtimeMinutes: 120,
            nightMinutes: 60,
            holidayMinutes: 0,
            substituteMinutes: 0
          },
          totalAllowanceAmount: 70000,
          createdAt: "2026-04-10T09:00:00.000Z"
        } as AllowanceCalculationResultRecord["snapshot"]
      })
    ]);

    expect(distribution.grandTotalAmount).toBe(90000);
    expect(distribution.dominantType).toBe("holiday");
    expect(distribution.segments.find((segment) => segment.type === "substitute")?.percentage).toBe(22);
  });

  it("should prefer the most used rate version and fall back to active version when no rows exist", () => {
    const rate2026A = createRateVersion({
      id: "rate-2026-a",
      year: 2026,
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-06-30"
    });
    const rate2026B = createRateVersion({
      id: "rate-2026-b",
      year: 2026,
      effectiveFrom: "2026-07-01"
    });

    expect(
      resolveDisplayedRateVersion({
        versions: [rate2026A, rate2026B],
        selectedYear: "2026",
        selectedMonth: "04",
        visibleResults: [
          createResult({
            id: "calc-1",
            employeeName: "홍길동",
            siteName: "본관",
            workDate: "2026-04-10",
            rateVersionId: "rate-2026-b"
          }),
          createResult({
            id: "calc-2",
            employeeName: "김영희",
            siteName: "본관",
            workDate: "2026-04-11",
            rateVersionId: "rate-2026-b"
          })
        ],
        fallbackDate: "2026-04-15",
        fallbackYear: "2026"
      })?.id
    ).toBe("rate-2026-b");

    expect(
      resolveDisplayedRateVersion({
        versions: [rate2026A, rate2026B],
        selectedYear: "2026",
        selectedMonth: "04",
        visibleResults: [],
        fallbackDate: "2026-04-15",
        fallbackYear: "2026"
      })?.id
    ).toBe("rate-2026-a");
  });

  it("should build history rows from latest export and approval records", () => {
    const results = [
      createResult({
        id: "calc-1",
        employeeName: "홍길동",
        siteName: "본관",
        workDate: "2026-04-10"
      })
    ];
    const latestRows = buildHistoryRows({
      results,
      latestDocumentExportByCalculationId: new Map([
        ["calc-1", createExportRecord({ id: "export-2", exportedAt: "2026-04-12T09:00:00.000Z", calculationIds: ["calc-1"] })]
      ]),
      latestApprovalByCalculationId: new Map([
        [
          "calc-1",
          createApprovalRecord({
            id: "approval-2",
            calculationId: "calc-1",
            processedAt: "2026-04-13T08:00:00.000Z",
            comment: "최종 승인"
          })
        ]
      ]),
      latestProposalApprovalByCalculationId: new Map([
        [
          "calc-1",
          createProposalApprovalRecord({
            id: "proposal-1",
            approvedAt: "2026-04-14T07:00:00.000Z",
            calculationIds: ["calc-1"]
          })
        ]
      ])
    });

    expect(latestRows[0]).toMatchObject({
      rowId: "calc-1",
      latestExportedAt: "2026-04-12T09:00:00.000Z",
      latestReviewedAt: "2026-04-13T08:00:00.000Z",
      latestReviewComment: "최종 승인"
    });
    expect(latestRows[0]?.proposalApproval?.id).toBe("proposal-1");
  });

  it("should filter visible history rows by work type, employee, and current status", () => {
    const resolver = createEmployeeCurrentStatusResolver(employees);
    const historyRows = buildHistoryRows({
      results: [
        createResult({
          id: "calc-1",
          employeeName: "홍길동",
          employeeCode: "EMP-1",
          siteName: "본관",
          workDate: "2026-04-10",
          workType: "overtime"
        }),
        createResult({
          id: "calc-2",
          employeeName: "김영희",
          employeeCode: "EMP-2",
          siteName: "본관",
          workDate: "2026-04-11",
          workType: "holiday"
        })
      ],
      latestDocumentExportByCalculationId: new Map(),
      latestApprovalByCalculationId: new Map(),
      latestProposalApprovalByCalculationId: new Map()
    });

    const filtered = buildVisibleHistoryRows({
      historyRows,
      selectedYear: "2026",
      selectedMonth: "04",
      selectedSite: "본관",
      selectedWorkType: "overtime",
      selectedCurrentStatus: "active",
      selectedStatus: "all",
      selectedEmployee: "홍길동",
      resolveEmployeeCurrentStatus: resolver
    });

    expect(filtered.map((row) => row.rowId)).toEqual(["calc-1"]);
  });

  it("should filter proposal approvals by preview rows and employee current status", () => {
    const resolver = createEmployeeCurrentStatusResolver(employees);
    const approvals = [
      createProposalApprovalRecord({
        id: "proposal-1",
        approvedAt: "2026-04-14T07:00:00.000Z",
        calculationIds: ["calc-1"],
        previewSnapshot: {
          workMonth: "2026-04",
          generatedAt: "2026-04-14T06:30:00.000Z",
          calculationCount: 1,
          employeeCount: 1,
          totalAllowanceAmount: 45000,
          regularTotalAllowanceAmount: 45000,
          earlyPayoutTotalAllowanceAmount: 0,
          rows: [
            {
              calculationId: "calc-1",
              siteName: "본관",
              employeeCode: "EMP-1",
              employeeName: "홍길동",
              workDate: "2026-04-10",
              workType: "overtime",
              businessCategoryLabel: "평일 연장",
              totalWorkMinutes: 180,
              totalAllowanceAmount: 45000
            }
          ],
          regularSiteSummaries: [],
          earlyPayoutSiteSummaries: []
        }
      }),
      createProposalApprovalRecord({
        id: "proposal-2",
        approvedAt: "2026-04-15T07:00:00.000Z",
        calculationIds: ["calc-2"],
        previewSnapshot: {
          workMonth: "2026-04",
          generatedAt: "2026-04-15T06:30:00.000Z",
          calculationCount: 1,
          employeeCount: 1,
          totalAllowanceAmount: 55000,
          regularTotalAllowanceAmount: 55000,
          earlyPayoutTotalAllowanceAmount: 0,
          rows: [
            {
              calculationId: "calc-2",
              siteName: "별관",
              employeeCode: "EMP-2",
              employeeName: "김영희",
              workDate: "2026-04-11",
              workType: "holiday",
              businessCategoryLabel: "휴일 근무",
              totalWorkMinutes: 300,
              totalAllowanceAmount: 55000
            }
          ],
          regularSiteSummaries: [],
          earlyPayoutSiteSummaries: []
        }
      })
    ];

    const filtered = buildVisibleProposalApprovals({
      proposalApprovals: approvals,
      selectedYear: "2026",
      selectedMonth: "04",
      selectedSite: "본관",
      selectedEmployee: "홍길동",
      selectedWorkType: "overtime",
      selectedCurrentStatus: "active",
      selectedStatus: "proposal-approved",
      resolveEmployeeCurrentStatus: resolver
    });

    expect(filtered.map((record) => record.id)).toEqual(["proposal-1"]);
  });
});
