param(
  [string]$Version = '',
  [string]$FlagDir = '',
  [string]$ConsoleScriptPath = '',
  [string]$StatusJsonPath = ''
)

Add-Type -AssemblyName System.Windows.Forms

$quitFlag = Join-Path $FlagDir 'quit.flag'
$toggleBlankingFlag = Join-Path $FlagDir 'toggle-blanking.flag'

$script:consoleProcess = $null
function Open-Console {
  if (-not $ConsoleScriptPath -or -not (Test-Path $ConsoleScriptPath)) { return }
  if ($script:consoleProcess -and -not $script:consoleProcess.HasExited) {
    return
  }
  $script:consoleProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-WindowStyle', 'Hidden',
    '-ExecutionPolicy', 'Bypass',
    '-File', "`"$ConsoleScriptPath`"",
    '-StatusJsonPath', "`"$StatusJsonPath`"",
    '-FlagDir', "`"$FlagDir`"",
    '-Version', $Version
  ) -WindowStyle Hidden -PassThru
}

$icon = New-Object System.Windows.Forms.NotifyIcon
$icon.Text = "SimRacing Manager Agent v$Version"
$icon.Icon = [System.Drawing.SystemIcons]::Application
$icon.Visible = $true
$icon.Add_DoubleClick({ Open-Console })

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$title = $menu.Items.Add("SimRacing Manager Agent v$Version")
$title.Enabled = $false
[void]$menu.Items.Add('-')

$consoleItem = $menu.Items.Add('Ouvrir la console')
$consoleItem.Add_Click({ Open-Console })

$blankingItem = $menu.Items.Add("Masquer / afficher l'écran d'attente")
$blankingItem.Add_Click({
  New-Item -ItemType File -Path $toggleBlankingFlag -Force | Out-Null
})

$quitItem = $menu.Items.Add('Quitter')
$quitItem.Add_Click({
  New-Item -ItemType File -Path $quitFlag -Force | Out-Null
})

$icon.ContextMenuStrip = $menu

# Keep the tray process alive until the quit flag is created.
$startTime = Get-Date
while ($icon.Visible) {
  if (Test-Path $quitFlag) {
    $icon.Visible = $false
    $icon.Dispose()
    break
  }
  Start-Sleep -Milliseconds 500
}
