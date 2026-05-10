param(
  [string]$Root = 'C:\AICommandCenter',
  [int]$MaxModels = 2,
  [int]$RequestTimeoutSec = 25,
  [int]$PerModelBudgetMs = 60000,
  [switch]$FullSuite
)

$ErrorActionPreference = 'Stop'

$outputsPath = Join-Path $Root 'outputs'
$modelsPath = Join-Path $Root 'models'
New-Item -ItemType Directory -Path $outputsPath, $modelsPath -Force | Out-Null

$auditFiles = Get-ChildItem -Path (Join-Path $Root 'logs') -Filter 'model-audit-*.json' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending
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

$tests = [ordered]@{
  summarize_repo_structure = 'summarize repo structure in 5 bullets and list likely folders to inspect.'
  explain_package_json = 'explain package.json fields and likely script impact for a teammate.'
  find_build_command = 'find the most likely build command from package scripts and explain why.'
  write_react_component = 'write a tiny React component for a status light with three colors and text label.'
  analyze_error_log = 'analyze this error and suggest likely fix: Cannot find module react-dom/client.'
}
if (-not $FullSuite) {
  $keys = @('summarize_repo_structure', 'explain_package_json', 'find_build_command')
  $compactTests = [ordered]@{}
  foreach ($key in $keys) { $compactTests[$key] = $tests[$key] }
  $tests = $compactTests
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

function parseResponseText($response) {
  if ($null -eq $response) { return 'error' }
  if ($response.response) { return [string]$response.response }
  if ($response.choices -and $response.choices.Count -gt 0) {
    $first = $response.choices[0]
    if ($first.message -and $first.message.content) { return [string]$first.message.content }
    if ($first.text) { return [string]$first.text }
  }
  if ($response.reasoning_content) { return [string]$response.reasoning_content }
  if ($response.text) { return [string]$response.text }
  return 'error'
}

function runRequest([string]$uri, [string]$jsonBody, [int]$timeoutSec) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $resp = Invoke-RestMethod -Method POST -Uri $uri -Body $jsonBody -ContentType 'application/json' -TimeoutSec $timeoutSec
    $sw.Stop()
    return [ordered]@{
      ok = $true
      latencyMs = [Math]::Max(1, [int]$sw.ElapsedMilliseconds)
      response = $resp
      error = ''
    }
  } catch {
    $sw.Stop()
    return [ordered]@{
      ok = $false
      latencyMs = [Math]::Max(1, [int]$sw.ElapsedMilliseconds)
      response = $null
      error = $_.Exception.Message
    }
  }
}

function runOllama([string]$name, [string]$prompt) {
  $uri = 'http://127.0.0.1:11434/api/generate'
  $payload = @{
    model = $name
    prompt = $prompt
    stream = $false
    options = @{ num_predict = 150 }
  } | ConvertTo-Json -Depth 6
  return runRequest $uri $payload $RequestTimeoutSec
}

function runLmStudio([string]$name, [string]$prompt) {
  $uri = 'http://127.0.0.1:1234/v1/chat/completions'
  $payload = @{
    model = $name
    messages = @(@{ role = 'user'; content = $prompt })
    stream = $false
  } | ConvertTo-Json -Depth 10
  return runRequest $uri $payload $RequestTimeoutSec
}

function sourceAvailable([string]$source) {
  if ($source -eq 'LM Studio') {
    try {
      Invoke-RestMethod -Method GET -Uri 'http://127.0.0.1:1234/v1/models' -TimeoutSec 3 | Out-Null
      return $true
    } catch {
      return $false
    }
  }
  try {
    Invoke-RestMethod -Method GET -Uri 'http://127.0.0.1:11434/api/version' -TimeoutSec 3 | Out-Null
    return $true
  } catch {
    return $false
  }
}

$selected = @($rawModels | Select-Object -First $MaxModels)
$rows = @()
$warnings = [System.Collections.Generic.List[string]]::new()
$sourceAvailability = @{
  Ollama = sourceAvailable 'Ollama'
  'LM Studio' = sourceAvailable 'LM Studio'
}

foreach ($entry in $selected) {
  $name = [string]$entry.name
  $source = [string]$entry.source
  if (-not $sourceAvailability.ContainsKey($source)) {
    $source = if ($source -eq 'LM Studio') { 'LM Studio' } else { 'Ollama' }
  }

  if (-not $sourceAvailability[$source]) {
    $warnings.Add("Skipping ${name}: source '${source}' endpoint not reachable.")
    continue
  }

  $size = if ($entry.sizeGB) { [decimal]$entry.sizeGB } else { 0 }
  $resultSet = @{}
  $budget = $PerModelBudgetMs

  foreach ($kv in $tests.GetEnumerator()) {
    if ($budget -le 0) {
      $warnings.Add("Model budget reached for ${name}; stopping additional tests.")
      break
    }

    $runResult = if ($source -eq 'LM Studio') { runLmStudio $name $kv.Value } else { runOllama $name $kv.Value }
    $budget -= $runResult.latencyMs

    if (-not $runResult.ok -or $runResult.latencyMs -gt $RequestTimeoutSec * 1000) {
      $resultText = "error: $($runResult.error)"
      $resultSet[$kv.Key] = [ordered]@{
        latencyMs = $runResult.latencyMs
        text = $resultText
        quality = 0
      }
      continue
    }

    $text = parseResponseText $runResult.response
    $resultSet[$kv.Key] = [ordered]@{
      latencyMs = $runResult.latencyMs
      text = [string]$text
      quality = scoreFromText ([string]$text)
    }
  }

  if ($resultSet.Count -eq 0) { continue }

  $latencies = @()
  $qualities = @()
  foreach ($item in $resultSet.Values) {
    if ($null -ne $item.latencyMs) {
      $latencies += [int]$item.latencyMs
    } else {
      $latencies += 99999
    }
    if ($null -ne $item.quality) {
      $qualities += [decimal]$item.quality
    } else {
      $qualities += 0
    }
  }

  $speed = [Math]::Round((($latencies | Measure-Object -Average).Average), 0)
  $quality = [Math]::Round((($qualities | Measure-Object -Average).Average), 2)

  $codingAbility = 0
  $writingAbility = 0
  if ($resultSet.ContainsKey('write_react_component') -and $resultSet.ContainsKey('find_build_command')) {
    $codingAbility = [Math]::Round((($resultSet.write_react_component.quality + $resultSet.find_build_command.quality) / 2), 2)
  } elseif ($resultSet.Count -gt 0) {
    $codingAbility = $quality
  }
  if ($resultSet.ContainsKey('explain_package_json') -and $resultSet.ContainsKey('analyze_error_log')) {
    $writingAbility = [Math]::Round((($resultSet.explain_package_json.quality + $resultSet.analyze_error_log.quality) / 2), 2)
  } elseif ($resultSet.Count -gt 0) {
    $writingAbility = $quality
  }

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
$outPathMd = Join-Path $outputsPath 'MODEL-BENCHMARKS.md'
$out = [ordered]@{
  scannedAt = (Get-Date).ToString('o')
  models = $rows
  warnings = @($warnings)
}

if ($warnings.Count -gt 0) {
  $warningText = "`n## Warnings`n" + (($warnings | ForEach-Object { "- $_" }) -join "`n")
} else {
  $warningText = ''
}

try {
  $out | ConvertTo-Json -Depth 20 | Out-File -FilePath $outPathJson -Encoding utf8
  $md = @"
# AI Mission Center Model Benchmarks

Generated: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))
Evaluated models: $($rows.Count)

| model | source | speed (ms) | quality | coding | writing | usefulness | recommendation |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
$(( $rows | ForEach-Object {
  "| $($_.model) | $($_.source) | $($_.speed) | $($_.quality) | $($_.codingAbility) | $($_.writingAbility) | $($_.usefulness) | $($_.recommendation) |"
} ) -join "`n")
$warningText
"@
  Set-Content -Path $outPathMd -Value $md -Encoding utf8

  Write-Host "Benchmark results written to $outPathJson"
  Write-Host "Benchmark markdown written to $outPathMd"
  Write-Output $out | ConvertTo-Json -Depth 8
} catch {
  Write-Host "Failed to write benchmark output: $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Output $out | ConvertTo-Json -Depth 8
  exit 1
}
