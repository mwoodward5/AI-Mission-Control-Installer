#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token || !token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      args[key] = next
      i += 1
    } else {
      args[key] = 'true'
    }
  }
  return args
}

function parseJsonText(raw) {
  if (!raw) return null
  const text = String(raw).trim()
  const lines = text.split(/\r?\n/)

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const candidate = lines.slice(i).join('\n').trim()
    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      try {
        return JSON.parse(candidate)
      } catch {
        // continue
      }
    }
  }

  const marker = text.lastIndexOf('{')
  if (marker >= 0) {
    try {
      return JSON.parse(text.slice(marker))
    } catch {
      return null
    }
  }

  return null
}

const args = parseArgs(process.argv.slice(2))
const provider = String(args.provider || '').trim().toLowerCase()
const prompt = typeof args.prompt === 'string' ? args.prompt : ''
const promptFileArg = typeof args['prompt-file'] === 'string' ? args['prompt-file'] : ''
const root = path.resolve(String(args.root || process.cwd()))

if (!provider) {
  console.error('Missing --provider')
  process.exit(1)
}

const scriptsRoot = path.join(root, 'scripts')
const outputsRoot = path.join(root, 'outputs')
const providerPromptsRoot = path.join(outputsRoot, 'provider-prompts')
if (!fs.existsSync(outputsRoot)) fs.mkdirSync(outputsRoot, { recursive: true })
if (!fs.existsSync(providerPromptsRoot)) fs.mkdirSync(providerPromptsRoot, { recursive: true })

const promptFile = promptFileArg || path.join(providerPromptsRoot, `${Date.now()}-${provider}-${Math.floor(Math.random() * 99999)}.txt`)

if (prompt && !promptFileArg) {
  fs.writeFileSync(promptFile, prompt, 'utf8')
}

if (!fs.existsSync(promptFile)) {
  console.error(`Prompt file not found: ${promptFile}`)
  process.exit(1)
}

const scriptPath = path.join(scriptsRoot, 'open-browser-provider.ps1')
if (!fs.existsSync(scriptPath)) {
  console.error(`Missing script: ${scriptPath}`)
  process.exit(1)
}

const ps = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Provider', provider, '-PromptFile', promptFile], {
  cwd: root,
  encoding: 'utf8',
})

const raw = `${ps.stdout || ''}\n${ps.stderr || ''}`
const parsed = parseJsonText(raw)

if (ps.error) {
  console.error(String(ps.error.message || ps.error))
}

if (parsed && typeof parsed === 'object') {
  const payload = {
    ok: (ps.status ?? 1) === 0,
    opened: Boolean(parsed.opened),
    promptCopied: Boolean(parsed.promptCopied),
    promptFile,
    provider,
    providerUrl: parsed.url,
    promptSource: parsed.promptSource,
    rawOutput: raw.trim(),
    exitCode: ps.status ?? 0,
  }
  process.stdout.write(JSON.stringify(payload))
  process.exit(payload.ok ? 0 : 1)
}

process.stdout.write(JSON.stringify({
  ok: (ps.status ?? 1) === 0,
  opened: !Boolean(ps.error),
  promptCopied: false,
  promptFile,
  provider,
  rawOutput: raw.trim(),
  exitCode: ps.status ?? 1,
}))
process.exit(ps.status ?? 1)