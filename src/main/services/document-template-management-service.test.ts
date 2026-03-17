import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  approveManagedDocumentTemplateVersion,
  deleteManagedDocumentTemplateVersion,
  inspectDocumentTemplateImport,
  saveManagedDocumentTemplateVersion
} from "./document-template-management-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import { listStoredDocumentTemplateVersions, resetOperationsStorageForTest } from "./operations-storage-service";

const userDataPath = path.resolve(process.cwd(), "artifacts", "tests", "template-management-user-data");

describe("document-template-management-service", () => {
  afterEach(() => {
    resetOperationsStorageForTest();
    resetSqliteStorageForTest();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it("should inspect a supported schedule template and persist it as pending", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "template-management.test.sqlite")
    });

    const inspection = await inspectDocumentTemplateImport({
      templateType: "schedule",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "근무표_템플릿1.xlsx")
    });

    expect(inspection.canProceed).toBe(true);
    expect(inspection.profile.kind).toBe("schedule");
    expect(inspection.detectedTemplateFamily).toBe("sample1");

    const saved = saveManagedDocumentTemplateVersion(
      {
        templateType: "schedule",
        versionLabel: "등록 테스트",
        sourcePath: path.resolve(process.cwd(), "양식샘플", "근무표_템플릿1.xlsx"),
        managedFileName: "커스텀_근무표_양식.xlsx",
        profileSchemaVersion: "1",
        profile: inspection.profile,
        validation: inspection
      },
      {
        userDataPath
      }
    );

    expect(saved.status).toBe("pending");
    expect(saved.profile?.kind).toBe("schedule");
    expect(existsSync(saved.sourcePath)).toBe(true);
    expect(path.basename(saved.sourcePath)).toBe("커스텀_근무표_양식.xlsx");
  });

  it("should approve and delete a managed template version", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "template-management.test.sqlite")
    });

    const inspection = await inspectDocumentTemplateImport({
      templateType: "proposal",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "품위서_샘플.xlsx")
    });
    const saved = saveManagedDocumentTemplateVersion(
      {
        templateType: "proposal",
        versionLabel: "품의 테스트",
        sourcePath: path.resolve(process.cwd(), "양식샘플", "품위서_샘플.xlsx"),
        profileSchemaVersion: "1",
        profile: inspection.profile,
        validation: inspection
      },
      {
        userDataPath
      }
    );

    const approved = approveManagedDocumentTemplateVersion(saved.id);

    expect(approved.status).toBe("approved");
    expect(existsSync(saved.sourcePath)).toBe(true);

    deleteManagedDocumentTemplateVersion(saved.id, {
      userDataPath
    });

    expect(listStoredDocumentTemplateVersions("proposal").some((template) => template.id === saved.id)).toBe(false);
    expect(existsSync(saved.sourcePath)).toBe(true);
  });

  it("should edit an approved template in place", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "template-management.test.sqlite")
    });

    const inspection = await inspectDocumentTemplateImport({
      templateType: "proposal",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "품위서_샘플.xlsx")
    });
    const saved = saveManagedDocumentTemplateVersion(
      {
        templateType: "proposal",
        versionLabel: "품의 테스트",
        sourcePath: path.resolve(process.cwd(), "양식샘플", "품위서_샘플.xlsx"),
        profileSchemaVersion: "1",
        profile: inspection.profile,
        validation: inspection
      },
      {
        userDataPath
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
        profileSchemaVersion: "1",
        profile: inspection.profile,
        validation: inspection
      },
      {
        userDataPath
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
});
