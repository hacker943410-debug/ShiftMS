import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import {
  approveManagedDocumentTemplateVersion,
  deleteManagedDocumentTemplateVersion,
  inspectDocumentTemplateImport,
  saveManagedDocumentTemplateVersion
} from "./document-template-management-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import { listStoredDocumentTemplateVersions, resetOperationsStorageForTest } from "./operations-storage-service";

const testRootBase = path.resolve(process.cwd(), "artifacts", "tests", "template-management");
const allocatedTestRoots: string[] = [];

const createTestPaths = () => {
  const rootDir = path.resolve(
    testRootBase,
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );

  allocatedTestRoots.push(rootDir);

  return {
    rootDir,
    dbPath: path.resolve(rootDir, "template-management.test.sqlite"),
    userDataPath: path.resolve(rootDir, "user-data")
  };
};

const writeProposalWorkbook = async (
  filePath: string,
  layout: { titleRow?: number; sectionRow?: number }
) => {
  mkdirSync(path.dirname(filePath), { recursive: true });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("품의서");

  if (layout.titleRow) {
    worksheet.getCell(`A${layout.titleRow}`).value =
      "제  목  :  DT사업1팀 스케쥴근무 시간외 근로 수당 지급의 건";
  }

  if (layout.sectionRow) {
    worksheet.getCell(`B${layout.sectionRow}`).value = "2. 4월 지급 요청 내역";
  }

  await workbook.xlsx.writeFile(filePath);
};

describe("document-template-management-service", () => {
  afterEach(() => {
    resetOperationsStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      try {
        rmSync(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // Ignore transient Windows file locks during test teardown.
      }
    });
  });

  it("should inspect a supported schedule template and persist it as pending", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({
      dbPath: paths.dbPath
    });

    const inspection = await inspectDocumentTemplateImport({
      templateType: "schedule",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "근무표_템플릿1.xlsx")
    });

    expect(inspection.canProceed).toBe(true);
    expect(inspection.profile.kind).toBe("schedule");
    expect(inspection.detectedTemplateFamily).toBe("sample1");
    expect(inspection.detectedZones.length).toBeGreaterThan(0);
    expect(inspection.suggestedLabels.length).toBeGreaterThan(0);

    const saved = saveManagedDocumentTemplateVersion(
      {
        templateType: "schedule",
        versionLabel: "등록 테스트",
        sourcePath: path.resolve(process.cwd(), "양식샘플", "근무표_템플릿1.xlsx"),
        managedFileName: "커스텀_근무표_양식.xlsx",
        profileSchemaVersion: "2",
        profile: inspection.profile,
        validation: inspection
      },
      {
        userDataPath: paths.userDataPath
      }
    );

    expect(saved.status).toBe("pending");
    expect(saved.profile?.kind).toBe("schedule");
    expect(existsSync(saved.sourcePath)).toBe(true);
    expect(path.basename(saved.sourcePath)).toBe("커스텀_근무표_양식.xlsx");
  });

  it("should approve and delete a managed template version", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({
      dbPath: paths.dbPath
    });

    const inspection = await inspectDocumentTemplateImport({
      templateType: "proposal",
      sourcePath: path.resolve(
        process.cwd(),
        "양식샘플",
        "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx"
      )
    });
    const saved = saveManagedDocumentTemplateVersion(
      {
        templateType: "proposal",
        versionLabel: "품의 테스트",
        sourcePath: path.resolve(
          process.cwd(),
          "양식샘플",
          "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx"
        ),
        profileSchemaVersion: "2",
        profile: inspection.profile,
        validation: inspection
      },
      {
        userDataPath: paths.userDataPath
      }
    );

    const approved = approveManagedDocumentTemplateVersion(saved.id);

    expect(approved.status).toBe("approved");
    expect(existsSync(saved.sourcePath)).toBe(true);

    deleteManagedDocumentTemplateVersion(saved.id, {
      userDataPath: paths.userDataPath
    });

    expect(listStoredDocumentTemplateVersions("proposal").some((template) => template.id === saved.id)).toBe(false);
    expect(existsSync(saved.sourcePath)).toBe(true);
  });

  it("should edit an approved template in place", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({
      dbPath: paths.dbPath
    });

    const inspection = await inspectDocumentTemplateImport({
      templateType: "proposal",
      sourcePath: path.resolve(
        process.cwd(),
        "양식샘플",
        "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx"
      )
    });
    const saved = saveManagedDocumentTemplateVersion(
      {
        templateType: "proposal",
        versionLabel: "품의 테스트",
        sourcePath: path.resolve(
          process.cwd(),
          "양식샘플",
          "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx"
        ),
        profileSchemaVersion: "2",
        profile: inspection.profile,
        validation: inspection
      },
      {
        userDataPath: paths.userDataPath
      }
    );

    const approved = approveManagedDocumentTemplateVersion(saved.id);
    const edited = saveManagedDocumentTemplateVersion(
      {
        id: approved.id,
        templateType: "proposal",
        versionLabel: "품의 테스트 수정",
        sourcePath: approved.sourcePath,
        managedFileName: "품의 수정 저장본.xlsx",
        profileSchemaVersion: "2",
        profile: inspection.profile,
        validation: inspection
      },
      {
        userDataPath: paths.userDataPath
      }
    );

    expect(edited.id).toBe(approved.id);
    expect(edited.status).toBe("approved");
    expect(edited.sourcePath).not.toBe(approved.sourcePath);
    expect(path.basename(edited.sourcePath)).toBe("품의 수정 저장본.xlsx");
    expect(existsSync(approved.sourcePath)).toBe(false);
    expect(existsSync(edited.sourcePath)).toBe(true);

    const templates = listStoredDocumentTemplateVersions("proposal");
    const updatedTemplate = templates.find((template) => template.id === approved.id);

    expect(updatedTemplate?.status).toBe("approved");
    expect(updatedTemplate?.versionLabel).toBe("품의 테스트 수정");
  });

  it("blocks registering an old (구형) proposal template at inspection", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({ dbPath: paths.dbPath });

    // 구형 레이아웃: 제목/지급 요청 내역 헤더가 신형보다 한 행 아래(12행/19행).
    const legacyPath = path.resolve(paths.rootDir, "품의서_구형.xlsx");
    await writeProposalWorkbook(legacyPath, { titleRow: 12, sectionRow: 19 });

    const inspection = await inspectDocumentTemplateImport({
      templateType: "proposal",
      sourcePath: legacyPath
    });

    expect(inspection.canProceed).toBe(false);
    expect(inspection.inspectionWarnings.some((warning) => warning.includes("구버전"))).toBe(true);

    expect(() =>
      saveManagedDocumentTemplateVersion(
        {
          templateType: "proposal",
          versionLabel: "구형 품의서",
          sourcePath: legacyPath,
          profileSchemaVersion: "2",
          profile: inspection.profile,
          validation: inspection
        },
        { userDataPath: paths.userDataPath }
      )
    ).toThrow();
  });

  it("accepts a new-layout (신형) proposal template regardless of file name", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({ dbPath: paths.dbPath });

    // 신형 레이아웃(제목 11행 / 지급 요청 내역 18행)을 파일명과 무관하게 콘텐츠로 인식.
    const updatedPath = path.resolve(paths.rootDir, "사내_품의_양식.xlsx");
    await writeProposalWorkbook(updatedPath, { titleRow: 11, sectionRow: 18 });

    const inspection = await inspectDocumentTemplateImport({
      templateType: "proposal",
      sourcePath: updatedPath
    });

    expect(inspection.canProceed).toBe(true);
    expect(inspection.inspectionWarnings).toHaveLength(0);
  });

  it("warns but allows an unrecognized proposal template structure", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({ dbPath: paths.dbPath });

    const unknownPath = path.resolve(paths.rootDir, "정체불명_양식.xlsx");
    mkdirSync(path.dirname(unknownPath), { recursive: true });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("품의서");
    worksheet.getCell("A1").value = "테스트 문서";
    worksheet.getCell("B5").value = "내용";
    await workbook.xlsx.writeFile(unknownPath);

    const inspection = await inspectDocumentTemplateImport({
      templateType: "proposal",
      sourcePath: unknownPath
    });

    expect(inspection.canProceed).toBe(true);
    expect(inspection.inspectionWarnings.some((warning) => warning.includes("인식하지 못"))).toBe(
      true
    );
  });

  it("accepts the bundled 신형 proposal template", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({ dbPath: paths.dbPath });

    const inspection = await inspectDocumentTemplateImport({
      templateType: "proposal",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "품의서_2026-04_수정본.xlsx")
    });

    expect(inspection.canProceed).toBe(true);
    expect(inspection.inspectionWarnings).toHaveLength(0);
  });
});
