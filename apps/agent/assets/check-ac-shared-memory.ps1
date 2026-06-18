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
$results | ConvertTo-Json -Compress
