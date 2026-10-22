export type ActiveSession = {
  sessionId: string
  pid: number
  procStart?: string
  name: string
  status: string
  project: string
  path: string
  transcript: string
  branch?: string
  jiraCard?: string
  startedAt: number
  title?: string
  lastPrompt?: string
  isCurrent: boolean
}

export type SessionAction = 'send' | 'view'

export type SessionFocus = { sessionId: string; action: SessionAction } | null

export type ConversationLine = { role: 'user' | 'assistant'; text: string }

declare module 'claude-code' {
  interface PluginState {
    'sessoes-ativas': {
      sessions: ActiveSession[]
      refreshedAt: number
      focus: SessionFocus
      conversation: ConversationLine[]
    }
  }
}
