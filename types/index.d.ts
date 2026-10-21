export type Stats = {
  costUsd: number | null
  contextPercent: number | null
  fiveHour: number | null
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
