param(
  [ValidateSet('Enter', 'Foreground', 'Exit')]
  [string]$Action = 'Enter',
  [string]$GameProcessName = 'acs',
  [string]$SkipTitle = 'SimRacingBlanking',
  [int]$ForegroundTimeoutMs = 20000
)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public class SimRacingKiosk {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

  [DllImport("kernel32.dll")]
  public static extern uint GetCurrentThreadId();
}
'@

# Windows ShowWindow constants
$SW_HIDE = 0
$SW_SHOW = 5
$SW_RESTORE = 9
$SW_FORCEMINIMIZE = 11

function Get-TaskbarHandles {
  $handles = New-Object System.Collections.Generic.List[IntPtr]
  $main = [SimRacingKiosk]::FindWindow('Shell_TrayWnd', $null)
  if ($main -ne [IntPtr]::Zero) { $handles.Add($main) }

  # Secondary taskbars (one per extra monitor) all share the same class,
  # so FindWindow (which only returns the first match) isn't enough.
  $callback = {
    param($hWnd, $lParam)
    $sb = New-Object System.Text.StringBuilder 256
    [SimRacingKiosk]::GetClassName($hWnd, $sb, $sb.Capacity) | Out-Null
    if ($sb.ToString() -eq 'Shell_SecondaryTrayWnd') {
      $handles.Add($hWnd)
    }
    return $true
  }
  [SimRacingKiosk]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
  return $handles
}

function Hide-Taskbar {
  foreach ($h in Get-TaskbarHandles) {
    [SimRacingKiosk]::ShowWindow($h, $SW_HIDE) | Out-Null
  }
}

function Show-Taskbar {
  foreach ($h in Get-TaskbarHandles) {
    [SimRacingKiosk]::ShowWindow($h, $SW_SHOW) | Out-Null
  }
}

function Minimize-OtherWindows {
  param([string]$SkipTitle, [string]$GameProcessName)

  # The game's own window must never be touched here: it may already exist
  # (e.g. on its loading screen) at this point, and force-minimizing a
  # fullscreen game window can disrupt its rendering/telemetry state even
  # if Set-GameForeground restores it moments later.
  $gamePids = @(Get-Process -Name $GameProcessName -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })

  $skippedClasses = @('Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Progman', 'WorkerW')
  $callback = {
    param($hWnd, $lParam)
    if (-not [SimRacingKiosk]::IsWindowVisible($hWnd)) { return $true }

    $classSb = New-Object System.Text.StringBuilder 256
    [SimRacingKiosk]::GetClassName($hWnd, $classSb, $classSb.Capacity) | Out-Null
    if ($skippedClasses -contains $classSb.ToString()) { return $true }

    [uint32]$procId = 0
    [SimRacingKiosk]::GetWindowThreadProcessId($hWnd, [ref]$procId) | Out-Null
    if ($gamePids -contains [int]$procId) { return $true }

    $titleSb = New-Object System.Text.StringBuilder 256
    [SimRacingKiosk]::GetWindowText($hWnd, $titleSb, $titleSb.Capacity) | Out-Null
    $title = $titleSb.ToString()
    # Skip our own blanking window and untitled/system helper windows.
    if ($title -eq '' -or $title -eq $SkipTitle) { return $true }

    [SimRacingKiosk]::ShowWindow($hWnd, $SW_FORCEMINIMIZE) | Out-Null
    return $true
  }
  [SimRacingKiosk]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
}

function Force-SetForeground {
  param([IntPtr]$TargetHwnd)

  # Plain SetForegroundWindow routinely gets silently denied by Windows when
  # the calling process isn't itself the current foreground process and
  # hasn't processed recent user input (the exact situation for a background
  # PowerShell script) — this was the actual cause of a ~1 minute stall
  # bringing the game up after every launch: the window existed and was
  # already loaded well before that, SetForegroundWindow was being called
  # every 300ms, it just kept failing. The standard, documented workaround
  # is to attach this thread's input queue to both the current foreground
  # window's thread and the target window's thread before calling it — that
  # makes Windows treat the request as if it came from the already-focused
  # thread, which it always allows.
  $dummyPid = 0
  $currentThreadId = [SimRacingKiosk]::GetCurrentThreadId()
  $fgHwnd = [SimRacingKiosk]::GetForegroundWindow()
  $fgThreadId = [SimRacingKiosk]::GetWindowThreadProcessId($fgHwnd, [ref]$dummyPid)
  $targetThreadId = [SimRacingKiosk]::GetWindowThreadProcessId($TargetHwnd, [ref]$dummyPid)

  $attachedFg = $false
  $attachedTarget = $false
  if ($fgThreadId -ne 0 -and $fgThreadId -ne $currentThreadId) {
    $attachedFg = [SimRacingKiosk]::AttachThreadInput($currentThreadId, $fgThreadId, $true)
  }
  if ($targetThreadId -ne 0 -and $targetThreadId -ne $currentThreadId -and $targetThreadId -ne $fgThreadId) {
    $attachedTarget = [SimRacingKiosk]::AttachThreadInput($currentThreadId, $targetThreadId, $true)
  }

  try {
    [SimRacingKiosk]::ShowWindow($TargetHwnd, $SW_RESTORE) | Out-Null
    [SimRacingKiosk]::SetForegroundWindow($TargetHwnd) | Out-Null
    return [SimRacingKiosk]::GetForegroundWindow() -eq $TargetHwnd
  } finally {
    if ($attachedFg) { [SimRacingKiosk]::AttachThreadInput($currentThreadId, $fgThreadId, $false) | Out-Null }
    if ($attachedTarget) { [SimRacingKiosk]::AttachThreadInput($currentThreadId, $targetThreadId, $false) | Out-Null }
  }
}

function Set-GameForeground {
  param([string]$ProcessName, [int]$TimeoutMs)

  # Returns $true only once the game window is actually confirmed as the
  # foreground window (GetForegroundWindow), not just once SetForegroundWindow
  # was called — that call can silently fail even when the window handle is
  # valid (see Force-SetForeground), so the caller must not take "we asked"
  # as proof it worked. Keeps retrying both finding the window and
  # re-asserting foreground within the same timeout budget.
  $elapsed = 0
  $intervalMs = 300
  while ($elapsed -lt $TimeoutMs) {
    $proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
      Select-Object -First 1
    if ($proc -and (Force-SetForeground -TargetHwnd $proc.MainWindowHandle)) {
      return $true
    }
    Start-Sleep -Milliseconds $intervalMs
    $elapsed += $intervalMs
  }
  Write-Warning "Game process '$ProcessName' window not confirmed in foreground within timeout, giving up"
  return $false
}

switch ($Action) {
  'Enter' {
    # Deliberately does NOT bring the game to the foreground here: the
    # blanking screen (topmost) must stay the visible thing on top of it
    # for the configured grace period. Foreground is requested separately
    # (Action 'Foreground') once the agent actually hides blanking.
    Hide-Taskbar
    Minimize-OtherWindows -SkipTitle $SkipTitle -GameProcessName $GameProcessName
  }
  'Foreground' {
    # Re-sweep right before revealing, not just once at session start: a
    # crash dialog, an updater popup, Content Manager reappearing, etc. can
    # all show up after 'Enter' ran and would otherwise flash on screen the
    # instant blanking drops, since the caller only removes blanking once
    # this whole action reports success (see BlankingManager.revealThenStop).
    Minimize-OtherWindows -SkipTitle $SkipTitle -GameProcessName $GameProcessName
    $ok = Set-GameForeground -ProcessName $GameProcessName -TimeoutMs $ForegroundTimeoutMs
    if (-not $ok) { exit 1 }
  }
  'Exit' {
    Show-Taskbar
  }
}
