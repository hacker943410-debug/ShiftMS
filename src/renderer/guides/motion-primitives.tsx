import type { CSSProperties } from "react";

/**
 * motion-primitives.tsx
 *
 * 가이드 씬에서 공통으로 사용하는 SVG/CSS 모션 프리미티브 컴포넌트 모음.
 *
 * 배경:
 * - 기존 DashboardGuideScene, PerformanceGuideScene, AllowanceGuideScene 각각에
 *   동일한 MotionPointer / MotionRipple 코드가 로컬로 중복 정의되어 있었음.
 * - 배치 3 GuideScene 추가 전에 공통 파일로 먼저 추출하여 중복을 제거함.
 *
 * 사용법:
 *   import { MotionPointer, MotionRipple } from "./motion-primitives";
 *
 * 확장:
 * - 새 씬 primitive가 필요하면 이 파일에 추가한다.
 * - className prop으로 씬별 위치/타이밍 CSS 클래스를 주입한다.
 *   예: className="guide-motion-pointer--schedule-distribute"
 */

interface MotionPrimitiveProps {
  className?: string;
  style?: CSSProperties;
}

interface GuideFocusHighlightProps extends MotionPrimitiveProps {
  active?: boolean;
  number: number;
}

export const GuideFocusHighlight = ({
  active = false,
  className,
  number,
  style
}: GuideFocusHighlightProps) => {
  if (!active) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={`guide-focus-highlight is-active ${className ?? ""}`.trim()}
      data-guide-focus={number}
      style={style}
    >
      <span className="guide-focus-badge">{number}</span>
    </div>
  );
};

/** 마우스 포인터 애니메이션 primitive */
export const MotionPointer = (_props: MotionPrimitiveProps) => null;

/** 클릭 리플(파문) 애니메이션 primitive */
export const MotionRipple = (_props: MotionPrimitiveProps) => null;
