import type { BridgeFailure, BridgeResult, BridgeSuccess } from "../../shared/bridge/contracts";
import type { AccessLogActionType } from "../../shared/domain/access-log";
import type { AuthSession } from "../../shared/domain/model";

export type IpcActivityInput = {
  actionType: AccessLogActionType;
  routeKey?: string;
  routeLabel?: string;
  details?: string;
  session?: AuthSession | null;
};

export type RecordSuccessfulIpcActivity = <T extends { ok: boolean }>(
  result: T,
  input: IpcActivityInput
) => T;

type IpcActionActivityOptions = {
  input: IpcActivityInput;
  recordSuccessfulActivity: RecordSuccessfulIpcActivity;
};

// A handler usually has one error code, but some failures are worth telling apart on the other
// side - a stale bulk preview needs the screen to force a rebuild, an ordinary save failure does
// not. Passing a function lets a handler pick the code from the error instead of the renderer
// matching on message text.
type IpcErrorCode = string | ((error: unknown) => string);

type RunIpcActionOptions<T> = {
  action: () => T | Promise<T>;
  errorCode: IpcErrorCode;
  getErrorMessage: (error: unknown) => string;
  activity?: IpcActionActivityOptions;
};

type RunIpcResultActionOptions<T> = {
  action: () => BridgeResult<T> | Promise<BridgeResult<T>>;
  activity?: IpcActionActivityOptions;
};

type RunIpcActionWithCleanupOptions<T> = {
  action: () => T | Promise<T>;
  cleanup: () => unknown | Promise<unknown>;
  errorCode: string;
  getErrorMessage: (error: unknown) => string;
  activity?: IpcActionActivityOptions;
};

type RunIpcSaveDialogActionOptions<T> = {
  action: (filePath: string) => T | Promise<T>;
  choosePath: () => string | null | Promise<string | null>;
  onCancel: () => BridgeResult<T> | Promise<BridgeResult<T>>;
  errorCode: string;
  getErrorMessage: (error: unknown) => string;
  activity?: IpcActionActivityOptions;
};

type RunIpcSaveDialogResultActionOptions<T> = {
  action: (filePath: string) => BridgeResult<T> | Promise<BridgeResult<T>>;
  choosePath: () => string | null | Promise<string | null>;
  onCancel: () => BridgeResult<T> | Promise<BridgeResult<T>>;
  errorCode: string;
  getErrorMessage: (error: unknown) => string;
  activity?: IpcActionActivityOptions;
};

type RunIpcOpenPathActionOptions = {
  filePath: string;
  exists: (filePath: string) => boolean;
  openPath: (filePath: string) => Promise<string>;
  missingErrorCode: string;
  missingMessage: string;
  openErrorCode: string;
  getErrorMessage: (error: unknown) => string;
  activity?: IpcActionActivityOptions;
};

export const createIpcSuccess = <T>(data: T): BridgeSuccess<T> => ({
  ok: true,
  data
});

const resolveIpcErrorCode = (errorCode: IpcErrorCode, error: unknown): string =>
  typeof errorCode === "function" ? errorCode(error) : errorCode;

export const createIpcFailure = (errorCode: string, message: string): BridgeFailure => ({
  ok: false,
  errorCode,
  message
});

export const createIpcFailureFromError = (
  errorCode: string,
  error: unknown,
  getErrorMessage: (error: unknown) => string
): BridgeFailure => createIpcFailure(errorCode, getErrorMessage(error));

export const runIpcAction = async <T>({
  action,
  errorCode,
  getErrorMessage,
  activity
}: RunIpcActionOptions<T>): Promise<BridgeResult<T>> => {
  try {
    const result = createIpcSuccess(await action());

    if (!activity) {
      return result;
    }

    return activity.recordSuccessfulActivity(result, activity.input);
  } catch (error) {
    return createIpcFailureFromError(resolveIpcErrorCode(errorCode, error), error, getErrorMessage);
  }
};

export const runIpcResultAction = async <T>({
  action,
  activity
}: RunIpcResultActionOptions<T>): Promise<BridgeResult<T>> => {
  const result = await action();

  if (!activity) {
    return result;
  }

  return activity.recordSuccessfulActivity(result, activity.input);
};

export const runIpcActionWithCleanup = async <T>({
  action,
  cleanup,
  errorCode,
  getErrorMessage,
  activity
}: RunIpcActionWithCleanupOptions<T>): Promise<BridgeResult<T>> => {
  let result: BridgeSuccess<T> | null = null;
  let actionError: unknown = null;

  try {
    result = createIpcSuccess(await action());
  } catch (error) {
    actionError = error;
  }

  try {
    await cleanup();
  } catch (error) {
    if (!actionError) {
      actionError = error;
    }
  }

  if (actionError) {
    return createIpcFailureFromError(errorCode, actionError, getErrorMessage);
  }

  if (!result) {
    return createIpcFailure(errorCode, "IPC action completed without a result.");
  }

  if (!activity) {
    return result;
  }

  return activity.recordSuccessfulActivity(result, activity.input);
};

export const runIpcSaveDialogAction = async <T>({
  action,
  choosePath,
  onCancel,
  errorCode,
  getErrorMessage,
  activity
}: RunIpcSaveDialogActionOptions<T>): Promise<BridgeResult<T>> => {
  try {
    const filePath = await choosePath();

    if (!filePath) {
      return await onCancel();
    }

    return await runIpcAction({
      action: () => action(filePath),
      errorCode,
      getErrorMessage,
      activity
    });
  } catch (error) {
    return createIpcFailureFromError(errorCode, error, getErrorMessage);
  }
};

export const runIpcSaveDialogResultAction = async <T>({
  action,
  choosePath,
  onCancel,
  errorCode,
  getErrorMessage,
  activity
}: RunIpcSaveDialogResultActionOptions<T>): Promise<BridgeResult<T>> => {
  try {
    const filePath = await choosePath();

    if (!filePath) {
      return await onCancel();
    }

    return await runIpcResultAction({
      action: () => action(filePath),
      activity
    });
  } catch (error) {
    return createIpcFailureFromError(errorCode, error, getErrorMessage);
  }
};

export const runIpcOpenPathAction = async ({
  filePath,
  exists,
  openPath,
  missingErrorCode,
  missingMessage,
  openErrorCode,
  getErrorMessage,
  activity
}: RunIpcOpenPathActionOptions): Promise<BridgeResult<null>> => {
  try {
    if (!exists(filePath)) {
      return createIpcFailure(missingErrorCode, missingMessage);
    }

    const openResult = await openPath(filePath);

    if (openResult) {
      return createIpcFailure(openErrorCode, openResult);
    }

    const result = createIpcSuccess(null);

    if (!activity) {
      return result;
    }

    return activity.recordSuccessfulActivity(result, activity.input);
  } catch (error) {
    return createIpcFailureFromError(openErrorCode, error, getErrorMessage);
  }
};
