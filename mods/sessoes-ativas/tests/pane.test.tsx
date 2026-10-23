import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'sessoes-ativas',
  component: 'Pane',
  requestId: 'sessoes-ativas',
  surface: 'terminal',
  props: {
    title: 'Sessões ativas',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const REGISTRY = {
  'a.json': { pid: 1, sessionId: 'aaa', cwd: '/proj/web', startedAt: 0, name: 'web-1', status: 'busy' },
  'b.json': { pid: 2, sessionId: 'bbb', cwd: '/proj/api', startedAt: 0, name: 'api-1', status: 'idle' },
  'd.json': { pid: 4, procStart: '777', sessionId: 'ddd', cwd: '/proj/api', startedAt: 0, name: 'parada', status: 'idle' },
  'c.json': { pid: 3, sessionId: 'ccc', cwd: '/proj/api', startedAt: 0, name: 'morta', status: 'idle' },
} as const

const TRANSCRIPT_A = [
  '{"type":"user","message":{"role":"user","content":"revisa o preview do carimbo"}}',
  '{"type":"user","isMeta":true,"message":{"role":"user","content":"meta escondido"}}',
  '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Revisei e ajustei a margem."}]}}',
  '{"type":"ai-title","aiTitle":"Título antigo"}',
  '{"type":"last-prompt","lastPrompt":"corrige o carimbo do GEODOC-1234"}',
  '{"type":"ai-title","aiTitle":"Migração do carimbo"}',
  '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Edit","input":{"file_path":"/proj/web/src/Carimbo.tsx"}}]}}',
  '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","input":{"command":"psql -c \\"select 1\\""}}]}}',
].join('\n')

const TRANSCRIPT_D = [
  '{"type":"user","message":{"role":"user","content":"como funciona o importador?"}}',
  '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Read","input":{"file_path":"/proj/api/importer.py"}}]}}',
  '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Grep","input":{"pattern":"x","glob":"**/*.py"}}]}}',
].join('\n')

const TRANSCRIPT_SECURITY = [
  '{"type":"user","message":{"role":"user","content":"<command-name>/security-review</command-name>"}}',
  '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Edit","input":{"file_path":"/proj/api/app/Http/Kernel.php"}}]}}',
].join('\n')

const TRANSCRIPT_INTERRUPTED = [
  '{"type":"user","message":{"role":"user","content":"faz uma revisão do PR"}}',
  '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","input":{"command":"grep -rn this.constructor src"}}]}}',
  '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user]"}]}}',
].join('\n')

const TRANSCRIPT_SKILL = [
  '{"type":"user","message":{"role":"user","content":"segue o plano"}}',
  '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Skill","input":{"skill":"superpowers:executing-plans"}}]}}',
].join('\n')

const stubEngine = (
  on: any,
  sent: unknown[],
  runs: string[][] = [],
  procStart = '777',
  answer = 'Encerrar',
  transcriptD = TRANSCRIPT_D,
) => {
  on('command.register', () => ({ value: { command: 'sessoes' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: {} }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'bbb' }))
  on('env.get', () => ({ value: '/home/u' }))
  on('fs.list', () => ({
    value: Object.keys(REGISTRY).map(name => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })),
  }))
  on('fs.read', (_, e) => ({
    value: JSON.stringify(REGISTRY[String(e.path).split('/').at(-1) as keyof typeof REGISTRY]),
  }))
  on('fs.exists', (_, e) => ({ value: !String(e.path).endsWith('/proc/3') && !String(e.path).includes('bbb.jsonl') }))
  on('tool.call', (_: unknown, e: { tool: string; questions?: { question: string }[] }) => ({
    result: { questions: e.questions ?? [], answers: Object.fromEntries((e.questions ?? []).map(q => [q.question, answer])) },
  }))
  on('process.run', (_: unknown, e: { argv: string[] }) => {
    runs.push(e.argv)
    if (e.argv[0] === 'cat') return { value: { exitCode: 0, stdout: `4 (claude) S ${'0 '.repeat(18)}${procStart} 0`, stderr: '' } }
    if (e.argv[0] === 'kill') return { value: { exitCode: 0, stdout: '', stderr: '' } }
    const isGit = e.argv[0] === 'git'
    const branch = e.argv[2] === '/proj/api' ? 'feat/geodoc-77-carimbo\n' : 'dev\n'
    const file = String(e.argv.at(-1))
    const transcript = file.includes('aaa') ? TRANSCRIPT_A : file.includes('ddd') ? transcriptD : ''
    return { value: { exitCode: 0, stdout: isGit ? branch : transcript, stderr: '' } }
  })
  on('session.send', (_: unknown, e: unknown) => {
    sent.push(e)
    return { isDelivered: true }
  })
  on('ui.toast', () => ({ value: undefined }))
}

test('deve listar as sessões vivas com título e último prompt quando o painel abre', async ($, on) => {
  stubEngine(on, [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'sessoes', args: '' })

  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /Migração do carimbo/ }))?.text).toContain('Migração do carimbo')
  expect(await ui.find({ type: 'Text', text: /corrige o carimbo/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /esta sessão/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /sem tarefa ainda/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /morta/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /GEODOC-1234/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /GEODOC-77/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /\/proj\/web/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /feat\/geodoc-77-carimbo/ })).toBeTruthy()
  await ui.unmount()
})

test('deve mandar mensagem para a sessão quando escrever no campo e teclar Enter', async ($, on) => {
  const sent: unknown[] = []
  stubEngine(on, sent)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'sessoes', args: '' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'send-aaa' })
  await ui.input({ key: 'input-aaa', text: 'roda os testes' })

  expect(sent).toEqual([expect.objectContaining({ to: 'aaa', text: 'roda os testes' })])
  expect(await ui.find({ type: 'Text', text: /roda os testes/ })).toBeFalsy()
  await ui.unmount()
})

test('deve mostrar as últimas mensagens da sessão quando pedir para ver a conversa', async ($, on) => {
  stubEngine(on, [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'sessoes', args: '' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'view-aaa' })

  expect(await ui.find({ type: 'Text', text: /revisa o preview do carimbo/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Revisei e ajustei a margem/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /meta escondido/ })).toBeFalsy()
  expect(await ui.find({ type: 'Button', text: /Mensagem/, key: 'send-bbb' })).toBeFalsy()
  await ui.unmount()
})

const killCalls = (runs: string[][]) => runs.filter(argv => argv[0] === 'kill')

test('deve encerrar a sessão parada quando confirmar e o processo for o mesmo', async ($, on) => {
  const runs: string[][] = []
  stubEngine(on, [], runs)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'sessoes', args: '' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'stop-ddd' })

  expect(killCalls(runs)).toEqual([['kill', '-TERM', '4']])
  await ui.unmount()
})

test('não deve encerrar a sessão quando o pid pertencer a outro processo', async ($, on) => {
  const runs: string[][] = []
  stubEngine(on, [], runs, '999')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'sessoes', args: '' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'stop-ddd' })

  expect(killCalls(runs)).toEqual([])
  await ui.unmount()
})

test('não deve encerrar a sessão quando o usuário cancelar', async ($, on) => {
  const runs: string[][] = []
  stubEngine(on, [], runs, '777', 'Cancelar')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'sessoes', args: '' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'stop-ddd' })

  expect(killCalls(runs)).toEqual([])
  await ui.unmount()
})

test('deve mostrar Encerrar só em sessões paradas que não são a atual', async ($, on) => {
  stubEngine(on, [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'sessoes', args: '' })

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Button', key: 'stop-ddd' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'stop-aaa' })).toBeFalsy()
  expect(await ui.find({ type: 'Button', key: 'stop-bbb' })).toBeFalsy()
  await ui.unmount()
})

test('deve mostrar o tipo de tarefa e as linguagens de cada sessão', async ($, on) => {
  stubEngine(on, [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'sessoes', args: '' })

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /\[review\]/ })).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /ts · sql/ }))?.text).toContain('ts · sql')
  expect(await ui.find({ type: 'Text', text: /\[análise\]/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /python/ })).toBeTruthy()
  await ui.unmount()
})

test('deve usar o comando invocado como tipo de tarefa quando o prompt for um slash command', async ($, on) => {
  stubEngine(on, [], [], '777', 'Encerrar', TRANSCRIPT_SECURITY)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'sessoes', args: '' })

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /\[segurança\]/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: / php/ })).toBeTruthy()
  await ui.unmount()
})

test('não deve mostrar tipo nem linguagem quando a sessão ainda não tem atividade', async ($, on) => {
  stubEngine(on, [], [], '777', 'Encerrar', '')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'sessoes', args: '' })

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /\[análise\]/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /python/ })).toBeFalsy()
  await ui.unmount()
})

test('deve manter o tipo de tarefa quando o usuário interromper e não mostrar chaves do protótipo como linguagem', async ($, on) => {
  stubEngine(on, [], [], '777', 'Encerrar', TRANSCRIPT_INTERRUPTED)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'sessoes', args: '' })

  const ui = await $.ui.mount(PANE)
  const line = await ui.find({ type: 'Text', text: /parada/ })
  expect(line?.text).toContain('[review]')
  expect(line?.text).not.toContain('function')
  await ui.unmount()
})

test('deve classificar como codificação quando a sessão executa um plano via skill', async ($, on) => {
  stubEngine(on, [], [], '777', 'Encerrar', TRANSCRIPT_SKILL)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'sessoes', args: '' })

  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /parada/ }))?.text).toContain('[codificação]')
  await ui.unmount()
})
