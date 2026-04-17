import { describe, expect, it } from "vitest";

import {
  buildAccessExportFailureMessage,
  buildAccessRequirementCheckFailure,
  buildPowerShellDiagnosticText,
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

  it("should build a generic export failure message and detailed log payload", () => {
    const snapshot = {
      status: 1,
      stderr: "script execution policy blocked"
    };

    expect(buildAccessExportFailureMessage(snapshot)).toBe(
      "Access DB를 JSON으로 변환하지 못했습니다. PowerShell 실행 환경과 복구 스크립트를 확인하세요."
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
});
