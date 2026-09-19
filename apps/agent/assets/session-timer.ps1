param([int]$DurationSeconds = 0)
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
$x = New-Object Windows.Window
$x.WindowStyle = 'None'; $x.ResizeMode = 'NoResize'; $x.Topmost = $true
$x.ShowInTaskbar = $false; $x.Background = [Windows.Media.Brushes]::Transparent
$x.Width = 190; $x.Height = 74; $x.Left = [System.Windows.SystemParameters]::PrimaryScreenWidth * 0.75; $x.Top = 24
$x.AllowsTransparency = $true
$b = New-Object Windows.Controls.Border; $b.CornerRadius = New-Object Windows.CornerRadius(8)
$b.Background = New-Object Windows.Media.SolidColorBrush([Windows.Media.Color]::FromArgb(220,12,16,28)); $b.BorderBrush = New-Object Windows.Media.SolidColorBrush([Windows.Media.Color]::FromArgb(230,40,150,255)); $b.BorderThickness = New-Object Windows.Thickness(1)
$t = New-Object Windows.Controls.TextBlock; $t.Foreground = [Windows.Media.Brushes]::White; $t.FontSize = 27; $t.FontWeight = 'Bold'; $t.HorizontalAlignment = 'Center'; $t.VerticalAlignment = 'Center'
$b.Child = $t; $x.Content = $b
$timer = New-Object Windows.Threading.DispatcherTimer; $timer.Interval = [TimeSpan]::FromSeconds(1)
$end = [DateTimeOffset]::Now.ToUnixTimeSeconds() + $DurationSeconds
$timer.Add_Tick({ $left = [Math]::Max(0, $end - [DateTimeOffset]::Now.ToUnixTimeSeconds()); $t.Text = '{0:00}:{1:00}' -f [Math]::Floor($left / 60), ($left % 60); if ($left -le 0) { $timer.Stop(); $x.Close() } })
$x.Add_Loaded({ $timer.Start() }); $x.ShowDialog() | Out-Null
