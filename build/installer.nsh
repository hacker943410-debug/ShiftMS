!ifndef BUILD_UNINSTALLER
!define UPDATE_DATA_SCRIPT_SOURCE "${__FILEDIR__}\installer-update-data.ps1"
!define SHIFTMGMT_INSTALL_REGISTRY_KEY "Software\${APP_GUID}"
!define SHIFTMGMT_UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"

Var ExistingInstallVersion
Var ExistingInstallScope
Var UpdateDataScriptPath
Var UpdateBackupDisplayPath

Function PrepareUpdateBackup
  StrCpy $ExistingInstallVersion ""
  StrCpy $ExistingInstallScope ""
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
  ; The backup path is deliberately NOT passed from here. NSIS resolves $LOCALAPPDATA against the
  ; shell var context, and electron-builder's initMultiUser - which runs before customInit - sets
  ; that context to `all` for an all-users install, where $LOCALAPPDATA is C:\ProgramData: a folder
  ; every local user can read and every local user shares. The backup holds the accounts and the
  ; database. The script reads %LOCALAPPDATA% itself, in the same process whose %APPDATA% it is
  ; copying, so the copy always lands in the private folder of the user whose data it is.
  ; It must also outlive this installer ($PLUGINSDIR is wiped the moment it exits) and must not sit
  ; under $APPDATA, which the backup step reads as live user data. Never RMDir it either - a backup
  ; still sitting there is one whose restore never finished.
  StrCpy $UpdateDataScriptPath "$PLUGINSDIR\installer-update-data.ps1"
  File /oname=$PLUGINSDIR\installer-update-data.ps1 "${UPDATE_DATA_SCRIPT_SOURCE}"

  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$UpdateDataScriptPath" -Mode Backup'
  Pop $0

  StrCmp $0 "0" update_backup_success update_backup_failed

update_backup_failed:
  IfSilent update_backup_abort
  MessageBox MB_ICONSTOP|MB_OK "기존 ShiftMgmt 사용자 데이터를 임시 백업하지 못해 업데이트를 계속할 수 없습니다.$\r$\n$\r$\nPowerShell 실행 환경과 사용자 프로필(APPDATA) 접근 권한을 확인한 뒤 다시 시도해 주세요."

update_backup_abort:
  Abort

update_backup_success:
  IfSilent prepare_backup_done
  MessageBox MB_ICONINFORMATION|MB_OK "기존 ShiftMgmt $ExistingInstallVersion 설치를 확인했습니다.$\r$\n$\r$\n이번 실행은 업데이트 모드로 진행되며 앱 파일만 교체합니다.$\r$\n계정 정보와 DB 데이터는 건드리지 않고 그대로 둡니다. 만약을 위해 설치 전에 안전 복사본을 만들어 두고, 설치 뒤에 빠진 파일이 있을 때만 그 복사본에서 채웁니다."

prepare_backup_done:
FunctionEnd

Function RestoreUpdateBackup
  StrCmp $ExistingInstallVersion "" restore_backup_done

  InitPluginsDir
  StrCmp $UpdateDataScriptPath "" 0 +2
  StrCpy $UpdateDataScriptPath "$PLUGINSDIR\installer-update-data.ps1"
  IfFileExists "$UpdateDataScriptPath" restore_backup_run restore_backup_extract

restore_backup_extract:
  File /oname=$PLUGINSDIR\installer-update-data.ps1 "${UPDATE_DATA_SCRIPT_SOURCE}"

restore_backup_run:
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$UpdateDataScriptPath" -Mode Restore'
  Pop $0

  ; The folder the messages below name, resolved at run time from this process's environment block.
  ; NOT $LOCALAPPDATA: NSIS resolves that shell var against the shell var context, which
  ; electron-builder's initMultiUser sets to `all` for an all-users install - there it is
  ; C:\ProgramData, which is never where the backup went. NOT $%LOCALAPPDATA% either: that form is
  ; expanded when this installer is COMPILED, so it would ship the build machine's own path to
  ; every operator. ExpandEnvStrings reads the environment block that nsExec's child powershell.exe
  ; inherits - the very block installer-update-data.ps1 reads $env:LOCALAPPDATA from - so the folder
  ; named here and the folder the backup is in cannot disagree. Measured: with LOCALAPPDATA spoofed
  ; in the installer process, the script's backup landed in exactly the expanded path.
  ExpandEnvStrings $UpdateBackupDisplayPath "%LOCALAPPDATA%\ShiftMgmt-update-backup"

  ; The exit codes are defined in installer-update-data.ps1's own header: 0 = finished with nothing
  ; set aside, 3 = finished but a live file was renamed aside instead of written over (so the safety
  ; copy is deliberately kept), 4 = finished and everything put back, but a folder in the live user
  ; data could not be read, so the safety copy is kept until one can be, anything else = it did not
  ; finish. 3 and 4 are NOT failures; before the 3 branch existed it fell into restore_backup_failed
  ; and told the operator the opposite of the truth, and 4 used to be reported as a failure for the
  ; same reason. They are two branches and not one because their messages are not interchangeable:
  ; only the 3 case leaves a renamed file the operator may have to do something about.
  StrCmp $0 "0" restore_backup_done 0
  StrCmp $0 "3" restore_backup_kept_log 0
  StrCmp $0 "4" restore_backup_unchecked restore_backup_failed

restore_backup_kept_log:
  ; Nothing failed here and nothing was deleted. IfSilent keeps an unattended auto-update quiet, the
  ; same way the failure branch below does - the file is preserved on disk either way.
  IfSilent restore_backup_done
  MessageBox MB_ICONINFORMATION|MB_OK "설치는 정상적으로 끝났습니다.$\r$\n$\r$\n다만 앱이 마지막까지 쓰고 있던 파일이 하나 남아 있었습니다.$\r$\n이 파일은 지우지 않고 이름만 바꿔서 그대로 두었습니다. 이름 뒤에 -unrestored- 와 날짜가 붙어 있습니다.$\r$\n$\r$\n앱을 열어 최근 승인 내역이 그대로 보이는지 확인해 주세요.$\r$\n최근에 넣은 자료가 비어 보이면 그 파일을 지우지 마시고 문의해 주세요.$\r$\n$\r$\n설치 전에 만들어 둔 안전 복사본도 아래 폴더에 그대로 두었습니다.$\r$\n$UpdateBackupDisplayPath"
  Goto restore_backup_done

restore_backup_unchecked:
  ; Nothing failed, nothing was renamed and nothing was deleted: the fill-in step finished, but one
  ; folder could not be read, so this run cannot say the safety copy has nothing left to give and
  ; keeps it. IfSilent keeps an unattended auto-update quiet, the same way the other branches do -
  ; the safety copy is kept on disk either way.
  IfSilent restore_backup_done
  MessageBox MB_ICONINFORMATION|MB_OK "설치는 정상적으로 끝났습니다.$\r$\n$\r$\n빠진 파일도 모두 채웠습니다. 다만 폴더 하나를 열어 볼 수 없어서, 남김없이 확인했다고까지는 말씀드릴 수 없습니다.$\r$\n$\r$\n그래서 설치 전에 만들어 둔 안전 복사본을 지우지 않고 아래 폴더에 그대로 두었습니다.$\r$\n$UpdateBackupDisplayPath$\r$\n$\r$\n앱을 실행해 자료가 그대로 보이는지 확인해 주세요. 자료가 비어 보이면 이 폴더를 지우지 마시고 문의해 주세요."
  Goto restore_backup_done

restore_backup_failed:
  ; This step only fills in files the install left missing; it never deletes the live folder, so a
  ; failure here leaves the operator's data exactly where it was. Aborting the install would make
  ; things worse, not better - the app files are already in place by now.
  ; It used to Abort, back when the restore wiped the live folder before copying and a failure
  ; therefore meant the data was gone - silently, on an unattended auto-update.
  IfSilent restore_backup_done
  MessageBox MB_ICONEXCLAMATION|MB_OK "설치는 정상적으로 끝났습니다.$\r$\n$\r$\n다만 설치 전에 만들어 둔 안전 복사본에서 빠진 파일을 채우는 단계가 끝까지 실행되지 않았습니다.$\r$\n기존 계정 정보와 DB 데이터는 지우지 않았으므로 그대로 남아 있습니다.$\r$\n앱을 실행해 자료가 보이는지 확인해 주세요.$\r$\n$\r$\n안전 복사본은 아래 폴더에 그대로 있습니다. 자료가 비어 보이면 이 폴더를 지우지 말고 문의해 주세요.$\r$\n$UpdateBackupDisplayPath"

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
