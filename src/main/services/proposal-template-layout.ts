import type ExcelJS from "exceljs";

// --- 품의서 양식 신/구형 식별 ------------------------------------------------------
// 품의서 생성 로직(allowance-document-export-service.ts)은 2026-04 신형 양식 기준으로
// 재설계되어 있다(제목 A11 / 표 제목 B18 / 데이터 21행). 구형 양식은 동일 구조가 한 행
// 아래로 밀려 있다(제목 A12 / 표 제목 B19 / 데이터 22행). 콘텐츠 앵커로 세대를 식별해,
// 구형이면 생성 시 행 앵커를 +1 이동시켜 신형과 동일한 내용으로 채운다. 앵커를 아예
// 인식하지 못하면 unknown으로 두고 일반(필드 매핑 기반) 생성 경로로 보낸다.
export const UPDATED_PROPOSAL_TITLE_ROW = 11;
export const UPDATED_PROPOSAL_SECTION_ROW = 18; // "2. N월 지급 요청 내역" (지급 표 바로 위 제목)
export const LEGACY_PROPOSAL_TITLE_ROW = 12;
export const LEGACY_PROPOSAL_SECTION_ROW = 19;

export type ProposalTemplateGeneration = "updated" | "legacy" | "unknown";

const readProposalMarkerText = (cell: ExcelJS.Cell): string => {
  try {
    const text = cell.text;

    if (typeof text === "string") {
      return text.trim();
    }
  } catch {
    // fall through to raw value below
  }

  const value = cell.value;
  return typeof value === "string" ? value.trim() : "";
};

const findFirstRowMatching = (
  worksheet: ExcelJS.Worksheet,
  predicate: (text: string) => boolean,
  maxRow = 40
): number | null => {
  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    let matched = false;

    worksheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell) => {
      if (!matched && predicate(readProposalMarkerText(cell))) {
        matched = true;
      }
    });

    if (matched) {
      return rowNumber;
    }
  }

  return null;
};

export const detectProposalTemplateGeneration = (
  workbook: ExcelJS.Workbook
): ProposalTemplateGeneration => {
  const worksheet = workbook.getWorksheet("품의서") ?? workbook.worksheets[0];

  if (!worksheet) {
    return "unknown";
  }

  const titleRow = findFirstRowMatching(worksheet, (text) => /제\s*목/.test(text));
  const sectionRow = findFirstRowMatching(worksheet, (text) => text.includes("지급 요청 내역"));

  // Confident new layout: document title at row 11 AND the payout-section header at row 18.
  if (titleRow === UPDATED_PROPOSAL_TITLE_ROW && sectionRow === UPDATED_PROPOSAL_SECTION_ROW) {
    return "updated";
  }

  // Confident old layout: the same anchors shifted exactly one row down. Anything that
  // sits deeper than that is an unrecognized structure — the fixed +1 offset would place
  // content on the wrong rows, so it must fall back to the generic writer instead.
  if (titleRow === LEGACY_PROPOSAL_TITLE_ROW || sectionRow === LEGACY_PROPOSAL_SECTION_ROW) {
    return "legacy";
  }

  return "unknown";
};

export const resolveProposalTemplateRowOffset = (generation: ProposalTemplateGeneration) =>
  generation === "legacy" ? 1 : 0;
