export type CpuTimes = { idle: number; total: number }
export type Mem = { used: number; total: number }

export const parseCpu = (stat: string): CpuTimes | null => {
  const line = stat.split('\n').find(l => l.startsWith('cpu '))
  if (!line) return null
  const f = line.trim().split(/\s+/).slice(1).map(Number)
  if (f.length < 4 || f.some(Number.isNaN)) return null
  const idle = f[3] + (f[4] ?? 0)
  const total = f.slice(0, 8).reduce((a, b) => a + b, 0)
  return { idle, total }
}

export const cpuPercent = (a: CpuTimes, b: CpuTimes): number => {
  const total = b.total - a.total
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, (1 - (b.idle - a.idle) / total) * 100))
}

const kb = (meminfo: string, key: string): number | null => {
  const m = meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))
  return m ? Number(m[1]) * 1024 : null
}

export const parseMem = (meminfo: string): { ram: Mem | null; swap: Mem | null } => {
  const total = kb(meminfo, 'MemTotal')
  const available = kb(meminfo, 'MemAvailable')
  const swapTotal = kb(meminfo, 'SwapTotal')
  const swapFree = kb(meminfo, 'SwapFree')
  return {
    ram: total !== null && available !== null ? { used: total - available, total } : null,
    swap:
      swapTotal !== null && swapFree !== null
        ? { used: swapTotal - swapFree, total: swapTotal }
        : null,
  }
}

export const parseDisk = (df: string): Mem | null => {
  const line = df.trim().split('\n').pop() ?? ''
  const [used, avail] = line.trim().split(/\s+/).map(Number)
  if (!Number.isFinite(used) || !Number.isFinite(avail) || used + avail <= 0) return null
  return { used, total: used + avail }
}

export const levelColor = (percent: number): string =>
  percent >= 85 ? '#f85149' : percent >= 60 ? '#ff9800' : '#3fb950'

export const barCells = (percent: number, width: number): number =>
  Math.round((Math.max(0, Math.min(100, percent)) / 100) * width)

export const gib = (bytes: number): string => (bytes / 1024 ** 3).toFixed(1)

const MS_PER_MINUTE = 60_000

export const formatCountdown = (resetsAt: string | null, now: number): string | null => {
  const target = resetsAt === null ? NaN : Date.parse(resetsAt)
  if (Number.isNaN(target)) return null
  const minutes = Math.max(0, Math.ceil((target - now) / MS_PER_MINUTE))
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`
}

export const shortModel = (model: string): string => model.replace(/^claude-/, '')

export const parseTime = (date: string): string | null => {
  const time = date.trim()
  return /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(time) ? time : null
}
