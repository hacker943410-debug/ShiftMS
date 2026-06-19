import type { ReactNode } from "react";

interface EmptyStateProps {
  message: string;
  description?: string;
  action?: ReactNode;
}

/**
 * 공용 빈 화면 컴포넌트.
 * 흩어져 있던 "문구만 있는" 빈 화면을 아이콘 + 안내 문구 + (선택)설명/액션 형태로 통일한다.
 * 기존 스타일 훅(allowance-empty-state)을 그대로 사용해 시각적 회귀 없이 아이콘만 추가한다.
 */
export const EmptyState = ({ message, description, action }: EmptyStateProps) => (
  <div className="allowance-empty-state empty-state">
    <svg
      aria-hidden="true"
      className="empty-state-icon"
      fill="none"
      height="40"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width="40"
    >
      <rect height="14" rx="2" width="18" x="3" y="4" />
      <path d="M3 13h5l1.6 2.6h4.8L19 13" />
    </svg>
    <strong>{message}</strong>
    {description ? <span>{description}</span> : null}
    {action ? <div className="empty-state-action">{action}</div> : null}
  </div>
);
