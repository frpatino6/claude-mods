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

export type ShellStatus = 'running' | 'ok' | 'failed' | 'timeout' | 'interrupted' | 'denied' | 'background'

export type ShellEntry = {
  id: string
  /** the command, secrets already redacted */
  command: string
  description?: string
  startedAt: number
  endedAt?: number
  status: ShellStatus
  /** read from the result text ("Exit code N"); absent when the text has none */
  exit?: number
  /** last output lines, redacted; empty when the result carried no output */
  tail: string[]
  /** stdout then stderr as the tool returned them, redacted and capped at 20k chars; '' while running */
  log: string
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
  /** how many events the mod has actually seen, to tell "no usage" from "no events" */
  diag?: { turnEvents: number; withUsage: number; measures: number }
  shell: ShellEntry[]
  /** bumped by the refresh while a command runs, so elapsed times redraw */
  tick?: number
  tools: Record<string, ToolStat>
  auth: AuthKind
  contextTokens?: number
  /** context size samples, oldest first, at most 40 */
  contextHistory: number[]
  contextWindow?: number
  /** why the last refresh could not read something, shown instead of hiding it */
  warn?: string
}

declare module 'claude-code' {
  interface PluginState {
    'session-info': { stats: Stats; expanded: string | null }
  }
}
