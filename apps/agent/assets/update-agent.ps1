param(
  [int]$AgentPid,
  [string]$ZipPath,
  [string]$BaseDir,
  [string]$FinalExePath,
  [string]$LauncherPath
)

$logPath = Join-Path $BaseDir 'update-agent.log'
function Write-Log($msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Add-Content -Path $logPath -Value $line -ErrorAction SilentlyContinue
}

Write-Log "Update started (AgentPid=$AgentPid, ZipPath=$ZipPath, BaseDir=$BaseDir)"

try {
  Wait-Process -Id $AgentPid -Timeout 30 -ErrorAction SilentlyContinue
} catch {
  Write-Log "Wait-Process error (ignored, proceeding): $_"
}

# A failed update must never leave the agent fully stopped — that needs
# physical access to fix on an unattended kiosk PC. Back up the current
# exe/native module before overwriting anything, so a failed extraction
# can restore the previous (known-working) version instead of leaving a
# half-updated or missing install behind.
$backupDir = Join-Path $BaseDir 'update-backup'
$buildDir = Join-Path $BaseDir 'build'
try {
  if (Test-Path $backupDir) { Remove-Item -Path $backupDir -Recurse -Force -ErrorAction SilentlyContinue }
  New-Item -Path $backupDir -ItemType Directory -Force | Out-Null
  if (Test-Path $FinalExePath) { Copy-Item -Path $FinalExePath -Destination $backupDir -Force }
  if (Test-Path $buildDir) { Copy-Item -Path $buildDir -Destination $backupDir -Recurse -Force }
  Write-Log "Backed up current version to $backupDir"
} catch {
  Write-Log "Backup step failed (continuing without a safety net): $_"
}

$extracted = $false
try {
  Expand-Archive -Path $ZipPath -DestinationPath $BaseDir -Force
  $extracted = $true
  Write-Log "Archive extracted successfully"
} catch {
  Write-Log "Expand-Archive FAILED: $_ -- restoring the previous version from backup"
  try {
    $backupExe = Join-Path $backupDir (Split-Path $FinalExePath -Leaf)
    if (Test-Path $backupExe) { Copy-Item -Path $backupExe -Destination $FinalExePath -Force }
    $backupBuild = Join-Path $backupDir 'build'
    if (Test-Path $backupBuild) { Copy-Item -Path $backupBuild -Destination $BaseDir -Recurse -Force }
    Write-Log "Restore from backup completed"
  } catch {
    Write-Log "Restore FAILED too, agent files may be in an inconsistent state: $_"
  }
}

Remove-Item -Path $ZipPath -Force -ErrorAction SilentlyContinue
if ($extracted) {
  Remove-Item -Path $backupDir -Recurse -Force -ErrorAction SilentlyContinue
}

# Relaunch through start-agent.vbs (bundled in the update zip, same as a
# fresh install) so the updated agent restarts hidden — running the .exe
# directly would flash a console window, since pkg builds a console
# subsystem executable. Always attempted, whether or not extraction above
# succeeded, so a failed update still comes back online (previous version)
# instead of staying down until someone walks up to the PC.
try {
  if (Test-Path $LauncherPath) {
    Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$LauncherPath`""
    Write-Log "Relaunched via $LauncherPath"
  } elseif (Test-Path $FinalExePath) {
    Start-Process -FilePath $FinalExePath
    Write-Log "Relaunched via $FinalExePath (no launcher found)"
  } else {
    Write-Log "FATAL: neither launcher nor exe found at $LauncherPath / $FinalExePath, could not relaunch"
  }
} catch {
  Write-Log "Relaunch FAILED: $_"
}

Remove-Item -Path $PSCommandPath -Force -ErrorAction SilentlyContinue
