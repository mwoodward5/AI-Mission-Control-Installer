param(
  [string]$Root = 'C:\AICommandCenter'
)

$ErrorActionPreference = 'Stop'

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logsPath = Join-Path $Root 'logs'
$logDirResult = $true
try {
  New-Item -ItemType Directory -Path $logsPath -Force -ErrorAction Stop | Out-Null
} catch {
  $logDirResult = $false
  Write-Host "Warning: unable to create logs folder. $($_.Exception.Message)" -ForegroundColor Yellow
}
$latest = Join-Path $logsPath 'system-check-latest.json'

function runLocalRequest([string]$Uri) {
  try {
    $response = Invoke-RestMethod -Uri $Uri -Method GET -TimeoutSec 3
    return @{ status = 'pass'; detail = $response }
  } catch {
    return @{ status = 'warn'; detail = $_.Exception.Message }
  }
}

function resolveCommand([string]$Name) {
  try {
    return (Get-Command $Name -ErrorAction SilentlyContinue).Source
  } catch {
    return $null
  }
}

$nodePath = resolveCommand 'node'
$npmPath = resolveCommand 'npm'
$gitPath = resolveCommand 'git'
$powershellPath = resolveCommand 'powershell'
$powershell7Path = resolveCommand 'pwsh'

$nodeVersion = ''
$npmVersion = ''
$gitVersion = ''
try { if ($nodePath) { $nodeVersion = (node -v).Trim() } } catch {}
try { if ($npmPath) { $npmVersion = (npm -v).Trim() } } catch {}
try { if ($gitPath) { $gitVersion = (git -v).Trim() } } catch {}

$powershellStatus = if ($powershellPath -or $powershell7Path) { 'pass' } else { 'warn' }
$powershellVersion = $PSVersionTable.PSVersion.ToString()

$ollamaInstalled = $null -ne (Get-Command ollama -ErrorAction SilentlyContinue)
$ollamaReach = runLocalRequest 'http://localhost:11434/api/version'
$ollamaReach127 = runLocalRequest 'http://127.0.0.1:11434/api/version'
$lmStudioReach = runLocalRequest 'http://localhost:1234/v1/models'
$lmStudioReach127 = runLocalRequest 'http://127.0.0.1:1234/v1/models'

$browserPaths = [ordered]@{
  chrome = @(
    Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'
    Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'
    Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'
  ) | Where-Object { $_ -and (Test-Path $_) }
  edge = @(
    Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'
    Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
    Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe'
  ) | Where-Object { $_ -and (Test-Path $_) }
  brave = @(
    Join-Path $env:ProgramFiles 'BraveSoftware\Brave-Browser\Application\brave.exe'
    Join-Path ${env:ProgramFiles(x86)} 'BraveSoftware\Brave-Browser\Application\brave.exe'
    Join-Path $env:LOCALAPPDATA 'BraveSoftware\Brave-Browser\Application\brave.exe'
  ) | Where-Object { $_ -and (Test-Path $_) }
}

$reposPath = Join-Path $Root 'repos'
$reposExists = Test-Path -LiteralPath $reposPath -PathType Container
$reposReadable = $false
if ($reposExists) {
  try {
    $null = Get-ChildItem -LiteralPath $reposPath -ErrorAction Stop
    $reposReadable = $true
  } catch {
    $reposReadable = $false
  }
}

$ollamaModels = @()
if ($ollamaInstalled) {
  try {
    $raw = & ollama list 2>&1
    $lines = @($raw -split "`r?`n" | Where-Object { $_.Trim() })
    if ($lines.Count -gt 1) {
      for ($i = 1; $i -lt $lines.Count; $i++) {
        $parts = @($lines[$i] -split '\s{2,}' | Where-Object { $_.Trim() })
        if ($parts.Count -lt 1 -or -not $parts[0]) { continue }
        $ollamaModels += [ordered]@{
          name = $parts[0]
          size = if ($parts.Count -gt 1) { $parts[1] } else { '' }
        }
      }
    }
  } catch {
    Write-Host "Could not parse ollama list: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

$lmStudioModels = @()
if ($lmStudioReach.status -eq 'pass') {
  try {
    $lmData = Invoke-RestMethod -Uri 'http://127.0.0.1:1234/v1/models' -Method GET -TimeoutSec 4
    foreach ($entry in $lmData.data) {
      $lmStudioModels += [ordered]@{
        name = [string]$entry.id
        size = if ($entry.size) { $entry.size } else { '' }
      }
    }
  } catch {
    Write-Host "Could not parse LM Studio models: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

$checks = [ordered]@{
  node = if ($nodeVersion) { 'pass' } else { 'fail' }
  npm = if ($npmVersion) { 'pass' } else { 'fail' }
  git = if ($gitVersion) { 'pass' } else { 'fail' }
  powershell = $powershellStatus
  ollama = if (-not $ollamaInstalled) { 'warn' } elseif ($ollamaReach.status -eq 'pass' -or $ollamaReach127.status -eq 'pass') { 'pass' } else { 'warn' }
  lmStudio = if ($lmStudioReach.status -eq 'pass' -or $lmStudioReach127.status -eq 'pass') { 'pass' } else { 'warn' }
  repos = if ($reposExists -and $reposReadable) { 'pass' } else { 'warn' }
}

$result = [ordered]@{
  checkedAt = (Get-Date).ToString('o')
  root = $Root
  checks = $checks
  node = [ordered]@{ status = if ($nodeVersion) { 'pass' } else { 'fail' }; version = $nodeVersion; path = $nodePath; command = 'node -v' }
  npm = [ordered]@{ status = if ($npmVersion) { 'pass' } else { 'fail' }; version = $npmVersion; path = $npmPath; command = 'npm -v' }
  git = [ordered]@{ status = if ($gitVersion) { 'pass' } else { 'fail' }; version = $gitVersion; path = $gitPath; command = 'git -v' }
  powershell = [ordered]@{ status = $powershellStatus; version = $powershellVersion; path = $powershellPath; path7 = $powershell7Path; command = if ($powershellPath) { 'powershell -v' } else { 'pwsh -v' } }
  systemCheck = [ordered]@{
    node = $checks.node
    npm = $checks.npm
    git = $checks.git
    powershell = $checks.powershell
    ollama = $checks.ollama
    lmStudio = $checks.lmStudio
  }
  endpoints = [ordered]@{
    ollama = [ordered]@{
      localhost = $ollamaReach
      localhost127 = $ollamaReach127
    }
    lmStudio = [ordered]@{
      localhost = $lmStudioReach
      localhost127 = $lmStudioReach127
    }
  }
  browsers = [ordered]@{
    chrome = [ordered]@{ detected = $browserPaths.chrome.Count -gt 0; sample = if ($browserPaths.chrome.Count -gt 0) { $browserPaths.chrome[0] } else { '' } }
    edge = [ordered]@{ detected = $browserPaths.edge.Count -gt 0; sample = if ($browserPaths.edge.Count -gt 0) { $browserPaths.edge[0] } else { '' } }
    brave = [ordered]@{ detected = $browserPaths.brave.Count -gt 0; sample = if ($browserPaths.brave.Count -gt 0) { $browserPaths.brave[0] } else { '' } }
  }
  repos = [ordered]@{ path = $reposPath; exists = $reposExists; readable = $reposReadable }
  modelSources = [ordered]@{
    ollama = $ollamaModels
    lmStudio = $lmStudioModels
  }
  commands = @(
    'node -v',
    'npm -v',
    'git -v',
    if ($powershellPath) { 'powershell -v' } elseif ($powershell7Path) { 'pwsh -v' } else { 'powershell unavailable' },
    'ollama list',
    'Invoke-RestMethod http://localhost:11434/api/version',
    'Invoke-RestMethod http://127.0.0.1:11434/api/version',
    'Invoke-RestMethod http://localhost:1234/v1/models',
    'Invoke-RestMethod http://127.0.0.1:1234/v1/models'
  )
}

$resultFile = Join-Path $logsPath "system-check-$timestamp.json"
if ($logDirResult) {
  $result | ConvertTo-Json -Depth 12 | Out-File -FilePath $resultFile -Encoding utf8 -Force
  $result | ConvertTo-Json -Depth 12 | Out-File -FilePath $latest -Encoding utf8 -Force
  Write-Host "System check written to: $resultFile" -ForegroundColor Green
  Write-Host "Latest system check written to: $latest" -ForegroundColor Green
}

Write-Output $result | ConvertTo-Json -Depth 12

