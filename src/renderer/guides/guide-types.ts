import type { ReactNode } from "react";

import type { RouteKey } from "../mock-design-data";

export type GuidePageKind = "intro" | "toc" | "feature";
export type GuideDetailTab = "flow" | "details";

export interface GuideStep {
  title: string;
  description: string;
  focusIndex?: number;
}

export interface GuideDetailItem {
  title: string;
  description: string;
  focusIndex?: number;
}

export interface GuideFigureRenderState {
  activeTab: GuideDetailTab;
  activeFocusIndex: number;
  activeStepNumber: number;
}

export interface GuidePageDefinition {
  id: string;
  kind: GuidePageKind;
  navLabel: string;
  title: string;
  description: string;
  goal?: string;
  steps: GuideStep[];
  notes?: string[];
  /**
   * 선행조건: 이 기능을 사용하기 전에 먼저 완료돼야 하는 조건.
   * 예: ["실적 승인이 먼저 완료된 상태여야 합니다."]
   */
  preconditions?: string[];
  /**
   * 기대 결과: 이 페이지의 흐름을 완료했을 때 예상되는 상태.
   * 예: "품의 승인 상태로 변경되고 자동 백업이 실행됩니다."
   */
  outcome?: string;
  detailItems?: GuideDetailItem[];
  figure?: ReactNode;
  renderFigure?: (state: GuideFigureRenderState) => ReactNode;
}

export interface RouteGuideDefinition {
  routeKey: RouteKey;
  title: string;
  description: string;
  pages: GuidePageDefinition[];
}
