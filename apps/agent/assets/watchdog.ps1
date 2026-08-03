param(
  [string]$ExePath,
  [string]$LauncherPath
)

# Independent supervisor process: watches for the agent process disappearing
# unexpectedly (crash, or a failed update that even Updater's own relaunch
# step couldn't recover from) and relaunches it. Deliberately separate from
# the agent itself — if the agent process is the thing that died, it can't
# be the one noticing. Stopped explicitly by WatchdogManager (via its own
# PID, see watchdogManager.ts) on a deliberate quit/update, not by a flag
# file, so there's no window where a legitimate shutdown races a check here.
$exeName = [System.IO.Path]::GetFileNameWithoutExtension($ExePath)
$logPath = Join-Path (Split-Path $ExePath -Parent) 'watchdog.log'

function Write-Log($msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Add-Content -Path $logPath -Value $line -ErrorAction SilentlyContinue
}

Write-Log "Watchdog started, watching for process '$exeName'"

while ($true) {
  Start-Sleep -Seconds 20

  if (Get-Process -Name $exeName -ErrorAction SilentlyContinue) {
    continue
  }

  # Grace period before concluding it's actually gone: an in-progress
  # update or manual restart briefly leaves no process running too.
  Start-Sleep -Seconds 15
  if (Get-Process -Name $exeName -ErrorAction SilentlyContinue) {
    continue
  }

  Write-Log "Agent process not found after grace period, relaunching"
  try {
    if (Test-Path $LauncherPath) {
      Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$LauncherPath`""
      Write-Log "Relaunched via $LauncherPath"
    } elseif (Test-Path $ExePath) {
      Start-Process -FilePath $ExePath
      Write-Log "Relaunched via $ExePath (no launcher found)"
    } else {
      Write-Log "Neither launcher nor exe found, cannot relaunch"
    }
  } catch {
    Write-Log "Relaunch FAILED: $_"
  }
}
