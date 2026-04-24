!ifndef BUILD_UNINSTALLER
!define UPDATE_DATA_SCRIPT_SOURCE "${__FILEDIR__}\installer-update-data.ps1"
!define SHIFTMGMT_INSTALL_REGISTRY_KEY "Software\${APP_GUID}"
!define SHIFTMGMT_UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"

Var ExistingInstallVersion
Var ExistingInstallScope
Var UpdateBackupRoot
Var UpdateDataScriptPath

Function PrepareUpdateBackup
  StrCpy $ExistingInstallVersion ""
  StrCpy $ExistingInstallScope ""
  StrCpy $UpdateBackupRoot ""
  StrCpy $UpdateDataScriptPath ""

  ReadRegStr $ExistingInstallVersion HKCU "${SHIFTMGMT_UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  StrCmp $ExistingInstallVersion "" check_machine_install current_user_install

check_machine_install:
  ReadRegStr $ExistingInstallVersion HKLM "${SHIFTMGMT_UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  StrCmp $ExistingInstallVersion "" prepare_backup_done machine_user_install

current_user_install:
  StrCpy $ExistingInstallScope "currentuser"
  Goto prepare_backup

machine_user_install:
  StrCpy $ExistingInstallScope "allusers"

prepare_backup:
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Get-Process -Name ''ShiftMgmt'' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; exit 0"'
  Pop $0
  InitPluginsDir
  StrCpy $UpdateBackupRoot "$PLUGINSDIR\shiftmgmt-update-backup"
  StrCpy $UpdateDataScriptPath "$PLUGINSDIR\installer-update-data.ps1"
  RMDir /r "$UpdateBackupRoot"
  File /oname=$PLUGINSDIR\installer-update-data.ps1 "${UPDATE_DATA_SCRIPT_SOURCE}"

  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$UpdateDataScriptPath" -Mode Backup -BackupRoot "$UpdateBackupRoot"'
  Pop $0

  StrCmp $0 "0" update_backup_success update_backup_failed

update_backup_failed:
  IfSilent update_backup_abort
  MessageBox MB_ICONSTOP|MB_OK "기존 ShiftMgmt 사용자 데이터를 임시 백업하지 못해 업데이트를 계속할 수 없습니다.$\r$\n$\r$\nPowerShell 실행 환경과 사용자 프로필(APPDATA) 접근 권한을 확인한 뒤 다시 시도해 주세요."

update_backup_abort:
  Abort

update_backup_success:
  IfSilent prepare_backup_done
  MessageBox MB_ICONINFORMATION|MB_OK "기존 ShiftMgmt $ExistingInstallVersion 설치를 확인했습니다.$\r$\n$\r$\n이번 실행은 업데이트 모드로 진행되며 앱 파일만 교체합니다.$\r$\n계정 정보와 DB 데이터는 설치 전에 백업한 뒤 설치 후 자동 복원됩니다."

prepare_backup_done:
FunctionEnd

Function RestoreUpdateBackup
  StrCmp $ExistingInstallVersion "" restore_backup_done

  InitPluginsDir
  StrCmp $UpdateBackupRoot "" 0 +2
  StrCpy $UpdateBackupRoot "$PLUGINSDIR\shiftmgmt-update-backup"
  StrCmp $UpdateDataScriptPath "" 0 +2
  StrCpy $UpdateDataScriptPath "$PLUGINSDIR\installer-update-data.ps1"
  IfFileExists "$UpdateDataScriptPath" restore_backup_run restore_backup_extract

restore_backup_extract:
  File /oname=$PLUGINSDIR\installer-update-data.ps1 "${UPDATE_DATA_SCRIPT_SOURCE}"

restore_backup_run:
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$UpdateDataScriptPath" -Mode Restore -BackupRoot "$UpdateBackupRoot"'
  Pop $0

  StrCmp $0 "0" restore_backup_done restore_backup_failed

restore_backup_failed:
  IfSilent restore_backup_abort
  MessageBox MB_ICONSTOP|MB_OK "설치 후 기존 ShiftMgmt 사용자 데이터를 자동 복원하지 못했습니다.$\r$\n$\r$\n앱은 설치되었지만 계정 정보와 DB 데이터가 정상 반영되지 않았을 수 있습니다.$\r$\nPowerShell 실행 환경과 사용자 프로필(APPDATA) 접근 권한을 확인한 뒤 설치를 다시 시도해 주세요."

restore_backup_abort:
  Abort

restore_backup_done:
FunctionEnd

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "ShiftMgmt 설치 / 업데이트"
  !define MUI_WELCOMEPAGE_TEXT "이 설치 프로그램은 신규 설치와 업데이트를 모두 지원합니다.$\r$\n$\r$\n기존 ShiftMgmt가 설치된 PC에서는 업데이트 모드로 동작하여 앱 파일만 교체하고 계정 정보와 DB 데이터는 유지합니다."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customInit
  Call PrepareUpdateBackup

  IfSilent installer_check_done

  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$$provider16 = [System.Type]::GetTypeFromProgID(''Microsoft.ACE.OLEDB.16.0''); $$provider12 = [System.Type]::GetTypeFromProgID(''Microsoft.ACE.OLEDB.12.0''); if ($$provider16 -or $$provider12) { exit 0 } exit 1"'
  Pop $0

  StrCmp $0 "0" installer_check_done

  MessageBox MB_ICONEXCLAMATION|MB_OK "이 PC에서 Microsoft Access Database Engine(ACE OLEDB)을 찾지 못했습니다.$\r$\n$\r$\nJSON 복원은 바로 사용할 수 있지만 Access DB(.accdb) 복원은 별도 Microsoft 365 Access Runtime 또는 호환 Office 구성이 필요할 수 있습니다.$\r$\n$\r$\n설치 후 앱의 운영 관리 > DB업데이트 미리보기에서 다시 확인할 수 있습니다."

installer_check_done:
!macroend

!macro customInstall
  Call RestoreUpdateBackup
!macroend
!endif
