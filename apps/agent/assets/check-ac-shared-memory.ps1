$results = @{}
foreach ($name in @('acpmf_physics', 'acpmf_graphics', 'acpmf_static')) {
  try {
    $mmf = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting("Local\$name")
    $mmf.Dispose()
    $results[$name] = $true
  } catch {
    $results[$name] = $false
  }
}

# A mapping merely existing isn't proof AC is actually running: if AC
# crashed without releasing it (or something else kept a handle open), it
# stays mapped forever with frozen contents. packetId is the first 4 bytes
# of acpmf_graphics and increments every physics tick whenever AC is truly
# alive (menus included) — reading it twice, a beat apart, tells a live
# mapping from a stale one.
$fresh = $false
if ($results['acpmf_graphics']) {
  try {
    $mmf = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting('Local\acpmf_graphics')
    $accessor = $mmf.CreateViewAccessor(0, 4)
    $first = $accessor.ReadInt32(0)
    Start-Sleep -Milliseconds 200
    $second = $accessor.ReadInt32(0)
    $fresh = ($first -ne $second)
    $accessor.Dispose()
    $mmf.Dispose()
  } catch {
    $fresh = $false
  }
}
$results['fresh'] = $fresh

$results | ConvertTo-Json -Compress
