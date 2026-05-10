param(
  [string]$InstallRoot = 'C:\AICommandCenter'
)

$ErrorActionPreference = 'Stop'

function Step($Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function EnsureFolder($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

Step "Preparing folders"
EnsureFolder $InstallRoot
foreach ($folder in @('app','tickets','repos','outputs','outputs\media','outputs\provider-prompts','models','logs','scripts','backups')) {
  EnsureFolder (Join-Path $InstallRoot $folder)
}

$appPath = Join-Path $InstallRoot 'app'
$packagePath = Join-Path $appPath 'package.json'
if (-not (Test-Path -LiteralPath $packagePath)) {
  throw "Missing $packagePath. Clone or copy the repository to $InstallRoot first."
}

Step "Installing app dependencies"
Push-Location $appPath
npm install

Step "Validating production build"
npm run build
Pop-Location

Step "Running safe system check"
$checkScript = Join-Path $InstallRoot 'scripts\check-system.ps1'
if (Test-Path -LiteralPath $checkScript) {
  powershell -NoProfile -File $checkScript -Root $InstallRoot
} else {
  Write-Warning "System check script was not found: $checkScript"
}

Write-Host "`nInstall validation complete." -ForegroundColor Green
Write-Host "Start with: powershell -NoProfile -File C:\AICommandCenter\scripts\launch-dashboard.ps1"
