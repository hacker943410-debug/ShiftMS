import { describe, expect, it, vi } from "vitest";

import {
  createIpcFailure,
  createIpcFailureFromError,
  createIpcSuccess,
  runIpcAction,
  runIpcActionWithCleanup,
  runIpcOpenPathAction,
  runIpcSaveDialogAction,
  runIpcSaveDialogResultAction,
  runIpcResultAction
} from "./ipc-handler-helpers";

describe("ipc-handler-helpers", () => {
  it("creates a success bridge result", () => {
    expect(createIpcSuccess({ value: 1 })).toEqual({
      ok: true,
      data: { value: 1 }
    });
  });

  it("creates a failure bridge result from a message", () => {
    expect(createIpcFailure("TEST_FAILED", "테스트 실패")).toEqual({
      ok: false,
      errorCode: "TEST_FAILED",
      message: "테스트 실패"
    });
  });

  it("maps thrown errors with the provided formatter", () => {
    expect(
      createIpcFailureFromError("TEST_FAILED", new Error("boom"), (error) =>
        error instanceof Error ? error.message : String(error)
      )
    ).toEqual({
      ok: false,
      errorCode: "TEST_FAILED",
      message: "boom"
    });
  });

  it("records successful activity when configured", async () => {
    const recordSuccessfulActivity = vi.fn((result, input) => ({
      ...result,
      audit: `${input.actionType}:${input.routeKey}`
    }));

    const result = await runIpcAction({
      action: async () => "done",
      errorCode: "UNUSED",
      getErrorMessage: () => "unused",
      activity: {
        recordSuccessfulActivity,
        input: {
          actionType: "holiday-save",
          routeKey: "operations",
          routeLabel: "운영 관리",
          details: "공휴일 저장"
        }
      }
    });

    expect(recordSuccessfulActivity).toHaveBeenCalledWith(
      {
        ok: true,
        data: "done"
      },
      {
        actionType: "holiday-save",
        routeKey: "operations",
        routeLabel: "운영 관리",
        details: "공휴일 저장"
      }
    );
    expect(result).toEqual({
      ok: true,
      data: "done",
      audit: "holiday-save:operations"
    });
  });

  it("returns a failure bridge result when the action throws", async () => {
    const result = await runIpcAction({
      action: () => {
        throw new Error("failed");
      },
      errorCode: "ACTION_FAILED",
      getErrorMessage: (error) => (error instanceof Error ? error.message : String(error))
    });

    expect(result).toEqual({
      ok: false,
      errorCode: "ACTION_FAILED",
      message: "failed"
    });
  });

  it("passes through an existing bridge result and records activity", async () => {
    const recordSuccessfulActivity = vi.fn((result) => result);

    const result = await runIpcResultAction({
      action: async () => ({
        ok: true as const,
        data: "done"
      }),
      activity: {
        recordSuccessfulActivity,
        input: {
          actionType: "allowance-export",
          routeKey: "allowance",
          routeLabel: "수당 관리",
          details: "출력"
        }
      }
    });

    expect(recordSuccessfulActivity).toHaveBeenCalledWith(
      {
        ok: true,
        data: "done"
      },
      {
        actionType: "allowance-export",
        routeKey: "allowance",
        routeLabel: "수당 관리",
        details: "출력"
      }
    );
    expect(result).toEqual({
      ok: true,
      data: "done"
    });
  });

  it("always runs cleanup after a successful action", async () => {
    const order: string[] = [];

    const result = await runIpcActionWithCleanup({
      action: async () => {
        order.push("action");
        return "done";
      },
      cleanup: async () => {
        order.push("cleanup");
      },
      errorCode: "UNUSED",
      getErrorMessage: () => "unused"
    });

    expect(order).toEqual(["action", "cleanup"]);
    expect(result).toEqual({
      ok: true,
      data: "done"
    });
  });

  it("returns the action failure after running cleanup", async () => {
    const cleanup = vi.fn(async () => {});

    const result = await runIpcActionWithCleanup({
      action: () => {
        throw new Error("failed");
      },
      cleanup,
      errorCode: "ACTION_FAILED",
      getErrorMessage: (error) => (error instanceof Error ? error.message : String(error))
    });

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      errorCode: "ACTION_FAILED",
      message: "failed"
    });
  });

  it("returns the cleanup failure when the action succeeds", async () => {
    const result = await runIpcActionWithCleanup({
      action: async () => "done",
      cleanup: () => {
        throw new Error("cleanup failed");
      },
      errorCode: "ACTION_FAILED",
      getErrorMessage: (error) => (error instanceof Error ? error.message : String(error))
    });

    expect(result).toEqual({
      ok: false,
      errorCode: "ACTION_FAILED",
      message: "cleanup failed"
    });
  });

  it("returns the cancel result when a save dialog is canceled", async () => {
    const result = await runIpcSaveDialogAction({
      choosePath: async () => null,
      onCancel: async () => createIpcSuccess(null),
      action: async () => "done",
      errorCode: "UNUSED",
      getErrorMessage: () => "unused"
    });

    expect(result).toEqual({
      ok: true,
      data: null
    });
  });

  it("runs the save dialog action with the selected path", async () => {
    const result = await runIpcSaveDialogAction({
      choosePath: async () => "C:/temp/output.xlsx",
      onCancel: async () => createIpcFailure("UNUSED", "unused"),
      action: async (filePath) => `saved:${filePath}`,
      errorCode: "SAVE_FAILED",
      getErrorMessage: (error) => (error instanceof Error ? error.message : String(error))
    });

    expect(result).toEqual({
      ok: true,
      data: "saved:C:/temp/output.xlsx"
    });
  });

  it("maps thrown save dialog result-action errors with the provided formatter", async () => {
    const result = await runIpcSaveDialogResultAction({
      choosePath: async () => "C:/temp/output.xlsx",
      onCancel: async () => createIpcFailure("UNUSED", "unused"),
      action: async () => {
        throw new Error("export failed");
      },
      errorCode: "EXPORT_FAILED",
      getErrorMessage: (error) => (error instanceof Error ? error.message : String(error))
    });

    expect(result).toEqual({
      ok: false,
      errorCode: "EXPORT_FAILED",
      message: "export failed"
    });
  });

  it("returns a missing-file failure when the open path target does not exist", async () => {
    const result = await runIpcOpenPathAction({
      filePath: "C:/temp/missing.xlsx",
      exists: () => false,
      openPath: async () => "",
      missingErrorCode: "FILE_MISSING",
      missingMessage: "파일이 없습니다.",
      openErrorCode: "FILE_OPEN_FAILED",
      getErrorMessage: (error) => (error instanceof Error ? error.message : String(error))
    });

    expect(result).toEqual({
      ok: false,
      errorCode: "FILE_MISSING",
      message: "파일이 없습니다."
    });
  });

  it("records activity when the local path opens successfully", async () => {
    const recordSuccessfulActivity = vi.fn((result) => result);

    const result = await runIpcOpenPathAction({
      filePath: "C:/temp/source.xlsx",
      exists: () => true,
      openPath: async () => "",
      missingErrorCode: "FILE_MISSING",
      missingMessage: "파일이 없습니다.",
      openErrorCode: "FILE_OPEN_FAILED",
      getErrorMessage: (error) => (error instanceof Error ? error.message : String(error)),
      activity: {
        recordSuccessfulActivity,
        input: {
          actionType: "performance-open-file",
          routeKey: "performance",
          routeLabel: "실적 관리",
          details: "원본 파일 열기"
        }
      }
    });

    expect(recordSuccessfulActivity).toHaveBeenCalledWith(
      {
        ok: true,
        data: null
      },
      {
        actionType: "performance-open-file",
        routeKey: "performance",
        routeLabel: "실적 관리",
        details: "원본 파일 열기"
      }
    );
    expect(result).toEqual({
      ok: true,
      data: null
    });
  });

  it("returns the shell open error when the OS open call fails", async () => {
    const result = await runIpcOpenPathAction({
      filePath: "C:/temp/source.xlsx",
      exists: () => true,
      openPath: async () => "Access denied",
      missingErrorCode: "FILE_MISSING",
      missingMessage: "파일이 없습니다.",
      openErrorCode: "FILE_OPEN_FAILED",
      getErrorMessage: (error) => (error instanceof Error ? error.message : String(error))
    });

    expect(result).toEqual({
      ok: false,
      errorCode: "FILE_OPEN_FAILED",
      message: "Access denied"
    });
  });
});
