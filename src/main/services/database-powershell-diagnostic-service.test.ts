import { describe, expect, it } from "vitest";

import {
  buildAccessExportFailureMessage,
  buildAccessRequirementCheckFailure,
  buildPowerShellDiagnosticText,
  extractMeaningfulPowerShellFailureReason,
  normalizePowerShellCommandOutput,
  parseDetectedAccessProvider
} from "./database-powershell-diagnostic-service";

describe("database-powershell-diagnostic-service", () => {
  it("should normalize stdout, stderr, and error message into one diagnostic string", () => {
    expect(
      normalizePowerShellCommandOutput({
        status: 1,
        stdout: "stdout-line",
        stderr: "stderr-line",
        errorMessage: "error-line"
      })
    ).toBe("stdout-line\nstderr-line\nerror-line");
  });

  it("should build provider-missing requirement guidance without exposing raw stderr", () => {
    const requirementCheck = buildAccessRequirementCheckFailure({
      checkedAt: "2026-04-16T06:00:00.000Z",
      scriptPath: "C:/app/resources/scripts/export-access-db.ps1",
      snapshot: {
        status: 1,
        stderr: "사용 가능한 Access OLEDB Provider를 찾지 못했습니다."
      }
    });

    expect(requirementCheck.status).toBe("provider-missing");
    expect(requirementCheck.details).toEqual([
      "Access 복구 스크립트: C:/app/resources/scripts/export-access-db.ps1",
      "JSON 복원은 계속 사용할 수 있지만 Access DB(.accdb) 미리보기와 복원은 현재 실행할 수 없습니다."
    ]);
  });

  it("should extract a meaningful PowerShell reason line", () => {
    expect(
      extractMeaningfulPowerShellFailureReason([
        "위치 줄:1 문자:3",
        "+ CategoryInfo          : NotSpecified: (:) [], RuntimeException",
        "선택한 테이블을 Access DB에서 찾지 못했습니다: 사업조직별근무실적"
      ].join("\n"))
    ).toBe("선택한 테이블을 Access DB에서 찾지 못했습니다: 사업조직별근무실적");
  });

  it("should surface the selected-table failure reason in the export message", () => {
    const snapshot = {
      status: 1,
      stderr: "선택한 테이블을 Access DB에서 찾지 못했습니다: 사업조직별근무실적"
    };

    expect(buildAccessExportFailureMessage(snapshot)).toBe(
      "Access DB에 선택한 복원 테이블이 없습니다. 원본 DB 구조와 테이블 선택을 확인하세요. 원인: 선택한 테이블을 Access DB에서 찾지 못했습니다: 사업조직별근무실적"
    );
    expect(
      buildPowerShellDiagnosticText({
        commandName: "access-export",
        scriptPath: "C:/app/resources/scripts/export-access-db.ps1",
        databasePath: "C:/data/source.accdb",
        snapshot
      })
    ).toContain("databasePath=C:/data/source.accdb");
  });

  it("should parse the detected provider token from success output", () => {
    expect(parseDetectedAccessProvider("ACCESS_PROVIDER_OK provider=Microsoft.ACE.OLEDB.16.0")).toBe(
      "Microsoft.ACE.OLEDB.16.0"
    );
  });

  it("should include the meaningful failure reason in requirement details", () => {
    const requirementCheck = buildAccessRequirementCheckFailure({
      checkedAt: "2026-04-21T08:00:00.000Z",
      scriptPath: "C:/app/resources/scripts/export-access-db.ps1",
      snapshot: {
        status: 1,
        stderr: "스크립트를 로드할 수 없으므로 실행할 수 없습니다."
      }
    });

    expect(requirementCheck.details).toContain(
      "실패 원인: 스크립트를 로드할 수 없으므로 실행할 수 없습니다."
    );
  });
});
