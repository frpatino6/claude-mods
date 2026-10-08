import type { AgentRec, AgentStatus, AuthKind, RateLimit, Stats, TokenCounts } from '../types'

export const emptyStats = (): Stats => ({
  models: {},
  skills: {},
  mcp: {},
  commands: {},
  rateLimits: [],
  agents: [],
  auth: 'unknown',
})

const bump = (counts: Record<string, number>, key: string) => ({
  ...counts,
  [key]: (counts[key] ?? 0) + 1,
})

export const addUsage = (
  stats: Stats,
  model: string,
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
  },
): Stats => {
  const had = stats.models[model] ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  return {
    ...stats,
    models: {
      ...stats.models,
      [model]: {
        input: had.input + usage.input_tokens,
        output: had.output + usage.output_tokens,
        cacheRead: had.cacheRead + usage.cache_read_input_tokens,
        cacheWrite: had.cacheWrite + usage.cache_creation_input_tokens,
      },
    },
  }
}

export const addSkill = (stats: Stats, skill: string): Stats => ({
  ...stats,
  skills: bump(stats.skills, skill),
})

export const addCommand = (stats: Stats, command: string): Stats => ({
  ...stats,
  commands: bump(stats.commands, command),
})

/** `mcp__server__tool` -> counted under server/tool; any other name is ignored. */
export const addMcpTool = (stats: Stats, tool: string): Stats => {
  const match = /^mcp__(.+?)__(.+)$/.exec(tool)
  if (!match) return stats
  const [, server, name] = match as unknown as [string, string, string]
  return { ...stats, mcp: { ...stats.mcp, [server]: bump(stats.mcp[server] ?? {}, name) } }
}

export const sumTokens = (stats: Stats): TokenCounts =>
  Object.values(stats.models).reduce(
    (all, one) => ({
      input: all.input + one.input,
      output: all.output + one.output,
      cacheRead: all.cacheRead + one.cacheRead,
      cacheWrite: all.cacheWrite + one.cacheWrite,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  )

export const formatTokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n)

export const formatUsd = (usd: number): string => `$${usd.toFixed(2)}`

/** 1234567 -> "1,234,567" */
export const formatInt = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export const padStart = (text: string, width: number): string => text.padStart(width, ' ')

export const padEnd = (text: string, width: number): string => text.padEnd(width, ' ')

export const clip = (text: string, width: number): string =>
  width > 1 && text.length > width ? `${text.slice(0, width - 1)}…` : text

export const rule = (width: number): string => '─'.repeat(Math.max(0, width))

/** A block-character bar: `filled` of `width` cells for a 0-100 percentage. */
export const bar = (percent: number, width: number): string => {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/** Colour of a usage bar by how much is USED: green under 60, yellow 60 to 85, red over 85. */
export const usedColor = (percentUsed: number): 'green' | 'yellow' | 'red' =>
  percentUsed < 60 ? 'green' : percentUsed <= 85 ? 'yellow' : 'red'

/** 52 -> "52", 47.5 -> "47.5" (no trailing .0). */
export const pct = (n: number): string => String(Math.round(n * 10) / 10)

/** Whole-number shares of the parts, "62% / 8% / 30%"; zero when the total is. */
export const shares = (values: number[]): number[] => {
  const sum = values.reduce((a, b) => a + b, 0)
  return values.map(v => (sum === 0 ? 0 : Math.round((v / sum) * 100)))
}

export const classifyAuth = (auth: { kind: 'bearer' | 'api-key' } | null): AuthKind =>
  auth === null ? 'none' : auth.kind

export type BalanceLine = { label: string; value: string; isNa?: boolean; percentLeft?: number; percentUsed?: number; resets?: string }

export type Balance = { plan: string; lines: BalanceLine[] }

const WINDOW_LABEL: Record<string, string> = {
  five_hour: '5-hour',
  seven_day: 'Weekly',
  spend_limit: 'Spend limit',
}

/** "1h 30m", "45m", "2d 3h" or "now"; empty when there is no usable reset time. */
export const countdown = (resetsAt: string | undefined, now: number): string => {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - now
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return 'now'
  const minutes = Math.round(ms / 60_000)
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`
}

const resetText = (resetsAt: string | undefined, now: number): string => {
  const text = countdown(resetsAt, now)
  return text === '' ? '' : text === 'now' ? ' · resetting now' : ` · resets in ${text}`
}

const windowLine = (limit: RateLimit, now: number): BalanceLine => {
  const left = Math.max(0, 100 - limit.percentUsed)
  return {
    label: WINDOW_LABEL[limit.kind] ?? limit.kind,
    percentLeft: left,
    percentUsed: limit.percentUsed,
    resets: countdown(limit.resetsAt, now),
    value: `${pct(limit.percentUsed)}% used · ${pct(left)}% left${resetText(limit.resetsAt, now)}`,
  }
}

/**
 * What the account can honestly be shown. The plan is read off what the API
 * reports (rate-limit windows exist only on a subscription), never guessed:
 * a figure the API does not give for that plan is `n/a` with the reason.
 */
export const describeBalance = (stats: Stats, now: number): Balance => {
  const cost: BalanceLine =
    stats.costUsd === undefined
      ? { label: 'Spent this session', value: 'n/a: no cost ledger on this host', isNa: true }
      : { label: 'Spent this session', value: formatUsd(stats.costUsd) }
  const windows = stats.rateLimits.filter(one => one.kind !== 'spend_limit')
  const spend = stats.rateLimits.filter(one => one.kind === 'spend_limit')

  if (windows.length > 0) {
    return {
      plan: 'Subscription (Pro / Max / Team)',
      lines: [
        ...windows.map(one => windowLine(one, now)),
        ...spend.map(one => windowLine(one, now)),
        { label: 'Plan tier', value: 'n/a: Pro vs Max is not exposed to mods', isNa: true },
        { ...cost, label: 'Session value at API list price' },
      ],
    }
  }
  if (spend.length > 0) {
    return {
      plan: 'Gateway with spend limit',
      lines: [...spend.map(one => windowLine(one, now)), cost],
    }
  }
  if (stats.auth === 'api-key') {
    return {
      plan: 'API key (pay-as-you-go / Enterprise billing)',
      lines: [
        cost,
        {
          label: 'Balance / budget',
          value: 'n/a for API key: account balance and org limits are not exposed to mods',
          isNa: true,
        },
      ],
    }
  }
  if (stats.auth === 'bearer') {
    return {
      plan: 'Logged-in account (plan not reported yet)',
      lines: [
        {
          label: 'Quota',
          value: 'n/a until the first response: limit windows arrive with it, and none came (e.g. Enterprise seat)',
          isNa: true,
        },
        cost,
      ],
    }
  }
  if (stats.auth === 'none') {
    return {
      plan: 'No first-party credential (3P provider / gateway)',
      lines: [
        { label: 'Balance / quota', value: 'n/a: not an Anthropic account', isNa: true },
        cost,
      ],
    }
  }
  return {
    plan: 'Unknown',
    lines: [{ label: 'Balance / quota', value: 'n/a: credential not read yet', isNa: true }, cost],
  }
}

export const ranked = (counts: Record<string, number>): [string, number][] =>
  Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

/** Short badge text for the plan card. */
export const planBadge = (balance: Balance): string => {
  const plan = balance.plan
  if (plan.startsWith('Subscription')) return 'SUBSCRIPTION'
  if (plan.startsWith('API key')) return 'API KEY'
  if (plan.startsWith('Gateway')) return 'GATEWAY'
  if (plan.startsWith('Logged-in')) return 'ACCOUNT'
  if (plan.startsWith('No first-party')) return '3P'
  return 'UNKNOWN'
}

/** The model with the most tokens so far, if any. */
export const topModel = (stats: Stats): string | undefined => {
  const total = (one: TokenCounts) => one.input + one.output + one.cacheRead + one.cacheWrite
  return Object.entries(stats.models).sort((a, b) => total(b[1]) - total(a[1]))[0]?.[0]
}

/** Cells for each value so they sum to `width`; a nonzero value always gets one. */
export const segments = (values: number[], width: number): number[] => {
  const sum = values.reduce((a, b) => a + b, 0)
  if (sum <= 0 || width <= 0) return values.map(() => 0)
  const cells = values.map(v => (v > 0 ? Math.max(1, Math.floor((v / sum) * width)) : 0))
  let spare = width - cells.reduce((a, b) => a + b, 0)
  const order = values.map((v, i) => i).sort((a, b) => (values[b] ?? 0) - (values[a] ?? 0))
  for (let i = 0; spare !== 0 && i < 1000; i++) {
    const at = order[i % order.length] as number
    if (spare > 0) { cells[at] = (cells[at] ?? 0) + 1; spare-- }
    else if ((cells[at] ?? 0) > 1) { cells[at] = (cells[at] ?? 0) - 1; spare++ }
  }
  return cells
}

/** Share of cached input among all input the model read: 0-100, or undefined with none. */
export const cacheHitPercent = (t: TokenCounts): number | undefined => {
  const all = t.input + t.cacheRead + t.cacheWrite
  return all === 0 ? undefined : Math.round((t.cacheRead / all) * 100)
}

/** Top `n` entries and how many were left out. */
export const top = <T,>(list: T[], n: number): { shown: T[]; more: number } => ({
  shown: list.slice(0, n),
  more: Math.max(0, list.length - n),
})

const FINISHED: AgentStatus[] = ['completed', 'failed', 'killed']
export const isFinished = (status: AgentStatus): boolean => FINISHED.includes(status)

export const recordSpawn = (
  stats: Stats,
  spawn: { id: string; type: string; description: string },
  now: number,
): Stats =>
  stats.agents.some(one => one.id === spawn.id)
    ? stats
    : { ...stats, agents: [...stats.agents, { ...spawn, status: 'running', tokens: 0, startedAt: now }] }

export const addAgentTokens = (stats: Stats, id: string, tokens: number): Stats => ({
  ...stats,
  agents: stats.agents.map(one => (one.id === id ? { ...one, tokens: one.tokens + tokens } : one)),
})

/**
 * Brings recorded subagents up to `$.agent.list()`. The engine drops a finished
 * subagent seconds later, so one that vanishes while recorded as live is marked
 * `completed` (it could have failed: the list no longer says).
 */
export const syncAgents = (
  stats: Stats,
  infos: { id: string; status: AgentStatus; type?: string; description?: string }[],
  now: number,
): Stats => {
  const known = new Set(stats.agents.map(one => one.id))
  const adopted: AgentRec[] = infos
    .filter(info => !known.has(info.id))
    .map(info => ({
      id: info.id,
      type: info.type ?? 'agent',
      description: info.description ?? '',
      status: info.status,
      tokens: 0,
      startedAt: now,
      endedAt: isFinished(info.status) ? now : undefined,
    }))
  return {
    ...stats,
    agents: [
      ...stats.agents.map(one => {
        if (isFinished(one.status)) return one
        const info = infos.find(i => i.id === one.id)
        const status: AgentStatus = info ? info.status : 'completed'
        return { ...one, status, endedAt: isFinished(status) ? now : undefined }
      }),
      ...adopted,
    ],
  }
}

/** Running first (then waiting, idle, pending), finished after; newest first within each. */
export const sortAgents = (agents: AgentRec[]): AgentRec[] =>
  [...agents].sort(
    (a, b) => Number(isFinished(a.status)) - Number(isFinished(b.status)) || b.startedAt - a.startedAt,
  )

export const agentTypeCounts = (agents: AgentRec[]): [string, number][] =>
  ranked(agents.reduce<Record<string, number>>((all, one) => ({ ...all, [one.type]: (all[one.type] ?? 0) + 1 }), {}))

export const statusDot = (status: AgentStatus): { glyph: string; color: string | undefined; label: string } =>
  status === 'running' || status === 'pending'
    ? { glyph: '●', color: 'yellow', label: status === 'running' ? 'running' : 'pending' }
    : status === 'completed'
      ? { glyph: '●', color: 'green', label: 'done' }
      : status === 'failed' || status === 'killed'
        ? { glyph: '●', color: 'red', label: status }
        : { glyph: '○', color: undefined, label: status }

export const formatDuration = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000))
  return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

const listText = (rows: [string, number][], n = 5): string => {
  if (rows.length === 0) return 'none yet'
  const { shown, more } = top(rows, n)
  return shown.map(([name, count]) => `${name} x${count}`).join(', ') + (more > 0 ? `, +${more} more` : '')
}

/** The whole report as compact plain text: the answer /info always gives, pane or not. */
export const textReport = (stats: Stats, now: number): string => {
  const total = sumTokens(stats)
  const all = total.input + total.output + total.cacheRead + total.cacheWrite
  const balance = describeBalance(stats, now)
  const servers = Object.entries(stats.mcp)
    .map(([server, tools]): [string, number] => [server, Object.values(tools).reduce((a, b) => a + b, 0)])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const running = stats.agents.filter(a => !isFinished(a.status)).length
  const lines = [
    `Session info - ${balance.plan}${topModel(stats) ? ` - ${topModel(stats)}` : ''}`,
    `Tokens: ${formatInt(all)} total (in ${formatTokens(total.input)}, out ${formatTokens(total.output)}, cache read ${formatTokens(total.cacheRead)}, cache write ${formatTokens(total.cacheWrite)})`,
    ...(stats.contextTokens === undefined
      ? []
      : [`Context now: ${formatInt(stats.contextTokens)}${stats.contextWindow ? ` / ${formatInt(stats.contextWindow)}` : ''} tokens (engine)`]),
    ...balance.lines.map(line => `${line.label}: ${line.value}`),
    `Skills: ${listText(ranked(stats.skills))}`,
    `MCP: ${listText(servers)}`,
    `Commands: ${listText(ranked(stats.commands).map(([name, n]): [string, number] => [`/${name}`, n]))}`,
    `Subagents: ${stats.agents.length === 0 ? 'none yet' : `${stats.agents.length} (${running} running) - ${listText(agentTypeCounts(stats.agents))}`}`,
  ]
  return (stats.warn ? [...lines, `Note: ${stats.warn}`] : lines).join('\n')
}

export type Row = { role: 'user' | 'assistant'; text: string; toolUses: { tool: string; input: Record<string, unknown> }[] }

export type Scan = {
  skills: Record<string, number>
  mcp: Record<string, Record<string, number>>
  commands: Record<string, number>
}

/**
 * Counts what the transcript itself shows (Skill and mcp__ tool uses, slash
 * commands the person typed). It does not depend on any hook having fired, so
 * it also covers what happened before the mod loaded.
 */
export const scanMessages = (rows: Row[]): Scan => {
  let scan = emptyStats()
  for (const row of rows) {
    for (const use of row.toolUses) {
      if (use.tool === 'Skill' && typeof use.input.skill === 'string') scan = addSkill(scan, use.input.skill)
      else scan = addMcpTool(scan, use.tool)
    }
    if (row.role === 'user') {
      const match = /^\s*\/([\w:.-]+)/.exec(row.text)
      if (match?.[1] && match[1] !== 'info') scan = addCommand(scan, match[1])
    }
  }
  return { skills: scan.skills, mcp: scan.mcp, commands: scan.commands }
}

const maxCounts = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
  const out = { ...a }
  for (const [key, n] of Object.entries(b)) out[key] = Math.max(out[key] ?? 0, n)
  return out
}

/** Per key, the larger of what the hooks saw and what the transcript shows. */
export const mergeScan = (stats: Stats, scan: Scan): Stats => {
  const mcp = { ...stats.mcp }
  for (const [server, tools] of Object.entries(scan.mcp)) mcp[server] = maxCounts(mcp[server] ?? {}, tools)
  return {
    ...stats,
    skills: maxCounts(stats.skills, scan.skills),
    commands: maxCounts(stats.commands, scan.commands),
    mcp,
  }
}

export type BarRowOptions = {
  /** text room of the row */
  W: number
  /** columns of the label, trailing gap included */
  labelW: number
  label: string
  /** fill, 0-100 */
  percent: number
  /** the number that stays on the bar's row */
  primary: string
  /** the second number: beside the primary when there is room, else on a dim line below */
  secondary?: string
  minBar?: number
  maxBar?: number
}

export type BarRow = {
  label: string
  filled: number
  empty: number
  primary: string
  /** shown right of the primary */
  inline: string
  /** shown on a dim line below the bar row */
  wrapped: string
}

/** One row of label + bar + numbers, the shape every card shares; narrow rows wrap the secondary number. */
export const layoutBarRow = (o: BarRowOptions): BarRow => {
  const secondary = o.secondary ?? ''
  const isRoomy = secondary === '' || o.W >= 56
  const tail = isRoomy ? o.primary + (secondary ? `  ${secondary}` : '') : o.primary
  const barW = Math.max(o.minBar ?? 8, Math.min(o.maxBar ?? 32, o.W - o.labelW - 1 - tail.length))
  const filled = Math.min(barW, Math.round((Math.min(100, Math.max(0, o.percent)) / 100) * barW))
  return {
    label: padEnd(clip(o.label, o.labelW - 1), o.labelW),
    filled,
    empty: barW - filled,
    primary: o.primary,
    inline: isRoomy ? secondary : '',
    wrapped: isRoomy ? '' : secondary,
  }
}
