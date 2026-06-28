param(
  [string]$Version = '',
  [string]$FlagDir = ''
)

Add-Type -AssemblyName System.Windows.Forms

$quitFlag = Join-Path $FlagDir 'quit.flag'
$toggleBlankingFlag = Join-Path $FlagDir 'toggle-blanking.flag'

$icon = New-Object System.Windows.Forms.NotifyIcon
$icon.Text = "SimRacing Manager Agent v$Version"
$icon.Icon = [System.Drawing.SystemIcons]::Application
$icon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$title = $menu.Items.Add("SimRacing Manager Agent v$Version")
$title.Enabled = $false
[void]$menu.Items.Add('-')

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
