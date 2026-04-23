import type { ReactNode } from "react";

import type { QuestionDialogOptions, QuestionDialogResult } from "./QuestionDialog";

type AskQuestion = (options: QuestionDialogOptions) => Promise<QuestionDialogResult>;

interface ActionResultDialogInput {
  description?: ReactNode;
  message: ReactNode;
  title?: string;
}

export const showActionResultDialog = async (
  askQuestion: AskQuestion,
  input: ActionResultDialogInput
) => {
  await askQuestion({
    title: input.title ?? "처리 완료",
    message: input.message,
    description: input.description,
    confirmLabel: "확인",
    hideCancel: true
  });
};
