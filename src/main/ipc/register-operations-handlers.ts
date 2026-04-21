import path from "node:path";

import { BrowserWindow, dialog, ipcMain } from "electron";
import type { App } from "electron";

import {
  getStoredAppSettingsSnapshot,
  saveStoredAppSettings
} from "../services/app-settings-storage-service";
import {
  getFileWatchStatusSnapshot,
  restartFileWatchRuntime,
  stopFileWatchRuntime
} from "../services/file-watch-runtime-service";
import {
  runDatabaseBackupNow,
  restartDatabaseBackupRuntime
} from "../services/database-backup-service";
import {
  checkDatabaseMigrationRequirements,
  previewDatabaseMigrationUpdate,
  runDatabaseMigrationUpdate
} from "../services/database-migration-service";
import {
  approveManagedDocumentTemplateVersion,
  deleteManagedDocumentTemplateVersion,
  inspectDocumentTemplateImport,
  saveManagedDocumentTemplateVersion
} from "../services/document-template-management-service";
import { previewDocumentTemplateFile } from "../services/document-template-preview-service";
import { fetchHolidayApiItems } from "../services/holiday-api-service";
import {
  deleteStoredAllowanceRateVersion,
  deleteStoredSiteNameOption,
  listStoredAllowanceRateHistory,
  deleteStoredHolidayItem,
  deleteStoredOperationUser,
  listStoredAllowanceRateVersions,
  listStoredDocumentTemplateHistory,
  listStoredDocumentTemplateVersions,
  listStoredHolidayCalendars,
  listStoredOperationUsers,
  listStoredSiteNameOptions,
  renameStoredHolidayItem,
  replaceStoredHolidayCalendar,
  saveStoredAllowanceRateVersion,
  saveStoredHolidayItem,
  saveStoredOperationUser,
  saveStoredSiteNameOption,
  setStoredDefaultDocumentTemplateVersion,
  updateStoredDocumentTemplateOutputFileNamePattern
} from "../services/operations-storage-service";
import {
  createIpcFailure,
  createIpcSuccess,
  runIpcAction,
  runIpcSaveDialogAction,
  runIpcActionWithCleanup
} from "./ipc-handler-helpers";
import { isSupportedDatabaseMigrationFilePath } from "../../shared/domain/database-migration";
import type { AuthSession, TemplateType } from "../../shared/domain/model";
import type {
  AllowanceRateVersionDeleteInput,
  AllowanceRateVersionSaveInput,
  AppSettingsUpdateInput,
  BridgeFailure,
  DatabaseMigrationRunInput,
  DirectorySelectionInput,
  DocumentTemplateInspectInput,
  DocumentTemplateOutputFileNameUpdateInput,
  DocumentTemplatePreviewInput,
  DocumentTemplateSaveInput,
  FileSelectionInput,
  HolidayCalendarReplaceInput,
  HolidayItemDeleteInput,
  HolidayItemRenameInput,
  HolidayItemUpsertInput,
  OperationUserDeleteInput,
  OperationUserSaveInput,
  SiteNameOptionDeleteInput,
  SiteNameOptionSaveInput
} from "../../shared/bridge/contracts";
import type {
  IpcActivityInput,
  RecordSuccessfulIpcActivity
} from "./ipc-handler-helpers";

type WithAdmin = <T>(callback: (session: AuthSession) => T) => T | BridgeFailure;

type RegisterOperationsHandlersOptions = {
  app: App;
  getErrorMessage: (error: unknown) => string;
  recordSuccessfulActivity: RecordSuccessfulIpcActivity;
  withAdmin: WithAdmin;
};

const documentTemplateLabelByType: Record<TemplateType, string> = {
  schedule: "근무표",
  proposal: "품의서",
  attachment1: "별첨1",
  attachment2: "별첨2"
};

const sanitizeFileSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "_");

const assertSupportedDatabaseRestoreFile = (filePath: string) => {
  if (!isSupportedDatabaseMigrationFilePath(filePath)) {
    throw new Error(
      "DB복구는 JSON 백업(.json) 또는 Access DB(.accdb) 파일만 사용할 수 있습니다. Excel 파일은 복구 대상이 아닙니다."
    );
  }
};

export const registerOperationsHandlers = ({
  app,
  getErrorMessage,
  recordSuccessfulActivity,
  withAdmin
}: RegisterOperationsHandlersOptions) => {
  const getUserDataPath = () => app.getPath("userData");
  const trackSuccess = (input: IpcActivityInput) => ({
    input,
    recordSuccessfulActivity
  });

  ipcMain.handle("operations:get-app-settings", () =>
    withAdmin(() =>
      createIpcSuccess(
        getStoredAppSettingsSnapshot({
          userDataPath: getUserDataPath()
        })
      )
    )
  );
  ipcMain.handle("operations:save-app-settings", async (_event, input: AppSettingsUpdateInput) =>
    withAdmin(async () =>
      runIpcAction({
        action: async () => {
          const savedSettings = saveStoredAppSettings(input, {
            userDataPath: getUserDataPath()
          });
          await restartFileWatchRuntime({
            userDataPath: getUserDataPath()
          });
          restartDatabaseBackupRuntime({
            userDataPath: getUserDataPath()
          });

          return savedSettings;
        },
        errorCode: "APP_SETTINGS_SAVE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "app-settings-save",
          routeKey: "operations",
          routeLabel: "운영 관리",
          details: "앱 운영 설정 저장"
        })
      })
    )
  );
  ipcMain.handle("operations:select-directory", async (event, input?: DirectorySelectionInput) =>
    withAdmin(async () => {
      const window =
        BrowserWindow.fromWebContents(event.sender) ??
        BrowserWindow.getFocusedWindow() ??
        undefined;
      const dialogOptions = {
        title: input?.title ?? "폴더 선택",
        buttonLabel: input?.buttonLabel ?? "선택",
        defaultPath: input?.defaultPath,
        properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory">
      };
      const result = window
        ? await dialog.showOpenDialog(window, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);

      return createIpcSuccess(result.canceled ? null : (result.filePaths[0] ?? null));
    })
  );
  ipcMain.handle(
    "operations:select-migration-file",
    async (event, input?: FileSelectionInput) =>
      withAdmin(async () => {
        const window =
          BrowserWindow.fromWebContents(event.sender) ??
          BrowserWindow.getFocusedWindow() ??
          undefined;
        const dialogOptions = {
          title: input?.title ?? "복원 파일 선택",
          buttonLabel: input?.buttonLabel ?? "선택",
          defaultPath: input?.defaultPath,
          properties: ["openFile"] as Array<"openFile">,
          filters:
            input?.filters && input.filters.length > 0
              ? input.filters
              : [
                  {
                    name: "복원 파일",
                    extensions: ["json", "accdb"]
                  }
                ]
        };
        const result = window
          ? await dialog.showOpenDialog(window, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);

        const selectedFilePath = result.canceled ? null : (result.filePaths[0] ?? null);

        if (selectedFilePath && !isSupportedDatabaseMigrationFilePath(selectedFilePath)) {
          return createIpcFailure(
            "DATABASE_RESTORE_FILE_REQUIRED",
            "DB복구는 JSON 백업(.json) 또는 Access DB(.accdb) 파일만 선택할 수 있습니다."
          );
        }

        return createIpcSuccess(selectedFilePath);
      })
  );
  ipcMain.handle("operations:select-spreadsheet-file", async (event, input?: FileSelectionInput) =>
    withAdmin(async () => {
      const window =
        BrowserWindow.fromWebContents(event.sender) ??
        BrowserWindow.getFocusedWindow() ??
        undefined;
      const dialogOptions = {
        title: input?.title ?? "Excel 파일 선택",
        buttonLabel: input?.buttonLabel ?? "가져오기",
        defaultPath: input?.defaultPath,
        properties: ["openFile"] as Array<"openFile">,
        filters:
          input?.filters && input.filters.length > 0
            ? input.filters
            : [
                {
                  name: "Excel Workbook",
                  extensions: ["xlsx", "xlsm"]
                }
              ]
      };
      const result = window
        ? await dialog.showOpenDialog(window, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);

      if (result.canceled || result.filePaths.length === 0) {
        return createIpcSuccess(null);
      }

      const filePath = result.filePaths[0]!;

      return createIpcSuccess({
        fileName: path.basename(filePath),
        filePath
      });
    })
  );
  ipcMain.handle(
    "operations:check-database-migration-requirements",
    async (_event, input: DatabaseMigrationRunInput) =>
      withAdmin(async () =>
        runIpcAction({
          action: () => {
            assertSupportedDatabaseRestoreFile(input.migrationFilePath);

            return checkDatabaseMigrationRequirements({
              migrationFilePath: input.migrationFilePath
            });
          },
          errorCode: "DATABASE_MIGRATION_REQUIREMENTS_FAILED",
          getErrorMessage
        })
      )
  );
  ipcMain.handle(
    "operations:preview-database-migration-update",
    async (_event, input: DatabaseMigrationRunInput) =>
      withAdmin(async () => {
        assertSupportedDatabaseRestoreFile(input.migrationFilePath);

        await stopFileWatchRuntime({
          userDataPath: getUserDataPath()
        });

        return runIpcActionWithCleanup({
          action: () =>
            previewDatabaseMigrationUpdate({
              userDataPath: getUserDataPath(),
              migrationFilePath: input.migrationFilePath,
              selectedAccessTables: input.selectedAccessTables
            }),
          cleanup: () =>
            restartFileWatchRuntime({
              userDataPath: getUserDataPath()
            }),
          errorCode: "DATABASE_MIGRATION_PREVIEW_FAILED",
          getErrorMessage,
          activity: trackSuccess({
            actionType: "database-migration-preview",
            routeKey: "operations",
            routeLabel: "운영 관리",
            details: "DB 복원 미리보기"
          })
        });
      })
  );
  ipcMain.handle(
    "operations:update-database-from-migration",
    async (_event, input: DatabaseMigrationRunInput) =>
      withAdmin(async () => {
        assertSupportedDatabaseRestoreFile(input.migrationFilePath);

        await stopFileWatchRuntime({
          userDataPath: getUserDataPath()
        });

        return runIpcActionWithCleanup({
          action: () =>
            runDatabaseMigrationUpdate({
              userDataPath: getUserDataPath(),
              migrationFilePath: input.migrationFilePath,
              selectedAccessTables: input.selectedAccessTables
            }),
          cleanup: () =>
            restartFileWatchRuntime({
              userDataPath: getUserDataPath()
            }),
          errorCode: "DATABASE_MIGRATION_FAILED",
          getErrorMessage,
          activity: trackSuccess({
            actionType: "database-migration-update",
            routeKey: "operations",
            routeLabel: "운영 관리",
            details: "DB 복원 반영"
          })
        });
      })
  );
  ipcMain.handle("operations:run-database-backup-now", async () =>
    withAdmin(async () =>
      runIpcAction({
        action: () =>
          runDatabaseBackupNow({
            userDataPath: getUserDataPath()
          }),
        errorCode: "DATABASE_BACKUP_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "database-backup-run",
          routeKey: "operations",
          routeLabel: "운영 관리",
          details: "DB 수동 백업"
        })
      })
    )
  );
  ipcMain.handle("operations:get-file-watch-status", () =>
    withAdmin(() =>
      createIpcSuccess(
        getFileWatchStatusSnapshot({
          userDataPath: getUserDataPath()
        })
      )
    )
  );
  ipcMain.handle("operations:restart-file-watch", async () =>
    withAdmin(async () =>
      runIpcAction({
        action: () =>
          restartFileWatchRuntime({
            userDataPath: getUserDataPath()
          }),
        errorCode: "FILE_WATCH_RESTART_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "file-watch-restart",
          routeKey: "operations",
          routeLabel: "운영 관리",
          details: "파일 감시 재시작"
        })
      })
    )
  );
  ipcMain.handle("operations:stop-file-watch", async () =>
    withAdmin(async () =>
      runIpcAction({
        action: () =>
          stopFileWatchRuntime({
            userDataPath: getUserDataPath()
          }),
        errorCode: "FILE_WATCH_STOP_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "file-watch-stop",
          routeKey: "operations",
          routeLabel: "운영 관리",
          details: "파일 감시 중지"
        })
      })
    )
  );
  ipcMain.handle("operations:list-holiday-calendars", (_event, year?: number) =>
    withAdmin(() => createIpcSuccess(listStoredHolidayCalendars(year)))
  );
  ipcMain.handle("operations:fetch-holiday-api-items", async (_event, year: number) =>
    withAdmin(async () =>
      runIpcAction({
        action: () => {
          const settings = getStoredAppSettingsSnapshot({
            userDataPath: getUserDataPath()
          });

          return fetchHolidayApiItems({
            baseUrl: settings.holidayApiBaseUrl,
            year
          });
        },
        errorCode: "HOLIDAY_API_FETCH_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "holiday-fetch",
          routeKey: "operations",
          routeLabel: "운영 관리",
          details: `${year}년 공휴일 불러오기`
        })
      })
    )
  );
  ipcMain.handle("operations:add-holiday-item", (_event, input: HolidayItemUpsertInput) =>
    withAdmin(async () =>
      runIpcAction({
        action: () => saveStoredHolidayItem(input),
        errorCode: "HOLIDAY_ITEM_SAVE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "holiday-save",
          routeKey: "operations",
          routeLabel: "운영 관리",
          details: `${input.holidayDate} 공휴일 등록`
        })
      })
    )
  );
  ipcMain.handle("operations:rename-holiday-item", (_event, input: HolidayItemRenameInput) =>
    withAdmin(async () =>
      runIpcAction({
        action: () => renameStoredHolidayItem(input),
        errorCode: "HOLIDAY_ITEM_RENAME_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "holiday-rename",
          routeKey: "operations",
          routeLabel: "운영 관리",
          details: "공휴일명 수정"
        })
      })
    )
  );
  ipcMain.handle("operations:delete-holiday-item", (_event, input: HolidayItemDeleteInput) =>
    withAdmin(async () =>
      runIpcAction({
        action: () => deleteStoredHolidayItem(input),
        errorCode: "HOLIDAY_ITEM_DELETE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "holiday-delete",
          routeKey: "operations",
          routeLabel: "운영 관리",
          details: "공휴일 삭제"
        })
      })
    )
  );
  ipcMain.handle(
    "operations:replace-holiday-calendar",
    (_event, input: HolidayCalendarReplaceInput) =>
      withAdmin(async () =>
        runIpcAction({
          action: () => replaceStoredHolidayCalendar(input),
          errorCode: "HOLIDAY_CALENDAR_REPLACE_FAILED",
          getErrorMessage,
          activity: trackSuccess({
            actionType: "holiday-replace",
            routeKey: "operations",
            routeLabel: "운영 관리",
            details: `${input.year}년 공휴일 일괄 반영`
          })
        })
      )
  );
  ipcMain.handle("operations:list-allowance-rate-versions", (_event, year?: number) =>
    withAdmin(() => createIpcSuccess(listStoredAllowanceRateVersions(year)))
  );
  ipcMain.handle("operations:list-allowance-rate-history", () =>
    withAdmin(() => createIpcSuccess(listStoredAllowanceRateHistory()))
  );
  ipcMain.handle(
    "operations:save-allowance-rate-version",
    (_event, input: AllowanceRateVersionSaveInput) =>
      withAdmin(async () =>
        runIpcAction({
          action: () => saveStoredAllowanceRateVersion(input),
          errorCode: "ALLOWANCE_RATE_SAVE_FAILED",
          getErrorMessage,
          activity: trackSuccess({
            actionType: "allowance-rate-save",
            routeKey: "operations",
            routeLabel: "운영 관리",
            details: input.changeReason?.trim()
              ? `${input.versionLabel} 요율 저장 · 사유: ${input.changeReason}`
              : `${input.versionLabel} 요율 저장`
          })
        })
      )
  );
  ipcMain.handle(
    "operations:delete-allowance-rate-version",
    (_event, input: AllowanceRateVersionDeleteInput) =>
      withAdmin(async () =>
        runIpcAction({
          action: () => {
            deleteStoredAllowanceRateVersion(input.rateVersionId);
            return null;
          },
          errorCode: "ALLOWANCE_RATE_DELETE_FAILED",
          getErrorMessage,
          activity: trackSuccess({
            actionType: "allowance-rate-delete",
            routeKey: "operations",
            routeLabel: "운영 관리",
            details: "요율 버전 삭제"
          })
        })
      )
  );
  ipcMain.handle("operations:list-users", () =>
    withAdmin(() => createIpcSuccess(listStoredOperationUsers()))
  );
  ipcMain.handle("operations:save-user", (_event, input: OperationUserSaveInput) =>
    withAdmin(async () =>
      runIpcAction({
        action: () => saveStoredOperationUser(input),
        errorCode: "OPERATION_USER_SAVE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "user-save",
          routeKey: "operations",
          routeLabel: "운영 관리",
          details: `${input.loginId} 사용자 저장`
        })
      })
    )
  );
  ipcMain.handle("operations:delete-user", (_event, input: OperationUserDeleteInput) =>
    withAdmin(async () =>
      runIpcAction({
        action: () => {
          deleteStoredOperationUser(input.userId);
          return null;
        },
        errorCode: "OPERATION_USER_DELETE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "user-delete",
          routeKey: "operations",
          routeLabel: "운영 관리",
          details: "사용자 삭제"
        })
      })
    )
  );
  ipcMain.handle("operations:list-site-name-options", () =>
    withAdmin(() => createIpcSuccess(listStoredSiteNameOptions()))
  );
  ipcMain.handle("operations:save-site-name-option", (_event, input: SiteNameOptionSaveInput) =>
    withAdmin(async () =>
      runIpcAction({
        action: () => saveStoredSiteNameOption(input),
        errorCode: "SITE_NAME_OPTION_SAVE_FAILED",
        getErrorMessage
      })
    )
  );
  ipcMain.handle(
    "operations:delete-site-name-option",
    (_event, input: SiteNameOptionDeleteInput) =>
      withAdmin(async () =>
        runIpcAction({
          action: () => {
            deleteStoredSiteNameOption(input);
            return null;
          },
          errorCode: "SITE_NAME_OPTION_DELETE_FAILED",
          getErrorMessage
        })
      )
  );
  ipcMain.handle(
    "operations:list-document-template-history",
    (_event, templateType?: TemplateType) =>
      withAdmin(() => createIpcSuccess(listStoredDocumentTemplateHistory(templateType)))
  );
  ipcMain.handle(
    "operations:select-document-template-file",
    async (event, templateType?: TemplateType) =>
      withAdmin(async () => {
        const window =
          BrowserWindow.fromWebContents(event.sender) ??
          BrowserWindow.getFocusedWindow() ??
          undefined;
        const openDialogOptions = {
          title: "양식 파일 선택",
          buttonLabel: "가져오기",
          properties: ["openFile"] as Array<"openFile">,
          filters: [
            {
              name:
                templateType === "schedule" ? "근무표 Excel 양식" : "Excel 양식 파일",
              extensions: ["xlsx", "xlsm"]
            }
          ]
        };
        const result = window
          ? await dialog.showOpenDialog(window, openDialogOptions)
          : await dialog.showOpenDialog(openDialogOptions);

        if (result.canceled || result.filePaths.length === 0) {
          return createIpcSuccess(null);
        }

        const filePath = result.filePaths[0]!;

        return createIpcSuccess({
          fileName: path.basename(filePath),
          filePath
        });
      })
  );
  ipcMain.handle(
    "operations:inspect-document-template",
    async (_event, input: DocumentTemplateInspectInput) =>
      withAdmin(async () =>
        runIpcAction({
          action: () => inspectDocumentTemplateImport(input),
          errorCode: "DOCUMENT_TEMPLATE_INSPECT_FAILED",
          getErrorMessage,
          activity: trackSuccess({
            actionType: "template-inspect",
            routeKey: "operations",
            routeLabel: "운영 관리",
            details: `${documentTemplateLabelByType[input.templateType]} 양식 검증`
          })
        })
      )
  );
  ipcMain.handle(
    "operations:preview-document-template",
    async (event, input: DocumentTemplatePreviewInput) =>
      withAdmin(async () => {
        const settings = getStoredAppSettingsSnapshot({
          userDataPath: getUserDataPath()
        });
        const previewDirectory = path.resolve(
          settings.scheduleExportDir,
          "template-previews",
          input.templateType
        );
        const sourceBaseName = path.basename(input.sourcePath, path.extname(input.sourcePath));
        const versionSegment = sanitizeFileSegment(
          input.versionLabel?.trim() ||
            sourceBaseName ||
            documentTemplateLabelByType[input.templateType]
        );
        const defaultPath = path.resolve(
          previewDirectory,
          `${documentTemplateLabelByType[input.templateType]}_${versionSegment}_preview.xlsx`
        );
        const window =
          BrowserWindow.fromWebContents(event.sender) ??
          BrowserWindow.getFocusedWindow() ??
          undefined;
        const saveDialogOptions = {
          title: "양식 미리보기 저장",
          defaultPath,
          buttonLabel: "미리보기 저장",
          filters: [
            {
              name: "Excel Workbook",
              extensions: ["xlsx"]
            }
          ],
          showOverwriteConfirmation: true
        };

        return runIpcSaveDialogAction({
          choosePath: async () => {
            const saveResult = window
              ? await dialog.showSaveDialog(window, saveDialogOptions)
              : await dialog.showSaveDialog(saveDialogOptions);

            return saveResult.canceled ? null : (saveResult.filePath ?? null);
          },
          onCancel: () => createIpcSuccess(null),
          action: (outputPath) =>
            previewDocumentTemplateFile(input, {
              outputPath
            }),
          errorCode: "DOCUMENT_TEMPLATE_PREVIEW_FAILED",
          getErrorMessage,
          activity: trackSuccess({
            actionType: "template-preview",
            routeKey: "operations",
            routeLabel: "운영 관리",
            details: `${documentTemplateLabelByType[input.templateType]} 양식 미리보기`
          })
        });
      })
  );
  ipcMain.handle(
    "operations:save-document-template-version",
    (_event, input: DocumentTemplateSaveInput) =>
      withAdmin(async () =>
        runIpcAction({
          action: () =>
            saveManagedDocumentTemplateVersion(input, {
              userDataPath: getUserDataPath()
            }),
          errorCode: "DOCUMENT_TEMPLATE_SAVE_FAILED",
          getErrorMessage,
          activity: trackSuccess({
            actionType: "template-save",
            routeKey: "operations",
            routeLabel: "운영 관리",
            details: `${documentTemplateLabelByType[input.templateType]} 양식 등록`
          })
        })
      )
  );
  ipcMain.handle(
    "operations:approve-document-template-version",
    (_event, templateId: string) =>
      withAdmin(async () =>
        runIpcAction({
          action: () => approveManagedDocumentTemplateVersion(templateId),
          errorCode: "DOCUMENT_TEMPLATE_APPROVE_FAILED",
          getErrorMessage,
          activity: trackSuccess({
            actionType: "template-approve",
            routeKey: "operations",
            routeLabel: "운영 관리",
            details: "양식 승인"
          })
        })
      )
  );
  ipcMain.handle(
    "operations:set-default-document-template-version",
    (_event, templateId: string) =>
      withAdmin(async () =>
        runIpcAction({
          action: () => setStoredDefaultDocumentTemplateVersion(templateId),
          errorCode: "DOCUMENT_TEMPLATE_SET_DEFAULT_FAILED",
          getErrorMessage,
          activity: trackSuccess({
            actionType: "template-set-default",
            routeKey: "operations",
            routeLabel: "운영 관리",
            details: "기본 양식 지정"
          })
        })
      )
  );
  ipcMain.handle(
    "operations:update-document-template-output-file-name",
    (_event, input: DocumentTemplateOutputFileNameUpdateInput) =>
      withAdmin(async () =>
        runIpcAction({
          action: () => updateStoredDocumentTemplateOutputFileNamePattern(input),
          errorCode: "DOCUMENT_TEMPLATE_OUTPUT_FILE_NAME_UPDATE_FAILED",
          getErrorMessage,
          activity: trackSuccess({
            actionType: "template-file-name-update",
            routeKey: "operations",
            routeLabel: "운영 관리",
            details: "출력 파일명 규칙 저장"
          })
        })
      )
  );
  ipcMain.handle(
    "operations:delete-document-template-version",
    (_event, templateId: string) =>
      withAdmin(async () =>
        runIpcAction({
          action: () => {
            deleteManagedDocumentTemplateVersion(templateId, {
              userDataPath: getUserDataPath()
            });

            return null;
          },
          errorCode: "DOCUMENT_TEMPLATE_DELETE_FAILED",
          getErrorMessage,
          activity: trackSuccess({
            actionType: "template-delete",
            routeKey: "operations",
            routeLabel: "운영 관리",
            details: "양식 삭제"
          })
        })
      )
  );
  ipcMain.handle(
    "operations:list-document-template-versions",
    (_event, templateType?: TemplateType) =>
      withAdmin(() => createIpcSuccess(listStoredDocumentTemplateVersions(templateType)))
  );
};
