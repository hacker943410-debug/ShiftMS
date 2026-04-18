import type { UserRole } from "./model";

export const accessLogActionLabels = {
  "sign-in": "로그인",
  "sign-in-failed": "로그인 실패",
  "password-change": "비밀번호 변경",
  "sign-out": "로그아웃",
  "route-view": "화면 이동",
  "dashboard-export": "대시보드 출력",
  "employee-save": "인력 저장",
  "employee-wage-save": "시급 저장",
  "employee-wage-close": "시급 종료",
  "employee-assignment-save": "배정 저장",
  "employee-assignment-close": "배정 종료",
  "employee-wage-bulk-apply": "시급 일괄 적용",
  "site-save": "근무지 저장",
  "site-delete": "근무지 삭제",
  "app-settings-save": "앱 설정 저장",
  "database-backup-run": "DB 수동 백업",
  "database-migration-preview": "DB 복원 미리보기",
  "database-migration-update": "DB 복원 반영",
  "file-watch-restart": "파일 감시 재시작",
  "file-watch-stop": "파일 감시 중지",
  "holiday-fetch": "공휴일 불러오기",
  "holiday-save": "공휴일 등록",
  "holiday-rename": "공휴일 수정",
  "holiday-delete": "공휴일 삭제",
  "holiday-replace": "공휴일 일괄 반영",
  "allowance-rate-save": "요율 저장",
  "allowance-rate-delete": "요율 삭제",
  "user-save": "사용자 저장",
  "user-delete": "사용자 삭제",
  "template-inspect": "양식 검증",
  "template-preview": "양식 미리보기",
  "template-save": "양식 등록",
  "template-approve": "양식 승인",
  "template-set-default": "기본 양식 지정",
  "template-file-name-update": "출력 파일명 규칙 저장",
  "template-delete": "양식 삭제",
  "shift-pattern-import": "근무패턴 분석",
  "shift-pattern-save": "근무패턴 저장",
  "shift-pattern-deactivate": "근무패턴 비활성화",
  "schedule-save": "근무표 저장",
  "schedule-preview": "근무표 미리보기",
  "schedule-export": "근무표 생성",
  "schedule-publish": "근무표 배포",
  "performance-approve": "실적 승인",
  "performance-reapprove": "실적 승인 확정",
  "performance-reject": "실적 반려",
  "performance-hide-approved": "승인완료 목록삭제",
  "performance-open-file": "원본 파일 열기",
  "allowance-calculate": "수당 계산",
  "allowance-approve": "수당 승인",
  "allowance-reject": "수당 반려",
  "allowance-early-payout": "선지급 지정",
  "allowance-export": "품의 출력",
  "allowance-proposal-preview": "품의 미리보기",
  "allowance-proposal-approve": "품의 승인"
} as const;

export type AccessLogActionType = keyof typeof accessLogActionLabels;

export const accessLogActionOptions = Object.entries(accessLogActionLabels).map(
  ([value, label]) => ({
    value: value as AccessLogActionType,
    label
  })
);

export interface AccessLogRecord {
  id: string;
  userId: string;
  loginId: string;
  displayName: string;
  role: UserRole;
  actionType: AccessLogActionType;
  actionLabel: string;
  routeKey?: string;
  routeLabel?: string;
  details?: string;
  occurredAt: string;
}
