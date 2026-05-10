import { useEffect, useMemo, useRef, useState } from 'react'

type Provider = 'local' | 'perplexity' | 'chatgpt' | 'claude' | 'gemini'
type Status = 'idle' | 'thinking' | 'local' | 'browser' | 'done' | 'warning'

type BridgeResponse<T = Record<string, unknown>> = {
  ok: boolean
  action: string
  command?: string
  output: string
  error?: string
  exitCode?: number
  payload?: T
}

type Run = {
  id: string
  at: string
  provider: Provider
  status: Status
  userPrompt: string
  routedPrompt: string
  command?: string
  output?: string
  ticketPath?: string
}

type ActivityEvent = {
  id: string
  at: string
  message: string
}

type RepoAction = 'status' | 'npmInstallPreview' | 'npmBuild' | 'npmTest' | 'openFolder' | 'backup'

type HealthPayload = {
  bridge?: string
  mode?: string
  bridgeOnlyDuringDev?: boolean
  root?: string
  scripts?: { exists?: boolean; path?: string }
  tickets?: { exists?: boolean; path?: string }
  outputs?: { exists?: boolean; path?: string }
  repos?: { exists?: boolean; path?: string }
}

type SpeechResultLike = {
  isFinal?: boolean
  0: { transcript: string }
}

type SpeechResultEventLike = {
  resultIndex: number
  results: ArrayLike<SpeechResultLike>
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechResultEventLike) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

const STORAGE_KEY = 'ai-mission-control-simple-v1'

const providerLabels: Record<Provider, string> = {
  local: 'Local first',
  perplexity: 'Perplexity research',
  chatgpt: 'ChatGPT build/design',
  claude: 'Claude cleanup/writing',
  gemini: 'Gemini long context',
}

const providerUiNames: Record<Provider, string> = {
  local: 'Local Ollama/LM Studio',
  perplexity: 'Perplexity Max (browser)',
  chatgpt: 'ChatGPT Pro/Max (browser)',
  claude: 'Claude/Sonnet (browser)',
  gemini: 'Gemini (browser)',
}

function now() {
  return new Date().toLocaleString()
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function chooseProvider(prompt: string): Provider {
  const text = prompt.toLowerCase()
  if (/(current|latest|research|citation|compare|vendor|price|news|web|coupon|market)/.test(text)) return 'perplexity'
  if (/(ui|design|dashboard|architecture|debug|bug|react|typescript|vite|build|code|component|polish)/.test(text)) return 'chatgpt'
  if (/(rewrite|clean up|cleanup|refactor|careful|long-form|document|copy|email|report)/.test(text)) return 'claude'
  if (/(huge|large file|long document|multimodal|image review|pdf review)/.test(text)) return 'gemini'
  return 'local'
}

function providerPrompt(provider: Provider, rawPrompt: string) {
  const base = `Mission Control request:\n\n${rawPrompt.trim()}\n\nRules:\n- Use existing files and existing project structure.\n- Prefer the cheapest safe local-first path.\n- Do not expose secrets, cookies, tokens, or passwords.\n- Give concrete next actions and exact commands when useful.`

  if (provider === 'local') {
    return `${base}\n\nLocal model role:\n- Do cheap scanning, repo mapping, file summaries, simple patch planning, log review, and first draft reasoning.\n- Avoid web assumptions.\n- Keep the answer short and operational.`
  }

  if (provider === 'perplexity') {
    return `${base}\n\nPerplexity role:\n- Use current web research and citations.\n- Compare options clearly.\n- Return a concise action plan with sources.`
  }

  if (provider === 'chatgpt') {
    return `${base}\n\nChatGPT role:\n- Use strong coding/design/architecture reasoning.\n- Produce a direct patch plan or final implementation instructions.\n- Make it simple enough to run locally with Codex.`
  }

  if (provider === 'claude') {
    return `${base}\n\nClaude role:\n- Be conservative and careful.\n- Improve writing, refactors, cleanup, docs, and risk checks.\n- Include rollback steps.`
  }

  return `${base}\n\nGemini role:\n- Handle long context or multimodal review.\n- Summarize large files/documents and extract exact next steps.`
}

async function bridge<T>(url: string, method = 'POST', body?: Record<string, unknown>): Promise<BridgeResponse<T>> {
  const response = await fetch(url, {
    method,
    headers: method === 'GET' ? undefined : { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = (await response.json()) as BridgeResponse<T>
  if (!response.ok) throw new Error(json.error || json.output || `Bridge error ${response.status}`)
  return json
}

export default function SimpleApp() {
  const [prompt, setPrompt] = useState('')
  const [runs, setRuns] = useState<Run[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    } catch {
      return []
    }
  })
  const [health, setHealth] = useState<HealthPayload | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [listening, setListening] = useState(false)
  const [activity, setActivity] = useState<ActivityEvent[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}:activity`)
    try {
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const [repoFolders, setRepoFolders] = useState<string[]>([])
  const [currentRepo, setCurrentRepo] = useState('')
  const [repoStates, setRepoStates] = useState({
    installPreview: { status: 'idle', command: '', output: '' },
    npmBuild: { status: 'idle', command: '', output: '' },
    npmTest: { status: 'idle', command: '', output: '' },
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, 50)))
  }, [runs])

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}:activity`, JSON.stringify(activity.slice(0, 100)))
  }, [activity])

  useEffect(() => {
    bridge<HealthPayload>('/api/mission-control/health', 'GET')
      .then((res) => setHealth(res.payload || null))
      .catch(() => setHealth(null))
  }, [])

  useEffect(() => {
    bridge<{ repos: string[] }>('/api/mission-control/repos', 'GET')
      .then((res) => {
        const repos = res.payload?.repos || []
        setRepoFolders(repos)
        if (!currentRepo && repos.length > 0) {
          setCurrentRepo(repos[0])
        }
      })
      .catch(() => {
        setRepoFolders([])
      })
  }, [])

  const latest = runs[0]
  const suggestedProvider = useMemo(() => chooseProvider(prompt || latest?.userPrompt || ''), [prompt, latest])

  const pushRun = (run: Run) => setRuns((prev) => [run, ...prev].slice(0, 50))

  const addActivity = (message: string) => {
    setActivity((prev) => [{ id: makeId(), at: now(), message }, ...prev].slice(0, 100))
  }

  const createTicket = async (provider: Provider, userPrompt: string) => {
    const ticket = {
      id: makeId(),
      title: userPrompt.slice(0, 80) || 'Mission Control task',
      ticketType: provider === 'perplexity' ? 'Web research' : provider === 'local' ? 'Repo scan' : 'Code build',
      repoPath: 'C:\\AICommandCenter\\repos',
      prompt: userPrompt,
      provider: providerUiNames[provider],
      status: provider === 'local' ? 'local-in-progress' : 'awaiting-browser-answer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const saved = await bridge<{ ticketPath?: string }>('/api/mission-control/save-ticket', 'POST', { ticket })
    return saved.payload?.ticketPath
  }

  const runMission = async (forcedProvider?: Provider) => {
    const userPrompt = prompt.trim()
    if (!userPrompt) return

    setStatus('thinking')
    addActivity('🧠 choosing provider')
    const provider = forcedProvider || chooseProvider(userPrompt)
    const routedPrompt = providerPrompt(provider, userPrompt)
    const baseRun: Run = {
      id: makeId(),
      at: now(),
      provider,
      status: provider === 'local' ? 'local' : 'browser',
      userPrompt,
      routedPrompt,
    }

    try {
      const ticketPath = await createTicket(provider, userPrompt)
      addActivity('💬 prompt copied')
      if (provider === 'local') {
        addActivity('🧹 scanning locally')
        addActivity('💸 avoiding cloud tokens')
        await navigator.clipboard.writeText(routedPrompt)
        pushRun({ ...baseRun, status: 'done', ticketPath, output: 'Local-first prompt copied. Use your local Ollama/LM Studio/Codex flow for cheap scan/plan work.' })
        setStatus('done')
      } else {
        addActivity('🌐 opening browser')
        const opened = await bridge('/api/mission-control/open-provider', 'POST', {
          provider: providerUiNames[provider],
          prompt: routedPrompt,
        })
        addActivity('📋 waiting for pasted answer')
        pushRun({ ...baseRun, status: opened.ok ? 'browser' : 'warning', ticketPath, command: opened.command, output: opened.output || opened.error })
        setStatus(opened.ok ? 'browser' : 'warning')
      }
      setPrompt('')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      pushRun({ ...baseRun, status: 'warning', output: message })
      setStatus('warning')
    }
  }

  const runQuickCheck = async (kind: 'system' | 'models' | 'benchmarks') => {
    setStatus('thinking')
    const endpoint = kind === 'system' ? 'system-check' : kind === 'models' ? 'model-scan' : 'model-benchmark'
    try {
      addActivity(kind === 'system' ? '🧠 choosing provider' : kind === 'models' ? '🔍 checking models' : '🧹 scanning locally')
      const result = await bridge(`/api/mission-control/${endpoint}`)
      addActivity(kind === 'benchmarks' ? '🧪 running safe command' : '💬 prompt copied')
      addActivity(result.ok ? '✅ build passed' : '🔴 build failed')
      pushRun({
        id: makeId(),
        at: now(),
        provider: 'local',
        status: result.ok ? 'done' : 'warning',
        userPrompt: `Run ${kind}`,
        routedPrompt: `Local ${kind} check`,
        command: result.command,
        output: result.output,
      })
      setStatus(result.ok ? 'done' : 'warning')
    } catch (error) {
      pushRun({ id: makeId(), at: now(), provider: 'local', status: 'warning', userPrompt: `Run ${kind}`, routedPrompt: '', output: error instanceof Error ? error.message : String(error) })
      setStatus('warning')
      addActivity('🔴 build failed')
    }
  }

  const runRepoAction = async (action: RepoAction) => {
    if (!currentRepo) {
      addActivity('🔴 build failed')
      setStatus('warning')
      pushRun({
        id: makeId(),
        at: now(),
        provider: 'local',
        status: 'warning',
        userPrompt: `Repo action ${action}`,
        routedPrompt: 'No repo selected.',
      })
      return
    }

    setStatus('thinking')
    addActivity('🧪 running safe command')
    const actionMap: Record<string, string> = {
      status: 'git status',
      npmInstallPreview: 'npm install preview',
      npmBuild: 'npm run build',
      npmTest: 'npm test',
      openFolder: 'open folder',
      backup: 'create backup before edits',
    }
    try {
      addActivity(`🧪 running safe command: ${actionMap[action]}`)
      const result = await bridge('/api/mission-control/repo-action', 'POST', { action, repoPath: currentRepo })
      if (action === 'npmInstallPreview') {
        setRepoStates((prev) => ({ ...prev, installPreview: { status: result.ok ? 'passed' : 'failed', command: result.command || '', output: result.output || '' } }))
      } else if (action === 'npmBuild') {
        setRepoStates((prev) => ({ ...prev, npmBuild: { status: result.ok ? 'passed' : 'failed', command: result.command || '', output: result.output || '' } }))
      } else if (action === 'npmTest') {
        setRepoStates((prev) => ({ ...prev, npmTest: { status: result.ok ? 'passed' : 'failed', command: result.command || '', output: result.output || '' } }))
      }
      addActivity(result.ok ? '✅ build passed' : '🔴 build failed')
      pushRun({
        id: makeId(),
        at: now(),
        provider: 'local',
        status: result.ok ? 'done' : 'warning',
        userPrompt: `Repo action: ${actionMap[action]}`,
        routedPrompt: `Safe terminal command for ${currentRepo}`,
        command: result.command || '',
        output: [result.output, result.error].filter(Boolean).join('\n'),
      })
      setStatus(result.ok ? 'done' : 'warning')
    } catch (error) {
      addActivity('🔴 build failed')
      pushRun({
        id: makeId(),
        at: now(),
        provider: 'local',
        status: 'warning',
        userPrompt: `Repo action: ${actionMap[action]}`,
        routedPrompt: '',
        output: error instanceof Error ? error.message : String(error),
      })
      setStatus('warning')
    }
  }

  const startVoice = () => {
    const windowSpeech = window as unknown as {
      SpeechRecognition?: { new(): SpeechRecognitionLike }
      webkitSpeechRecognition?: { new(): SpeechRecognitionLike }
    }
    const Ctor = windowSpeech.SpeechRecognition || windowSpeech.webkitSpeechRecognition
    if (!Ctor) {
      pushRun({ id: makeId(), at: now(), provider: 'local', status: 'warning', userPrompt: 'Voice input', routedPrompt: '', output: 'This browser does not support SpeechRecognition.' })
      return
    }
    if (recognitionRef.current) recognitionRef.current.stop()
    const recognition = new Ctor()
    recognitionRef.current = recognition
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = false
    recognition.onresult = (event: SpeechResultEventLike) => {
      const text = Array.from(event.results as ArrayLike<SpeechResultLike>)
        .slice(event.resultIndex)
        .map((result) => result?.[0]?.transcript || '')
        .join(' ')
        .trim()
      if (text) setPrompt((prev) => (prev ? `${prev} ${text}` : text))
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    setListening(true)
    recognition.start()
  }

  const stopVoice = () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }

  return (
    <main className="min-h-screen bg-[#05060a] text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-cyan-300/70">Local-first AI command center</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">AI Mission Control</h1>
            <p className="mt-2 text-sm text-slate-300">One box. Dictate or type the mission. The router chooses local, Perplexity, ChatGPT, Claude, or Gemini.</p>
          </div>
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-right text-xs text-cyan-100 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
            <div className="font-bold">Bridge {health ? 'ONLINE' : 'UNKNOWN'}</div>
            <div>{health?.bridgeOnlyDuringDev ? 'Active during npm run dev' : 'Run local starter'}</div>
          </div>
        </header>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_0_90px_rgba(14,165,233,0.10)] backdrop-blur">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Tell Mission Control what to do... example: Scan my repo, find why the Vite build fails, use local first, then make a ChatGPT prompt only if needed."
            className="min-h-44 w-full resize-none rounded-3xl border border-cyan-300/20 bg-black/60 p-5 text-lg leading-relaxed text-white outline-none ring-0 placeholder:text-slate-500 focus:border-cyan-300/70"
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={() => runMission()} className="rounded-2xl bg-cyan-300 px-6 py-3 font-black text-black shadow-[0_0_40px_rgba(34,211,238,0.25)]">Run smart route</button>
            <button onClick={listening ? stopVoice : startVoice} className="rounded-2xl border border-fuchsia-300/40 px-5 py-3 font-bold text-fuchsia-100">{listening ? 'Stop dictation' : 'Dictate mission'}</button>
            <button onClick={() => runMission('local')} className="rounded-2xl border border-emerald-300/40 px-5 py-3 font-bold text-emerald-100">Force local first</button>
            <button onClick={() => runMission('perplexity')} className="rounded-2xl border border-sky-300/40 px-5 py-3 font-bold text-sky-100">Force Perplexity</button>
            <button onClick={() => runMission('chatgpt')} className="rounded-2xl border border-violet-300/40 px-5 py-3 font-bold text-violet-100">Force ChatGPT</button>
            <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">Suggested: {providerLabels[suggestedProvider]}</span>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <button onClick={() => runQuickCheck('system')} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-left hover:border-cyan-300/40">
            <div className="text-xl font-black">System check</div>
            <div className="mt-1 text-sm text-slate-400">Node, npm, Git, PowerShell, browsers.</div>
          </button>
          <button onClick={() => runQuickCheck('models')} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-left hover:border-emerald-300/40">
            <div className="text-xl font-black">Model scan</div>
            <div className="mt-1 text-sm text-slate-400">Ollama, LM Studio, cleanup plan.</div>
          </button>
          <button onClick={() => runQuickCheck('benchmarks')} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-left hover:border-fuchsia-300/40">
            <div className="text-xl font-black">Benchmark</div>
            <div className="mt-1 text-sm text-slate-400">Tiny safe model tests.</div>
          </button>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
            <h2 className="text-xl font-black">Local repos & terminal actions</h2>
            <div className="mt-3 text-sm text-slate-300">
              <label className="block text-xs">Repo path</label>
              <select
                className="mt-1 w-full rounded border border-slate-600 bg-black/40 p-2 text-xs"
                value={currentRepo}
                onChange={(event) => {
                  setCurrentRepo(event.target.value)
                }}
              >
                {repoFolders.length === 0 ? <option value="">No repos found under C:\AICommandCenter\repos</option> : null}
                {repoFolders.map((repo) => (
                  <option key={repo} value={repo}>
                    {repo}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button onClick={() => runRepoAction('status')} className="rounded border border-cyan-300/30 px-2 py-2 text-xs">git status</button>
              <button onClick={() => runRepoAction('npmInstallPreview')} className="rounded border border-sky-300/30 px-2 py-2 text-xs">npm install preview</button>
              <button onClick={() => runRepoAction('npmBuild')} className="rounded border border-violet-300/30 px-2 py-2 text-xs">npm run build</button>
              <button onClick={() => runRepoAction('npmTest')} className="rounded border border-emerald-300/30 px-2 py-2 text-xs">npm test</button>
              <button onClick={() => runRepoAction('openFolder')} className="rounded border border-slate-300/30 px-2 py-2 text-xs">Open folder</button>
              <button onClick={() => runRepoAction('backup')} className="rounded border border-orange-300/30 px-2 py-2 text-xs">Backup before edits</button>
            </div>

            <p className="mt-3 text-xs text-slate-300">
              Backup button performs a safe mirror copy (no .env files touched unless already excluded by existing folder contents).
            </p>
            <div className="mt-3 rounded border border-slate-700 p-3 text-xs text-slate-200">
              <p className="font-bold text-slate-300">Last status</p>
              <p>Install preview: {repoStates.installPreview.status}</p>
              <p>Build: {repoStates.npmBuild.status}</p>
              <p>Test: {repoStates.npmTest.status}</p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
            <h2 className="text-xl font-black">Activity bubbles</h2>
            <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1 text-xs text-slate-200">
              {activity.length === 0 ? <p className="text-slate-400">No activity yet.</p> : null}
              {activity.map((item) => (
                <article key={item.id} className="rounded bg-black/40 border border-white/10 p-2">
                  <div className="text-[11px] text-slate-500">{item.at}</div>
                  <div>{item.message}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6 grid flex-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <h2 className="text-xl font-black">Router state</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="flex justify-between border-b border-white/10 pb-2"><span>Status</span><span className="font-bold text-cyan-200">{status}</span></div>
              <div className="flex justify-between border-b border-white/10 pb-2"><span>Root</span><span className="text-right">{health?.root || 'C:\\AICommandCenter'}</span></div>
              <div className="flex justify-between border-b border-white/10 pb-2"><span>Tickets</span><span>{health?.tickets?.exists ? 'ready' : 'unknown'}</span></div>
              <div className="flex justify-between border-b border-white/10 pb-2"><span>Outputs</span><span>{health?.outputs?.exists ? 'ready' : 'unknown'}</span></div>
              <div className="flex justify-between pb-2"><span>Workflow</span><span className="text-right">local scan → browser AI only when useful → saved ticket</span></div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
            <h2 className="text-xl font-black">Execution trail</h2>
            <div className="mt-4 max-h-[430px] space-y-3 overflow-auto pr-2">
              {runs.length === 0 ? <p className="text-sm text-slate-400">No missions yet. Type or dictate one mission above.</p> : null}
              {runs.map((run) => (
                <article key={run.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-200">{providerLabels[run.provider]}</span>
                    <span className="text-xs text-slate-500">{run.at}</span>
                  </div>
                  <p className="mt-3 font-semibold text-white">{run.userPrompt}</p>
                  {run.ticketPath ? <p className="mt-2 text-xs text-emerald-300">Saved: {run.ticketPath}</p> : null}
                  {run.command ? <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/50 p-3 text-xs text-slate-300">{run.command}</pre> : null}
                  {run.output ? <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-xl bg-black/50 p-3 text-xs text-slate-300">{run.output}</pre> : null}
                  <details className="mt-3 text-xs text-slate-400">
                    <summary className="cursor-pointer text-slate-300">Provider prompt</summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-black/50 p-3">{run.routedPrompt}</pre>
                  </details>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
