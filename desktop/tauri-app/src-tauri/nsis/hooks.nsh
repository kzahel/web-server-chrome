; NSIS installer hooks for 200 OK Web Server

!macro CUSTOM_PREINSTALL
  ; Kill running processes before install
  nsExec::Exec 'taskkill /f /im "200 OK.exe"'
  nsExec::Exec 'taskkill /f /im ok200-host.exe'
  Sleep 500
!macroend

!macro CUSTOM_PREUNINSTALL
  ; Kill running processes before uninstall
  nsExec::Exec 'taskkill /f /im "200 OK.exe"'
  nsExec::Exec 'taskkill /f /im ok200-host.exe'
  Sleep 500
!macroend

!macro CUSTOM_POSTINSTALL
  ; Register native messaging host with Chromium browsers via registry
  ; Manifest file path
  nsExec::ExecToLog 'cmd /c echo {"name":"app.ok200.native","description":"200 OK Web Server Native Messaging Host","path":"$INSTDIR\\ok200-host.exe","type":"stdio","allowed_origins":["chrome-extension://lpkjdhnmgkhaabhimpdinmdgejoaejic/"]} > "$LOCALAPPDATA\app.ok200.desktop\app.ok200.native.json"'

  ; Create registry keys for each browser
  WriteRegStr HKCU "Software\Google\Chrome\NativeMessagingHosts\app.ok200.native" "" "$LOCALAPPDATA\app.ok200.desktop\app.ok200.native.json"
  WriteRegStr HKCU "Software\Chromium\NativeMessagingHosts\app.ok200.native" "" "$LOCALAPPDATA\app.ok200.desktop\app.ok200.native.json"
  WriteRegStr HKCU "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\app.ok200.native" "" "$LOCALAPPDATA\app.ok200.desktop\app.ok200.native.json"
  WriteRegStr HKCU "Software\Microsoft\Edge\NativeMessagingHosts\app.ok200.native" "" "$LOCALAPPDATA\app.ok200.desktop\app.ok200.native.json"
!macroend

!macro CUSTOM_POSTUNINSTALL
  ; Clean up native messaging host registry keys
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\app.ok200.native"
  DeleteRegKey HKCU "Software\Chromium\NativeMessagingHosts\app.ok200.native"
  DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\app.ok200.native"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\app.ok200.native"

  ; Clean up manifest file
  Delete "$LOCALAPPDATA\app.ok200.desktop\app.ok200.native.json"
  RMDir "$LOCALAPPDATA\app.ok200.desktop"
!macroend
