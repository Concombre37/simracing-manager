Dim fso, shell, scriptDir, exePath
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = scriptDir & "\sim-center-agent-win.exe"

If Not fso.FileExists(exePath) Then
  exePath = scriptDir & "\agent.exe"
End If

If fso.FileExists(exePath) Then
  shell.Run """" & exePath & """", 0, False
Else
  MsgBox "sim-center-agent-win.exe introuvable dans " & scriptDir, vbCritical, "SimRacing Manager Agent"
End If
