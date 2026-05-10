import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type AgentMode = 'auto' | 'local' | 'perplexity' | 'chatgpt' | 'claude' | 'gemini'
type AgentRoute = Exclude<AgentMode, 'auto'>
type BridgeResult = {
  ok: boolean
  action: string
  command?: string
  output: string
  error?: string
  payload?: Record<string, unknown>
  exitCode?: number
}

type BridgeRequest = {
  provider?: string
  prompt?: string
  promptFile?: string
  message?: string
  mode?: AgentMode
  route?: AgentRoute
  action?: string
  repoPath?: string
  content?: string
  ticketPath?: string
  ticketId?: string
}

type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

type ChatMessage = {
  role: MessageRole
  content: string
}

type AgentRunBridgeResult = BridgeResult & {
  route: AgentRoute
  messages: ChatMessage[]
  response: string
  artifacts?: {
    ticketPath?: string
    promptFile?: string
    prompt?: string
    provider?: string
    responsePath?: string
    ticketId?: string
    providerRoute?: AgentRoute
  }
}

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
const providerResponsesRoot = path.join(outputsRoot, 'provider-responses')
const chatsRoot = path.join(outputsRoot, 'chats')

const AGENT_OUTPUT_DIRS = [
  providerPromptsRoot,
  providerResponsesRoot,
  chatsRoot,
]

const providerPromptLabel: Record<AgentRoute, string> = {
  local: 'Local Ollama/LM Studio',
  perplexity: 'Perplexity Max (browser)',
  chatgpt: 'ChatGPT Pro/Max (browser)',
  claude: 'Claude/Sonnet (browser)',
  gemini: 'Gemini (browser)',
}

const providerCodeMap: Record<string, AgentRoute> = {
  local: 'local',
  ollama: 'local',
  perplexity: 'perplexity',
  'Perplexity Max (browser)': 'perplexity',
  chatgpt: 'chatgpt',
  'ChatGPT Pro/Max (browser)': 'chatgpt',
  claude: 'claude',
  'Claude/Sonnet (browser)': 'claude',
  gemini: 'gemini',
  'Gemini (browser)': 'gemini',
  openclaw: 'chatgpt',
  'OpenClaw (browser)': 'chatgpt',
}

const providerBrowserUrl: Record<AgentRoute, string> = {
  local: 'http://localhost:11434',
  perplexity: 'https://www.perplexity.ai',
  chatgpt: 'https://chatgpt.com',
  claude: 'https://claude.ai',
  gemini: 'https://gemini.google.com/app',
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

function ensureDir(filePath: string) {
  fs.mkdirSync(filePath, { recursive: true })
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function safeJsonPayload(payload: unknown) {
  try {
    return JSON.stringify(payload)
  } catch {
    return JSON.stringify({})
  }
}

function writeJson(filePath: string, payload: unknown) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, safeJsonPayload(payload), 'utf8')
}

function writeText(filePath: string, content: string) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, content, 'utf8')
}

function runCommand(command: string, args: string[], cwd = projectRoot): Promise<{ code: number; output: string; error: string }> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn(command, args, { cwd, shell: false, windowsHide: true, env: process.env })
    let output = ''
    let error = ''
    child.stdout?.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
      error += chunk.toString()
    })
    child.on('error', (err) => {
      resolve({ code: 1, output, error: err.message })
    })
    child.on('close', (code) => {
      resolve({ code: Number(code ?? 0), output: output.trim(), error: error.trim() })
    })
  })
}

async function getRequestBody(req: any) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

function sendJson(res: any, status: number, body: BridgeResult | AgentRunBridgeResult) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

function nowStamp() {
  return new Date().toLocaleString()
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

function latestJsonFromPattern(dir: string, pattern: string) {
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter((name) => name.startsWith(pattern) && name.endsWith('.json')).sort().reverse()
  return files[0] ? path.join(dir, files[0]) : null
}

function runPowershell(script: string, args: string[]) {
  return runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(scriptsRoot, script), ...args], projectRoot)
}

function mapProviderCode(provider: string) {
  const normalized = String(provider || '').trim()
  if (providerCodeMap[normalized]) return providerCodeMap[normalized]
  const lower = normalized.toLowerCase()
  if (providerCodeMap[lower]) return providerCodeMap[lower]
  return 'chatgpt'
}

function normalizeMode(raw: unknown): AgentMode {
  const value = String(raw || 'auto').toLowerCase()
  if (value === 'local' || value === 'perplexity' || value === 'chatgpt' || value === 'claude' || value === 'gemini') return value as AgentMode
  return 'auto'
}

function chooseRoute(mode: AgentMode, message: string): AgentRoute {
  if (mode !== 'auto') return mode
  const text = message.toLowerCase()
  if (/(current|latest|research|citation|compare|vendor|price|pricing|web|news|online)/.test(text)) return 'perplexity'
  if (/(polish|design|architecture|ui|typescript|vite|build|debug|component|refactor|patch|error|broken|bug|fix)/.test(text)) return 'chatgpt'
  if (/(careful|rewrite|clean up|cleanup|docs|documentation|long-form|report|email)/.test(text)) return 'claude'
  if (/(huge|large document|multimodal|image review|pdf|video|audio)/.test(text)) return 'gemini'
  return 'local'
}

function buildProviderPrompt(route: AgentRoute, rawPrompt: string) {
  const base = `Mission Control request:\n\n${rawPrompt.trim()}\n\nRules:\n- Use existing files and existing project structure.\n- Prioritize local-safe execution first.\n- Do not expose API keys, cookies, passwords, or secrets.\n- Keep recommendations concrete and safe.\n- Avoid unsafe destructive commands.\n`

  if (route === 'local') {
    return `${base}\nLocal-first mode:\n- Perform repo scan, file summary, package.json analysis, dependency-map checks, and safe planning.\n- Keep commands to read-only unless explicitly asked.\n- Use dry-run for risky actions.\n`
  }

  if (route === 'perplexity') {
    return `${base}\nPerplexity mode:\n- Do current web research with citations and practical comparisons.\n- Prioritize practical local strategy and cost-aware options.\n`
  }

  if (route === 'chatgpt') {
    return `${base}\nChatGPT mode:\n- Provide strong coding, debugging, and architecture reasoning.\n- Produce a minimal patch plan and explicit local follow-up steps.\n`
  }

  if (route === 'claude') {
    return `${base}\nClaude mode:\n- Write careful cleanup and refactor guidance.\n- Include rollback and safety checks.\n`
  }

  return `${base}\nGemini mode:\n- Handle long documents and multimodal review.\n- Return concise next-step recommendations.\n`
}

function makeTicket(route: AgentRoute, userPrompt: string, provider: string) {
  const ticketType = route === 'local' ? 'Repo scan' : route === 'perplexity' ? 'Web research' : 'Code build'
  const title = userPrompt.slice(0, 70) || 'Mission Control task'
  const created = new Date().toISOString()
  const suffix = Math.random().toString(36).slice(2, 7)
  const id = `mc-${Date.now().toString(36)}-${suffix}`
  return {
    id,
    title,
    ticketType,
    repoPath: path.join(projectRoot, 'repos'),
    prompt: userPrompt,
    provider,
    providerAlternates: [providerPromptLabel.perplexity, providerPromptLabel.chatgpt, providerPromptLabel.claude, providerPromptLabel.gemini],
    status: route === 'local' ? 'local-in-progress' : 'browser-ready',
    createdAt: created,
    updatedAt: created,
    ticketId: id,
  }
}

function parseJsonFromTail(raw: string) {
  if (!raw) return null
  const trimmed = raw.trim()
  const lines = trimmed.split(/\r?\n/)

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const segment = lines.slice(i).join('\n').trim()
    if (!segment.startsWith('{') || !segment.endsWith('}')) continue
    try {
      return JSON.parse(segment) as Record<string, unknown>
    } catch {
      continue
    }
  }

  const firstBrace = trimmed.indexOf('{')
  if (firstBrace >= 0) {
    const tail = trimmed.slice(firstBrace)
    try {
      return JSON.parse(tail) as Record<string, unknown>
    } catch {
      return null
    }
  }

  return null
}

function runBrowserAgent(route: AgentRoute, prompt: string, promptFile = '') {
  const browserCode = route
  const resolvedPromptFile = promptFile && fs.existsSync(promptFile)
    ? path.resolve(promptFile)
    : path.join(providerPromptsRoot, `${Date.now()}-${sanitizeFileName(route)}-${Math.floor(Math.random() * 99999)}.txt`)

  if (!promptFile) {
    writeText(resolvedPromptFile, prompt)
  }

  const scriptPath = path.join(scriptsRoot, 'browser-agent.mjs')
  if (!fs.existsSync(scriptPath)) {
    return {
      ok: false,
      code: 1,
      output: `Cannot find browser agent at ${scriptPath}`,
      error: 'missing browser-agent.mjs',
      promptFile: resolvedPromptFile,
      command: `node ${scriptPath}`,
    }
  }

  const command = `node ${scriptPath} --provider ${browserCode} --prompt-file ${JSON.stringify(resolvedPromptFile)} --root ${JSON.stringify(projectRoot)}`
  const commandResult = runCommand('node', [scriptPath, '--provider', browserCode, '--prompt-file', resolvedPromptFile, '--root', projectRoot], projectRoot)

  const parsedCommandResult = commandResult.then((result) => {
    const parsed = parseJsonFromTail([result.output, result.error].join('\n'))
    return {
      ok: result.code === 0,
      code: result.code,
      output: result.output || result.error,
      error: result.error,
      promptFile: resolvedPromptFile,
      command,
      payload: parsed,
    }
  })

  return parsedCommandResult
}

function isInside(candidate: string, root: string) {
  const c = path.resolve(candidate)
  const r = path.resolve(root)
  return c === r || c.startsWith(`${r}${path.sep}`)
}

function mapRouteToActionLabel(route: AgentRoute) {
  return route === 'local'
    ? 'local'
    : route === 'perplexity'
      ? 'Perplexity'
      : route === 'chatgpt'
        ? 'ChatGPT'
        : route === 'claude'
          ? 'Claude'
          : 'Gemini'
}

function defaultToolMessages(route: AgentRoute) {
  const labels = ['🧠 choosing provider']
  if (route === 'local') {
    labels.push('🧹 scanning locally')
    labels.push('💸 avoiding cloud tokens')
  } else {
    labels.push(`routing to ${mapRouteToActionLabel(route)}`)
    labels.push('📋 prompt copied')
    labels.push('🌐 opening browser')
    labels.push('🕘 waiting for pasted answer')
  }
  labels.push('saved ticket')
  return labels
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'mission-control-bridge',
      configureServer(server) {
        AGENT_OUTPUT_DIRS.forEach((dir) => ensureDir(dir))

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
              scripts: { path: scriptsRoot, exists: fs.existsSync(scriptsRoot) },
              repos: { path: reposRoot, exists: fs.existsSync(reposRoot) },
              tickets: { path: ticketsRoot, exists: fs.existsSync(ticketsRoot) },
              outputs: { path: outputsRoot, exists: fs.existsSync(outputsRoot) },
              logs: { path: logsRoot, exists: fs.existsSync(logsRoot) },
              models: { path: modelsRoot, exists: fs.existsSync(modelsRoot) },
              backups: { path: backupsRoot, exists: fs.existsSync(backupsRoot) },
            },
          })
        })

        server.middlewares.use('/api/mission-control/agent-run', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          try {
            const body = (await getRequestBody(req)) as BridgeRequest
            const message = String(body.message || '').trim()
            if (!message) {
              sendJson(res, 400, {
                ok: false,
                action: 'agent-run',
                output: '',
                error: 'message is required for agent-run',
              })
              return
            }

            const requested = normalizeMode(body.mode)
            const route = chooseRoute(requested, message)
            const provider = providerPromptLabel[route]
            const routedPrompt = buildProviderPrompt(route, message)
            const toolMessages = defaultToolMessages(route).map((content) => ({ role: 'tool' as MessageRole, content }))
            const ticket = makeTicket(route, message, provider)
            const ticketPath = path.join(ticketsRoot, `${sanitizeFileName(`${ticket.id}.json`)}`)
            writeJson(ticketPath, ticket)

            let artifacts: AgentRunBridgeResult['artifacts'] = {
              ticketPath,
              provider,
              prompt: routedPrompt,
              providerRoute: route,
              ticketId: ticket.id,
            }

            let response = 'Local-first route selected. I copied the local prompt and saved ticket details.'

            if (route === 'local') {
              toolMessages.push({ role: 'system', content: 'routing to local' })
            } else {
              const browser = await runBrowserAgent(route, routedPrompt)
              artifacts = {
                ...artifacts,
                promptFile: browser.promptFile,
                responsePath: undefined,
                provider: providerPromptLabel[route],
              }
              if (browser.ok) {
                response = `I opened ${provider} and copied the prompt. Paste the answer here when complete.`
              } else {
                toolMessages.push({ role: 'system', content: 'build failed' })
                response = `Could not open ${provider} yet. ${browser.error || 'Bridge error while launching browser provider.'}`
                sendJson(res, 500, {
                  ok: false,
                  action: 'agent-run',
                  output: browser.output,
                  command: browser.command,
                  exitCode: browser.code,
                  route,
                  messages: toolMessages,
                  response,
                  artifacts,
                })
                return
              }
            }

            const result: AgentRunBridgeResult = {
              ok: true,
              action: 'agent-run',
              output: response,
              route,
              messages: toolMessages,
              response,
              artifacts,
              payload: {
                ticketPath,
                provider,
                prompt: routedPrompt,
                promptFile: artifacts.promptFile,
                providerRoute: route,
                responsePath: artifacts.responsePath,
                ticketId: ticket.id,
              },
            }
            sendJson(res, 200, result)
          } catch (error) {
            sendJson(res, 500, {
              ok: false,
              action: 'agent-run',
              output: '',
              error: error instanceof Error ? error.message : String(error),
            })
          }
        })

        server.middlewares.use('/api/mission-control/browser-run', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const body = (await getRequestBody(req)) as BridgeRequest
          const providerRoute = mapProviderCode(String(body.provider || 'chatgpt'))
          const prompt = String(body.prompt || '').trim()
          const promptFile = String(body.promptFile || '').trim()

          if (!prompt && !promptFile) {
            sendJson(res, 400, { ok: false, action: 'browser-run', output: 'prompt or promptFile is required', error: 'Missing prompt input' })
            return
          }

          const browser = await runBrowserAgent(providerRoute, prompt, promptFile)
          if (!browser.ok) {
            sendJson(res, 500, {
              ok: false,
              action: 'browser-run',
              output: browser.output,
              error: browser.error,
              command: browser.command,
              payload: { promptFile: browser.promptFile, route: providerRoute },
              exitCode: browser.code,
            })
            return
          }

          sendJson(res, 200, {
            ok: true,
            action: 'browser-run',
            output: browser.output,
            command: browser.command,
            payload: {
              route: providerRoute,
              promptFile: browser.promptFile,
              providerUrl: providerBrowserUrl[providerRoute],
              command: browser.command,
            },
          })
        })

        server.middlewares.use('/api/mission-control/save-chat', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const body = await getRequestBody(req)
          const chat = body?.chat
          if (!Array.isArray(chat)) {
            sendJson(res, 400, {
              ok: false,
              action: 'save-chat',
              output: '',
              error: 'chat array is required',
            })
            return
          }

          const name = `${nowStamp().replace(/[\/: ]/g, '-')}-${sanitizeFileName(String(body?.route || 'mission') )}`
          const chatPath = path.join(chatsRoot, `${name}.json`)
          writeJson(chatPath, {
            route: body?.route || 'auto',
            ticketPath: body?.artifacts?.ticketPath,
            savedAt: new Date().toISOString(),
            messages: chat,
            artifacts: body?.artifacts,
            command: body?.command || '',
          })

          sendJson(res, 200, {
            ok: true,
            action: 'save-chat',
            output: `Chat saved: ${chatPath}`,
            payload: { chatPath },
          })
        })

        server.middlewares.use('/api/mission-control/save-provider-response', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const body = (await getRequestBody(req)) as BridgeRequest
          const content = String(body?.content || '').trim()
          const ticketId = sanitizeFileName(String(body?.ticketId || body?.ticketPath || `response-${Date.now()}`))
          if (!content) {
            sendJson(res, 400, {
              ok: false,
              action: 'save-provider-response',
              output: '',
              error: 'content cannot be empty',
            })
            return
          }
          const outputPath = path.join(providerResponsesRoot, `${nowStamp().replace(/[\/: ]/g, '-')}-${ticketId}.txt`)
          writeText(outputPath, content)
          sendJson(res, 200, {
            ok: true,
            action: 'save-provider-response',
            output: `Provider response saved: ${outputPath}`,
            payload: {
              outputPath,
              route: body?.route || 'provider',
              ticketPath: body?.ticketPath || '',
              promptFile: body?.promptFile || '',
            },
          })
        })

        server.middlewares.use('/api/mission-control/system-check', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const { code, output, error } = await runPowershell('check-system.ps1', ['-Root', projectRoot])
          const latest = safeReadJson(path.join(logsRoot, 'system-check-latest.json'))
          sendJson(res, code === 0 ? 200 : 500, {
            ok: code === 0,
            action: 'system-check',
            command: `powershell -File check-system.ps1 -Root "${projectRoot}"`,
            output: [output, error].filter(Boolean).join('\n'),
            exitCode: code,
            payload: { systemCheck: (latest as { systemCheck?: unknown } | null)?.systemCheck ?? latest },
          })
        })

        server.middlewares.use('/api/mission-control/model-scan', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const { code, output, error } = await runPowershell('check-models.ps1', ['-Root', projectRoot])
          const summaryPath = latestJsonFromPattern(logsRoot, 'model-audit-')
          sendJson(res, 200, {
            ok: code === 0,
            action: 'model-scan',
            command: `powershell -File check-models.ps1 -Root "${projectRoot}"`,
            output: [output, error].filter(Boolean).join('\n'),
            exitCode: code,
            payload: {
              records: readModelRecords(),
              summary: summaryPath ? safeReadJson(summaryPath) : null,
              modelCleanupPlanPath: path.join(outputsRoot, 'MODEL-CLEANUP-PLAN.md'),
            },
          })
        })

        server.middlewares.use('/api/mission-control/model-benchmark', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const { code, output, error } = await runPowershell('benchmark-models.ps1', ['-Root', projectRoot])
          const latest = latestJsonFromPattern(outputsRoot, 'model-benchmarks-')
          const payload = latest ? { resultsPath: latest, results: safeReadJson(latest), markdownPath: path.join(outputsRoot, 'MODEL-BENCHMARKS.md') } : {}
          sendJson(res, code === 0 ? 200 : 500, {
            ok: code === 0,
            action: 'model-benchmark',
            command: `powershell -File benchmark-models.ps1 -Root "${projectRoot}"`,
            output: [output, error].filter(Boolean).join('\n'),
            exitCode: code,
            payload,
          })
        })

        server.middlewares.use('/api/mission-control/open-provider', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const body = (await getRequestBody(req)) as BridgeRequest
          const provider = String(body?.provider || 'chatgpt')
          const prompt = String(body?.prompt || '')
          const route = mapProviderCode(provider)
          const promptFile = path.join(providerPromptsRoot, `${Date.now()}-${sanitizeFileName(provider)}.txt`)
          if (prompt.trim()) writeText(promptFile, prompt)

          const browser = await runBrowserAgent(route, prompt, prompt.trim() ? promptFile : '')
          if (!browser.ok) {
            sendJson(res, 500, {
              ok: false,
              action: 'open-provider',
              output: browser.output,
              error: browser.error,
              command: browser.command,
              exitCode: browser.code,
              payload: {
                provider: provider,
                providerCode: route,
                promptFile,
              },
            })
            return
          }

          sendJson(res, 200, {
            ok: true,
            action: 'open-provider',
            command: browser.command,
            output: browser.output,
            exitCode: browser.code,
            payload: {
              provider,
              providerCode: route,
              promptFile,
            },
          })
        })

        server.middlewares.use('/api/mission-control/save-ticket', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const body = (await getRequestBody(req)) as BridgeRequest & { ticket?: { id?: string } }
          const ticket = body.ticket
          if (!ticket || !ticket.id) {
            sendJson(res, 400, { ok: false, action: 'save-ticket', output: '', error: 'ticket.id is required' })
            return
          }
          const filePath = path.join(ticketsRoot, sanitizeFileName(`${ticket.id}.json`))
          writeJson(filePath, ticket)
          sendJson(res, 200, {
            ok: true,
            action: 'save-ticket',
            command: `Save-Content "${filePath}"`,
            output: `Ticket saved: ${filePath}`,
            payload: { ticketPath: filePath },
          })
        })

        server.middlewares.use('/api/mission-control/repos', (req, res, next) => {
          if (req.method !== 'GET') return next()
          const repos = fs.existsSync(reposRoot)
            ? fs.readdirSync(reposRoot, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => path.join(reposRoot, item.name))
            : []
          sendJson(res, 200, { ok: true, action: 'repos', output: '', payload: { repos } })
        })

        server.middlewares.use('/api/mission-control/repo-action', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const body = (await getRequestBody(req)) as BridgeRequest
          const action = String(body?.action || '')
          const repoPath = String(body?.repoPath || '')
          const scripts = parseRepoScripts(repoPath)

          if (!repoPath || !fs.existsSync(repoPath)) {
            sendJson(res, 400, { ok: false, action: 'repo-action', output: '', error: 'Valid repoPath is required' })
            return
          }

          if (!isInside(repoPath, reposRoot) && path.resolve(repoPath) !== appRoot) {
            sendJson(res, 400, {
              ok: false,
              action: 'repo-action',
              output: '',
              error: `Repo actions are limited to ${reposRoot} or the dashboard app folder.`,
            })
            return
          }

          let command = ''
          let commandOutput = ''
          let exitCode = 0

          if (action === 'status') {
            const run = await runPowershell('git-safe.ps1', ['-Action', 'status', '-Repo', repoPath, '-NoPrompt'])
            command = `powershell -File git-safe.ps1 -Action status -Repo "${repoPath}" -NoPrompt`
            commandOutput = [run.output, run.error].filter(Boolean).join('\n')
            exitCode = run.code
          } else if (action === 'npmInstallPreview') {
            const run = await runPowershell('npm-safe.ps1', ['-Script', 'install', '-Repo', repoPath, '-NoPrompt', '-DryRun'])
            command = `powershell -File npm-safe.ps1 -Script install -Repo "${repoPath}" -DryRun -NoPrompt`
            commandOutput = [run.output, run.error].filter(Boolean).join('\n')
            exitCode = run.code
          } else if (action === 'npmBuild') {
            if (!scripts?.build) {
              sendJson(res, 200, { ok: false, action: 'repo-action', output: 'No build script found', error: 'Missing npm build script in package.json' })
              return
            }
            const run = await runCommand('cmd', ['/c', 'npm run build'], repoPath)
            command = `npm run build --prefix "${repoPath}"`
            commandOutput = [run.output, run.error].filter(Boolean).join('\n')
            exitCode = run.code
          } else if (action === 'npmTest') {
            if (!scripts?.test) {
              sendJson(res, 200, { ok: false, action: 'repo-action', output: 'No test script', error: 'Missing npm test script in package.json' })
              return
            }
            const run = await runCommand('cmd', ['/c', 'npm run test'], repoPath)
            command = `npm run test --prefix "${repoPath}"`
            commandOutput = [run.output, run.error].filter(Boolean).join('\n')
            exitCode = run.code
          } else if (action === 'openFolder') {
            const run = await runCommand('explorer', [repoPath], projectRoot)
            command = `explorer "${repoPath}"`
            commandOutput = [run.output, run.error].filter(Boolean).join('\n')
            exitCode = run.code
          } else if (action === 'backup') {
            const target = path.join(backupsRoot, `${path.basename(repoPath)}-${new Date().toISOString().replace(/[:.]/g, '-')}`)
            ensureDir(backupsRoot)
            const run = await runCommand('robocopy', [repoPath, target, '/MIR', '/XD', '.git', 'node_modules', 'dist'], projectRoot)
            command = `robocopy "${repoPath}" "${target}" /MIR /XD .git node_modules dist`
            commandOutput = [run.output, run.error].filter(Boolean).join('\n')
            exitCode = run.code
          } else {
            sendJson(res, 400, { ok: false, action: 'repo-action', output: '', error: `Unknown action: ${action}` })
            return
          }

          const success = action === 'backup' ? exitCode >= 0 && exitCode <= 7 : exitCode === 0
          sendJson(res, 200, {
            ok: success,
            action: 'repo-action',
            command,
            output: commandOutput,
            exitCode,
            payload: { repoPath },
          })
        })

        server.middlewares.use('/api/mission-control/model-inventory', (req, res, next) => {
          if (req.method !== 'GET') return next()
          sendJson(res, 200, {
            ok: true,
            action: 'model-inventory',
            output: 'model registry loaded',
            payload: {
              records: readModelRecords(),
              planPath: path.join(outputsRoot, 'MODEL-CLEANUP-PLAN.md'),
            },
          })
        })
      },
    },
  ],
})