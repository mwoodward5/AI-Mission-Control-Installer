import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'

type RouteMode = 'auto' | 'local' | 'perplexity' | 'chatgpt' | 'claude' | 'gemini'
type AgentRoute = Exclude<RouteMode, 'auto'>
type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

type ChatMessage = {
  id: string
  at: string
  role: MessageRole
  content: string
  route?: AgentRoute
  artifactPath?: string
}

type BridgePayload<T = Record<string, unknown>> = {
  ok: boolean
  output: string
  command?: string
  error?: string
  action?: string
  route?: AgentRoute
  messages?: Array<{ role: MessageRole; content: string }>
  artifacts?: Record<string, unknown>
  response?: string
  payload?: T
}

type AgentRunResponse = {
  ok: boolean
  route: AgentRoute
  messages: Array<{ role: MessageRole; content: string }>
  response: string
  artifacts?: {
    ticketPath?: string
    promptFile?: string
    prompt?: string
    provider?: string
    outputPath?: string
    route?: AgentRoute
    providerResponsePath?: string
    ticketId?: string
  }
}

type HealthPayload = {
  bridge?: string
  route?: string
  scripts?: { path?: string; exists?: boolean }
  repos?: { path?: string; exists?: boolean }
  tickets?: { path?: string; exists?: boolean }
  outputs?: { path?: string; exists?: boolean }
  logs?: { path?: string; exists?: boolean }
  models?: { path?: string; exists?: boolean }
  backups?: { path?: string; exists?: boolean }
}

type RepoAction = 'status' | 'npmInstallPreview' | 'npmBuild' | 'npmTest' | 'openFolder' | 'backup'

type SpeechCtor = new () => SpeechRecognitionLike

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  start: () => void
  stop: () => void
}

const STORAGE_KEY = 'ai-mission-control-computerplexity-chat-v1'
const SETTINGS_KEY = 'ai-mission-control-computerplexity-settings-v1'

const routeLabels: Record<AgentRoute, string> = {
  local: 'local',
  perplexity: 'Perplexity',
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
}

function now() {
  return new Date().toLocaleString()
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000).toString(36)}`
}

function asRoute(value: unknown): RouteMode {
  if (value === 'local' || value === 'perplexity' || value === 'chatgpt' || value === 'claude' || value === 'gemini') return value
  return 'auto'
}

function copyText(content: string) {
  if (!content) return
  return navigator.clipboard?.writeText(content)
}

function clampLocalLog(lines: string[], max = 80) {
  return lines.slice(-max)
}

function inferTicketId(ticketPath = '') {
  const match = ticketPath.match(/([^\\/]+)\.json$/)
  return match?.[1]
}

async function bridgePost<T = BridgePayload>(url: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = (await response.json()) as T
  if (!response.ok) {
    throw new Error((payload as BridgePayload).error || (payload as BridgePayload).output || `Bridge request failed: ${response.status}`)
  }
  return payload
}

function extractToolMessages(items: Array<{ role: MessageRole; content: string }>, route: AgentRoute) {
  return items.map((entry) => ({
    id: makeId(),
    at: now(),
    role: entry.role === 'assistant' ? 'tool' : entry.role,
    content: entry.content,
    route,
  }))
}

async function bridgeGet<T = BridgePayload>(url: string): Promise<T> {
  const response = await fetch(url)
  const payload = (await response.json()) as T
  if (!response.ok) {
    throw new Error((payload as BridgePayload).error || (payload as BridgePayload).output || `Bridge request failed: ${response.status}`)
  }
  return payload
}

export default function ComputerPlexityApp() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as ChatMessage[]) : []
    } catch {
      return []
    }
  })

  const [health, setHealth] = useState<HealthPayload | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [routeMode, setRouteMode] = useState<RouteMode>('auto')
  const [showDebug, setShowDebug] = useState(false)
  const [repos, setRepos] = useState<string[]>([])
  const [selectedRepo, setSelectedRepo] = useState('')
  const [rawOutput, setRawOutput] = useState<string[]>(() => ['Ready.'])
  const [latestRoute, setLatestRoute] = useState<AgentRoute>('local')
  const [pendingPaste, setPendingPaste] = useState<{ messageId: string; route: AgentRoute; ticketPath?: string; promptFile?: string; ticketId?: string } | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [ticketPathForLastRun, setTicketPathForLastRun] = useState('')
  const [promptPathForLastRun, setPromptPathForLastRun] = useState('')
  const [chatPathForLastRun, setChatPathForLastRun] = useState('')
  const [responsePathForLastRun, setResponsePathForLastRun] = useState('')
  const [listening, setListening] = useState(false)
  const [micAvailable, setMicAvailable] = useState(false)
  const [runningStatus, setRunningStatus] = useState('ready')

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  const latestSystemMessages = useMemo(() => {
    const events = messages.filter((m) => m.role === 'tool' || m.role === 'system')
    return events.slice(-8)
  }, [messages])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-250)))
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ routeMode }))
  }, [messages, routeMode])

  useEffect(() => {
    bridgeGet<{ ok: boolean; payload?: HealthPayload }>('/api/mission-control/health')
      .then((res) => setHealth(res.payload ?? null))
      .catch(() => setHealth(null))

    bridgeGet<{ ok: boolean; payload?: { repos?: string[] } }>('/api/mission-control/repos')
      .then((res) => {
        const found = res.payload?.repos || []
        setRepos(found)
        if (!selectedRepo && found.length > 0) setSelectedRepo(found[0])
      })
      .catch(() => {
        setRepos([])
      })

    try {
      const saved = localStorage.getItem(SETTINGS_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { routeMode?: RouteMode }
        if (parsed?.routeMode) setRouteMode(asRoute(parsed.routeMode))
      }
    } catch {
      setRouteMode('auto')
    }

    const speechFactory = (window as Window & { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }).SpeechRecognition
      || (window as Window & { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition
    setMicAvailable(Boolean(speechFactory))
  }, [selectedRepo])

  const appendMessage = (message: Omit<ChatMessage, 'id'>) => {
    setMessages((prev) => [...prev, { ...message, id: makeId() }].slice(-300))
  }

  const appendSystemLine = (content: string, route?: AgentRoute) => {
    appendMessage({ at: now(), role: 'system', content, route })
  }

  const addTerminalLine = (line: string) => {
    setRawOutput((prev) => clampLocalLog([...prev, `${new Date().toLocaleTimeString()} ${line}`], 200))
  }

  const updateTerminalFromBridge = (label: string, response: BridgePayload) => {
    const output = [response.output, response.error].filter(Boolean).join(' | ')
    if (response.command) {
      addTerminalLine(`${label} cmd: ${response.command}`)
    }
    if (output) {
      addTerminalLine(`${label}: ${output.slice(0, 280)}`)
    }
  }

  const saveChatTranscript = async (fullChat: ChatMessage[], artifacts?: AgentRunResponse['artifacts']) => {
    const payload = {
      savedAt: new Date().toISOString(),
      route: latestRoute,
      chat: fullChat,
      artifacts: artifacts || {},
    }
    const response = await bridgePost<{ ok: boolean; payload?: { chatPath?: string } }>('/api/mission-control/save-chat', payload)
    setChatPathForLastRun(response.payload?.chatPath || '')
    addTerminalLine(`Saved chat to ${response.payload?.chatPath || 'outputs/chats'}`)
    appendSystemLine('saved output', latestRoute)
  }

  const saveProviderResponse = async () => {
    if (!pendingPaste || !pasteText.trim()) return
    const payload = {
      route: pendingPaste.route,
      ticketPath: pendingPaste.ticketPath,
      promptFile: pendingPaste.promptFile,
      ticketId: pendingPaste.ticketId,
      content: pasteText,
      source: 'ui',
    }

    const response = await bridgePost<{ ok: boolean; payload?: { outputPath?: string } }>('/api/mission-control/save-provider-response', payload)
    const path = response.payload?.outputPath || ''
    setResponsePathForLastRun(path)
    setPendingPaste(null)
    setPasteText('')
    addTerminalLine(`Saved provider response to ${path || 'outputs/provider-responses'}`)
    appendMessage({ role: 'assistant', content: 'Answer saved. Here are the local next actions to apply locally from the pasted answer.', route: pendingPaste.route, at: now() })
    appendMessage({ role: 'system', content: 'saved output', route: pendingPaste.route, at: now() })
  }

  const onSubmitPrompt = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    const input = promptText.trim()
    if (!input || isRunning) return

    setIsRunning(true)
    setRunningStatus('mission-running')
    stopListening(false)

    const userMsg: ChatMessage = {
      id: makeId(),
      at: now(),
      role: 'user',
      content: input,
      route: routeMode === 'auto' ? undefined : routeMode,
    }
    const baseMessages: ChatMessage[] = [...messages, userMsg]
    setMessages((prev) => [...prev, userMsg].slice(-300))
    setPromptText('')

    const toolStart = [
      { role: 'system', content: '🧠 choosing provider', route: routeMode === 'auto' ? undefined : routeMode, at: now() },
    ] as Array<{ role: MessageRole; content: string; route?: AgentRoute; at: string }>

    setMessages((prev) => [...prev, ...toolStart.map((entry) => ({ ...entry, id: makeId() })).slice(-300)])

    try {
      const agentResponse = await bridgePost<AgentRunResponse>('/api/mission-control/agent-run', {
        message: input,
        mode: routeMode,
      })
      const route = agentResponse.route
      setLatestRoute(route)

      const toolMessages = extractToolMessages(agentResponse.messages || [], route)
      const responseMessage: ChatMessage = {
        id: makeId(),
        at: now(),
        role: 'assistant',
        content: agentResponse.response || 'No response received from mission-runner.',
        route,
      }

      const afterRun: ChatMessage[] = [...baseMessages, ...toolMessages, responseMessage]
      setMessages((prev) => [...prev, ...toolMessages, responseMessage].slice(-300))

      if (agentResponse.artifacts?.ticketPath) {
        setTicketPathForLastRun(agentResponse.artifacts.ticketPath)
        appendMessage({ role: 'system', content: 'saved ticket', route, at: now() })
      }
      if (agentResponse.artifacts?.promptFile) {
        setPromptPathForLastRun(agentResponse.artifacts.promptFile)
      }

      if (agentResponse.artifacts?.prompt) {
        await copyText(agentResponse.artifacts.prompt)
        appendMessage({ role: 'system', content: 'prompt copied', route, at: now() })
      }

      if (route !== 'local' && agentResponse.artifacts?.promptFile && agentResponse.artifacts.ticketPath) {
        setPendingPaste({
          messageId: responseMessage.id,
          route,
          ticketPath: agentResponse.artifacts.ticketPath,
          promptFile: agentResponse.artifacts.promptFile,
          ticketId: inferTicketId(agentResponse.artifacts.ticketPath),
        })
      }

      await saveChatTranscript(afterRun, agentResponse.artifacts)
      updateTerminalFromBridge('agent-run', {
        ok: agentResponse.ok,
        output: responseMessage.content,
        command: route === 'local' ? 'local route selected' : `browser route: ${route}`,
        payload: agentResponse.artifacts,
      })
      setRunningStatus('done')
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err)
      setRunningStatus('failed')
      appendMessage({ role: 'tool', content: `build failed: ${errorText}`, route: latestRoute, at: now() })
    } finally {
      setIsRunning(false)
      setRunningStatus('done')
    }
  }

  const onComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void onSubmitPrompt()
    }
  }

  const runSystemCheck = async () => {
    setRunningStatus('checking')
    appendSystemLine('checking local machine', latestRoute)
    try {
      const response = await bridgePost<BridgePayload>('/api/mission-control/system-check', {})
      appendSystemLine('build passed', latestRoute)
      updateTerminalFromBridge('system-check', response)
    } catch (err) {
      appendSystemLine('build failed', latestRoute)
      addTerminalLine(err instanceof Error ? err.message : String(err))
    } finally {
      setRunningStatus('done')
    }
  }

  const runModelScan = async () => {
    setRunningStatus('checking')
    appendSystemLine('checking local machine', latestRoute)
    try {
      const response = await bridgePost<BridgePayload<{ summary?: { modelCleanupPlanPath?: string }; modelCleanupPlanPath?: string }>>(
        '/api/mission-control/model-scan',
      )
      if (response.payload?.summary?.modelCleanupPlanPath) {
        addTerminalLine(`Model cleanup plan: ${response.payload.summary.modelCleanupPlanPath}`)
      }
      appendSystemLine('prompt copied', latestRoute)
      appendSystemLine('saved output', latestRoute)
      updateTerminalFromBridge('model-scan', response)
    } catch (err) {
      appendSystemLine('build failed', latestRoute)
      addTerminalLine(err instanceof Error ? err.message : String(err))
    } finally {
      setRunningStatus('done')
    }
  }

  const runBenchmark = async () => {
    setRunningStatus('running')
    appendSystemLine('running safe command', latestRoute)
    try {
      const response = await bridgePost<BridgePayload>('/api/mission-control/model-benchmark')
      appendSystemLine('saved output', latestRoute)
      updateTerminalFromBridge('model-benchmark', response)
    } catch (err) {
      appendSystemLine('build failed', latestRoute)
      addTerminalLine(err instanceof Error ? err.message : String(err))
    } finally {
      setRunningStatus('done')
    }
  }

  const runRepoAction = async (action: RepoAction) => {
    if (!selectedRepo) {
      appendMessage({ role: 'tool', content: 'build failed: no repo selected', route: latestRoute, at: now() })
      return
    }

    const labels: Record<RepoAction, string> = {
      status: 'git status',
      npmInstallPreview: 'npm install preview',
      npmBuild: 'npm run build',
      npmTest: 'npm run test',
      openFolder: 'open folder',
      backup: 'create backup before edits',
    }

    try {
      appendSystemLine(`🧪 running safe command: ${labels[action]}`, latestRoute)
      const response = await bridgePost<BridgePayload>('/api/mission-control/repo-action', { action, repoPath: selectedRepo })
      appendSystemLine(response.ok ? 'build passed' : 'build failed', latestRoute)
      updateTerminalFromBridge(`repo-action:${action}`, response)
    } catch (err) {
      appendSystemLine('build failed', latestRoute)
      addTerminalLine(err instanceof Error ? err.message : String(err))
    }
  }

  const runBrowserPaste = async () => {
    if (!pendingPaste) return
    await saveProviderResponse()
  }

  const startListening = () => {
    if (!micAvailable) {
      appendMessage({ role: 'tool', content: 'This browser does not support SpeechRecognition.', at: now(), route: latestRoute })
      return
    }

    const SpeechRecognition = (window as Window & { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }).SpeechRecognition
      || (window as Window & { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition
    if (!SpeechRecognition) return

    if (listening) {
      recognitionRef.current?.stop()
      return
    }

    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event) => {
      const finalText = Array.from(event.results)
        .slice(event.resultIndex)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim()
      if (finalText) {
        setPromptText((prev) => (prev ? `${prev} ${finalText}` : finalText))
      }
    }

    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)

    recognition.start()
    setListening(true)
    appendSystemLine('🎙️ listening', latestRoute)
    setTimeout(() => composerRef.current?.focus(), 0)
  }

  const stopListening = (restoreComposer = true) => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setListening(false)
    if (restoreComposer) {
      setTimeout(() => composerRef.current?.focus(), 0)
    }
  }

  const statusChips = latestSystemMessages.map((message) => message.content).filter(Boolean)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-4 sm:px-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-300/25 bg-slate-900/70 p-3 shadow-[0_0_20px_rgba(16,185,129,0.12)] backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">ComputerPlexity / AI Mission Control</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">AI Mission Control</h1>
            <p className="mt-1 text-xs text-slate-300">Bridge: {health?.bridge ? 'online' : 'offline'} • Active route: {latestRoute ? routeLabels[latestRoute] : 'auto'}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-cyan-300/40 bg-cyan-500/15 px-3 py-1 text-xs text-cyan-100">{runningStatus}</span>
            <button
              type="button"
              onClick={() => setShowDebug((prev) => !prev)}
              title="Show debug controls"
              className="rounded-full border border-slate-500/70 px-3 py-1 text-sm transition hover:border-cyan-400 hover:bg-cyan-500/20"
            >
              ⚙
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/35">
          <div className="flex-1 overflow-auto px-3 py-4 sm:px-5">
            <div className="mb-3 flex flex-wrap gap-2">
              {statusChips.map((status) => (
                <span key={status} className="inline-flex rounded-full border border-cyan-300/35 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
                  {status}
                </span>
              ))}
            </div>

            <div className="space-y-3 pb-4">
              {messages.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-700 bg-slate-800/40 px-4 py-6 text-sm text-slate-300">
                  Start a mission. The router will choose local / Perplexity / ChatGPT / Claude / Gemini automatically.
                </p>
              ) : (
                messages.map((msg) => {
                  const isUser = msg.role === 'user'
                  const isTool = msg.role === 'tool' || msg.role === 'system'
                  return (
                    <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[88%] rounded-2xl px-4 py-2 text-sm shadow ${
                          isUser
                            ? 'bg-cyan-500/20 border border-cyan-300/30'
                            : isTool
                              ? 'bg-slate-800/70 border border-slate-600/60 text-slate-200'
                              : 'bg-emerald-600/15 border border-emerald-400/40 text-emerald-100'
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">
                          {msg.role} {msg.route ? `• ${routeLabels[msg.route]}` : ''}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {pendingPaste ? (
              <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-900/25 p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.25em] text-emerald-200/70">Paste provider answer</p>
                <textarea
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  className="h-28 w-full resize-y rounded-xl border border-emerald-400/30 bg-black/20 p-3 text-sm text-emerald-100"
                  placeholder="Paste the provider answer here when it appears in your browser window."
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void runBrowserPaste()}
                    className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-black"
                  >
                    Save provider answer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingPaste(null)
                      setPasteText('')
                    }}
                    className="rounded-xl border border-slate-500 px-3 py-2 text-sm text-slate-200"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <form
            onSubmit={onSubmitPrompt}
            className="flex gap-2 border-t border-slate-700/80 p-3"
          >
            <textarea
              ref={composerRef}
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              onKeyDown={onComposerKey}
              placeholder="Type your mission"
              className="min-h-24 flex-1 resize-y rounded-2xl border border-slate-600 bg-slate-900/50 px-4 py-3 text-sm text-slate-100 outline-none ring-cyan-300/40 focus:ring-1"
            />
            <div className="flex flex-col gap-2">
              <button
                type="button"
                title={listening ? 'Stop dictation' : 'Start dictation'}
                onClick={() => void startListening()}
                disabled={!micAvailable}
                className={`rounded-xl px-3 py-2 text-sm ${
                  listening
                    ? 'bg-rose-500 text-white'
                    : 'border border-slate-500 bg-slate-800 text-slate-200'
                }`}
              >
                🎤
              </button>
              <button
                type="submit"
                disabled={isRunning || !promptText.trim()}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                Go
              </button>
            </div>
          </form>
        </main>

        {showDebug ? (
          <section className="mt-4 space-y-3 rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="mb-3 text-sm text-slate-200">Debug controls</div>

            <div className="grid gap-2 rounded-xl border border-slate-700 bg-slate-950/70 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <button type="button" onClick={() => void runSystemCheck()} className="rounded-xl border border-slate-500 px-3 py-2 text-sm">System check</button>
              <button type="button" onClick={() => void runModelScan()} className="rounded-xl border border-slate-500 px-3 py-2 text-sm">Model scan</button>
              <button type="button" onClick={() => void runBenchmark()} className="rounded-xl border border-slate-500 px-3 py-2 text-sm">Benchmark</button>
              <button
                type="button"
                onClick={() => void onSubmitPrompt()}
                className="rounded-xl border border-slate-500 px-3 py-2 text-sm"
              >
                route last mission again
              </button>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
              <p className="mb-2 text-sm font-semibold">Provider override</p>
              <select
                className="rounded-xl border border-slate-600 bg-slate-900/90 px-3 py-2 text-sm text-slate-100"
                value={routeMode}
                onChange={(event) => setRouteMode(asRoute(event.target.value as RouteMode))}
              >
                <option value="auto">auto</option>
                <option value="local">local</option>
                <option value="perplexity">perplexity</option>
                <option value="chatgpt">chatgpt</option>
                <option value="claude">claude</option>
                <option value="gemini">gemini</option>
              </select>
            </div>

            <div className="grid gap-2 rounded-xl border border-slate-700 bg-slate-950/70 p-3 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold">Repo actions</p>
                <select
                  className="mb-2 w-full rounded-xl border border-slate-600 bg-slate-900/90 px-3 py-2 text-sm text-slate-100"
                  value={selectedRepo}
                  onChange={(event) => setSelectedRepo(event.target.value)}
                >
                  {repos.map((repo) => (
                    <option key={repo} value={repo}>
                      {repo}
                    </option>
                  ))}
                </select>
                <div className="grid gap-2 sm:grid-cols-3">
                  <button type="button" onClick={() => void runRepoAction('status')} className="rounded-xl border border-slate-500 px-3 py-2 text-xs">git status</button>
                  <button type="button" onClick={() => void runRepoAction('npmInstallPreview')} className="rounded-xl border border-slate-500 px-3 py-2 text-xs">npm install preview</button>
                  <button type="button" onClick={() => void runRepoAction('npmBuild')} className="rounded-xl border border-slate-500 px-3 py-2 text-xs">npm run build</button>
                  <button type="button" onClick={() => void runRepoAction('npmTest')} className="rounded-xl border border-slate-500 px-3 py-2 text-xs">npm test</button>
                  <button type="button" onClick={() => void runRepoAction('openFolder')} className="rounded-xl border border-slate-500 px-3 py-2 text-xs">open folder</button>
                  <button type="button" onClick={() => void runRepoAction('backup')} className="rounded-xl border border-slate-500 px-3 py-2 text-xs">create backup</button>
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">Artifacts</p>
                <div className="space-y-1 text-xs text-slate-300">
                  <p>Tickets: {health?.tickets?.path || 'C:\\AICommandCenter\\tickets'}</p>
                  <p>Outputs: {health?.outputs?.path || 'C:\\AICommandCenter\\outputs'}</p>
                  <p>Latest ticket: {ticketPathForLastRun || 'not created yet'}</p>
                  <p>Latest prompt: {promptPathForLastRun || 'not created yet'}</p>
                  <p>Latest chat: {chatPathForLastRun || 'not created yet'}</p>
                  <p>Latest provider answer: {responsePathForLastRun || 'not saved yet'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
              <p className="mb-2 text-sm font-semibold">Raw terminal/log output</p>
              <pre className="max-h-40 overflow-auto rounded-lg bg-black/70 p-3 text-[11px] leading-relaxed text-slate-200">
                {rawOutput.join('\n')}
              </pre>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
