param(
  [string]$PlaylistPath = '',
  [int]$SlideIntervalMs = 10000,
  [string]$Message = 'SimRacing Manager',
  [string]$ResultsHtmlPath = '',
  [int]$MonitorIndex = 1
)

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName System.Windows.Forms

# The WPF WebBrowser control hosts the legacy IE engine and defaults to
# IE7 quirks mode unless the host process is opted into a modern document
# mode. This makes the results screen (flexbox, gradients, vw units)
# render correctly instead of falling back to unstyled text.
try {
  $hostExe = [System.IO.Path]::GetFileName([System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName)
  $regPath = 'HKCU:\Software\Microsoft\Internet Explorer\Main\FeatureControl\FEATURE_BROWSER_EMULATION'
  if (-not (Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
  }
  New-ItemProperty -Path $regPath -Name $hostExe -Value 11001 -PropertyType DWord -Force | Out-Null
} catch {
  Write-Warning "Failed to set IE emulation mode for results screen: $_"
}

$playlist = @()
if ($PlaylistPath -and (Test-Path $PlaylistPath)) {
  try {
    $json = Get-Content $PlaylistPath -Raw -ErrorAction Stop
    $playlist = $json | ConvertFrom-Json -ErrorAction Stop
  } catch {
    Write-Warning "Failed to read/parse playlist from $PlaylistPath : $_"
  }
}

# Normalize playlist items
$items = @()
foreach ($item in $playlist) {
  if ($item -is [string]) {
    $ext = [System.IO.Path]::GetExtension($item).ToLower()
    $type = if ($ext -in @('.mp4', '.webm')) { 'video' } else { 'image' }
    $items += @{ Path = $item; Type = $type }
  } elseif ($item.path) {
    $items += @{ Path = $item.path; Type = $item.type }
  }
}

$window = New-Object System.Windows.Window
$window.Title = 'SimRacingBlanking'
$window.WindowStyle = 'None'
$window.ResizeMode = 'NoResize'
$window.WindowState = 'Maximized'
$window.WindowStartupLocation = 'Manual'
$window.Topmost = $true
$window.ShowInTaskbar = $false
$window.Background = 'Black'
$window.Cursor = [System.Windows.Input.Cursors]::None

$screens = [System.Windows.Forms.Screen]::AllScreens
$targetScreen = if ($MonitorIndex -gt 0 -and $MonitorIndex -le $screens.Count) {
  $screens[$MonitorIndex - 1]
} else {
  $screens[0]
}
$window.Left = $targetScreen.Bounds.Left
$window.Top = $targetScreen.Bounds.Top

$grid = New-Object System.Windows.Controls.Grid
$window.Content = $grid

$videoPlayer = New-Object System.Windows.Controls.MediaElement
$videoPlayer.Stretch = 'UniformToFill'
$videoPlayer.IsMuted = $true
$videoPlayer.Visibility = 'Collapsed'
$videoPlayer.LoadedBehavior = 'Manual'
$videoPlayer.UnloadedBehavior = 'Close'
[void]$grid.Children.Add($videoPlayer)

$imagePlayer = New-Object System.Windows.Controls.Image
$imagePlayer.Stretch = 'UniformToFill'
$imagePlayer.Visibility = 'Collapsed'
[void]$grid.Children.Add($imagePlayer)

$webBrowser = $null
if ($ResultsHtmlPath -and (Test-Path $ResultsHtmlPath)) {
  $webBrowser = New-Object System.Windows.Controls.WebBrowser
  $webBrowser.HorizontalAlignment = 'Stretch'
  $webBrowser.VerticalAlignment = 'Stretch'
  [void]$grid.Children.Add($webBrowser)
}

if (-not $webBrowser -and $items.Count -eq 0 -and $Message -and $Message -ne '') {
  $label = New-Object System.Windows.Controls.Label
  $label.Content = $Message
  $label.Foreground = 'Gray'
  $label.FontSize = 16
  $label.HorizontalAlignment = 'Center'
  $label.VerticalAlignment = 'Bottom'
  $label.Margin = '0,0,0,40'
  [void]$grid.Children.Add($label)
}

$currentIndex = 0
$timer = $null

function Show-CurrentSlide {
  param([switch]$SkipAnimation)

  if ($items.Count -eq 0) { return }

  $item = $items[$currentIndex]
  $previousVisual = if ($videoPlayer.Visibility -eq 'Visible') { $videoPlayer } else { $imagePlayer }

  if ($item.Type -eq 'video') {
    $nextVisual = $videoPlayer
    try {
      $videoPlayer.Source = [System.Uri]::new($item.Path)
      $videoPlayer.Visibility = 'Visible'
      $imagePlayer.Visibility = 'Collapsed'
      $videoPlayer.Play()
    } catch {
      Write-Warning "Failed to load video $($item.Path): $_"
    }
  } else {
    $nextVisual = $imagePlayer
    try {
      $bitmap = New-Object System.Windows.Media.Imaging.BitmapImage
      $bitmap.BeginInit()
      $bitmap.UriSource = [System.Uri]::new($item.Path)
      $bitmap.CacheOption = 'OnLoad'
      $bitmap.EndInit()
      if ($bitmap.IsFrozen -eq $false) { $bitmap.Freeze() | Out-Null }
      $imagePlayer.Source = $bitmap
      $imagePlayer.Visibility = 'Visible'
      $videoPlayer.Visibility = 'Collapsed'
      $videoPlayer.Stop()
    } catch {
      Write-Warning "Failed to load image $($item.Path): $_"
    }
  }

  if (-not $SkipAnimation -and $previousVisual -ne $nextVisual) {
    $fadeIn = New-Object System.Windows.Media.Animation.DoubleAnimation(0.0, 1.0, [System.TimeSpan]::FromMilliseconds(500))
    $nextVisual.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $fadeIn)
  }

  if ($item.Type -eq 'image') {
    if ($timer -eq $null) {
      $timer = New-Object System.Windows.Threading.DispatcherTimer
      $timer.Interval = [System.TimeSpan]::FromMilliseconds($SlideIntervalMs)
      $timer.Add_Tick({
        $script:currentIndex = ($script:currentIndex + 1) % $items.Count
        Show-CurrentSlide
      })
    }
    $timer.Stop()
    $timer.Start()
  } else {
    if ($timer -ne $null) { $timer.Stop() }
  }
}

$videoPlayer.Add_MediaFailed({
  $errorMessage = $_.Exception
  if (-not $errorMessage -and $args.Count -gt 1) {
    $errorMessage = $args[1].ErrorException
  }
  Write-Warning "Video playback failed for $($items[$script:currentIndex].Path): $errorMessage"
  $script:currentIndex = ($script:currentIndex + 1) % $items.Count
  Show-CurrentSlide
})

$videoPlayer.Add_MediaEnded({
  if ($items.Count -eq 1) {
    $videoPlayer.Position = [System.TimeSpan]::Zero
    $videoPlayer.Play()
  } else {
    $script:currentIndex = ($script:currentIndex + 1) % $items.Count
    Show-CurrentSlide
  }
})

$window.Add_KeyDown({
  if ($_.Key -eq 'Escape') {
    Write-Host 'Escape pressed, closing blanking screen'
    $window.Close()
  }
})

$window.Add_Closed({
  if ($timer -ne $null) { $timer.Stop() }
  $videoPlayer.Stop()
  $videoPlayer.Close()
})

$window.Add_Loaded({
  $this.Topmost = $true
  $this.Activate() | Out-Null
  if ($webBrowser -ne $null) {
    $webBrowser.Navigate([System.Uri]::new($ResultsHtmlPath))
  } elseif ($items.Count -gt 0) {
    Show-CurrentSlide -SkipAnimation
  }
})

[void]$window.ShowDialog()
