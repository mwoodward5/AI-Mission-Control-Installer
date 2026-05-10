param(
  [Parameter(Mandatory)][ValidateSet('ollama', 'lmstudio', 'chatgpt', 'perplexity', 'claude', 'gemini', 'openclaw')][string]$Provider,
  [string]$Prompt = '',
  [string]$PromptFile = ''
)

$url = switch ($Provider) {
  'ollama' { 'http://localhost:11434' }
  'lmstudio' { 'http://localhost:1234' }
  'chatgpt' { 'https://chatgpt.com' }
  'perplexity' { 'https://www.perplexity.ai' }
  'claude' { 'https://claude.ai' }
  'gemini' { 'https://gemini.google.com/app' }
  'openclaw' { 'https://openclaw.ai/' }
}

$promptText = ''
$promptSource = 'none'

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

if ($promptText) {
  Set-Clipboard -Value $promptText
  Write-Host "Prompt copied to clipboard from $promptSource."
}

Write-Host "Opening provider tab: $url (logged-in browser profile)"
Start-Process $url

[pscustomobject]@{
  opened = $true
  provider = $Provider
  url = $url
  promptCopied = [bool]$promptText
  promptSource = $promptSource
} | ConvertTo-Json -Depth 6
