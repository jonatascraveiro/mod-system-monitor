export type Stats = {
  time: string | null
  model: string | null
  contextPercent: number | null
  fiveHour: number | null
  fiveHourResetsAt: string | null
  sevenDay: number | null
  cpu: number | null
  ram: { used: number; total: number } | null
  swap: { used: number; total: number } | null
  disk: { used: number; total: number } | null
}

declare module 'claude-code' {
  interface PluginState {
    'sysmon-band': { stats: Stats | null }
  }
}
