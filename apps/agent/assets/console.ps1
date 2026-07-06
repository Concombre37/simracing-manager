param(
  [string]$StatusJsonPath = '',
  [string]$FlagDir = '',
  [string]$Version = ''
)

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName System.Windows.Forms

# Same IE11 document-mode fix as blanking.ps1: without it the WPF
# WebBrowser control renders this page in IE7 quirks mode (no flexbox, no
# gradients).
try {
  $hostExe = [System.IO.Path]::GetFileName([System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName)
  $regPath = 'HKCU:\Software\Microsoft\Internet Explorer\Main\FeatureControl\FEATURE_BROWSER_EMULATION'
  if (-not (Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
  }
  New-ItemProperty -Path $regPath -Name $hostExe -Value 11001 -PropertyType DWord -Force | Out-Null
} catch {
  Write-Warning "Failed to set IE emulation mode for console: $_"
}

function Get-LevelColor([string]$level) {
  switch ($level.ToUpper()) {
    'ERROR' { return '#ff6b6b' }
    'FATAL' { return '#ff6b6b' }
    'WARN'  { return '#ffc93c' }
    'DEBUG' { return '#55555f' }
    default { return '#c7c7d1' }
  }
}

function Build-Html($status) {
  $stationName = if ($status) { $status.stationName } else { $null }
  $stationId = if ($status) { $status.stationId } else { $null }
  $version = if ($status -and $status.version) { $status.version } else { $Version }
  $connected = [bool]($status -and $status.connected)
  $acRunning = [bool]($status -and $status.acRunning)
  $blankingActive = [bool]($status -and $status.blankingActive)
  $logs = if ($status -and $status.logs) { @($status.logs) } else { @() }

  $connectedLed = if ($connected) { 'led-green' } else { 'led-gray' }
  $connectedLabel = if ($connected) { 'Connecté au serveur' } else { 'Déconnecté' }
  $acLed = if ($acRunning) { 'led-green' } else { 'led-gray' }
  $acLabel = if ($acRunning) { 'Assetto Corsa en cours' } else { 'Assetto Corsa arrêté' }
  $blankingLed = if ($blankingActive) { 'led-amber' } else { 'led-gray' }
  $blankingLabel = if ($blankingActive) { "Écran d'attente actif" } else { "Écran d'attente masqué" }

  $logLines = ''
  foreach ($line in ($logs | Select-Object -Last 100)) {
    $escaped = [System.Net.WebUtility]::HtmlEncode([string]$line)
    $level = 'INFO'
    if ($escaped -match '\]\s+(\w+)\s') { $level = $matches[1] }
    $color = Get-LevelColor $level
    $logLines += "<div class='log-line' style='color:$color'>$escaped</div>"
  }
  if (-not $logLines) {
    $logLines = "<div class='log-line log-empty'>En attente d'activité…</div>"
  }

  $stationLabel = if ($stationName) { "$stationName ($stationId)" } else { 'En attente de connexion…' }

  return @"
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    background: #050508;
    color: #fff;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    display: flex;
    flex-direction: column;
  }
  header {
    padding: 18px 20px 14px;
    border-bottom: 1px solid #1a1a25;
    background: linear-gradient(180deg, rgba(255,107,53,0.10), transparent);
  }
  header h1 {
    margin: 0;
    font-size: 17px;
    font-weight: 800;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  header .subtitle {
    margin-top: 2px;
    font-size: 12px;
    color: #8a8a96;
  }
  section { padding: 14px 20px; }
  section.status { border-bottom: 1px solid #1a1a25; }
  .status-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    font-size: 13px;
  }
  .led {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .led-green { background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.7); }
  .led-amber { background: #ffc93c; box-shadow: 0 0 8px rgba(255,201,60,0.7); }
  .led-gray  { background: #34344a; }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  a.btn {
    display: inline-block;
    padding: 9px 14px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    text-decoration: none;
    border: 1px solid #252536;
    background: #12121a;
    color: #e5e5ea;
  }
  a.btn.warning { border-color: rgba(255,107,53,0.5); color: #ff6b35; }
  a.btn.danger { border-color: rgba(255,51,51,0.5); color: #ff3333; }
  section.logs {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .logs h2 {
    margin: 0 0 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #8a8a96;
  }
  .log-panel {
    flex: 1;
    overflow-y: auto;
    background: #0a0a0f;
    border: 1px solid #1a1a25;
    border-radius: 8px;
    padding: 8px 10px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 11px;
  }
  .log-line { white-space: pre-wrap; word-break: break-word; padding: 1px 0; }
  .log-empty { color: #55555f; }
  footer {
    padding: 8px 20px;
    font-size: 10px;
    color: #55555f;
    border-top: 1px solid #1a1a25;
  }
</style>
</head>
<body>
  <header>
    <h1>SimRacing Manager</h1>
    <div class="subtitle">$([System.Net.WebUtility]::HtmlEncode($stationLabel)) &middot; agent v$version</div>
  </header>
  <section class="status">
    <div class="status-row"><span class="led $connectedLed"></span>$connectedLabel</div>
    <div class="status-row"><span class="led $acLed"></span>$acLabel</div>
    <div class="status-row"><span class="led $blankingLed"></span>$blankingLabel</div>
  </section>
  <section class="status">
    <div class="actions">
      <a class="btn" href="app://toggle-blanking">Masquer / afficher l'écran d'attente</a>
      <a class="btn" href="app://sync-content">Synchroniser le contenu</a>
      <a class="btn" href="app://check-update">Vérifier les mises à jour</a>
      <a class="btn warning" href="app://restart-agent">Redémarrer l'agent</a>
      <a class="btn danger" href="app://quit">Quitter l'agent</a>
    </div>
  </section>
  <section class="logs">
    <h2>Activité récente</h2>
    <div class="log-panel" id="logPanel">$logLines</div>
  </section>
  <footer>SimRacing Manager Agent</footer>
  <script>
    var panel = document.getElementById('logPanel');
    if (panel) { panel.scrollTop = panel.scrollHeight; }
  </script>
</body>
</html>
"@
}

$window = New-Object System.Windows.Window
$window.Title = 'SimRacing Manager — Console'
$window.Width = 560
$window.Height = 720
$window.MinWidth = 420
$window.MinHeight = 480
$window.WindowStartupLocation = 'CenterScreen'
$window.Background = [System.Windows.Media.Brushes]::Black
$window.ShowInTaskbar = $true
$window.Topmost = $false

$webBrowser = New-Object System.Windows.Controls.WebBrowser
$window.Content = $webBrowser

$tmpDir = Split-Path -Path $StatusJsonPath -Parent
if (-not $tmpDir) { $tmpDir = $env:TEMP }
$consoleHtmlPath = Join-Path $tmpDir 'console.html'

function Read-Status {
  if ($StatusJsonPath -and (Test-Path $StatusJsonPath)) {
    try {
      $raw = Get-Content -Path $StatusJsonPath -Raw -ErrorAction Stop
      return $raw | ConvertFrom-Json -ErrorAction Stop
    } catch {
      return $null
    }
  }
  return $null
}

function Render-Console {
  $status = Read-Status
  $html = Build-Html $status
  Set-Content -Path $consoleHtmlPath -Value $html -Encoding UTF8
  $webBrowser.Navigate([System.Uri]::new($consoleHtmlPath))
}

$webBrowser.Add_Navigating({
  param($sender, $e)
  $uri = $e.Uri
  if ($uri -and $uri.Scheme -eq 'app') {
    $e.Cancel = $true
    $action = $uri.Host
    if ($action -and $FlagDir) {
      try {
        New-Item -ItemType Directory -Path $FlagDir -Force -ErrorAction SilentlyContinue | Out-Null
        New-Item -ItemType File -Path (Join-Path $FlagDir "$action.flag") -Force | Out-Null
      } catch {
        Write-Warning "Failed to write flag for action '$action': $_"
      }
    }
  }
})

$window.Add_Loaded({ Render-Console })

$script:lastStatusWriteTime = [DateTime]::MinValue
$pollTimer = New-Object System.Windows.Threading.DispatcherTimer
$pollTimer.Interval = [System.TimeSpan]::FromMilliseconds(1000)
$pollTimer.Add_Tick({
  try {
    if ($StatusJsonPath -and (Test-Path $StatusJsonPath)) {
      $writeTime = [System.IO.File]::GetLastWriteTimeUtc($StatusJsonPath)
      if ($writeTime -ne $script:lastStatusWriteTime) {
        $script:lastStatusWriteTime = $writeTime
        Render-Console
      }
    }
  } catch {
    Write-Warning "Failed to poll console status: $_"
  }
})
$pollTimer.Start()
$window.Add_Closed({ $pollTimer.Stop() })

[void]$window.ShowDialog()
