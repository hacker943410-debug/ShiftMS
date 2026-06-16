import type { LocalFileSelection, SitePatternImportAnalysis } from "@shared/bridge/contracts";

import { GuideFlowModal } from "../../components/GuideFlowModal";
import { useDialogDismiss } from "../../components/useDialogDismiss";
import { sitePatternImportGuide } from "../../guides/route-guides";

type PatternImportPreviewTab = "analysis" | "groups" | "mismatches" | "data";

interface PatternImportGroupDetailRow {
  confidence: number;
  cycleDisplay: string;
  cycleKey: string;
  cycleLength: number;
  groupId: number;
  mismatchCount: number;
  name: string;
  offset: number;
  suggestedTeamCapacity?: number;
  suggestedTeamIndex?: number;
  suggestedTeamLabel?: string;
}

interface PatternImportMismatchRow {
  actualCode: string;
  confidence: number;
  cycleDisplay: string;
  cycleIndex: number;
  cycleKey: string;
  date: string;
  expectedCode: string;
  groupId: number;
  holidayName?: string;
  index: number;
  name: string;
  offset: number;
  weekday: string;
}

interface SitePatternImportModalProps {
  analysis: SitePatternImportAnalysis | null;
  copyStatus: string | null;
  errorMessage: string | null;
  file: LocalFileSelection | null;
  groupDetailRows: PatternImportGroupDetailRow[];
  isAnalyzing: boolean;
  isOpen: boolean;
  mismatchRows: PatternImportMismatchRow[];
  onAnalyze: () => void;
  onApply: () => void;
  onClose: () => void;
  onCloseGuide: () => void;
  onCopyReport: () => void;
  onOpenGuide: () => void;
  onPreviewTabChange: (tab: PatternImportPreviewTab) => void;
  onSelectFile: () => void;
  previewTab: PatternImportPreviewTab;
  showGuide: boolean;
}

export const SitePatternImportModal = ({
  analysis,
  copyStatus,
  errorMessage,
  file,
  groupDetailRows,
  isAnalyzing,
  isOpen,
  mismatchRows,
  onAnalyze,
  onApply,
  onClose,
  onCloseGuide,
  onCopyReport,
  onOpenGuide,
  onPreviewTabChange,
  onSelectFile,
  previewTab,
  showGuide
}: SitePatternImportModalProps) => {
  const { dialogRef, onKeyDown } = useDialogDismiss<HTMLDivElement>({
    isOpen,
    onDismiss: onClose
  });

  if (!isOpen) {
    return showGuide ? (
      <GuideFlowModal
        guide={sitePatternImportGuide}
        onClose={onCloseGuide}
      />
    ) : null;
  }

  return (
    <>
      <div className="modal-overlay">
        <div
          aria-labelledby="pattern-import-modal-title"
          aria-modal="true"
          className="modal-card pattern-import-modal"
          onKeyDown={onKeyDown}
          ref={dialogRef}
          role="dialog"
          tabIndex={-1}
        >
          <div className="section-heading compact-heading">
            <div className="modal-heading-copy">
              <h3 id="pattern-import-modal-title">패턴 적용된 근무지 추가</h3>
              <p>표준 근무표 Excel 파일에서 반복 Cycle과 조별 offset을 산출해 근무지 등록 1단계 draft에 자동 반영합니다.</p>
            </div>
            <div className="button-row">
              <button className="ghost-button compact-button" onClick={onOpenGuide} type="button">
                가이드 보기
              </button>
            </div>
          </div>

          <div className="excel-import-panel">
            <div className="excel-import-file-card">
              <div>
                <strong>근무표 파일 Import</strong>
                <p>{file ? file.fileName : "아직 선택된 파일이 없습니다."}</p>
              </div>
              <div className="button-row">
                <button className="ghost-button compact-button" onClick={onSelectFile} type="button">
                  파일 가져오기
                </button>
                <button
                  className="ghost-button compact-button"
                  disabled={!file || isAnalyzing}
                  onClick={onAnalyze}
                  type="button"
                >
                  {isAnalyzing ? "분석 중..." : "패턴 산출"}
                </button>
              </div>
            </div>
            <p className="site-field-note">
              첫 번째 시트 기준으로 읽고, A1=날짜, A2=요일, A3=공휴일, A4부터 근무 항목 형식을 기대합니다.
            </p>
          </div>

          {errorMessage ? <p className="form-error-text">{errorMessage}</p> : null}

          {analysis ? (
            <div className="excel-import-preview-stack">
              <div className="import-preview-summary-grid pattern-import-summary-grid">
                <article className="surface-card import-preview-summary-card emphasis">
                  <span>분석 기간</span>
                  <strong>
                    {analysis.startDate} ~ {analysis.endDate}
                  </strong>
                  <em>{analysis.totalDays}일</em>
                </article>
                <article className="surface-card import-preview-summary-card">
                  <span>분석 대상</span>
                  <strong>{analysis.workerCount}개</strong>
                  <em>
                    파일 {analysis.fileName} · 시트 {analysis.sheetName}
                  </em>
                </article>
                <article className="surface-card import-preview-summary-card">
                  <span>발견 Cycle</span>
                  <strong>{analysis.detectedGroupCount}개</strong>
                  <em>{analysis.groups.map((group) => group.cycleKey).join(", ")}</em>
                </article>
                <article className="surface-card import-preview-summary-card">
                  <span>감지 조 수</span>
                  <strong>{analysis.suggestion.teamCount}개</strong>
                  <em>1단계 draft 기준</em>
                </article>
                <article className="surface-card import-preview-summary-card">
                  <span>공휴일 / 제외</span>
                  <strong>
                    {analysis.holidayCount}일 / {analysis.skippedWorkers.length}개
                  </strong>
                  <em>경고 {analysis.warningMessages.length}건</em>
                </article>
                <article className="surface-card import-preview-summary-card">
                  <span>고유 근무코드</span>
                  <strong>
                    {analysis.uniqueCodes.length > 0 ? analysis.uniqueCodes.join(", ") : "(없음)"}
                  </strong>
                  <em>공백 제거 후 원본 코드 기준</em>
                </article>
              </div>

              {analysis.warningMessages.length > 0 || analysis.skippedWorkers.length > 0 ? (
                <div className="guide-note-box">
                  {analysis.warningMessages.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                  {analysis.skippedWorkers.map((item) => (
                    <p key={`${item.name}-${item.reason}`}>
                      {item.name}: {item.reason}
                    </p>
                  ))}
                </div>
              ) : null}

              <div className="excel-import-preview-section">
                <div className="section-heading compact-heading">
                  <div>
                    <h3>패턴 산출 결과 미리보기</h3>
                    <p>외부 명세서 예시 기준으로 결과 텍스트, 그룹 상세, 불일치, 원본 데이터를 확인할 수 있습니다.</p>
                  </div>
                  <div className="button-row pattern-import-tab-row">
                    {([
                      ["analysis", "분석 결과"],
                      ["groups", "그룹별 상세"],
                      ["mismatches", "불일치 내역"],
                      ["data", "원본 데이터"]
                    ] as Array<[PatternImportPreviewTab, string]>).map(([tab, label]) => (
                      <button
                        className={`ghost-button compact-button pattern-import-tab-button${
                          previewTab === tab ? " is-active" : ""
                        }`}
                        key={tab}
                        onClick={() => {
                          onPreviewTabChange(tab);
                        }}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pattern-import-result-panel">
                  {previewTab === "analysis" ? (
                    <div className="pattern-import-result-stack">
                      <div className="section-heading compact-heading">
                        <div>
                          <h3>분석 결과 텍스트</h3>
                          <p>문서 예시와 같은 고정폭 텍스트 형식으로 그룹, offset, 신뢰도, 불일치를 요약합니다.</p>
                        </div>
                        <div className="button-row">
                          <button className="ghost-button compact-button" onClick={onCopyReport} type="button">
                            텍스트 복사
                          </button>
                        </div>
                      </div>
                      {copyStatus ? <p className="site-field-note pattern-import-copy-status">{copyStatus}</p> : null}
                      <pre className="pattern-import-report-pre">{analysis.analysisReport}</pre>
                    </div>
                  ) : null}

                  {previewTab === "groups" ? (
                    <div className="pattern-import-result-stack">
                      <div className="section-heading compact-heading">
                        <div>
                          <h3>그룹별 상세</h3>
                          <p>Cycle, 길이, offset, 신뢰도와 draft에 반영될 조 제안을 함께 확인합니다.</p>
                        </div>
                      </div>
                      <div className="data-scroll">
                        <table className="info-table wide">
                          <thead>
                            <tr>
                              <th>그룹</th>
                              <th>이름</th>
                              <th>사이클 패턴</th>
                              <th>길이</th>
                              <th>Offset</th>
                              <th>신뢰도</th>
                              <th>불일치</th>
                              <th>제안 조</th>
                              <th>조 Index</th>
                              <th>정원</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupDetailRows.map((row) => (
                              <tr key={`${row.cycleKey}-${row.name}`}>
                                <td>그룹 {row.groupId}</td>
                                <td>{row.name}</td>
                                <td>{row.cycleDisplay}</td>
                                <td>{row.cycleLength}일</td>
                                <td>{row.offset}</td>
                                <td>{(row.confidence * 100).toFixed(1)}%</td>
                                <td>{row.mismatchCount}건</td>
                                <td>{row.suggestedTeamLabel ?? "-"}</td>
                                <td>{typeof row.suggestedTeamIndex === "number" ? row.suggestedTeamIndex : "-"}</td>
                                <td>
                                  {typeof row.suggestedTeamCapacity === "number"
                                    ? `${row.suggestedTeamCapacity}명`
                                    : "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {previewTab === "mismatches" ? (
                    <div className="pattern-import-result-stack">
                      <div className="section-heading compact-heading">
                        <div>
                          <h3>불일치 내역</h3>
                          <p>패턴 예상값과 실제 근무코드가 다른 날짜를 기준일 index와 cycle index까지 함께 보여줍니다.</p>
                        </div>
                      </div>
                      {mismatchRows.length > 0 ? (
                        <div className="data-scroll">
                          <table className="info-table wide">
                            <thead>
                              <tr>
                                <th>그룹</th>
                                <th>이름</th>
                                <th>날짜</th>
                                <th>요일</th>
                                <th>공휴일</th>
                                <th>실제</th>
                                <th>예상</th>
                                <th>기준일 Index</th>
                                <th>Cycle Index</th>
                                <th>Offset</th>
                              </tr>
                            </thead>
                            <tbody>
                              {mismatchRows.map((row) => (
                                <tr
                                  key={`${row.cycleKey}-${row.name}-${row.index}-${row.actualCode}-${row.expectedCode}`}
                                >
                                  <td>그룹 {row.groupId}</td>
                                  <td>{row.name}</td>
                                  <td>{row.date}</td>
                                  <td>{row.weekday || "-"}</td>
                                  <td>{row.holidayName ?? "-"}</td>
                                  <td>{row.actualCode || "-"}</td>
                                  <td>{row.expectedCode || "-"}</td>
                                  <td>{row.index}</td>
                                  <td>{row.cycleIndex}</td>
                                  <td>{row.offset}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="guide-note-box">
                          <p>현재 분석 결과에서는 패턴과 실제 근무코드가 다른 날짜가 없습니다.</p>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {previewTab === "data" ? (
                    <div className="pattern-import-result-stack">
                      <div className="section-heading compact-heading">
                        <div>
                          <h3>원본 데이터 미리보기</h3>
                          <p>첫 번째 시트 전체 날짜/요일/공휴일/근무자 코드 테이블을 그대로 보여줍니다.</p>
                        </div>
                      </div>
                      <div className="data-scroll pattern-import-data-scroll">
                        <table className="info-table wide pattern-import-data-table">
                          <thead>
                            <tr>
                              <th className="pattern-import-sticky-cell">항목</th>
                              {analysis.dates.map((date) => (
                                <th key={date.date}>{date.date.slice(5)}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <th className="pattern-import-sticky-cell">요일</th>
                              {analysis.dates.map((date) => (
                                <td key={`weekday-${date.date}`}>{date.weekday || "-"}</td>
                              ))}
                            </tr>
                            <tr>
                              <th className="pattern-import-sticky-cell">공휴일</th>
                              {analysis.dates.map((date) => (
                                <td key={`holiday-${date.date}`}>{date.holidayName ?? "-"}</td>
                              ))}
                            </tr>
                            {analysis.previewRows.map((worker) => (
                              <tr key={worker.name}>
                                <th className="pattern-import-sticky-cell">{worker.name}</th>
                                {worker.codes.map((code, index) => (
                                  <td key={`${worker.name}-${analysis.dates[index]?.date ?? index}`}>{code || "-"}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="button-row">
            <button
              className="primary-button"
              disabled={!analysis || isAnalyzing}
              onClick={onApply}
              type="button"
            >
              근무지 등록(1단계 이동)
            </button>
            <button className="ghost-button" onClick={onClose} type="button">
              닫기
            </button>
          </div>
        </div>
      </div>

      {showGuide ? (
        <GuideFlowModal
          guide={sitePatternImportGuide}
          onClose={onCloseGuide}
        />
      ) : null}
    </>
  );
};
