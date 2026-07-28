; Lightweight extensions to Tauri's standard per-user NSIS installer.

!macro _Stop200OKProcesses
  ; Ask an existing single instance to shut down cleanly so its server and
  ; WebView2 children release their app-data files.
  IfFileExists "$INSTDIR\ok200-desktop.exe" 0 +2
    nsExec::ExecToLog '"$INSTDIR\ok200-desktop.exe" --quit-for-uninstall'

  Sleep 1000

  ; Fall back to killing only the installed product's process trees.
  nsis_tauri_utils::FindProcess "ok200-desktop.exe" $R0
  ${If} $R0 = 0
    nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM ok200-desktop.exe'
  ${EndIf}

  nsis_tauri_utils::FindProcess "ok200-host.exe" $R0
  ${If} $R0 = 0
    nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM ok200-host.exe'
  ${EndIf}

  Sleep 500
!macroend

!include "WordFunc.nsh"

!macro NSIS_HOOK_PREINSTALL
  !insertmacro _Stop200OKProcesses
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Tauri currently installs an external binary without its source target
  ; suffix. The wildcard also tolerates a target-suffixed future layout.
  FindFirst $0 $1 "$INSTDIR\ok200-host*.exe"
  FindClose $0

  ${If} $1 != ""
    StrCpy $2 "$INSTDIR\$1"
    ${WordReplace} $2 "\" "\\" "+" $3

    CreateDirectory "$LOCALAPPDATA\app.ok200.desktop"
    FileOpen $4 "$LOCALAPPDATA\app.ok200.desktop\app.ok200.native.json" w
    FileWrite $4 '{$\r$\n'
    FileWrite $4 '  "name": "app.ok200.native",$\r$\n'
    FileWrite $4 '  "description": "200 OK Web Server Native Messaging Host",$\r$\n'
    FileWrite $4 '  "path": "$3",$\r$\n'
    FileWrite $4 '  "type": "stdio",$\r$\n'
    FileWrite $4 '  "allowed_origins": [$\r$\n'
    FileWrite $4 '    "chrome-extension://lpkjdhnmgkhaabhimpdinmdgejoaejic/"$\r$\n'
    FileWrite $4 '  ]$\r$\n'
    FileWrite $4 '}'
    FileClose $4

    StrCpy $5 "$LOCALAPPDATA\app.ok200.desktop\app.ok200.native.json"
    WriteRegStr HKCU "Software\Google\Chrome\NativeMessagingHosts\app.ok200.native" "" $5
    WriteRegStr HKCU "Software\Chromium\NativeMessagingHosts\app.ok200.native" "" $5
    WriteRegStr HKCU "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\app.ok200.native" "" $5
    WriteRegStr HKCU "Software\Microsoft\Edge\NativeMessagingHosts\app.ok200.native" "" $5
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro _Stop200OKProcesses
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\app.ok200.native"
  DeleteRegKey HKCU "Software\Chromium\NativeMessagingHosts\app.ok200.native"
  DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\app.ok200.native"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\app.ok200.native"

  Delete "$LOCALAPPDATA\app.ok200.desktop\app.ok200.native.json"

  ; Tauri's standard uninstaller already removes these paths. Retry after the
  ; graceful/process-tree shutdown in case WebView2 released a file late.
  SetShellVarContext current
  RMDir /r "$APPDATA\app.ok200.desktop"
  RMDir /r "$LOCALAPPDATA\app.ok200.desktop"
  Sleep 500
  RMDir /r "$APPDATA\app.ok200.desktop"
  RMDir /r "$LOCALAPPDATA\app.ok200.desktop"
!macroend
