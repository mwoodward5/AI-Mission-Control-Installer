import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'

type TicketStatus =
  | 'queued'
  | 'scanning'
  | 'local-in-progress'
  | 'browser-ready'
  | 'awaiting-browser-answer'
  | 'patching'
  | 'build-running'
  | 'done'
  | 'build-failed'

type TicketType =
  | 'Code build'
  | 'Code repair'
  | 'Repo scan'
  | 'Web research'
  | 'SEO report'
  | 'Landing page generation'
  | 'Dashboard generation'
  | 'PDF/report writing'
  | 'Image generation prompt'
  | 'Video generation prompt'
  | 'Lovable prompt generation'
  | 'GitHub cleanup'
  | 'Vercel deployment prep'

type ProviderName =
  | 'Local Ollama/LM Studio'
  | 'Perplexity Max (browser)'
  | 'ChatGPT Pro/Max (browser)'
  | 'Claude/Sonnet (browser)'
  | 'Gemini (browser)'
  | 'OpenClaw (browser)'

type StatusLevel = 'pass' | 'warn' | 'fail' | 'unknown'

type Activity = {
  id: string
  time: string
  icon: string
  text: string
  ticketId?: string
}

type Ticket = {
  id: string
  title: string
  ticketType: TicketType
  repoPath: string
  prompt: string
  provider: ProviderName
  providerAlternates: ProviderName[]
  status: TicketStatus
  createdAt: string
  updatedAt: string
  savedPath?: string
}

type SystemCheck = {
  node: StatusLevel
  npm: StatusLevel
  git: StatusLevel
  powershell: StatusLevel
  ollama: StatusLevel
  lmStudio: StatusLevel
}

type ModelRecord = {
  name: string
  source: 'Ollama' | 'LM Studio' | 'Imported'
  sizeGB?: number
  recommendation: 'KEEP' | 'OPTIONAL KEEP' | 'ARCHIVE' | 'DELETE CANDIDATE' | 'REPLACE WITH BETTER MODEL'
  reason?: string
}

type TerminalLine = {
  id: string
  time: string
  action: string
  command: string
  output: string
  status: 'running' | 'ok' | 'warn'
}

type NpmState = {
  build: { status: 'not-run' | 'passed' | 'failed'; lastRun: string | null; runtimeMs: number | null; output?: string }
  test: { status: 'not-run' | 'passed' | 'failed'; lastRun: string | null; runtimeMs: number | null; output?: string }
  installPreview: { status: 'not-run' | 'passed' | 'failed'; lastRun: string | null; runtimeMs: number | null; output?: string }
}

type RepoActionResponse = {
  ok: boolean
  action: string
  output: string
  command?: string
  error?: string
  exitCode?: number
  payload?: Record<string, unknown>
}

type BridgePayload<T> = {
  ok: boolean
  action: string
  command?: string
  output: string
  error?: string
  exitCode?: number
  payload?: T
}

type AppState = {
  tickets: Ticket[]
  activities: Activity[]
  systemCheck: SystemCheck
  modelInventory: ModelRecord[]
  terminalLog: TerminalLine[]
  npmState: NpmState
  gitStatus: string
  modelScanPath: string
  benchmarkPath: string
  repos: string[]
  selectedRepo: string
}

declare global {
  interface Window {
    SpeechRecognition?: typeof SpeechRecognition
    webkitSpeechRecognition?: typeof SpeechRecognition
  }
}

type RepoListPayload = { repos: string[] }

type ModelInventoryPayload = {
  records: ModelRecord[]
  planPath?: string
}

type ModelScanPayload = {
  records: ModelRecord[]
  summary?: {
    modelsFound?: number
    duplicateGroups?: number
  }
  modelCleanupPlanPath?: string
}

type BenchmarkPayload = {
  resultsPath?: string
  markdownPath?: string
}

const FALLBACK_MODELS: ModelRecord[] = [
  {
    name: 'qwen2.5-coder',
    source: 'Ollama',
    sizeGB: 7.2,
    recommendation: 'KEEP',
    reason: 'Keep until benchmark says otherwise.',
  },
]

const PROVIDERS: Record<TicketType, ProviderName[]> = {
  'Repo scan': ['Local Ollama/LM Studio', 'Perplexity Max (browser)'],
  'Code build': ['Local Ollama/LM Studio', 'ChatGPT Pro/Max (browser)'],
  'Code repair': ['Local Ollama/LM Studio', 'Claude/Sonnet (browser)'],
  'Web research': ['Perplexity Max (browser)', 'ChatGPT Pro/Max (browser)'],
  'SEO report': ['Perplexity Max (browser)', 'Claude/Sonnet (browser)'],
  'Landing page generation': ['ChatGPT Pro/Max (browser)', 'Gemini (browser)'],
  'Dashboard generation': ['ChatGPT Pro/Max (browser)', 'Local Ollama/LM Studio'],
  'PDF/report writing': ['Claude/Sonnet (browser)', 'Gemini (browser)'],
  'Image generation prompt': ['ChatGPT Pro/Max (browser)', 'Gemini (browser)'],
  'Video generation prompt': ['ChatGPT Pro/Max (browser)', 'Gemini (browser)'],
  'Lovable prompt generation': ['ChatGPT Pro/Max (browser)', 'OpenClaw (browser)'],
  'GitHub cleanup': ['Claude/Sonnet (browser)', 'Local Ollama/LM Studio'],
  'Vercel deployment prep': ['ChatGPT Pro/Max (browser)', 'Claude/Sonnet (browser)'],
}

const ticketTypes: TicketType[] = [
  'Code build',
  'Code repair',
  'Repo scan',
  'Web research',
  'SEO report',
  'Landing page generation',
  'Dashboard generation',
  'PDF/report writing',
  'Image generation prompt',
  'Video generation prompt',
  'Lovable prompt generation',
  'GitHub cleanup',
  'Vercel deployment prep',
]

const providerStyles: Record<ProviderName, { badge: string; dot: string }> = {
  'Local Ollama/LM Studio': {
    badge: 'bg-emerald-400/20 text-emerald-200 border-emerald-300/50',
    dot: 'bg-emerald-400',
  },
  'Perplexity Max (browser)': {
    badge: 'bg-cyan-400/20 text-cyan-100 border-cyan-300/60',
    dot: 'bg-cyan-300',
  },
  'ChatGPT Pro/Max (browser)': {
    badge: 'bg-fuchsia-400/20 text-fuchsia-100 border-fuchsia-300/60',
    dot: 'bg-fuchsia-300',
  },
  'Claude/Sonnet (browser)': {
    badge: 'bg-orange-400/20 text-orange-100 border-orange-300/60',
    dot: 'bg-orange-300',
  },
  'Gemini (browser)': {
    badge: 'bg-indigo-400/20 text-indigo-100 border-indigo-300/60',
    dot: 'bg-indigo-300',
  },
  'OpenClaw (browser)': {
    badge: 'bg-rose-400/20 text-rose-100 border-rose-300/60',
    dot: 'bg-rose-300',
  },
}

const statusLights: Record<TicketStatus, string> = {
  queued: 'bg-slate-500',
  scanning: 'bg-blue-400 animate-pulse',
  'local-in-progress': 'bg-emerald-400',
  'browser-ready': 'bg-cyan-400',
  'awaiting-browser-answer': 'bg-amber-400',
  patching: 'bg-fuchsia-400',
  'build-running': 'bg-violet-400 animate-pulse',
  done: 'bg-emerald-500',
  'build-failed': 'bg-red-500',
}

const statusText: Record<TicketStatus, string> = {
  queued: 'Queued',
  scanning: 'Scanning',
  'local-in-progress': 'Local',
  'browser-ready': 'Browser ready',
  'awaiting-browser-answer': 'Awaiting answer',
  patching: 'Applying patch',
  'build-running': 'Build running',
  done: 'Done',
  'build-failed': 'Build failed',
}

const activityCatalog = [
  '🧠 choosing provider',
  '🧹 scanning repo locally',
  '💸 avoiding cloud tokens',
  '🌐 opening Perplexity',
  '💬 prompt copied',
  '📋 waiting for answer',
  '🧰 applying local patch',
  '🧪 running build',
  '✅ build passed',
  '🔴 build failed',
]

const providerForType: Record<TicketType, ProviderName> = {
  'Repo scan': 'Local Ollama/LM Studio',
  'Code build': 'Local Ollama/LM Studio',
  'Code repair': 'Local Ollama/LM Studio',
  'Web research': 'Perplexity Max (browser)',
  'SEO report': 'Perplexity Max (browser)',
  'Landing page generation': 'ChatGPT Pro/Max (browser)',
  'Dashboard generation': 'ChatGPT Pro/Max (browser)',
  'PDF/report writing': 'Claude/Sonnet (browser)',
  'Image generation prompt': 'Gemini (browser)',
  'Video generation prompt': 'Gemini (browser)',
  'Lovable prompt generation': 'OpenClaw (browser)',
  'GitHub cleanup': 'Claude/Sonnet (browser)',
  'Vercel deployment prep': 'ChatGPT Pro/Max (browser)',
}

const SYSTEM_STORAGE_KEY = 'aimissioncenter_state_v2'

function now() {
  return new Date().toISOString()
}

function newId() {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1000000).toString(36)}`
}

function statusColor(level: StatusLevel) {
  if (level === 'pass') return 'bg-emerald-400'
  if (level === 'warn') return 'bg-amber-300'
  if (level === 'fail') return 'bg-red-500'
  return 'bg-slate-500'
}

function statusTextValue(level: StatusLevel) {
  if (level === 'pass') return 'PASS'
  if (level === 'warn') return 'WARN'
  if (level === 'fail') return 'FAIL'
  return 'UNKNOWN'
}

function statusChip(level: StatusLevel) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
        level === 'pass'
          ? 'bg-emerald-900/40 text-emerald-200 border border-emerald-300/40'
          : level === 'warn'
            ? 'bg-amber-900/40 text-amber-200 border border-amber-300/40'
            : level === 'fail'
              ? 'bg-rose-900/40 text-rose-200 border border-rose-300/40'
              : 'bg-slate-900/40 text-slate-300 border border-slate-500/40'
      }`}
    >
      <span className={`h-2 w-2 mr-1.5 rounded-full ${statusColor(level)}`} />
      {statusTextValue(level)}
    </span>
  )
}

function defaultSystemCheck(): SystemCheck {
  return { node: 'unknown', npm: 'unknown', git: 'unknown', powershell: 'pass', ollama: 'warn', lmStudio: 'warn' }
}

function buildPrompt(ticket: Ticket) {
  const base = `Task: ${ticket.title}\nType: ${ticket.ticketType}\nRepo: ${ticket.repoPath || 'Not specified'}\nPrompt: ${ticket.prompt || '(no prompt text)'}`

  if (ticket.provider === 'Local Ollama/LM Studio') {
    return `${base}\n\nLocal-first execution request:\n- Keep edits minimal\n- Prefer local-only approach and exact file edits\n- Avoid adding new external tools without explicit approval`
  }

  if (ticket.provider === 'Perplexity Max (browser)') {
    return `${base}\n\nNeed current web research with citations.\n- Compare vendors and alternatives\n- Focus on practical migration plan\n- Include citations and next actions`
  }

  if (ticket.provider === 'ChatGPT Pro/Max (browser)') {
    return `${base}\n\nStrong coding/design routing:\n- Give final patch plan + architecture recommendation\n- Add clear test and rollback steps\n- Keep costs low by reusing what already exists`
  }

  if (ticket.provider === 'Claude/Sonnet (browser)') {
    return `${base}\n\nCareful long-form planning:\n- Conservative refactor steps\n- Risks + rollbacks + assumptions\n- Safety and cleanup checklist`
  }

  return `${base}\n\nGenerate a structured answer with short decisions and concrete commands.`
}

function parseStatus(obj: any): StatusLevel {
  if (obj === 'pass') return 'pass'
  if (obj === 'warn') return 'warn'
  if (obj === 'fail') return 'fail'
  return 'unknown'
}

function normalizeSystemResult(raw: any): SystemCheck {
  if (!raw || typeof raw !== 'object') return defaultSystemCheck()
  return {
    node: parseStatus(raw?.node),
    npm: parseStatus(raw?.npm),
    git: parseStatus(raw?.git),
    powershell: parseStatus(raw?.powershell),
    ollama: parseStatus(raw?.ollama),
    lmStudio: parseStatus(raw?.lmStudio),
  }
}

function normalizeModelRecords(records: any[]): ModelRecord[] {
  if (!Array.isArray(records)) return FALLBACK_MODELS
  return records
    .map((item) => {
      if (!item?.name) return null
      return {
        name: String(item.name),
        source: (item.source === 'LM Studio' || item.source === 'Ollama' ? item.source : 'Imported') as ModelRecord['source'],
        sizeGB: item.sizeGB !== undefined && item.sizeGB !== null ? Number(item.sizeGB) : undefined,
        recommendation: (item.recommendation ??
          'OPTIONAL KEEP') as ModelRecord['recommendation'],
        reason: item.reason ? String(item.reason) : undefined,
      } as ModelRecord
    })
    .filter(Boolean) as ModelRecord[]
}

function estimatedSavings(tickets: Ticket[]) {
  const localCount = tickets.filter((ticket) => ticket.provider === 'Local Ollama/LM Studio').length
  const estimated = localCount * 0.4
  const cloudCalls = tickets.length - localCount
  return {
    avoidValue: estimated.toFixed(2),
    cloudCalls,
  }
}

function App() {
  const [state, setState] = useState<AppState>(() => {
    try {
      const raw = localStorage.getItem(SYSTEM_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppState>
        return {
          tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
          activities: Array.isArray(parsed.activities) ? parsed.activities : [],
          systemCheck: parsed.systemCheck ?? defaultSystemCheck(),
          modelInventory: normalizeModelRecords(Array.isArray(parsed.modelInventory) ? parsed.modelInventory : []),
          terminalLog: Array.isArray(parsed.terminalLog)
            ? parsed.terminalLog
            : [
                {
                  id: newId(),
                  time: now(),
                  action: 'start',
                  command: 'Dashboard ready',
                  output: 'Local state loaded from browser storage.',
                  status: 'ok',
                },
              ],
          npmState: parsed.npmState ?? {
            build: { status: 'not-run', lastRun: null, runtimeMs: null },
            test: { status: 'not-run', lastRun: null, runtimeMs: null },
            installPreview: { status: 'not-run', lastRun: null, runtimeMs: null },
          },
          gitStatus: parsed.gitStatus ?? 'No status yet.',
          modelScanPath: parsed.modelScanPath ?? 'Not run',
          benchmarkPath: parsed.benchmarkPath ?? 'Not run',
          repos: Array.isArray(parsed.repos) ? parsed.repos : [],
          selectedRepo: parsed.selectedRepo ?? '',
        }
      }
    } catch {}
    return {
      tickets: [],
      activities: [],
      systemCheck: defaultSystemCheck(),
      modelInventory: FALLBACK_MODELS,
      terminalLog: [
        {
          id: newId(),
          time: now(),
          action: 'start',
          command: 'Dashboard started',
          output: 'No runs yet',
          status: 'ok',
        },
      ],
      npmState: {
        build: { status: 'not-run', lastRun: null, runtimeMs: null },
        test: { status: 'not-run', lastRun: null, runtimeMs: null },
        installPreview: { status: 'not-run', lastRun: null, runtimeMs: null },
      },
      gitStatus: 'No status yet.',
      modelScanPath: 'Not run',
      benchmarkPath: 'Not run',
      repos: [],
      selectedRepo: '',
    }
  })

  const [title, setTitle] = useState('')
  const [ticketType, setTicketType] = useState<TicketType>('Code build')
  const [repoPath, setRepoPath] = useState('')
  const [prompt, setPrompt] = useState('')
  const [selectedTicketId, setSelectedTicketId] = useState('')
  const [mediaPrompt, setMediaPrompt] = useState('')
  const [benchmarkPathField, setBenchmarkPathField] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [speechTarget, setSpeechTarget] = useState<'ticket' | 'media'>('ticket')
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    localStorage.setItem(SYSTEM_STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const [repoFolders, setRepoFolders] = useState<string[]>([])
  const [currentRepo, setCurrentRepo] = useState('')

  useEffect(() => {
    fetch('/api/mission-control/repos')
      .then((r) => r.json())
      .then((json: BridgePayload<RepoListPayload>) => {
        const repos = json?.payload?.repos ?? []
        setRepoFolders(Array.isArray(repos) ? repos : [])
        if (!state.selectedRepo && repos[0]) setCurrentRepo(repos[0])
      })
      .catch(() => {})
  }, [])

  const selectedTicket = useMemo(
    () => state.tickets.find((item) => item.id === selectedTicketId) ?? null,
    [selectedTicketId, state.tickets],
  )

  const estimate = useMemo(() => estimatedSavings(state.tickets), [state.tickets])

  const apiCall = async <T,>(url: string, body?: Record<string, unknown>, method = 'POST'): Promise<BridgePayload<T>> => {
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const payload = await res.json()
    if (!res.ok) {
      throw new Error(payload?.error ?? `request failed: ${res.status}`)
    }
    return payload
  }

  const addActivity = (icon: string, text: string, ticketId?: string) => {
    setState((prev) => ({
      ...prev,
      activities: [{ id: newId(), time: now(), icon, text, ticketId }, ...prev.activities].slice(0, 160),
    }))
  }

  const addTerminal = (action: string, command: string, output: string, status: TerminalLine['status'] = 'ok') => {
    setState((prev) => ({
      ...prev,
      terminalLog: [
        {
          id: newId(),
          time: now(),
          action,
          command,
          output,
          status,
        },
        ...prev.terminalLog,
      ].slice(0, 160),
    }))
  }

  const withTicketUpdate = (id: string, updates: Partial<Ticket>) => {
    setState((prev) => ({
      ...prev,
      tickets: prev.tickets.map((ticket) => (ticket.id === id ? { ...ticket, ...updates, updatedAt: now() } : ticket)),
    }))
  }

  const setTicketStatus = (id: string, status: TicketStatus) => withTicketUpdate(id, { status })

  const runAction = async (action: string, commandLabel: string, request: () => Promise<RepoActionResponse>) => {
    addTerminal(action, commandLabel, 'Running...', 'running')
    try {
      const result = await request()
      addTerminal(action, result.command ?? commandLabel, result.output || result.error || '', result.ok ? 'ok' : 'warn')
      return result
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      addTerminal(action, commandLabel, msg, 'warn')
      return { ok: false, action, output: msg, command: commandLabel }
    }
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  const stopListening = () => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop()
      speechRecognitionRef.current.onresult = null
      speechRecognitionRef.current.onerror = null
      speechRecognitionRef.current.onend = null
      speechRecognitionRef.current = null
    }
    setIsListening(false)
  }

  const startVoiceInput = (target: 'ticket' | 'media') => {
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Constructor) {
      addActivity('🔴', 'microphone unsupported')
      addTerminal('voice-input', 'speech recognition', 'Browser does not support SpeechRecognition API.', 'warn')
      return
    }

    if (isListening) stopListening()

    try {
      const recognition = new Constructor()
      speechRecognitionRef.current = recognition
      setSpeechTarget(target)
      setIsListening(true)

      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'
      recognition.onstart = () => {
        addActivity('🎙️', `microphone recording started (${target} prompt)`)
        addTerminal('voice-input', 'SpeechRecognition.start', `Recording into ${target} prompt`)
      }
      recognition.onresult = (event: any) => {
        const chunks: string[] = []
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          if (event.results[i].isFinal) chunks.push(event.results[i][0].transcript)
        }
        const text = chunks.join(' ').trim()
        if (!text) return
        if (target === 'ticket') {
          setPrompt((value) => (value ? `${value} ${text}` : text))
        } else {
          setMediaPrompt((value) => (value ? `${value} ${text}` : text))
        }
      }
      recognition.onerror = (event: any) => {
        const msg = event?.error ? String(event.error) : 'unknown speech recognition error'
        addActivity('🔴', `microphone error: ${msg}`)
        addTerminal('voice-input', 'SpeechRecognition.error', msg, 'warn')
        stopListening()
      }
      recognition.onend = () => {
        stopListening()
        addActivity('🎙️', `microphone recording stopped (${target} prompt)`)
      }

      recognition.start()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to start microphone.'
      addActivity('🔴', `microphone failed: ${msg}`)
      addTerminal('voice-input', 'SpeechRecognition', msg, 'warn')
      setIsListening(false)
      speechRecognitionRef.current = null
    }
  }

  const runSystemCheck = async () => {
    addActivity('🧠', 'checking provider/stack status')
    const result = await runAction('system-check', 'powershell -File check-system.ps1', () => apiCall('/api/mission-control/system-check'))
    if (result?.payload) {
      const payload = result.payload as any
      setState((prev) => ({ ...prev, systemCheck: normalizeSystemResult(payload.systemCheck ?? payload) }))
    }
  }

  const runModelScan = async () => {
    addActivity('🧹', 'checking models')
    const result = await runAction('model-scan', 'powershell -File check-models.ps1', () =>
      apiCall<ModelScanPayload>('/api/mission-control/model-scan'),
    )
    const payload = result?.payload as ModelScanPayload | undefined
    if (payload?.records) {
      setState((prev) => ({ ...prev, modelInventory: normalizeModelRecords(payload.records), modelScanPath: payload.modelCleanupPlanPath ?? 'Plan generated' }))
    }
  }

  const runBenchmark = async () => {
    addActivity('🧪', 'running tiny benchmark')
    const result = await runAction('model-benchmark', 'powershell -File benchmark-models.ps1', () =>
      apiCall<BenchmarkPayload>('/api/mission-control/model-benchmark'),
    )
    const payload = result?.payload as BenchmarkPayload | undefined
    if (payload?.markdownPath) {
      setState((prev) => ({ ...prev, benchmarkPath: payload.markdownPath! }))
      setBenchmarkPathField(payload.markdownPath!)
    }
    if (payload?.resultsPath) {
      setBenchmarkPathField(payload.resultsPath)
    }
  }

  const createTicket = async (event?: FormEvent) => {
    event?.preventDefault()
    const provider = providerForType[ticketType]
    const next: Ticket = {
      id: newId(),
      title: title.trim() || `${ticketType} request`,
      ticketType,
      repoPath: repoPath.trim(),
      prompt: prompt.trim(),
      provider,
      providerAlternates: PROVIDERS[ticketType],
      status: 'queued',
      createdAt: now(),
      updatedAt: now(),
    }

    setState((prev) => ({ ...prev, tickets: [next, ...prev.tickets] }))
    setSelectedTicketId(next.id)
    addActivity('🧠', 'choosing provider', next.id)
    if (provider === 'Local Ollama/LM Studio') addActivity('💸', 'avoiding cloud tokens', next.id)

    try {
      const saved = await apiCall<{ ticketPath?: string }>('/api/mission-control/save-ticket', { ticket: next })
      setState((prev) => ({
        ...prev,
        tickets: prev.tickets.map((item) =>
          item.id === next.id ? { ...item, savedPath: String(saved?.payload?.ticketPath ?? '') } : item,
        ),
      }))
      addTerminal('ticket-save', `Save-Content ticket-${next.id}.json`, `Ticket saved to ${saved?.payload?.ticketPath}`)
    } catch {
      addTerminal('ticket-save', `Save ticket ${next.id}`, 'Ticket created in memory only')
    }

    setTitle('')
    setRepoPath('')
    setPrompt('')
  }

  const createDemoTicket = async () => {
    setTitle('Demo repo scan + local summary')
    setTicketType('Repo scan')
    setRepoPath('C:\\AICommandCenter\\repos')
    setPrompt('Summarize repository structure and find likely build commands without calling web.')
    await createTicket()
  }

  const copyTicketPrompt = async (id: string) => {
    const ticket = state.tickets.find((item) => item.id === id)
    if (!ticket) return
    await copyToClipboard(ticket.prompt || '')
    addActivity('💬', 'prompt copied', id)
    addTerminal('copy-prompt', 'Ticket prompt', `Prompt copied to clipboard for ticket ${ticket.title}`)
  }

  const copyPrompt = async (id: string) => {
    const ticket = state.tickets.find((item) => item.id === id)
    if (!ticket) return
    const next = buildPrompt(ticket)
    await copyToClipboard(next)
    addActivity('💬', 'prompt copied', id)
    setTicketStatus(id, ticket.provider === 'Local Ollama/LM Studio' ? 'local-in-progress' : 'awaiting-browser-answer')
    if (ticket.provider !== 'Local Ollama/LM Studio') addActivity('📋', 'waiting for answer', id)
    addTerminal('copy-prompt', `Build provider prompt: ${ticket.provider}`, `Prompt copied to clipboard for ticket ${ticket.title}`)
  }

  const copyProviderPrompt = async (provider: ProviderName, ticket: Ticket) => {
    const copyText = `${provider} task prompt:\n\n${buildPrompt({ ...ticket, provider })}`
    await copyToClipboard(copyText)
    addActivity('💬', `prompt copied (${provider})`, ticket.id)
    addTerminal('provider-prompt', `Prompt provider ${provider}`, 'Prompt copied to clipboard')
  }

  const setTicketProvider = (id: string, provider: ProviderName) => {
    withTicketUpdate(id, { provider })
    addActivity('🧠', `route set to ${provider}`, id)
  }

  const openProvider = async (ticket: Ticket) => {
    addActivity('🌐', `opening ${ticket.provider}`, ticket.id)
    const result = await runAction('open-provider', `open-browser-provider.ps1 -Provider ${ticket.provider}`, () =>
      apiCall('/api/mission-control/open-provider', {
        provider: ticket.provider,
        prompt: buildPrompt(ticket),
      }),
    )
    setTicketStatus(ticket.id, ticket.provider === 'Local Ollama/LM Studio' ? 'scanning' : 'browser-ready')
    if (ticket.provider !== 'Local Ollama/LM Studio') {
      addActivity('📋', 'waiting for pasted answer', ticket.id)
    } else {
      addActivity('🧹', 'scanning repo locally', ticket.id)
    }
    if (!result.ok) addActivity('🔴', 'browser action failed', ticket.id)
  }

  const runBuildForTicket = async (id: string) => {
    const ticket = state.tickets.find((item) => item.id === id)
    if (!ticket) return
    const repoPath = ticket.repoPath || currentRepo || state.selectedRepo
    if (!repoPath) {
      addActivity('🔴', 'build failed', id)
      addTerminal('ticket-build', 'npm run build (repo ticket path)', 'No repository selected for ticket build.', 'warn')
      setTicketStatus(id, 'build-failed')
      return
    }

    setTicketStatus(id, 'build-running')
    addActivity('🧪', 'running build', id)
    const started = Date.now()
    const result = await runAction('ticket-build', 'npm run build (repo ticket path)', () =>
      apiCall<RepoActionResponse>('/api/mission-control/repo-action', {
        action: 'npmBuild',
        repoPath,
      }),
    )
    const ms = Date.now() - started
    if (result.ok) {
      setTicketStatus(id, 'done')
      addActivity('✅', 'build passed', id)
      setState((prev) => ({
        ...prev,
        npmState: {
          ...prev.npmState,
          build: { status: 'passed', lastRun: now(), runtimeMs: ms, output: result.output },
        },
      }))
    } else {
      setTicketStatus(id, 'build-failed')
      addActivity('🔴', 'build failed', id)
      setState((prev) => ({
        ...prev,
        npmState: {
          ...prev.npmState,
          build: { status: 'failed', lastRun: now(), runtimeMs: ms, output: result.output },
        },
      }))
    }
  }

  const runRepoAction = async (action: 'status' | 'npmInstallPreview' | 'npmBuild' | 'npmTest' | 'openFolder' | 'backup') => {
    if (!currentRepo && !state.selectedRepo) {
      addTerminal(action, `repo-action:${action}`, 'No repository selected', 'warn')
      return
    }
    const repoPath = currentRepo || state.selectedRepo
    addActivity('🧪', `running safe command: ${action}`, repoPath)
    const started = Date.now()
    const result = await runAction(`repo-${action}`, `repo-action ${action}`, () =>
      apiCall<RepoActionResponse>('/api/mission-control/repo-action', { action, repoPath }),
    )

    const ms = Date.now() - started
    if (action === 'status') {
      setState((prev) => ({ ...prev, gitStatus: result?.output || 'status empty' }))
    }
    if (action === 'npmInstallPreview') {
      setState((prev) => ({
        ...prev,
        npmState: {
          ...prev.npmState,
          installPreview: { status: result?.ok ? 'passed' : 'failed', lastRun: now(), runtimeMs: ms, output: result?.output },
        },
      }))
    }
    if (action === 'npmBuild') {
      setState((prev) => ({
        ...prev,
        npmState: {
          ...prev.npmState,
          build: { status: result?.ok ? 'passed' : 'failed', lastRun: now(), runtimeMs: ms, output: result?.output },
        },
      }))
      addActivity(result?.ok ? '✅' : '🔴', result?.ok ? 'build passed' : 'build failed')
    }
    if (action === 'npmTest') {
      setState((prev) => ({
        ...prev,
        npmState: {
          ...prev.npmState,
          test: { status: result?.ok ? 'passed' : 'failed', lastRun: now(), runtimeMs: ms, output: result?.output },
        },
      }))
    }
  }

  const refreshModelInventory = async () => {
    try {
      const result = await apiCall<ModelInventoryPayload>('/api/mission-control/model-inventory', undefined, 'GET')
      const records = normalizeModelRecords(result?.payload?.records ?? [])
      setState((prev) => ({ ...prev, modelInventory: records }))
    } catch {}
  }

  const providerButtons = [
    ['Perplexity', 'Perplexity Max (browser)'],
    ['ChatGPT', 'ChatGPT Pro/Max (browser)'],
    ['Claude', 'Claude/Sonnet (browser)'],
    ['Gemini', 'Gemini (browser)'],
    ['OpenClaw', 'OpenClaw (browser)'],
  ] as const

  return (
    <div className="min-h-screen bg-grid p-4 text-white lg:p-8">
      <main className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-2xl border border-rose-200/20 bg-black/35 p-4 shadow-[0_0_45px_rgba(248,113,113,0.12)]">
          <h1 className="text-3xl font-black">AI Mission Control</h1>
          <p className="text-sm text-slate-300">C:\AICommandCenter local-first dashboard + route actions</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={runSystemCheck} className="rounded-md border border-emerald-300/40 px-3 py-2 text-sm">
              Run System Check
            </button>
            <button onClick={runModelScan} className="rounded-md border border-cyan-300/40 px-3 py-2 text-sm">
              Run Model Scan
            </button>
            <button onClick={runBenchmark} className="rounded-md border border-fuchsia-300/40 px-3 py-2 text-sm">
              Run Benchmark Models
            </button>
            <button onClick={createDemoTicket} className="rounded-md border border-rose-300/40 px-3 py-2 text-sm">
              Create Demo Ticket
            </button>
            <button onClick={refreshModelInventory} className="rounded-md border border-slate-300/40 px-3 py-2 text-sm">
              Refresh Model Inventory
            </button>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-rose-200/20 bg-black/35 p-4">
            <h2 className="text-lg font-semibold">System Check</h2>
            <div className="mt-3 grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Node</span>
                {statusChip(state.systemCheck.node)}
              </div>
              <div className="flex items-center justify-between">
                <span>npm</span>
                {statusChip(state.systemCheck.npm)}
              </div>
              <div className="flex items-center justify-between">
                <span>Git</span>
                {statusChip(state.systemCheck.git)}
              </div>
              <div className="flex items-center justify-between">
                <span>PowerShell</span>
                {statusChip(state.systemCheck.powershell)}
              </div>
              <div className="flex items-center justify-between">
                <span>Ollama</span>
                {statusChip(state.systemCheck.ollama)}
              </div>
              <div className="flex items-center justify-between">
                <span>LM Studio</span>
                {statusChip(state.systemCheck.lmStudio)}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-rose-200/20 bg-black/35 p-4">
            <h2 className="text-lg font-semibold">Cost Savings</h2>
            <p className="mt-2 text-sm text-slate-200">Estimated monthly local-first savings: ${estimate.avoidValue}</p>
            <p className="mt-1 text-xs text-slate-300">{estimate.cloudCalls} queued tickets route through browser providers.</p>
          </div>

          <div className="rounded-2xl border border-rose-200/20 bg-black/35 p-4">
            <h2 className="text-lg font-semibold">Provider Bubble Legend</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activityCatalog.map((entry) => (
                <span key={entry} className="rounded-full border border-slate-500/40 bg-slate-900/70 px-2 py-1 text-xs">
                  {entry}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <div className="rounded-2xl border border-rose-200/20 bg-black/35 p-4 shadow-[0_0_45px_rgba(248,113,113,0.12)]">
            <h2 className="text-lg font-semibold">Ticket Queue</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <input
                value={title}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value)}
                placeholder="Ticket title"
                className="rounded-md border border-slate-600 bg-black/40 px-3 py-2 text-sm"
              />
              <select
                value={ticketType}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setTicketType(event.target.value as TicketType)}
                className="rounded-md border border-slate-600 bg-black/40 px-3 py-2 text-sm"
              >
                {ticketTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
              <input
                value={repoPath}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setRepoPath(event.target.value)}
                placeholder="Repo path"
                className="rounded-md border border-slate-600 bg-black/40 px-3 py-2 text-sm"
              />
            </div>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Task details"
              className="mt-2 h-20 w-full rounded-md border border-slate-600 bg-black/40 p-2 text-sm"
            />
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (isListening && speechTarget === 'ticket') {
                    stopListening()
                  } else {
                    startVoiceInput('ticket')
                  }
                }}
                className="rounded border border-violet-300/40 px-3 py-2 text-sm"
              >
                {isListening && speechTarget === 'ticket' ? 'Stop mic' : 'Dictate prompt'}
              </button>
              <button
                type="button"
                onClick={() => createTicket()}
                className="rounded-md bg-emerald-500 px-4 py-2 font-bold text-black hover:bg-emerald-400"
              >
                Add ticket
              </button>
              <span className="text-xs text-slate-300">Auto provider: {providerForType[ticketType]}</span>
            </div>
            <p className="mt-2 text-xs text-slate-300">
              {isListening ? `Listening for ${speechTarget} prompt...` : 'Microphone is idle.'}
            </p>

            <div className="mt-3 space-y-2">
              {state.tickets.length === 0 ? (
                <p className="rounded border border-dashed border-slate-700 p-3 text-xs text-slate-300">No tickets yet.</p>
              ) : null}
              {state.tickets.map((ticket) => {
                const style = providerStyles[ticket.provider]
                return (
                  <article key={ticket.id} className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{ticket.title}</p>
                        <p className="text-xs text-slate-400">
                          {ticket.ticketType} • {ticket.repoPath || 'Repo not set'}
                        </p>
                        {ticket.savedPath ? <p className="text-xs text-emerald-300">{ticket.savedPath}</p> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedTicketId(ticket.id)}
                        className="rounded border border-cyan-300/30 px-2 py-1 text-xs hover:bg-cyan-800/60"
                      >
                        Select
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${style.badge}`}>
                        <span className={`mr-1 h-2 w-2 rounded-full ${style.dot}`} />
                        {ticket.provider}
                      </span>
                      <span
                        className="inline-flex items-center rounded-full border border-slate-500/40 px-2 py-0.5 text-xs bg-slate-900/40 text-slate-200"
                        title="Ticket state"
                      >
                        <span className={`mr-1 h-2 w-2 rounded-full ${statusLights[ticket.status]}`} />
                        {statusText[ticket.status]}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-300">Prompt: {ticket.prompt || 'No prompt body yet'}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      <button onClick={() => copyPrompt(ticket.id)} className="rounded border border-emerald-300/30 px-2 py-1 text-sm">
                        Copy provider prompt
                      </button>
                      <button onClick={() => openProvider(ticket)} className="rounded border border-cyan-300/30 px-2 py-1 text-sm">
                        Open provider
                      </button>
                      <button onClick={() => setTicketStatus(ticket.id, 'local-in-progress')} className="rounded border border-fuchsia-300/30 px-2 py-1 text-sm">
                        Route local first
                      </button>
                      <button
                        onClick={() => copyTicketPrompt(ticket.id)}
                        className="rounded border border-violet-300/30 px-2 py-1 text-sm"
                      >
                        Copy prompt
                      </button>
                      <button onClick={() => runBuildForTicket(ticket.id)} className="rounded border border-violet-300/30 px-2 py-1 text-sm">
                        Run build
                      </button>
                      <div className="sm:col-span-2 xl:col-span-1">
                        <select
                          className="w-full rounded border border-slate-600 bg-black/30 px-2 py-1 text-xs"
                          onChange={(event) => setTicketProvider(ticket.id, event.target.value as ProviderName)}
                          value={ticket.provider}
                        >
                          {ticket.providerAlternates.map((provider) => (
                            <option key={`${ticket.id}-${provider}`} value={provider}>
                              Use {provider}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="mt-2 text-xs">
                      <button
                        onClick={() => copyProviderPrompt('Perplexity Max (browser)', ticket)}
                        className="rounded border border-cyan-300/20 px-2 py-1 text-xs"
                      >
                        Copy for Perplexity
                      </button>
                      <button
                        onClick={() => copyProviderPrompt('ChatGPT Pro/Max (browser)', ticket)}
                        className="ml-2 rounded border border-fuchsia-300/20 px-2 py-1 text-xs"
                      >
                        Copy for ChatGPT
                      </button>
                      <button
                        onClick={() => copyProviderPrompt('Claude/Sonnet (browser)', ticket)}
                        className="ml-2 rounded border border-orange-300/20 px-2 py-1 text-xs"
                      >
                        Copy for Claude
                      </button>
                      <button
                        onClick={() => copyProviderPrompt('Gemini (browser)', ticket)}
                        className="ml-2 rounded border border-cyan-300/20 px-2 py-1 text-xs"
                      >
                        Copy for Gemini
                      </button>
                      <button
                        onClick={() => copyProviderPrompt('OpenClaw (browser)', ticket)}
                        className="ml-2 rounded border border-fuchsia-300/20 px-2 py-1 text-xs"
                      >
                        Copy for OpenClaw
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-rose-200/20 bg-black/35 p-4">
              <h2 className="text-lg font-semibold">Activity Bubbles</h2>
              <p className="mt-1 text-xs text-slate-300">Realtime local activity stream.</p>
              <div className="mt-2 max-h-56 space-y-2 overflow-auto pr-1">
                {state.activities.length === 0 ? (
                  <p className="text-xs text-slate-400">No activity yet.</p>
                ) : (
                  state.activities.map((item) => (
                    <div key={item.id} className="rounded border border-slate-800 bg-black/60 p-2 text-xs">
                      <span className="mr-2">{item.icon}</span>
                      <span>{item.text}</span>
                      <span className="float-right text-[11px] text-slate-400">{new Date(item.time).toLocaleTimeString()}</span>
                      {item.ticketId ? <div className="text-[11px] text-slate-400">ticket {item.ticketId}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-rose-200/20 bg-black/35 p-4">
              <h2 className="text-lg font-semibold">Media Prompt Lab</h2>
              <textarea
                value={mediaPrompt}
                onChange={(event) => setMediaPrompt(event.target.value)}
                className="mt-2 h-24 w-full rounded border border-slate-700 bg-black/40 p-2 text-sm"
                placeholder="Image / video / lovable prompt"
              />
              <div className="mt-2 grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isListening && speechTarget === 'media') {
                      stopListening()
                    } else {
                      startVoiceInput('media')
                    }
                  }}
                  className="rounded border border-amber-300/30 px-2 py-1 text-xs"
                >
                  {isListening && speechTarget === 'media' ? 'Stop mic' : 'Dictate media prompt'}
                </button>
                <button onClick={() => copyToClipboard(`Image prompt:\n${mediaPrompt}`)} className="rounded border border-fuchsia-300/30 px-2 py-1 text-xs">
                  Copy image prompt
                </button>
                <button onClick={() => copyToClipboard(`Video prompt:\n${mediaPrompt}`)} className="rounded border border-indigo-300/30 px-2 py-1 text-xs">
                  Copy video prompt
                </button>
                <button onClick={() => copyToClipboard(`Lovable prompt:\n${mediaPrompt}`)} className="rounded border border-cyan-300/30 px-2 py-1 text-xs">
                  Copy lovable prompt
                </button>
              </div>
            </div>
          </aside>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-rose-200/20 bg-black/35 p-4">
            <h2 className="text-lg font-semibold">Model Inventory</h2>
            <p className="mt-1 text-xs text-slate-300">Model plan path: {state.modelScanPath}</p>
            <p className="mt-1 text-xs text-slate-300">Benchmark results: {state.benchmarkPath}</p>
            <div className="mt-2 space-y-2">
              {state.modelInventory.map((model) => (
                <div key={`${model.source}-${model.name}`} className="rounded border border-slate-700 bg-black/50 p-2 text-xs">
                  <div className="flex justify-between">
                    <p className="font-semibold text-slate-100">{model.name}</p>
                    <span className="rounded border border-slate-400/30 px-2 py-0.5">{model.source}</span>
                  </div>
                  <p className="mt-1 text-slate-300">
                    {model.sizeGB ? `${model.sizeGB} GB` : 'size unknown'} • {model.recommendation}
                  </p>
                  {model.reason ? <p className="text-[11px] text-slate-400">{model.reason}</p> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-rose-200/20 bg-black/35 p-4">
            <h2 className="text-lg font-semibold">Terminal Panel</h2>
            <p className="mt-1 text-xs text-slate-300">Command output from local bridge actions.</p>
            <div className="mt-2 max-h-56 space-y-2 overflow-auto">
              {state.terminalLog.map((line) => (
                <div
                  key={line.id}
                  className={`rounded border p-2 text-xs ${line.status === 'warn' ? 'border-rose-700/80 bg-rose-900/20' : 'border-slate-700 bg-black/60'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{line.action}</span>
                    <span className="text-[11px] text-slate-400">{new Date(line.time).toLocaleTimeString()}</span>
                  </div>
                  <p className="mt-1 break-all text-slate-200">{line.command}</p>
                  <p className="mt-1 text-slate-400">{line.output}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-rose-200/20 bg-black/35 p-4">
            <h2 className="text-lg font-semibold">Git & NPM Panel</h2>
            <div className="mt-2 space-y-2">
              <button onClick={() => runRepoAction('status')} className="w-full rounded border border-emerald-300/30 px-2 py-1 text-xs">
                Git status
              </button>
              <button onClick={() => runRepoAction('npmInstallPreview')} className="w-full rounded border border-cyan-300/30 px-2 py-1 text-xs">
                npm install preview
              </button>
              <button onClick={() => runRepoAction('npmBuild')} className="w-full rounded border border-violet-300/30 px-2 py-1 text-xs">
                npm run build
              </button>
              <button onClick={() => runRepoAction('npmTest')} className="w-full rounded border border-violet-300/30 px-2 py-1 text-xs">
                npm test
              </button>
              <button onClick={() => runRepoAction('openFolder')} className="w-full rounded border border-slate-300/30 px-2 py-1 text-xs">
                Open folder
              </button>
              <button onClick={() => runRepoAction('backup')} className="w-full rounded border border-orange-300/30 px-2 py-1 text-xs">
                Backup repo
              </button>
              <p className="text-xs text-slate-300">{state.gitStatus}</p>
              <div className="text-xs text-slate-300">
                <p>Build: {state.npmState.build.status}</p>
                <p>Test: {state.npmState.test.status}</p>
                <p>Install preview: {state.npmState.installPreview.status}</p>
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs text-slate-300">Repo path for actions:</label>
              <select
                className="mt-1 w-full rounded border border-slate-600 bg-black/40 p-2 text-xs"
                value={currentRepo || state.selectedRepo}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  setCurrentRepo(event.target.value)
                  setState((prev) => ({ ...prev, selectedRepo: event.target.value }))
                }}
              >
                {repoFolders.length === 0 ? <option value="">{repoPath || 'No repos folder entries'}</option> : null}
                {repoFolders.map((repo) => (
                  <option key={repo} value={repo}>
                    {repo}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-2xl border border-rose-200/20 bg-black/35 p-4 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold">Browser Provider Launch</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {providerButtons.map(([label, provider]) => (
                <button
                  type="button"
                  key={provider}
                  className="rounded border border-cyan-300/30 px-2 py-2 text-sm"
                  onClick={() =>
                    openProvider({
                      id: newId(),
                      title: 'Manual browser launch',
                      ticketType: 'Web research',
                      repoPath: '',
                      prompt: '',
                      provider: provider as ProviderName,
                      providerAlternates: PROVIDERS['Web research'],
                      status: 'queued',
                      createdAt: now(),
                      updatedAt: now(),
                    })
                  }
                >
                  Open {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-300">
              Open the browser tab directly with a placeholder ticket (uses your logged-in browser profile; no saved passwords/cookies/tokens).
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Output Paths</h2>
            <div className="mt-2 rounded border border-slate-700 p-3 text-xs text-slate-200">
              <p>
                Tickets folder: <span className="text-emerald-200">C:\AICommandCenter\tickets</span>
              </p>
              <p>
                Outputs folder: <span className="text-emerald-200">C:\AICommandCenter\outputs</span>
              </p>
              <p>
                Model benchmark file: <span className="text-emerald-200">{state.benchmarkPath || 'MODEL-BENCHMARKS.md (pending)'}</span>
              </p>
              <p>
                Cleanup plan file: <span className="text-emerald-200">C:\AICommandCenter\outputs\MODEL-CLEANUP-PLAN.md</span>
              </p>
            </div>
            <label className="mt-3 block text-xs text-slate-300">Open a benchmark path if you want:</label>
            <input
              value={benchmarkPathField}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setBenchmarkPathField(event.target.value)}
              className="mt-1 w-full rounded border border-slate-600 bg-black/40 p-2 text-xs"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-rose-200/20 bg-black/35 p-4">
          <h2 className="text-lg font-semibold">Selected ticket details</h2>
          <pre className="mt-2 text-xs leading-5 text-slate-200 bg-black/40 border border-slate-700 rounded p-3 overflow-auto max-h-40">
            {selectedTicket ? JSON.stringify(selectedTicket, null, 2) : 'No ticket selected. Select a ticket in the queue.'}
          </pre>
        </section>
      </main>
    </div>
  )
}

export default App
