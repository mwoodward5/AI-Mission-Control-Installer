param(
  [Parameter(Mandatory)][ValidateSet('install', 'build', 'test', 'lint', 'run')][string]$Script,
  [string]$Repo = (Get-Location).Path,
  [string]$RunScript = 'build',
  [switch]$DryRun,
  [switch]$NoPrompt
)

$ErrorActionPreference = 'Stop'

function runCommand([string]$Command) {
  Write-Host "Planned command: $Command" -ForegroundColor Cyan
  if ($DryRun) {
    Write-Host "Dry-run mode: no execution." -ForegroundColor Yellow
    return
  }
  if (-not $NoPrompt) {
    $confirm = Read-Host "Run this command? y/N"
    if ($confirm -ne 'y') {
      Write-Host "Skipped: $Command" -ForegroundColor Yellow
      return
    }
  }
  Invoke-Expression $Command
}

if (-not (Test-Path (Join-Path $Repo 'package.json'))) {
  throw "No package.json found in repo: $Repo"
}

switch ($Script) {
  'install' {
    runCommand "Set-Location `"$Repo`"; npm install --package-lock-only --ignore-scripts --prefix `"$Repo`""
  }
  'build' {
    runCommand "Set-Location `"$Repo`"; npm run build"
  }
  'test' {
    runCommand "Set-Location `"$Repo`"; npm run test"
  }
  'lint' {
    runCommand "Set-Location `"$Repo`"; npm run lint"
  }
  'run' {
    runCommand "Set-Location `"$Repo`"; npm run $RunScript"
  }
}

