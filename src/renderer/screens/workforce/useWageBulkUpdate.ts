import { useRef, useState } from "react";

import type {
  LocalFileSelection,
  OperationsBridge,
  WorkforceBridge,
  WorkforceWageBulkUpdateApplySummary,
  WorkforceWageBulkUpdatePreview
} from "@shared/bridge/contracts";
import { createTodayDateInputValue } from "@shared/lib/local-date";

import { showActionResultDialog } from "../../components/action-result-dialog";
import type { QuestionDialogOptions, QuestionDialogResult } from "../../components/QuestionDialog";
import {
  buildWageBulkPreviewBasis,
  canPreviewWageBulk,
  createWageBulkMappingModel,
  describeWageBulkMapping,
  reduceWageBulkMapping,
  resolveWageBulkApplyAnswer,
  selectCurrentWageBulkResult,
  selectWageBulkView,
  type StoredWageBulkResult,
  type WageBulkColumnMapping,
  type WageBulkMappingEvent
} from "./wage-bulk-preview-basis";

// Everything the bulk update touches outside the renderer. Narrowed to these four so a test can
// stand in a fake whose header reading finishes when the test says so.
export type WageBulkUpdateBridge = Pick<
  WorkforceBridge,
  | "suggestWorkforceWageBulkColumns"
  | "previewWorkforceWageBulkUpdate"
  | "applyWorkforceWageBulkUpdate"
> &
  Pick<OperationsBridge, "selectSpreadsheetFile">;

type AskQuestion = (options: QuestionDialogOptions) => Promise<QuestionDialogResult>;

export interface UseWageBulkUpdateOptions {
  bridge: WageBulkUpdateBridge;
  askQuestion: AskQuestion;
  // Called once a save has landed, so the list behind the modal reloads.
  onApplied: () => void;
}

// A performance row keeps the wage stamped onto it when the workbook was first read, so editing
// the wage history never moves an amount that is already on screen. The old wording claimed the
// opposite ("will be recalculated"), which let operators approve at the stale wage.
// The refresh it points at re-parses the file, and because hourlyRate takes part in the approval
// equality check, rows already approved inside a partly-approved file flip back to "needs review".
// Say both halves here — the instruction is useless without the consequence.
export const WAGE_CHANGE_REFRESH_NOTICE =
  "이미 승인해 지급한 실적과 수당은 그대로 유지됩니다. 아직 승인하지 않은 실적은 자동으로 바뀌지 않습니다 — 실적 관리 화면에서 새로고침(↻)으로 그 파일을 다시 읽어야 새 시급이 반영됩니다. 다만 그 파일에서 일부만 승인해 둔 상태라면, 이미 승인한 줄도 함께 재검토 대상으로 되돌아갑니다. 먼저 확인하십시오.";

export const initialWageBulkMappingState: WageBulkColumnMapping = {
  // Left empty on purpose: guessing a column for the employee code would quietly read whatever
  // happens to sit there. The operator fills it in, and until then matching works as before.
  employeeCodeColumn: "",
  siteNameColumn: "B",
  employeeNameColumn: "C",
  hourlyRateColumn: "D"
};

const normalizeWageBulkColumnInput = (value: string) =>
  value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);

const formatDate = (value?: string) => (value ? value.replace(/-/g, ".") : "-");

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

// The whole life of the bulk update modal - file, column mapping, effective date, preview, apply -
// in one place, with nothing left in the screen but buttons bound to these handlers. Four review
// rounds found the same defect in four different handlers: a function that was right and a screen
// that forgot to call it. Moving the handlers here is what lets a test drive them the way the
// screen does, with a header reading that finishes when the test says so.
export const useWageBulkUpdate = ({ bridge, askQuestion, onApplied }: UseWageBulkUpdateOptions) => {
  const [file, setFile] = useState<LocalFileSelection | null>(null);
  // One model owns the mapping, the generation that decides which header answer still counts, and
  // the facts the notices are built from. Keeping the ref as the source of truth means a request
  // can capture the generation it was made under without waiting for a render.
  const mappingRef = useRef(createWageBulkMappingModel(initialWageBulkMappingState));
  const [mappingModel, setMappingModel] = useState(mappingRef.current);
  const dispatchMapping = (event: WageBulkMappingEvent) => {
    const next = reduceWageBulkMapping(mappingRef.current, event, initialWageBulkMappingState);

    mappingRef.current = next;
    setMappingModel(next);
  };
  const [effectiveFrom, setEffectiveFromState] = useState(createTodayDateInputValue());
  const [storedPreview, setStoredPreview] =
    useState<StoredWageBulkResult<WorkforceWageBulkUpdatePreview> | null>(null);
  const [storedSummary, setStoredSummary] =
    useState<StoredWageBulkResult<WorkforceWageBulkUpdateApplySummary> | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  // Identifies the preview request whose answer is still wanted. See discardPreview.
  const previewTokenRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const mapping = mappingModel.mapping;
  const basis = buildWageBulkPreviewBasis({
    filePath: file?.filePath,
    effectiveFrom,
    ...mapping
  });
  // A preview built from other inputs is not shown and cannot be applied, so no path has to
  // remember to clear it. Applying is asynchronous too, so its answer is checked against the same
  // basis: a save that finished for another file or date is neither shown nor named under the
  // inputs now on screen.
  const currentPreview = selectCurrentWageBulkResult(storedPreview, basis);
  const view = selectWageBulkView({
    storedPreview,
    storedSummary,
    currentBasis: basis,
    selectedFileName: file?.fileName,
    selectedEffectiveFrom: effectiveFrom
  });
  const rows = view.rows;
  const readyRows = rows.filter((row) => row.status === "ready" || row.status === "applied");
  const skippedRows = rows.filter((row) => row.status !== "ready" && row.status !== "applied");

  // A preview belongs to the effective date and column letters it was built from. Changing either
  // makes the table on screen disagree with what Apply would store, so drop it and force a rebuild.
  // Bumping the token also disowns a preview request that is still in flight — otherwise the late
  // response lands after the reset and puts the stale table back.
  const discardPreview = () => {
    previewTokenRef.current += 1;
    setStoredPreview(null);
    setStoredSummary(null);
    setSuccess(null);
  };

  const open = () => {
    setError(null);
    discardPreview();
    setFile(null);
    dispatchMapping({ type: "modal-opened" });
    setEffectiveFromState(createTodayDateInputValue());
  };

  const setColumn = (field: keyof WageBulkColumnMapping, value: string) => {
    // A column typed by hand outranks any header reading still in flight.
    dispatchMapping({
      type: "column-edited",
      field,
      value: normalizeWageBulkColumnInput(value)
    });
    discardPreview();
  };

  const setEffectiveFrom = (value: string) => {
    setEffectiveFromState(value);
    discardPreview();
  };

  const selectFile = async () => {
    setError(null);

    let selection: LocalFileSelection | null;

    try {
      const result = await bridge.selectSpreadsheetFile({
        title: "시급 업데이트 Excel 파일 선택",
        buttonLabel: "가져오기"
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      selection = result.data;
    } catch (caught) {
      setError(getErrorMessage(caught));
      return;
    }

    // A new file is a new mapping: its columns are decided by its own header row and the
    // explicit defaults, never by what the last workbook left in the boxes.
    dispatchMapping({ type: "file-chosen" });
    setFile(selection);
    discardPreview();

    // The dialog was dismissed; there is no file to read a header row from.
    if (!selection) {
      return;
    }

    // The employee code is what stops people being missed, so it is read off the header row
    // rather than typed in every time. Only headers that actually say so are applied - a column
    // guessed by position would quietly read the wrong values. Until the answer is in, the boxes
    // hold defaults nobody has checked against this file, so the preview stays locked; the
    // reducer drops the answer if anything has decided the mapping since.
    dispatchMapping({ type: "header-read-started" });

    const requestGeneration = mappingRef.current.generation;

    try {
      const suggestion = await bridge.suggestWorkforceWageBulkColumns({
        filePath: selection.filePath
      });

      dispatchMapping(
        suggestion.ok
          ? { type: "header-read-succeeded", suggestion: suggestion.data, requestGeneration }
          : { type: "header-read-failed", message: suggestion.message, requestGeneration }
      );
    } catch (caught) {
      dispatchMapping({
        type: "header-read-failed",
        message: getErrorMessage(caught),
        requestGeneration
      });
    }
  };

  const preview = async () => {
    if (!file) {
      setError("시급 업데이트 Excel 파일을 먼저 가져와야 합니다.");
      return;
    }

    // The button is disabled in these states; a keyboard or a stale closure must not get past it.
    if (!canPreviewWageBulk(mappingRef.current)) {
      return;
    }

    setError(null);
    setSuccess(null);
    setIsPreviewing(true);
    // The mapping is now the one being judged. A header answer landing after this would leave the
    // boxes describing columns this preview never used.
    dispatchMapping({ type: "mapping-consumed" });

    const requestToken = previewTokenRef.current;
    const requestBasis = basis;
    const isStale = () => previewTokenRef.current !== requestToken;

    try {
      const result = await bridge.previewWorkforceWageBulkUpdate({
        filePath: file.filePath,
        effectiveFrom,
        mapping
      });

      // The operator changed the effective date or a column while this was running; this answer
      // describes a basis that is no longer on screen, so drop it rather than restore a stale table.
      if (isStale()) {
        return;
      }

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setStoredPreview({ basis: requestBasis, data: result.data });
      setStoredSummary(null);
    } catch (caught) {
      if (isStale()) {
        return;
      }

      setError(getErrorMessage(caught));
    } finally {
      // Always clear the spinner: the button stays disabled while a preview runs, so no newer
      // request can be waiting on this flag, and skipping it would strand the modal.
      setIsPreviewing(false);
    }
  };

  const apply = async () => {
    if (!file) {
      setError("시급 업데이트 Excel 파일을 먼저 가져와야 합니다.");
      return;
    }

    const reviewedPreview = currentPreview;

    if (!reviewedPreview) {
      setError("지금 화면의 입력으로 만든 미리보기가 없습니다. 미리보기를 먼저 만들어 주세요.");
      return;
    }

    // Saving one wage warns before backdating; the bulk path had no such gate, so dozens of people
    // could be written at once without a confirmation.
    if (effectiveFrom < createTodayDateInputValue()) {
      const confirmed = await askQuestion({
        title: "지난 날짜로 시급 일괄 적용",
        message: `${formatDate(effectiveFrom)}부터 ${
          reviewedPreview.readyCount
        }명의 시급을 적용합니다. 그 날짜 이후 기간의 시급이 바뀝니다. 계속할까요?`,
        description: WAGE_CHANGE_REFRESH_NOTICE,
        confirmLabel: "적용",
        cancelLabel: "취소"
      });

      if (!confirmed.confirmed) {
        return;
      }
    }

    setError(null);
    setSuccess(null);
    setIsApplying(true);
    // Same reason as the preview, for the save that is now under way.
    dispatchMapping({ type: "mapping-consumed" });

    const requestBasis = basis;

    try {
      const result = await bridge.applyWorkforceWageBulkUpdate({
        filePath: file.filePath,
        effectiveFrom,
        mapping,
        // Apply exactly the preview that is on screen. Main re-reads the file and refuses anything
        // that no longer matches, so an Excel edit made after previewing cannot slip in unseen.
        expectedPreviewId: reviewedPreview.previewId
      });

      const outcome = resolveWageBulkApplyAnswer(result, requestBasis);

      if (outcome.discardPreview) {
        discardPreview();
      }

      if (!outcome.storedSummary) {
        setError(outcome.errorMessage);
        return;
      }

      const applied = outcome.storedSummary.data;

      setStoredSummary(outcome.storedSummary);
      setStoredPreview(null);
      setSuccess(
        `${formatDate(applied.effectiveFrom)}부터 ${applied.appliedCount}명의 시급 변경 이력을 반영했습니다.`
      );
      onApplied();
      // 적용일이 의도와 다르면 바로 알아채도록 완료 안내에도 날짜를 적는다.
      await showActionResultDialog(askQuestion, {
        title: "시급 일괄 적용 완료",
        message: `${formatDate(applied.effectiveFrom)}부터 ${
          applied.appliedCount
        }명의 시급 변경 이력을 반영했습니다.`,
        description: WAGE_CHANGE_REFRESH_NOTICE
      });
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsApplying(false);
    }
  };

  return {
    file,
    mapping,
    mappingModel,
    notices: describeWageBulkMapping(mappingModel),
    isReadingHeader: mappingModel.headerRead === "reading",
    effectiveFrom,
    view,
    rows,
    readyRows,
    skippedRows,
    canPreview: canPreviewWageBulk(mappingModel),
    canApply: view.canApply,
    isPreviewing,
    isApplying,
    error,
    success,
    open,
    selectFile,
    setColumn,
    setEffectiveFrom,
    preview,
    apply
  };
};
