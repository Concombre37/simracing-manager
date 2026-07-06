param(
  [ValidateSet('Enter', 'Exit')]
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

function Set-GameForeground {
  param([string]$ProcessName, [int]$TimeoutMs)

  $elapsed = 0
  $intervalMs = 500
  while ($elapsed -lt $TimeoutMs) {
    $proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
      Select-Object -First 1
    if ($proc) {
      [SimRacingKiosk]::ShowWindow($proc.MainWindowHandle, $SW_RESTORE) | Out-Null
      [SimRacingKiosk]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
      return
    }
    Start-Sleep -Milliseconds $intervalMs
    $elapsed += $intervalMs
  }
  Write-Warning "Game process '$ProcessName' window not found within timeout, giving up"
}

switch ($Action) {
  'Enter' {
    Hide-Taskbar
    Minimize-OtherWindows -SkipTitle $SkipTitle -GameProcessName $GameProcessName
    Set-GameForeground -ProcessName $GameProcessName -TimeoutMs $ForegroundTimeoutMs
  }
  'Exit' {
    Show-Taskbar
  }
}
