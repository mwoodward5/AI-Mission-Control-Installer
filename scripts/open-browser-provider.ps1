param(
  [Parameter(Mandatory)][ValidateSet('ollama', 'lmstudio', 'chatgpt', 'perplexity', 'claude', 'gemini', 'openclaw')][string]$Provider,
  [string]$Prompt = ''
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

if ($Prompt) {
  Set-Clipboard -Value $Prompt
  Write-Host "Prompt copied to clipboard."
}

Write-Host "Opening provider tab: $url (logged-in browser profile)"
Start-Process $url
Write-Output @{ opened=$true; provider=$Provider; url=$url; promptCopied = [bool]$Prompt } | ConvertTo-Json -Depth 6
