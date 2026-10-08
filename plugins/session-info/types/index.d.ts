export type TokenCounts = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type AgentStatus = 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed'

export type AgentRec = {
  id: string
  type: string
  description: string
  status: AgentStatus
  tokens: number
  startedAt: number
  endedAt?: number
}

export type TurnRec = {
  id: string
  /** prompt snippet, '' for a continuation */
  label: string
  /** tokens processed in the turn (input + output + cache), 0 until it completes */
  tokens: number
  /** tool names called while it ran, in order */
  tools: string[]
}

export type ToolStat = {
  calls: number
  /** characters the tool's results held, as the model read them */
  chars: number
  /** results of 20k+ tokens (estimated) */
  bigResults: number
}

export type AuthKind = 'bearer' | 'api-key' | 'none' | 'unknown'

export type Stats = {
  models: Record<string, TokenCounts>
  skills: Record<string, number>
  mcp: Record<string, Record<string, number>>
  commands: Record<string, number>
  rateLimits: RateLimit[]
  costUsd?: number
  agents: AgentRec[]
  turns: TurnRec[]
  tools: Record<string, ToolStat>
  auth: AuthKind
  contextTokens?: number
  contextWindow?: number
  /** why the last refresh could not read something, shown instead of hiding it */
  warn?: string
}

declare module 'claude-code' {
  interface PluginState {
    'session-info': { stats: Stats }
  }
}
