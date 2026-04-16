!macro customInit
  IfSilent installer_check_done

  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$$provider16 = [System.Type]::GetTypeFromProgID(''Microsoft.ACE.OLEDB.16.0''); $$provider12 = [System.Type]::GetTypeFromProgID(''Microsoft.ACE.OLEDB.12.0''); if ($$provider16 -or $$provider12) { exit 0 } exit 1"'
  Pop $0

  StrCmp $0 "0" installer_check_done

  MessageBox MB_ICONEXCLAMATION|MB_OK "이 PC에서 Microsoft Access Database Engine(ACE OLEDB)을 찾지 못했습니다.$\r$\n$\r$\nJSON 복원은 바로 사용할 수 있지만 Access DB(.accdb) 복원은 별도 Microsoft 365 Access Runtime 또는 호환 Office 구성이 필요할 수 있습니다.$\r$\n$\r$\n설치 후 앱의 운영 관리 > DB업데이트 미리보기에서 다시 확인할 수 있습니다."

installer_check_done:
!macroend
