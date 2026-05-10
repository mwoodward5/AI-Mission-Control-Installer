param(
  [Parameter(Mandatory)][ValidateSet('status', 'add', 'commit', 'push', 'pull', 'log', 'clone')][string]$Action,
  [string]$Repo = (Get-Location).Path,
  [string]$File = '.',
  [string]$Message = '',
  [string]$Remote = '',
  [string]$Target = '',
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

if (-not (Test-Path $Repo)) { throw "Repository path not found: $Repo" }

$gitBase = "git -C `"$Repo`""

switch ($Action) {
  'status' {
    runCommand "$gitBase status --short"
  }
  'add' {
    runCommand "$gitBase add $File"
  }
  'commit' {
    if (-not $Message) { throw "Commit requires -Message" }
    runCommand "$gitBase add $File"
    runCommand "$gitBase commit -m `"$Message`""
  }
  'push' {
    if (-not $Remote) { $Remote = 'origin' }
    runCommand "$gitBase push $Remote HEAD"
  }
  'pull' {
    runCommand "$gitBase pull"
  }
  'log' {
    runCommand "$gitBase log --oneline -n 12"
  }
  'clone' {
    if (-not $Target) { throw "Clone requires -Target" }
    runCommand "git clone $Repo $Target"
  }
}

