param(
  [string]$Root = 'C:\AICommandCenter'
)

$ErrorActionPreference = 'Stop'

$logsPath = Join-Path $Root 'logs'
$outputsPath = Join-Path $Root 'outputs'
$modelsPath = Join-Path $Root 'models'
New-Item -ItemType Directory -Path $logsPath, $outputsPath, $modelsPath -Force | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $logsPath "model-audit-$timestamp.json"
$registryPath = Join-Path $modelsPath 'model-registry.json'
$planPath = Join-Path $outputsPath 'MODEL-CLEANUP-PLAN.md'

function normalizeName([string]$name) {
  return ($name -split ':')[0].Trim().ToLowerInvariant()
}

function sizeToGB([object]$sizeBytes) {
  if (-not $sizeBytes) { return $null }
  return [Math]::Round(([decimal]$sizeBytes) / 1GB, 2)
}

function detectModelSizeBytes([object]$entry) {
  if ($null -ne $entry.size) { return [int64]$entry.size }
  if ($null -ne $entry.size_bytes) { return [int64]$entry.size_bytes }
  if ($entry.size -is [string]) {
    $raw = $entry.size -replace '[^0-9.]', ''
    if ($raw) { return [int64]($raw * 1GB) }
  }
  return $null
}

function classifyModel([string]$name, [decimal]$sizeGB, [int]$count) {
  if ($count -gt 1) {
    return @('REPLACE WITH BETTER MODEL', 'Multiple installed variants detected. Keep only the best-needed one after benchmarking.')
  }

  if ($name -match 'qwen|llama|deepseek|kimi|glm|gemma') {
    if ($sizeGB -gt 30) {
      return @('ARCHIVE', 'Good model family but currently large for this machine profile.')
    }
    if ($name -match 'tiny|mini|1b|2b|3b') {
      return @('OPTIONAL KEEP', 'Useful fallback model for tiny tasks.')
    }
    return @('KEEP', 'Recommended local lane model for this stack.')
  }

  if ($sizeGB -gt 30) {
    return @('ARCHIVE', 'Very large model; keep only if needed for heavy workloads.')
  }
  if ($name -match 'instruct|coder|coding|code') {
    return @('OPTIONAL KEEP', 'Potentially useful local coding helper; benchmark before deletion.')
  }
  return @('DELETE CANDIDATE', 'Model did not match recommended lanes yet. Benchmark before manual prune.')
}

$models = @()

function addModel([string]$name, [string]$source, [object]$entry, [decimal]$sizeGB) {
  $script:models += [ordered]@{
    name = $name
    source = $source
    sizeGB = $sizeGB
    exists = $true
    raw = $entry
  }
}

# Ollama models
try {
  $ollamaList = Invoke-RestMethod -Method GET -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 4
  foreach ($entry in $ollamaList.models) {
    $sizeBytes = detectModelSizeBytes $entry
    $sizeGB = if ($sizeBytes) { sizeToGB $sizeBytes } else { $null }
    addModel $entry.name 'Ollama' $entry $sizeGB
  }
} catch {
  Write-Host "Ollama API unavailable: $($_.Exception.Message)" -ForegroundColor Yellow
}

# LM Studio models
try {
  $lmData = Invoke-RestMethod -Method GET -Uri 'http://127.0.0.1:1234/v1/models' -TimeoutSec 4
  foreach ($entry in $lmData.data) {
    $sizeBytes = detectModelSizeBytes $entry
    $sizeGB = if ($sizeBytes) { sizeToGB $sizeBytes } else { $null }
    addModel $entry.id 'LM Studio' $entry $sizeGB
  }
} catch {
  Write-Host "LM Studio API unavailable: $($_.Exception.Message)" -ForegroundColor Yellow
}

$nameGroups = $models | Group-Object { normalizeName $_.name }
$audited = @()

foreach ($item in $models) {
  $norm = normalizeName $item.name
  $groupMatch = if ($nameGroups) { $nameGroups | Where-Object { $_.Name -eq $norm } | Select-Object -First 1 } else { $null }
  $groupCount = if ($groupMatch) { [int]$groupMatch.Count } else { 1 }
  $recommendation = classifyModel $item.name $item.sizeGB $groupCount
  $audited += [ordered]@{
    name = $item.name
    source = $item.source
    sizeGB = $item.sizeGB
    recommendation = $recommendation[0]
    reason = $recommendation[1]
    duplicateGroup = $groupCount
  }
}

$weak = $audited | Where-Object { $_.recommendation -eq 'DELETE CANDIDATE' }
$huge = $audited | Where-Object { $_.sizeGB -and $_.sizeGB -gt 20 }
$optional = $audited | Where-Object { $_.recommendation -eq 'OPTIONAL KEEP' }
$replace = $audited | Where-Object { $_.recommendation -eq 'REPLACE WITH BETTER MODEL' }
$keep = $audited | Where-Object { $_.recommendation -eq 'KEEP' }
$archive = $audited | Where-Object { $_.recommendation -eq 'ARCHIVE' }

$summary = [ordered]@{
  scannedAt = (Get-Date).ToString('o')
  root = $Root
  modelsFound = $audited.Count
  duplicateGroups = ($nameGroups | Where-Object { $_.Count -gt 1 }).Count
  weakModels = $weak.Count
  hugeModels = $huge.Count
  replaceNeeded = $replace.Count
  records = $audited
}

$summary | ConvertTo-Json -Depth 12 | Out-File -FilePath $logPath -Encoding utf8
$summary | ConvertTo-Json -Depth 12 | Out-File -FilePath $registryPath -Encoding utf8

$markdown = @"
# AI Mission Center Model Cleanup Plan

Generated: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))
Scanned models: $($summary.modelsFound)

## KEEP
$(( $keep | ForEach-Object { "- $($_.name) ($($_.source)): $($_.reason)" }) -join "`n")

## OPTIONAL KEEP
$(( $optional | ForEach-Object { "- $($_.name) ($($_.source)): $($_.reason)" }) -join "`n")

## ARCHIVE
$(( $archive | ForEach-Object { "- $($_.name) ($($_.source)): $($_.reason)" }) -join "`n")

## DELETE CANDIDATE
$(( $weak | ForEach-Object { "- $($_.name) ($($_.source)): $($_.reason)" }) -join "`n")

## REPLACE WITH BETTER MODEL
$(( $replace | ForEach-Object { "- $($_.name) ($($_.source)): $($_.reason)" }) -join "`n")

## Duplicate groups
$(( ($nameGroups | Where-Object { $_.Count -gt 1 }) | ForEach-Object { "- $($_.Name) => $($_.Count) variants" }) -join "`n")

## Safety note
- No models are deleted by this script.
- Run your own judgment pass before deleting anything.
"@

Set-Content -Path $planPath -Value $markdown -Encoding utf8

Write-Host "Model audit written to: $logPath"
Write-Host "Model inventory written to: $registryPath"
Write-Host "Cleanup plan written to: $planPath"
Write-Output $summary | ConvertTo-Json -Depth 12
