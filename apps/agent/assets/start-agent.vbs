Dim fso, shell, scriptDir, exePath
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = scriptDir & "\sim-center-agent-win.exe"

If Not fso.FileExists(exePath) Then
  exePath = scriptDir & "\agent.exe"
End If

If fso.FileExists(exePath) Then
  ' Immediately after an update, the freshly-extracted exe can be briefly
  ' locked (Windows Defender's real-time scan-on-write is the prime
  ' suspect, same category as the EPERM seen on the download step) —
  ' confirmed live: shell.Run failed here with 0x80070020 ("file in use
  ' by another process") right after an update-agent.ps1 relaunch, even
  ' though the exe was fully extracted on disk. Retry for a few seconds
  ' before giving up instead of failing on the very first attempt.
  Dim attempt, maxAttempts, launched
  maxAttempts = 10
  launched = False
  For attempt = 1 To maxAttempts
    On Error Resume Next
    Err.Clear
    shell.Run """" & exePath & """", 0, False
    If Err.Number = 0 Then
      launched = True
    End If
    On Error Goto 0
    If launched Then Exit For
    WScript.Sleep 1000
  Next
  If Not launched Then
    MsgBox "Impossible de lancer " & exePath & " apres " & maxAttempts & " tentatives (fichier verrouille ?)", vbCritical, "SimRacing Manager Agent"
  End If
Else
  MsgBox "sim-center-agent-win.exe introuvable dans " & scriptDir, vbCritical, "SimRacing Manager Agent"
End If
