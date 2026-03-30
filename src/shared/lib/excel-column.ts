const EXCEL_COLUMN_LABEL_REGEX = /^[A-Z]+$/;

export const normalizeExcelColumnLabel = (value: string) => value.trim().toUpperCase();

export const isValidExcelColumnLabel = (value: string) =>
  EXCEL_COLUMN_LABEL_REGEX.test(normalizeExcelColumnLabel(value));

export const excelColumnLabelToIndex = (value: string) => {
  const normalizedLabel = normalizeExcelColumnLabel(value);

  if (!isValidExcelColumnLabel(normalizedLabel)) {
    throw new Error("열 표기는 A, B, C처럼 입력해야 합니다.");
  }

  return normalizedLabel.split("").reduce((index, character) => {
    const alphabetIndex = character.charCodeAt(0) - 64;

    return index * 26 + alphabetIndex;
  }, 0);
};

export const excelColumnIndexToLabel = (value: number) => {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("열 번호는 1 이상의 정수여야 합니다.");
  }

  let remainder = value;
  let label = "";

  while (remainder > 0) {
    const current = (remainder - 1) % 26;
    label = String.fromCharCode(65 + current) + label;
    remainder = Math.floor((remainder - 1) / 26);
  }

  return label;
};
