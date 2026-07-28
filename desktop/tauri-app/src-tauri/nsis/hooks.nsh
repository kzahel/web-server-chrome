; Lightweight extensions to Tauri's standard per-user NSIS installer.

!macro _Kill200OKProcesses
  nsis_tauri_utils::FindProcess "ok200-desktop.exe" $R0
  ${If} $R0 = 0
    nsis_tauri_utils::KillProcess "ok200-desktop.exe" $R0
  ${EndIf}

  nsis_tauri_utils::FindProcess "ok200-host.exe" $R0
  ${If} $R0 = 0
    nsis_tauri_utils::KillProcess "ok200-host.exe" $R0
  ${EndIf}

  Sleep 500
!macroend

!include "WordFunc.nsh"

!macro NSIS_HOOK_PREINSTALL
  !insertmacro _Kill200OKProcesses
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
  !insertmacro _Kill200OKProcesses
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\app.ok200.native"
  DeleteRegKey HKCU "Software\Chromium\NativeMessagingHosts\app.ok200.native"
  DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\app.ok200.native"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\app.ok200.native"

  Delete "$LOCALAPPDATA\app.ok200.desktop\app.ok200.native.json"
  RMDir "$LOCALAPPDATA\app.ok200.desktop"
!macroend
