import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(appRoot, '..')
const scriptsRoot = path.join(projectRoot, 'scripts')
const reposRoot = path.join(projectRoot, 'repos')
const modelsRoot = path.join(projectRoot, 'models')
const outputsRoot = path.join(projectRoot, 'outputs')
const logsRoot = path.join(projectRoot, 'logs')
const ticketsRoot = path.join(projectRoot, 'tickets')
const backupsRoot = path.join(projectRoot, 'backups')
const providerPromptsRoot = path.join(outputsRoot, 'provider-prompts')

type BridgeResult = {
  ok: boolean
  action: string
  command?: string
  output: string
  error?: string
  payload?: Record<string, unknown>
  exitCode?: number
}

function safeReadJson(filePath: string) {
  try {
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf8')
    const text = raw.replace(/^\uFEFF/, '').trim()
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function writeJson(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8')
}

function writeText(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
}

function runCommand(command: string, args: string[], cwd = projectRoot): Promise<{ code: number; output: string; error: string }> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn(command, args, { cwd, shell: false, windowsHide: true, env: process.env })
    let output = ''
    let error = ''
    child.stdout?.on('data', (chunk) => { output += chunk.toString() })
    child.stderr?.on('data', (chunk) => { error += chunk.toString() })
    child.on('error', (err) => resolve({ code: 1, output: '', error: err.message }))
    child.on('close', (code) => resolve({ code: Number(code ?? 0), output: output.trim(), error: error.trim() }))
  })
}

async function getRequestBody(req: any) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

function sendJson(res: any, status: number, body: BridgeResult) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

function parseRepoScripts(repoPath: string) {
  const pkgPath = path.join(repoPath, 'package.json')
  const pkg = safeReadJson(pkgPath) as { scripts?: Record<string, string> } | null
  return pkg?.scripts ?? null
}

function readModelRecords() {
  const payload = safeReadJson(path.join(modelsRoot, 'model-registry.json'))
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray((payload as { records?: unknown[] }).records)) return (payload as { records: unknown[] }).records
  return []
}

function mapProviderCode(provider: string) {
  const map: Record<string, string> = {
    'Perplexity Max (browser)': 'perplexity',
    'ChatGPT Pro/Max (browser)': 'chatgpt',
    'Claude/Sonnet (browser)': 'claude',
    'Gemini (browser)': 'gemini',
    'OpenClaw (browser)': 'openclaw',
    'Local Ollama/LM Studio': 'ollama',
  }
  return map[provider] ?? (provider.toLowerCase().replace(/[^a-z0-9]/g, '') || 'chatgpt')
}

function latestJsonFromPattern(dir: string, pattern: string) {
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter((name) => name.startsWith(pattern) && name.endsWith('.json')).sort().reverse()
  return files[0] ? path.join(dir, files[0]) : null
}

function runPowershell(script: string, args: string[]) {
  return runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(scriptsRoot, script), ...args], projectRoot)
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function pathStatus(target: string) {
  return { path: target, exists: fs.existsSync(target) }
}

function isInside(candidate: string, root: string) {
  const c = path.resolve(candidate)
  const r = path.resolve(root)
  return c === r || c.startsWith(`${r}${path.sep}`)
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'mission-control-bridge',
      configureServer(server) {
        server.middlewares.use('/api/mission-control/health', (req, res, next) => {
          if (req.method !== 'GET') return next()
          sendJson(res, 200, {
            ok: true,
            action: 'health',
            output: 'Mission Control local bridge is online while npm run dev/start is running.',
            payload: {
              bridge: 'online',
              mode: 'vite-dev-middleware',
              bridgeOnlyDuringDev: true,
              root: projectRoot,
              appRoot,
              scripts: pathStatus(scriptsRoot),
              repos: pathStatus(reposRoot),
              tickets: pathStatus(ticketsRoot),
              outputs: pathStatus(outputsRoot),
              logs: pathStatus(logsRoot),
              models: pathStatus(modelsRoot),
              backups: pathStatus(backupsRoot),
            },
          })
        })

        server.middlewares.use('/api/mission-control/system-check', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const { code, output, error } = await runPowershell('check-system.ps1', ['-Root', projectRoot])
          const latest = safeReadJson(path.join(logsRoot, 'system-check-latest.json'))
          sendJson(res, code === 0 ? 200 : 500, { ok: code === 0, action: 'system-check', command: `powershell -File check-system.ps1 -Root "${projectRoot}"`, output: [output, error].filter(Boolean).join('\n'), exitCode: code, payload: { systemCheck: (latest as { systemCheck?: unknown } | null)?.systemCheck ?? latest } })
        })

        server.middlewares.use('/api/mission-control/model-scan', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const { code, output, error } = await runPowershell('check-models.ps1', ['-Root', projectRoot])
          const summaryPath = latestJsonFromPattern(logsRoot, 'model-audit-')
          sendJson(res, 200, { ok: code === 0, action: 'model-scan', command: `powershell -File check-models.ps1 -Root "${projectRoot}"`, output: [output, error].filter(Boolean).join('\n'), exitCode: code, payload: { records: readModelRecords(), summary: summaryPath ? safeReadJson(summaryPath) : null, modelCleanupPlanPath: path.join(outputsRoot, 'MODEL-CLEANUP-PLAN.md') } })
        })

        server.middlewares.use('/api/mission-control/model-benchmark', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const { code, output, error } = await runPowershell('benchmark-models.ps1', ['-Root', projectRoot])
          const latest = latestJsonFromPattern(outputsRoot, 'model-benchmarks-')
          const payload = latest ? { resultsPath: latest, results: safeReadJson(latest), markdownPath: path.join(outputsRoot, 'MODEL-BENCHMARKS.md') } : {}
          sendJson(res, code === 0 ? 200 : 500, { ok: code === 0, action: 'model-benchmark', command: `powershell -File benchmark-models.ps1 -Root "${projectRoot}"`, output: [output, error].filter(Boolean).join('\n'), exitCode: code, payload })
        })

        server.middlewares.use('/api/mission-control/open-provider', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const body = await getRequestBody(req)
          const provider = String(body?.provider || 'chatgpt')
          const prompt = String(body?.prompt || '')
          const providerCode = mapProviderCode(provider)
          const promptFile = path.join(providerPromptsRoot, `${Date.now()}-${sanitizeFileName(providerCode)}.txt`)
          if (prompt.trim()) writeText(promptFile, prompt)
          const args = prompt.trim() ? ['-Provider', providerCode, '-PromptFile', promptFile] : ['-Provider', providerCode]
          const { code, output, error } = await runPowershell('open-browser-provider.ps1', args)
          sendJson(res, 200, { ok: code === 0, action: 'open-provider', command: prompt.trim() ? `powershell -File open-browser-provider.ps1 -Provider ${providerCode} -PromptFile "${promptFile}"` : `powershell -File open-browser-provider.ps1 -Provider ${providerCode}`, output: [output, error].filter(Boolean).join('\n'), exitCode: code, payload: { provider, providerCode, promptFile: prompt.trim() ? promptFile : null } })
        })

        server.middlewares.use('/api/mission-control/save-ticket', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const body = await getRequestBody(req)
          const ticket = body?.ticket
          if (!ticket || !ticket.id) return sendJson(res, 400, { ok: false, action: 'save-ticket', output: '', error: 'ticket.id is required' })
          const filePath = path.join(ticketsRoot, sanitizeFileName(`${ticket.id}.json`))
          writeJson(filePath, ticket)
          sendJson(res, 200, { ok: true, action: 'save-ticket', command: `Save-Content "${filePath}"`, output: `Ticket saved: ${filePath}`, payload: { ticketPath: filePath } })
        })

        server.middlewares.use('/api/mission-control/repos', (req, res, next) => {
          if (req.method !== 'GET') return next()
          const repos = fs.existsSync(reposRoot) ? fs.readdirSync(reposRoot, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => path.join(reposRoot, item.name)) : []
          sendJson(res, 200, { ok: true, action: 'repos', output: '', payload: { repos } })
        })

        server.middlewares.use('/api/mission-control/repo-action', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const body = await getRequestBody(req)
          const action = String(body?.action || '')
          const repoPath = String(body?.repoPath || '')
          const scripts = parseRepoScripts(repoPath)
          if (!repoPath || !fs.existsSync(repoPath)) return sendJson(res, 400, { ok: false, action: 'repo-action', output: '', error: 'Valid repoPath is required' })
          if (!isInside(repoPath, reposRoot) && path.resolve(repoPath) !== appRoot) return sendJson(res, 400, { ok: false, action: 'repo-action', output: '', error: `Repo actions are limited to ${reposRoot} or the dashboard app folder.` })
          let command = ''
          let commandOutput = ''
          let exitCode = 0
          if (action === 'status') {
            const run = await runPowershell('git-safe.ps1', ['-Action', 'status', '-Repo', repoPath, '-NoPrompt'])
            command = `powershell -File git-safe.ps1 -Action status -Repo "${repoPath}" -NoPrompt`; commandOutput = [run.output, run.error].filter(Boolean).join('\n'); exitCode = run.code
          } else if (action === 'npmInstallPreview') {
            const run = await runPowershell('npm-safe.ps1', ['-Script', 'install', '-Repo', repoPath, '-NoPrompt', '-DryRun'])
            command = `powershell -File npm-safe.ps1 -Script install -Repo "${repoPath}" -DryRun -NoPrompt`; commandOutput = [run.output, run.error].filter(Boolean).join('\n'); exitCode = run.code
        } else if (action === 'npmBuild') {
            if (!scripts?.build) return sendJson(res, 200, { ok: false, action: 'repo-action', output: 'No build script found', error: 'Missing npm build script in package.json' })
            const run = await runCommand('cmd', ['/c', 'npm run build'], repoPath)
            command = `npm run build --prefix "${repoPath}"`
            commandOutput = [run.output, run.error].filter(Boolean).join('\n'); exitCode = run.code
          } else if (action === 'npmTest') {
            if (!scripts?.test) return sendJson(res, 200, { ok: false, action: 'repo-action', output: 'No test script', error: 'Missing npm test script in package.json' })
            const run = await runCommand('cmd', ['/c', 'npm run test'], repoPath)
            command = `npm run test --prefix "${repoPath}"`
            commandOutput = [run.output, run.error].filter(Boolean).join('\n'); exitCode = run.code
          } else if (action === 'openFolder') {
            const run = await runCommand('explorer', [repoPath], projectRoot)
            command = `explorer "${repoPath}"`; commandOutput = [run.output, run.error].filter(Boolean).join('\n'); exitCode = run.code
          } else if (action === 'backup') {
            const target = path.join(backupsRoot, `${path.basename(repoPath)}-${new Date().toISOString().replace(/[:.]/g, '-')}`)
            fs.mkdirSync(backupsRoot, { recursive: true })
            const run = await runCommand('robocopy', [repoPath, target, '/MIR', '/XD', '.git', 'node_modules', 'dist'], projectRoot)
            command = `robocopy "${repoPath}" "${target}" /MIR /XD .git node_modules dist`; commandOutput = [run.output, run.error].filter(Boolean).join('\n'); exitCode = run.code
          } else {
            return sendJson(res, 400, { ok: false, action: 'repo-action', output: '', error: `Unknown action: ${action}` })
          }
          const success = action === 'backup' ? exitCode >= 0 && exitCode <= 7 : exitCode === 0
          sendJson(res, 200, { ok: success, action: 'repo-action', command, output: commandOutput, exitCode, payload: { repoPath } })
        })

        server.middlewares.use('/api/mission-control/model-inventory', (req, res, next) => {
          if (req.method !== 'GET') return next()
          sendJson(res, 200, { ok: true, action: 'model-inventory', output: 'model registry loaded', payload: { records: readModelRecords(), planPath: path.join(outputsRoot, 'MODEL-CLEANUP-PLAN.md') } })
        })
      },
    },
  ],
})
