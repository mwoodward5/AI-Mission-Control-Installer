param(
  [string]$Root = 'C:\AICommandCenter',
  [int]$Port = 5173,
  [switch]$NoBrowser
)

$appPath = Join-Path $Root 'app'
if (-not (Test-Path $appPath)) {
  throw "Cannot find app folder at $appPath"
}

$command = "npm run dev -- --host 0.0.0.0 --port $Port"

Write-Host ""
Write-Host "Planned command: Set-Location $appPath; $command" -ForegroundColor Cyan
Write-Host "This dashboard can only open local tabs for browser providers." -ForegroundColor DarkYellow
Write-Host "No credentials are imported or saved by these scripts." -ForegroundColor DarkYellow
Write-Host "Preview destructive commands before execution in the dashboard before using Terminal actions." -ForegroundColor DarkYellow
Write-Host ""
Read-Host "Press Enter to run"

Set-Location $appPath
if ($NoBrowser) {
  Invoke-Expression $command
} else {
  Start-Process "http://localhost:$Port"
  Invoke-Expression $command
}
