import { expect, test } from 'claude-code/testing'

const STDOUT: Record<string, string> = {
  cat: 'cpu  100 0 100 800 0 0 0 0\nMemTotal: 2048 kB\nMemAvailable: 1024 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n',
  df: '      Used     Avail\n1073741824 3221225472\n',
  date: '21/10/2026 14:07\n',
}

const BAND = {
  plugin: 'sysmon-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 200,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('test_should_keep_band_below_when_another_mod_draws_above_prompt', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>outro mod</Text>
  })
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      cost: { usd: 0.88 },
      context: { window: 200000, percent: 47 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 9, resetsAt: new Date(Date.now() + 133.5 * 60_000).toISOString() }],
    },
  }))
  on('process.run', (_, e) => ({
    value: {
      exitCode: 0,
      stdout: STDOUT[e.argv[0] ?? ''] ?? '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /Sessão/ }))?.text).toBe('Sessão opus-5-5 · ctx 47% · 5h 9% ↻ 2h14m')
    expect((await ui.find({ type: 'Text', text: /outro mod/ }))?.text).toBe('outro mod')
    await ui.unmount()
  }
})

test('test_should_draw_only_band_below_when_stats_are_missing', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>outro mod</Text>
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /Sessão/ })).toBe(undefined)
  expect((await ui.find({ type: 'Text', text: /outro mod/ }))?.text).toBe('outro mod')
  await ui.unmount()
})
