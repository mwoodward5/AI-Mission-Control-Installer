param(
  [string]$Root = 'C:\AICommandCenter',
  [int]$Port = 5173,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$appPath = Join-Path $Root 'app'

if (-not (Test-Path -LiteralPath (Join-Path $appPath 'package.json'))) {
  throw "AI Mission Control app was not found at $appPath. Clone or copy the repo to $Root first."
}

Write-Host "Starting AI Mission Control..." -ForegroundColor Cyan
Write-Host "Root: $Root"
Write-Host "URL:  http://localhost:$Port"
Write-Host ""
Write-Host "This starts the local bridge. Close this PowerShell window to stop it." -ForegroundColor Yellow
Write-Host ""

Push-Location $appPath
try {
  if (-not $NoBrowser) {
    Start-Process "http://localhost:$Port"
  }
  npm run dev -- --host 127.0.0.1 --port $Port
}
finally {
  Pop-Location
}
