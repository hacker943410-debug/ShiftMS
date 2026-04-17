// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LocalFileSelection, SitePatternImportAnalysis } from "@shared/bridge/contracts";

import { SitePatternImportModal } from "./SitePatternImportModal";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const renderComponent = async (element: ReactElement) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(element);
  });

  return { container };
};

const findButtonByText = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(text));

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();

    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
  }

  mountedContainers.splice(0).forEach((container) => {
    container.remove();
  });
});

const sampleFile: LocalFileSelection = {
  fileName: "sample.xlsx",
  filePath: "C:/temp/sample.xlsx"
};

const sampleAnalysis = {
  fileName: "sample.xlsx",
  filePath: "C:/temp/sample.xlsx",
  sheetName: "Sheet1",
  startDate: "2026-04-01",
  endDate: "2026-04-30",
  totalDays: 30,
  workerCount: 4,
  holidayCount: 1,
  detectedGroupCount: 2,
  uniqueCodes: ["D", "N", "X"],
  analysisReport: "analysis report",
  warningMessages: ["경고 1"],
  skippedWorkers: [{ name: "제외자", reason: "빈 코드" }],
  dates: [{ date: "2026-04-01", weekday: "화", holidayName: undefined }],
  previewRows: [{ name: "홍길동", codes: ["D"] }],
  groups: [{ cycleKey: "cycle-1" }],
  suggestion: { teamCount: 2, cycles: [{ patternStartDate: "2026-04-01" }] }
} as SitePatternImportAnalysis;

describe("SitePatternImportModal", () => {
  it("should render summary and forward tab and action events", async () => {
    const onAnalyze = vi.fn();
    const onApply = vi.fn();
    const onClose = vi.fn();
    const onCopyReport = vi.fn();
    const onOpenGuide = vi.fn();
    const onPreviewTabChange = vi.fn();
    const onSelectFile = vi.fn();

    const { container } = await renderComponent(
      <SitePatternImportModal
        analysis={sampleAnalysis}
        copyStatus={null}
        errorMessage={null}
        file={sampleFile}
        groupDetailRows={[
          {
            confidence: 0.92,
            cycleDisplay: "주주야야휴휴",
            cycleKey: "cycle-1",
            cycleLength: 6,
            groupId: 1,
            mismatchCount: 0,
            name: "A조",
            offset: 0,
            suggestedTeamCapacity: 2,
            suggestedTeamIndex: 0,
            suggestedTeamLabel: "A조"
          }
        ]}
        isAnalyzing={false}
        isOpen
        mismatchRows={[]}
        onAnalyze={onAnalyze}
        onApply={onApply}
        onClose={onClose}
        onCloseGuide={vi.fn()}
        onCopyReport={onCopyReport}
        onOpenGuide={onOpenGuide}
        onPreviewTabChange={onPreviewTabChange}
        onSelectFile={onSelectFile}
        previewTab="analysis"
        showGuide={false}
      />
    );

    expect(container.textContent).toContain("패턴 적용된 근무지 추가");
    expect(container.textContent).toContain("sample.xlsx");
    expect(container.textContent).toContain("analysis report");

    await act(async () => {
      findButtonByText(container, "가이드 보기")?.click();
      findButtonByText(container, "파일 가져오기")?.click();
      findButtonByText(container, "패턴 산출")?.click();
      findButtonByText(container, "그룹별 상세")?.click();
      findButtonByText(container, "텍스트 복사")?.click();
      findButtonByText(container, "근무지 등록")?.click();
      findButtonByText(container, "닫기")?.click();
    });

    expect(onOpenGuide).toHaveBeenCalledTimes(1);
    expect(onSelectFile).toHaveBeenCalledTimes(1);
    expect(onAnalyze).toHaveBeenCalledTimes(1);
    expect(onPreviewTabChange).toHaveBeenCalledWith("groups");
    expect(onCopyReport).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should render mismatch empty state when the mismatch tab has no rows", async () => {
    const { container } = await renderComponent(
      <SitePatternImportModal
        analysis={sampleAnalysis}
        copyStatus="복사 완료"
        errorMessage="오류 없음"
        file={sampleFile}
        groupDetailRows={[]}
        isAnalyzing={false}
        isOpen
        mismatchRows={[]}
        onAnalyze={vi.fn()}
        onApply={vi.fn()}
        onClose={vi.fn()}
        onCloseGuide={vi.fn()}
        onCopyReport={vi.fn()}
        onOpenGuide={vi.fn()}
        onPreviewTabChange={vi.fn()}
        onSelectFile={vi.fn()}
        previewTab="mismatches"
        showGuide={false}
      />
    );

    expect(container.textContent).toContain("불일치 내역");
    expect(container.textContent).toContain("현재 분석 결과에서는 패턴과 실제 근무코드가 다른 날짜가 없습니다.");
  });
});
