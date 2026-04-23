import type { DatabaseMigrationRequirementCheck } from "../../shared/bridge/contracts";

export interface PowerShellCommandSnapshot {
  status: number | null;
  stdout?: string | null;
  stderr?: string | null;
  errorMessage?: string | null;
}

const ACCESS_PROVIDER_MISSING_MESSAGE = "사용 가능한 Access OLEDB Provider를 찾지 못했습니다.";
const POWERSHELL_IGNORED_DIAGNOSTIC_PREFIXES = [
  "위치 줄:",
  "명령 위치:",
  "CategoryInfo",
  "FullyQualifiedErrorId"
] as const;

export const normalizePowerShellCommandOutput = (snapshot: PowerShellCommandSnapshot) =>
  [snapshot.stdout, snapshot.stderr, snapshot.errorMessage].filter(Boolean).join("\n").trim();

export const parseDetectedAccessProvider = (text: string) => {
  const matched = text.match(/provider=([^\s]+)/);
  return matched?.[1];
};

export const hasMissingAccessProviderSignal = (text: string) =>
  text.includes(ACCESS_PROVIDER_MISSING_MESSAGE);

export const extractMeaningfulPowerShellFailureReason = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => {
      if (/^[+~]/.test(line)) {
        return false;
      }

      return !POWERSHELL_IGNORED_DIAGNOSTIC_PREFIXES.some((prefix) => line.startsWith(prefix));
    }) ?? null;

export const buildPowerShellDiagnosticText = (input: {
  commandName: string;
  scriptPath: string;
  databasePath?: string;
  snapshot: PowerShellCommandSnapshot;
}) => {
  const output = normalizePowerShellCommandOutput(input.snapshot);
  const lines = [
    `command=${input.commandName}`,
    `status=${input.snapshot.status ?? "null"}`,
    `scriptPath=${input.scriptPath}`
  ];

  if (input.databasePath) {
    lines.push(`databasePath=${input.databasePath}`);
  }

  if (output) {
    lines.push(output);
  }

  return lines.join("\n");
};

export const buildAccessRequirementCheckFailure = (input: {
  checkedAt: string;
  scriptPath: string;
  snapshot: PowerShellCommandSnapshot;
}): DatabaseMigrationRequirementCheck => {
  const output = normalizePowerShellCommandOutput(input.snapshot);
  const failureReason = extractMeaningfulPowerShellFailureReason(output);

  if (hasMissingAccessProviderSignal(output)) {
    return {
      sourceType: "access",
      isReady: false,
      status: "provider-missing",
      checkedAt: input.checkedAt,
      headline: "이 PC에는 Access DB(.accdb) 복원에 필요한 ACE OLEDB가 없습니다.",
      details: [
        `Access 복구 스크립트: ${input.scriptPath}`,
        "JSON 복원은 계속 사용할 수 있지만 Access DB(.accdb) 미리보기와 복원은 현재 실행할 수 없습니다."
      ],
      recommendedActions: [
        "Microsoft 365 Access Runtime 또는 호환 Office/Access 구성으로 ACE OLEDB를 설치하세요.",
        "64비트 설치본을 사용 중이므로 Office/Runtime 아키텍처 충돌 여부를 함께 확인하세요.",
        "설치 후 앱을 다시 실행하고 DB업데이트 미리보기를 다시 확인하세요."
      ],
      scriptPath: input.scriptPath
    };
  }

  return {
    sourceType: "access",
    isReady: false,
    status: "check-failed",
    checkedAt: input.checkedAt,
    headline: "Access 복원 사전 점검 중 오류가 발생했습니다.",
    details: [
      `Access 복구 스크립트: ${input.scriptPath}`,
      "PowerShell 기반 Access 복원 사전 점검을 완료하지 못했습니다.",
      ...(failureReason ? [`실패 원인: ${failureReason}`] : [])
    ],
    recommendedActions: [
      "PowerShell 실행 가능 여부와 보안 정책을 확인한 뒤 다시 시도하세요."
    ],
    scriptPath: input.scriptPath
  };
};

export const buildAccessExportFailureMessage = (snapshot: PowerShellCommandSnapshot) => {
  const output = normalizePowerShellCommandOutput(snapshot);
  const failureReason = extractMeaningfulPowerShellFailureReason(output);

  if (hasMissingAccessProviderSignal(output)) {
    return "Access DB를 읽지 못했습니다. 대상 PC에 Microsoft Access Database Engine(ACE OLEDB)이 설치되어 있는지 확인하세요.";
  }

  if (
    snapshot.errorMessage?.includes("ENOENT") ||
    (output.toLowerCase().includes("powershell") && output.toLowerCase().includes("not recognized"))
  ) {
    return "Access 복원을 시작하지 못했습니다. PowerShell 실행 파일을 찾을 수 없습니다.";
  }

  if (output.includes("데이터베이스 파일을 찾을 수 없습니다:")) {
    return "선택한 Access DB 파일을 찾을 수 없습니다. 파일 경로와 접근 권한을 확인하세요.";
  }

  if (output.includes("선택한 테이블을 Access DB에서 찾지 못했습니다:")) {
    return `Access DB에 선택한 복원 테이블이 없습니다. 원본 DB 구조와 테이블 선택을 확인하세요.${failureReason ? ` 원인: ${failureReason}` : ""}`;
  }

  if (
    output.includes("데이터베이스 연결 문자열을 구성하지 못했습니다.") ||
    output.includes("데이터베이스 연결을 열 수 없습니다")
  ) {
    return `Access DB 연결을 열지 못했습니다.${failureReason ? ` 원인: ${failureReason}` : ""}`;
  }

  if (
    output.includes("ExecutionPolicy") ||
    output.includes("running scripts is disabled") ||
    output.includes("스크립트를 로드할 수 없으므로")
  ) {
    return `PowerShell 실행 정책 때문에 Access 복원이 차단되었습니다.${failureReason ? ` 원인: ${failureReason}` : ""}`;
  }

  return `Access DB를 JSON으로 변환하지 못했습니다.${failureReason ? ` 원인: ${failureReason}` : " PowerShell 실행 환경과 복구 스크립트를 확인하세요."}`;
};
