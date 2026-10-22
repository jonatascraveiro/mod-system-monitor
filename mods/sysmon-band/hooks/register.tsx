import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Stats } from '../types'
import { barCells, cpuPercent, gib, levelColor, parseCpu, parseDisk, parseMem, parseTime } from './metrics'
import type { CpuTimes } from './metrics'

const stats = atom({ plugin: 'sysmon-band', key: 'stats' } as const, null)

const PERIOD_MS = 2000
const BAR = 10
const SEP = ' │ '

const memo: { previous: CpuTimes | null } = { previous: null }

async function sample($: EngineInterface) {
  const [usage, proc, df, date] = await Promise.all([
    $.session.usage(),
    $.process.run(['cat', '/proc/stat', '/proc/meminfo']),
    $.process.run(['df', '-B1', '--output=used,avail', '/']),
    $.process.run(['date', '+%d/%m/%Y %H:%M']),
  ])
  const cpu = parseCpu(proc.stdout)
  const { ram, swap } = parseMem(proc.stdout)
  const next: Stats = {
    time: parseTime(date.stdout),
    costUsd: usage.cost?.usd ?? null,
    contextPercent: usage.context.percent ?? null,
    fiveHour: usage.rateLimits.find(r => r.kind === 'five_hour')?.percentUsed ?? null,
    sevenDay: usage.rateLimits.find(r => r.kind === 'seven_day')?.percentUsed ?? null,
    cpu: cpu && memo.previous ? cpuPercent(memo.previous, cpu) : null,
    ram,
    swap,
    disk: parseDisk(df.stdout),
  }
  memo.previous = cpu
  await update($, stats, () => next)
}

export const register: Register = on => {
  let timer: { cancel: () => void } | null = null

  on('session.start', async ($, e, next) => {
    timer?.cancel()
    timer = $.clock.every(PERIOD_MS, () => sample($))
    void sample($)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, stats)
    if (e.props.hasSurvey || s === null) return next(e)

    const below = await next(e)
    const { Box, Text } = $.ui.resolve(e)

    const pct = (v: number | null, label: string) =>
      v === null ? '' : `${label} ${v.toFixed(0)}%`
    const consumption = [
      s.costUsd === null ? '' : `$${s.costUsd.toFixed(2)}`,
      pct(s.contextPercent, 'ctx'),
      pct(s.fiveHour, '5h'),
      pct(s.sevenDay, '7d'),
    ]
      .filter(Boolean)
      .join(' · ')

    const memPct = (m: { used: number; total: number } | null) =>
      m && m.total > 0 ? (m.used / m.total) * 100 : null
    const memTail = (m: { used: number; total: number } | null) =>
      m ? `${gib(m.used)}/${gib(m.total)} GiB` : ''

    const items = [
      { label: 'CPU', percent: s.cpu, tail: '' },
      { label: 'RAM', percent: memPct(s.ram), tail: memTail(s.ram) },
      {
        label: 'Swap',
        percent: memPct(s.swap),
        tail: s.swap && s.swap.total === 0 ? 'desativado' : memTail(s.swap),
      },
      {
        label: 'Disco',
        percent: memPct(s.disk),
        tail: s.disk ? `${gib(s.disk.total - s.disk.used)} GiB livres` : '',
      },
    ]

    const text = (it: (typeof items)[number], bar: boolean, tail: boolean) =>
      [
        it.label,
        bar ? '░'.repeat(BAR) : '',
        it.percent === null ? '…' : `${it.percent.toFixed(0)}%`,
        tail ? it.tail : '',
      ]
        .filter(Boolean)
        .join(' ')
    const clock = s.time === null ? '' : `${s.time}${SEP}`
    const length = (bar: boolean, tail: boolean) =>
      clock.length +
      `Sessão ${consumption || '—'}`.length +
      items.reduce((n, it) => n + SEP.length + text(it, bar, tail).length, 0)

    const room = e.props.bodyColumns
    const bar = length(true, true) <= room
    const tail = bar || length(false, true) <= room

    return (
      <Box flexDirection="column">
        <Box>
          {clock ? <Text bold>{s.time}<Text dimColor>{SEP}</Text></Text> : ''}
          <Text dimColor>Sessão {consumption || '—'}</Text>
          {items.map(it => (
            <Text key={it.label}>
              <Text dimColor>{SEP}</Text>
              <Text dimColor>{it.label} </Text>
              {it.percent === null ? (
                <Text dimColor>{bar ? '░'.repeat(BAR) + ' ' : ''}…</Text>
              ) : (
                <Text color={levelColor(it.percent)}>
                  {bar ? '█'.repeat(barCells(it.percent, BAR)) : ''}
                  {bar ? <Text dimColor>{'░'.repeat(BAR - barCells(it.percent, BAR))}</Text> : ''}
                  {`${bar ? ' ' : ''}${it.percent.toFixed(0)}%`}
                </Text>
              )}
              {tail && it.tail ? <Text dimColor>{` ${it.tail}`}</Text> : ''}
            </Text>
          ))}
        </Box>
        {below}
      </Box>
    )
  })
}
