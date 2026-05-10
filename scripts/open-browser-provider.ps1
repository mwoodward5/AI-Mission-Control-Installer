param(
  [Parameter(Mandatory)][ValidateSet('ollama', 'lmstudio', 'chatgpt', 'perplexity', 'claude', 'gemini', 'openclaw')][string]$Provider,
  [string]$Prompt = '',
  [string]$PromptFile = ''
)

$ErrorActionPreference = 'Stop'

$maxClipboardLength = 8000000

$url = switch ($Provider) {
  'ollama' { 'http://localhost:11434' }
  'lmstudio' { 'http://localhost:1234' }
  'chatgpt' { 'https://chatgpt.com' }
  'perplexity' { 'https://www.perplexity.ai' }
  'claude' { 'https://claude.ai' }
  'gemini' { 'https://gemini.google.com/app' }
  'openclaw' { 'https://openclaw.ai/' }
  default { 'https://chatgpt.com' }
}

$promptText = ''
$promptSource = 'none'
$promptCopied = $false

if ($PromptFile) {
  if (-not (Test-Path -LiteralPath $PromptFile)) {
    throw "PromptFile not found: $PromptFile"
  }
  $promptText = Get-Content -LiteralPath $PromptFile -Raw
  $promptSource = "file:$PromptFile"
} elseif ($Prompt) {
  $promptText = $Prompt
  $promptSource = 'argument'
}

if ($promptText.Length -gt $maxClipboardLength) {
  Write-Host "Prompt is large (${($promptText.Length)} chars). Trying clipboard copy in chunks." -ForegroundColor Yellow
}

if ($promptText) {
  try {
    $escaped = $promptText.Replace("'", "''")
    if ($promptText.Length -le 250000) {
      powershell -NoProfile -Command "Set-Clipboard -Value @'\n${escaped}\n'@" | Out-Null
    } else {
      # Safe fallback for very large prompts: write through temporary file and load back to clipboard in one shot.
      $tempClipboard = Join-Path $env:TEMP ("mission-control-prompt-{0}.txt" -f [guid]::NewGuid())
      Set-Content -Path $tempClipboard -Value $promptText -Encoding utf8 -Force
      powershell -NoProfile -Command "Set-Clipboard -Value (Get-Content -Path '$tempClipboard' -Raw)"
      Remove-Item -LiteralPath $tempClipboard -Force
    }
    $promptCopied = $true
    Write-Host "Prompt copied to clipboard from $promptSource." -ForegroundColor Green
  } catch {
    Write-Host "Failed to copy prompt to clipboard: $($_.Exception.Message)" -ForegroundColor Yellow
    $promptCopied = $false
  }
}

Write-Host "Opening provider tab: $url (logged-in browser profile)"
Start-Process $url

[pscustomobject]@{
  opened = $true
  provider = $Provider
  url = $url
  promptCopied = [bool]$promptCopied
  promptSource = $promptSource
} | ConvertTo-Json -Depth 6
