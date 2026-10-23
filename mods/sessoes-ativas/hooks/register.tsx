import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface as Api } from 'claude-code'

import type { ActiveSession, ConversationLine, SessionAction, SessionFocus } from '../types'

const PANE = 'sessoes-ativas'
const PANE_TITLE = 'Sessões ativas'
const REFRESH_INTERVAL_MS = 10_000
const MS_PER_MINUTE = 60_000
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const SUMMARY_MARKER = /"type":"(ai-title|last-prompt)"/
const JIRA_CARD = /\b[A-Z][A-Z0-9]+-\d+\b/
const TRANSCRIPT_TAIL_LINES = '400'
const CONVERSATION_MESSAGES = 8
const CONVERSATION_LINE_CHARS = 300
const PROC_START_FIELD = 19
const MAX_LANGUAGES = 2
const EDIT_WEIGHT = 3
const CONFIRM_STOP = 'Encerrar'
const CANCEL_STOP = 'Cancelar'

const sessions = atom({ plugin: 'sessoes-ativas', key: 'sessions' } as const, [])
const refreshedAt = atom({ plugin: 'sessoes-ativas', key: 'refreshedAt' } as const, 0)
const focus = atom({ plugin: 'sessoes-ativas', key: 'focus' } as const, null as SessionFocus)
const conversation = atom({ plugin: 'sessoes-ativas', key: 'conversation' } as const, [])

type RegistryEntry = {
  pid: number
  sessionId: string
  cwd: string
  startedAt: number
  procStart?: string
  name?: string
  status?: string
}

type TaskSummary = { title?: string; lastPrompt?: string; jiraCard?: string }

type Activity = { languages: string[]; taskKind?: string }

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'ts', tsx: 'ts', mts: 'ts', cts: 'ts',
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
  py: 'python', ipynb: 'python',
  sql: 'sql',
  php: 'php',
  go: 'go',
  rs: 'rust',
  java: 'java', kt: 'kotlin',
  rb: 'ruby',
  cs: 'c#',
  c: 'c', h: 'c', cpp: 'c++', hpp: 'c++',
  swift: 'swift', dart: 'dart',
  sh: 'shell', bash: 'shell',
  css: 'css', scss: 'css',
  html: 'html', vue: 'vue',
}

const FILE_EXTENSION = /\.([a-z]+)\b/gi

const COMMAND_LANGUAGES: [RegExp, string][] = [
  [/\b(psql|mysql|sqlite3)\b/, 'sql'],
  [/\b(python3?|pytest|pip3?|uv|poetry)\b/, 'python'],
  [/\b(tsc|vitest|jest)\b/, 'ts'],
  [/\b(php|artisan|composer)\b/, 'php'],
  [/\b(go (build|test|run))\b/, 'go'],
  [/\bcargo\b/, 'rust'],
]

const TASK_BY_COMMAND: [RegExp, string][] = [
  [/security-review/, 'segurança'],
  [/review/, 'review'],
  [/debugging/, 'correção'],
  [/(executing-plans|subagent-driven)/, 'codificação'],
  [/(plan|brainstorming)/, 'planejamento'],
  [/(biz-doc|summarize|docs-update|obsidian-map|docs)/, 'documentação'],
  [/(feature|componente|pagina|commit|test-driven)/, 'codificação'],
]

const TASK_BY_PROMPT: [RegExp, string][] = [
  [/(seguran[cç]a|security|vulnerab|owasp|pentest|cve\b)/i, 'segurança'],
  [/(review|revis[aeã]|\bmr\b|merge request)/i, 'review'],
  [/(\btestes?\b|\btests?\b|cobertura|coverage)/i, 'testes'],
  [/(\bbug|\berro|\berror|\bfix|corrig|quebr|falha|n[aã]o funciona)/i, 'correção'],
  [/(documenta|\bdocs?\b|readme)/i, 'documentação'],
  [/(analis|anális|explica|como funciona|investig|entend|por que|porque|o que é|qual )/i, 'análise'],
  [/(implement|cri[ae]r?\b|adicion|atualiz|refator|migr|ajust|alter|mud[ae])/i, 'codificação'],
]

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LSP'])

const toProjectFolder = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, '-')

const basename = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path

const formatAge = (startedAt: number, now: number) => {
  const minutes = Math.floor((now - startedAt) / MS_PER_MINUTE)
  if (minutes < MINUTES_PER_HOUR) return `${minutes}min`
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  if (hours < HOURS_PER_DAY) return `${hours}h`
  return `${Math.floor(hours / HOURS_PER_DAY)}d`
}

const findJiraCard = (text: string) => text.match(JIRA_CARD)?.[0]

const shortenHome = (path: string, home: string) =>
  path.startsWith(home) ? `~${path.slice(home.length)}` : path

const readBranch = async ($: Api, cwd: string) => {
  try {
    const { exitCode, stdout } = await $.process.run(['git', '-C', cwd, 'branch', '--show-current'])
    return exitCode === 0 ? stdout.trim() || undefined : undefined
  } catch {
    return undefined
  }
}

const isAlive = ($: Api, pid: number) => $.fs.exists(`/proc/${pid}`)

const readRegistryEntry = async ($: Api, path: string) => {
  try {
    return JSON.parse(await $.fs.read(path)) as RegistryEntry
  } catch {
    return undefined
  }
}

const readTaskSummary = async ($: Api, transcript: string): Promise<TaskSummary> => {
  if (!(await $.fs.exists(transcript))) return {}
  const { stdout } = await $.process.run(['grep', '-E', SUMMARY_MARKER.source, transcript])
  const summary: TaskSummary = {}
  for (const line of stdout.split('\n')) {
    if (!line) continue
    try {
      const row = JSON.parse(line)
      if (row.aiTitle) summary.title = row.aiTitle
      if (row.lastPrompt) {
        summary.lastPrompt = row.lastPrompt
        summary.jiraCard = findJiraCard(row.lastPrompt) ?? summary.jiraCard
      }
    } catch {}
  }
  return summary
}

const toMessageText = (content: unknown) => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join(' ')
}

const isPromptNoise = (text: string) =>
  /^\s*(<(system-reminder|command-|local-command|task-notification)|\[Request interrupted)/.test(text)

const commandName = (text: string) => text.match(/<command-name>\/?([^<]+)<\/command-name>/)?.[1]

const firstMatch = (table: [RegExp, string][], text: string) => table.find(([pattern]) => pattern.test(text))?.[1]

const languagesIn = (text: string) => {
  const found: string[] = []
  for (const [, extension] of text.matchAll(FILE_EXTENSION)) {
    const key = extension.toLowerCase()
    if (Object.hasOwn(LANGUAGE_BY_EXTENSION, key)) found.push(LANGUAGE_BY_EXTENSION[key])
  }
  return found
}

const toolLanguages = (name: string, input: Record<string, unknown>) => {
  const paths = [input.file_path, input.notebook_path, input.path, input.glob].filter(
    (value): value is string => typeof value === 'string',
  )
  const found = paths.flatMap(languagesIn)
  if (name === 'Bash' && typeof input.command === 'string') {
    found.push(...languagesIn(input.command))
    found.push(...COMMAND_LANGUAGES.filter(([pattern]) => pattern.test(input.command as string)).map(([, lang]) => lang))
  }
  return found
}

const topLanguages = (scores: Map<string, number>) =>
  [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_LANGUAGES)
    .map(([language]) => language)

const taskFromTools = (tools: string[]) => {
  if (tools.some(tool => EDIT_TOOLS.has(tool))) return 'codificação'
  if (tools.some(tool => READ_TOOLS.has(tool) || tool === 'Bash')) return 'análise'
  return undefined
}

const readActivity = async ($: Api, transcript: string): Promise<Activity> => {
  if (!(await $.fs.exists(transcript))) return { languages: [] }
  const { stdout } = await $.process.run(['tail', '-n', TRANSCRIPT_TAIL_LINES, transcript])
  const scores = new Map<string, number>()
  let promptTask: string | undefined
  let toolsSincePrompt: string[] = []
  for (const line of stdout.split('\n')) {
    if (!line.includes('"tool_use"') && !line.includes('"type":"user"')) continue
    try {
      const row = JSON.parse(line)
      if (row.isSidechain) continue
      const content = row.message?.content
      if (row.type === 'user' && !row.isMeta) {
        const text = toMessageText(content)
        const command = commandName(text)
        if (command) {
          promptTask = firstMatch(TASK_BY_COMMAND, command) ?? promptTask
          toolsSincePrompt = []
        } else if (text.trim() && !isPromptNoise(text)) {
          promptTask = firstMatch(TASK_BY_PROMPT, text) ?? promptTask
          toolsSincePrompt = []
        }
      }
      if (row.type !== 'assistant' || !Array.isArray(content)) continue
      for (const block of content) {
        if (block?.type !== 'tool_use') continue
        toolsSincePrompt.push(block.name)
        if (block.name === 'Skill' && typeof block.input?.skill === 'string') {
          promptTask = firstMatch(TASK_BY_COMMAND, block.input.skill) ?? promptTask
        }
        const weight = EDIT_TOOLS.has(block.name) ? EDIT_WEIGHT : 1
        for (const language of toolLanguages(block.name, block.input ?? {})) {
          scores.set(language, (scores.get(language) ?? 0) + weight)
        }
      }
    } catch {}
  }
  return { languages: topLanguages(scores), taskKind: promptTask ?? taskFromTools(toolsSincePrompt) }
}

const readConversation = async ($: Api, transcript: string): Promise<ConversationLine[]> => {
  if (!(await $.fs.exists(transcript))) return []
  const { stdout } = await $.process.run(['tail', '-n', TRANSCRIPT_TAIL_LINES, transcript])
  const lines: ConversationLine[] = []
  for (const line of stdout.split('\n')) {
    try {
      const row = JSON.parse(line)
      if ((row.type !== 'user' && row.type !== 'assistant') || row.isMeta || row.isSidechain) continue
      const text = toMessageText(row.message?.content).replace(/\s+/g, ' ').trim()
      if (!text || isPromptNoise(text)) continue
      lines.push({ role: row.type, text: text.slice(0, CONVERSATION_LINE_CHARS) })
    } catch {}
  }
  return lines.slice(-CONVERSATION_MESSAGES)
}

const collectSessions = async ($: Api): Promise<ActiveSession[]> => {
  const home = await $.env.get('HOME')
  const claudeDir = `${home}/.claude`
  const registryDir = `${claudeDir}/sessions`
  const currentId = await $.session.id()
  const files = (await $.fs.list(registryDir)).filter(
    file => file.kind === 'file' && file.name.endsWith('.json'),
  )
  const entries = await Promise.all(
    files.map(file => readRegistryEntry($, `${registryDir}/${file.name}`)),
  )
  const alive = await Promise.all(
    entries.map(async entry => (entry && (await isAlive($, entry.pid)) ? entry : undefined)),
  )

  const found = await Promise.all(
    alive
      .filter((entry): entry is RegistryEntry => entry !== undefined)
      .map(async entry => {
        const transcript = `${claudeDir}/projects/${toProjectFolder(entry.cwd)}/${entry.sessionId}.jsonl`
        const [summary, branch, activity] = await Promise.all([
          readTaskSummary($, transcript),
          readBranch($, entry.cwd),
          readActivity($, transcript),
        ])
        return {
          sessionId: entry.sessionId,
          pid: entry.pid,
          procStart: entry.procStart,
          name: entry.name ?? String(entry.pid),
          status: entry.status ?? '?',
          project: basename(entry.cwd),
          path: shortenHome(entry.cwd, home ?? ''),
          transcript,
          branch,
          startedAt: entry.startedAt,
          isCurrent: entry.sessionId === currentId,
          ...summary,
          ...activity,
          jiraCard: summary.jiraCard ?? (branch ? findJiraCard(branch.toUpperCase()) : undefined),
        }
      }),
  )

  return found.sort((a, b) => a.name.localeCompare(b.name))
}

const toggleFocus = async ($: Api, session: ActiveSession, action: SessionAction) => {
  const current = await read($, focus)
  const isSame = current?.sessionId === session.sessionId && current.action === action
  await update($, focus, () => (isSame ? null : { sessionId: session.sessionId, action }))
  if (isSame || action !== 'view') return
  await update($, conversation, () => [])
  const lines = await readConversation($, session.transcript)
  await update($, conversation, () => lines)
}

const sendMessage = async ($: Api, session: ActiveSession, text: string) => {
  if (!text.trim()) return
  const sent = await $.session.send({ to: { sessionId: session.sessionId }, text })
  $.ui.toast(sent.isDelivered ? `Mensagem enviada para ${session.name}` : `Não enviada: ${sent.reason}`)
  if (sent.isDelivered) await update($, focus, () => null)
}

const readProcStart = async ($: Api, pid: number) => {
  const { exitCode, stdout } = await $.process.run(['cat', `/proc/${pid}/stat`])
  if (exitCode !== 0) return undefined
  return stdout.slice(stdout.lastIndexOf(')') + 1).trim().split(/\s+/)[PROC_START_FIELD]
}

const isSameProcess = async ($: Api, session: ActiveSession) =>
  session.procStart !== undefined && (await readProcStart($, session.pid)) === session.procStart

const stopSession = async ($: Api, session: ActiveSession) => {
  const answer = await $.ui
    .ask(`Encerrar a sessão ${session.name} (${session.project})?`, {
      header: 'Encerrar',
      options: [CONFIRM_STOP, CANCEL_STOP],
    })
    .catch(() => CANCEL_STOP)
  if (answer !== CONFIRM_STOP) return

  if (!(await isSameProcess($, session))) {
    $.ui.toast(`${session.name} já não está rodando`)
    await refresh($)
    return
  }

  const { exitCode, stderr } = await $.process.run(['kill', '-TERM', String(session.pid)])
  $.ui.toast(exitCode === 0 ? `${session.name} encerrada` : `Não encerrou ${session.name}: ${stderr.trim()}`)
  await update($, focus, current => (current?.sessionId === session.sessionId ? null : current))
  await refresh($)
}

const refresh = async ($: Api) => {
  try {
    const list = await collectSessions($)
    await update($, sessions, () => list)
    await update($, refreshedAt, () => Date.now())
    const focused = await read($, focus)
    const viewed = focused?.action === 'view' && list.find(one => one.sessionId === focused.sessionId)
    if (viewed) {
      const lines = await readConversation($, viewed.transcript)
      await update($, conversation, () => lines)
    }
  } catch (error) {
    $.ui.log(`sessoes-ativas: falha ao ler sessões: ${error}`, { to: 'debug' })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sessoes',
      description: 'Mostra as sessões ativas desta máquina e o que cada uma está fazendo',
    })
    void refresh($)
    $.clock.every(REFRESH_INTERVAL_MS, () => refresh($))

    return next(e)
  })

  on('command.run', { command: 'sessoes' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: PANE_TITLE })

    return { text: 'Painel de sessões ativas aberto.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const Input = 'Input' in elements ? elements.Input : undefined
    const list = await read($, sessions)
    const focused = await read($, focus)
    const lines = await read($, conversation)
    const now = Date.now()

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>Nenhuma sessão encontrada.</Text>}
        {list.map(session => (
          <Box flexDirection="column" marginBottom={1}>
            <Text wrap="truncate-end">
              <Text bold color={session.status === 'busy' ? 'yellow' : 'green'}>
                {session.status === 'busy' ? '● ' : '○ '}
              </Text>
              <Text bold>{session.name}</Text>
              {session.taskKind && <Text color="blue"> [{session.taskKind}]</Text>}
              {session.languages?.length ? <Text color="cyan"> {session.languages.join(' · ')}</Text> : null}
              <Text dimColor>
                {' '}
                {session.status} · {formatAge(session.startedAt, now)}
                {session.isCurrent ? ' · esta sessão' : ''}
              </Text>
            </Text>
            <Text wrap="truncate-end">
              {'  '}
              <Text color="cyan">{session.project}</Text>
              {session.jiraCard && <Text color="magenta"> {session.jiraCard}</Text>}
              {session.branch && <Text dimColor> ⎇ {session.branch}</Text>}
            </Text>
            <Text dimColor wrap="truncate-start">
              {'  '}
              {session.path}
            </Text>
            <Text wrap="truncate-end">
              {'  '}
              {session.title ?? <Text dimColor>sem tarefa ainda</Text>}
            </Text>
            {session.lastPrompt && (
              <Text dimColor wrap="truncate-end">
                {'  › '}
                {session.lastPrompt.replace(/\s+/g, ' ')}
              </Text>
            )}
            {!session.isCurrent && (
              <Box flexDirection="row" gap={1} marginLeft={2}>
                <Button key={`send-${session.sessionId}`} dimColor onPress={() => toggleFocus($, session, 'send')}>
                  Mensagem
                </Button>
                <Button key={`view-${session.sessionId}`} dimColor onPress={() => toggleFocus($, session, 'view')}>
                  {focused?.sessionId === session.sessionId && focused.action === 'view' ? 'Fechar conversa' : 'Ver conversa'}
                </Button>
                {session.status === 'idle' && (
                  <Button key={`stop-${session.sessionId}`} dimColor onPress={() => stopSession($, session)}>
                    Encerrar
                  </Button>
                )}
              </Box>
            )}
            {Input && focused?.sessionId === session.sessionId && focused.action === 'send' && (
              <Box marginLeft={2}>
                <Input
                  key={`input-${session.sessionId}`}
                  label={`Para ${session.name}: `}
                  placeholder="escreva e tecle Enter"
                  submitLabel="enviar"
                  autoFocus
                  onSubmit={(value: string) => sendMessage($, session, value)}
                />
              </Box>
            )}
            {focused?.sessionId === session.sessionId && focused.action === 'view' && (
              <Box flexDirection="column" marginLeft={2} marginTop={1}>
                {lines.length === 0 && <Text dimColor>Sem mensagens para mostrar.</Text>}
                {lines.map(line => (
                  <Text wrap="wrap">
                    <Text bold color={line.role === 'user' ? 'cyan' : 'green'}>
                      {line.role === 'user' ? 'você › ' : 'claude › '}
                    </Text>
                    {line.text}
                  </Text>
                ))}
              </Box>
            )}
          </Box>
        ))}
      </Box>
    )
  })
}
