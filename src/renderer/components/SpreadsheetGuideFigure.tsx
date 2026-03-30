type SpreadsheetGuideFigureVariant = "wage-bulk" | "pattern-import";

interface SpreadsheetGuideFigureProps {
  variant: SpreadsheetGuideFigureVariant;
}

const wageRows = [
  ["근무지명", "보라매DC", "김현우", "13,600"],
  ["근무지명", "동탄센터", "이수민", "14,200"],
  ["근무지명", "인천허브", "박정호", "15,000"]
];

const patternRows = [
  ["날짜", "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"],
  ["요일", "목", "금", "토", "일"],
  ["공휴일", "신정", "", "", ""],
  ["김현중", "D", "D", "O", "O"],
  ["이은동", "O", "O", "N", "N"]
];

export const SpreadsheetGuideFigure = ({ variant }: SpreadsheetGuideFigureProps) => {
  const isWageBulk = variant === "wage-bulk";
  const rows = isWageBulk ? wageRows : patternRows;
  const callouts = isWageBulk
    ? [
        { label: "근무지명", detail: "B열 지정", tone: "sand" },
        { label: "이름", detail: "C열 지정", tone: "mint" },
        { label: "시급", detail: "D열 지정", tone: "sky" }
      ]
    : [
        { label: "1행", detail: "날짜", tone: "sand" },
        { label: "2행", detail: "요일", tone: "mint" },
        { label: "3행", detail: "공휴일", tone: "sky" },
        { label: "4행부터", detail: "근무자", tone: "rose" }
      ];

  return (
    <div className="spreadsheet-guide-figure">
      <div className="spreadsheet-guide-sheet">
        <div className="spreadsheet-guide-sheet-head">
          <span>Excel 미리보기</span>
          <strong>{isWageBulk ? "시급 업데이트 파일" : "표준 근무표 템플릿"}</strong>
        </div>
        <div className="spreadsheet-guide-grid">
          {rows.map((row, rowIndex) => (
            <div
              className="spreadsheet-guide-row"
              key={`${variant}-row-${rowIndex + 1}`}
              style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
            >
              {row.map((cell, cellIndex) => (
                <span
                  className={[
                    "spreadsheet-guide-cell",
                    rowIndex === 0 ? "is-header" : "",
                    !isWageBulk && rowIndex < 3 ? "is-fixed" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={`${variant}-cell-${rowIndex + 1}-${cellIndex + 1}`}
                >
                  {cell || " "}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="spreadsheet-guide-callouts">
        {callouts.map((callout) => (
          <div
            className={`spreadsheet-guide-callout tone-${callout.tone}`}
            key={`${variant}-${callout.label}`}
          >
            <strong>{callout.label}</strong>
            <span>{callout.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
