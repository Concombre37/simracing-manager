param(
  [int]$AgentPid,
  [string]$ZipPath,
  [string]$BaseDir,
  [string]$FinalExePath,
  [string]$LauncherPath
)

try {
  Wait-Process -Id $AgentPid -Timeout 30 -ErrorAction SilentlyContinue
} catch {
  # Already exited, or never existed under this PID — either way, proceed.
}

Expand-Archive -Path $ZipPath -DestinationPath $BaseDir -Force
Remove-Item -Path $ZipPath -Force -ErrorAction SilentlyContinue

# Relaunch through start-agent.vbs (bundled in the update zip, same as a
# fresh install) so the updated agent restarts hidden — running the .exe
# directly would flash a console window, since pkg builds a console
# subsystem executable.
if (Test-Path $LauncherPath) {
  Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$LauncherPath`""
} else {
  Start-Process -FilePath $FinalExePath
}

Remove-Item -Path $PSCommandPath -Force -ErrorAction SilentlyContinue
