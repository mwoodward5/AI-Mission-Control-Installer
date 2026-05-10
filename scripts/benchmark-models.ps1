param(
  [string]$Root = 'C:\AICommandCenter'
)

$ErrorActionPreference = 'Stop'

$outputsPath = Join-Path $Root 'outputs'
$modelsPath = Join-Path $Root 'models'
New-Item -ItemType Directory -Path $outputsPath, $modelsPath -Force | Out-Null

$auditFiles = Get-ChildItem -Path (Join-Path $Root 'logs') -Filter 'model-audit-*.json' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
$sourceFile = if ($auditFiles) { $auditFiles[0].FullName } else { Join-Path $modelsPath 'model-registry.json' }
if (-not (Test-Path $sourceFile)) {
  Write-Host "No model inventory found. Run check-models.ps1 first." -ForegroundColor Yellow
  exit 1
}

$inventory = Get-Content $sourceFile -Raw | ConvertFrom-Json
$rawModels = @()
if ($inventory.PSObject.Properties.Name -contains 'records') { $rawModels = $inventory.records } else { $rawModels = $inventory }
if (-not $rawModels -or $rawModels.Count -eq 0) {
  Write-Host "No local models available to benchmark." -ForegroundColor Yellow
  exit 0
}

$selected = @($rawModels | Select-Object -First 4)

$tests = [ordered]@{
  summarize_repo_structure = 'summarize repo structure in 5 bullets and list likely folders to inspect.'
  explain_package_json = 'explain package.json fields and likely script impact for a teammate.'
  find_build_command = 'find the most likely build command from package scripts and explain why.'
  write_react_component = 'write a tiny React component for a status light with three colors and text label.'
  analyze_error_log = 'analyze this error and suggest likely fix: Cannot find module react-dom/client.'
}

function scoreFromText([string]$text) {
  if (-not $text) { return 0 }
  $len = $text.Length
  return [Math]::Round([Math]::Min(5, [Math]::Max(1, $len / 90)))
}

function recommendModel([decimal]$speed, [decimal]$quality, [decimal]$coding, [decimal]$writing, [decimal]$usefulness, [decimal]$size) {
  if ($quality -ge 4 -and $coding -ge 4 -and $writing -ge 3 -and $speed -lt 3000) { return 'KEEP' }
  if ($quality -ge 3.2 -and $writing -ge 3 -and $speed -lt 5000) { return 'OPTIONAL KEEP' }
  if ($size -gt 22) { return 'ARCHIVE' }
  if ($quality -lt 2.2 -or $usefulness -lt 1.5) { return 'DELETE CANDIDATE' }
  return 'REPLACE WITH BETTER MODEL'
}

function runOllama([string]$name, [string]$prompt) {
  $uri = 'http://127.0.0.1:11434/api/generate'
  $payload = @{
    model = $name
    prompt = $prompt
    stream = $false
    options = @{ num_predict = 150 }
  } | ConvertTo-Json -Depth 6
  $start = Get-Date
  try {
    $resp = Invoke-RestMethod -Method POST -Uri $uri -Body $payload -ContentType 'application/json' -TimeoutSec 100
    $ms = [Math]::Max(1, [int]((Get-Date) - $start).TotalMilliseconds)
    return [ordered]@{
      latencyMs = $ms
      text = [string]$resp.response
      quality = scoreFromText ([string]$resp.response)
    }
  } catch {
    return [ordered]@{ latencyMs = 99999; text = "error"; quality = 0 }
  }
}

function runLmStudio([string]$name, [string]$prompt) {
  $uri = 'http://127.0.0.1:1234/v1/chat/completions'
  $payload = @{
    model = $name
    messages = @(@{ role = 'user'; content = $prompt })
    stream = $false
  } | ConvertTo-Json -Depth 10
  $start = Get-Date
  try {
    $resp = Invoke-RestMethod -Method POST -Uri $uri -Body $payload -ContentType 'application/json' -TimeoutSec 100
    $ms = [Math]::Max(1, [int]((Get-Date) - $start).TotalMilliseconds)
    $content = [string]$resp.choices[0].message.content
    return [ordered]@{
      latencyMs = $ms
      text = $content
      quality = scoreFromText $content
    }
  } catch {
    return [ordered]@{ latencyMs = 99999; text = "error"; quality = 0 }
  }
}

$rows = @()
foreach ($entry in $selected) {
  $name = [string]$entry.name
  $source = [string]$entry.source
  $size = if ($entry.sizeGB) { [decimal]$entry.sizeGB } else { 0 }

  $resultSet = @{}
  foreach ($kv in $tests.GetEnumerator()) {
    if ($source -eq 'Ollama') {
      $resultSet[$kv.Key] = runOllama $name $kv.Value
    } else {
      $resultSet[$kv.Key] = runLmStudio $name $kv.Value
    }
  }

  $values = @($resultSet.Values)
  $latencies = @()
  $qualities = @()
  foreach ($entry in $values) {
    if ($entry -is [System.Collections.IDictionary]) {
      if ($entry.Contains('latencyMs')) { $latencies += [int]$entry.latencyMs } else { $latencies += 99999 }
      if ($entry.Contains('quality')) { $qualities += [decimal]$entry.quality } else { $qualities += 0 }
    } else {
      $latencies += 99999
      $qualities += 0
    }
  }

  $speed = [Math]::Round((($latencies | Measure-Object -Average).Average), 0)
  $quality = [Math]::Round((($qualities | Measure-Object -Average).Average), 2)
  $codingAbility = [Math]::Round((($resultSet.write_react_component.quality + $resultSet.find_build_command.quality) / 2), 2)
  $writingAbility = [Math]::Round((($resultSet.explain_package_json.quality + $resultSet.analyze_error_log.quality) / 2), 2)
  $usefulness = [Math]::Round((($quality + (1000 / [Math]::Max(1, $speed))) / 2), 2)

  $rows += [ordered]@{
    model = $name
    source = $source
    tests = $resultSet
    sizeGB = $size
    speed = $speed
    quality = $quality
    codingAbility = $codingAbility
    writingAbility = $writingAbility
    usefulness = $usefulness
    recommendation = recommendModel $speed $quality $codingAbility $writingAbility $usefulness $size
  }
}

$outPathJson = Join-Path $outputsPath "model-benchmarks-$((Get-Date -Format 'yyyyMMdd-HHmmss')).json"
$out = [ordered]@{
  scannedAt = (Get-Date).ToString('o')
  models = $rows
}
$out | ConvertTo-Json -Depth 20 | Out-File -FilePath $outPathJson -Encoding utf8

$outPathMd = Join-Path $outputsPath 'MODEL-BENCHMARKS.md'
$md = @"
# AI Mission Center Model Benchmarks

Generated: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))
Evaluated models: $($rows.Count)

| model | source | speed (ms) | quality | coding | writing | usefulness | recommendation |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
$($rows | ForEach-Object {
  "| $($_.model) | $($_.source) | $($_.speed) | $($_.quality) | $($_.codingAbility) | $($_.writingAbility) | $($_.usefulness) | $($_.recommendation) |"
} -join "`n")

"@
Set-Content -Path $outPathMd -Value $md -Encoding utf8

Write-Host "Benchmark results written to $outPathJson"
Write-Host "Benchmark markdown written to $outPathMd"
Write-Output $out | ConvertTo-Json -Depth 8
