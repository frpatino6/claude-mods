import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Stats } from '../types'
import {
  addAgentTokens,
  addCommand,
  agentTypeCounts,
  formatDuration,
  recordSpawn,
  sortAgents,
  statusDot,
  syncAgents,
  addMcpTool,
  addSkill,
  addUsage,
  bar,
  cacheHitPercent,
  classifyAuth,
  clip,
  describeBalance,
  emptyStats,
  formatInt,
  formatTokens,
  formatUsd,
  pct,
  layoutBarRow,
  padEnd,
  padStart,
  planBadge,
  ranked,
  segments,
  shares,
  sumTokens,
  mergeScan,
  scanMessages,
  usedColor,
  textReport,
  top,
  topModel,
} from './lib'

const PANE = 'session-info'
const ACCENT = 'claude'
const SECOND = 'suggestion'
const THIRD = 'inactive'
const FOURTH = 'subtle'
const COMMAND = 'info'
const stats = atom({ plugin: 'session-info', key: 'stats' } as const, emptyStats())

const REFRESH_MS = 3000
let stopTimer: (() => void) | undefined

// A failed read must never stop a hook from answering, but it is never hidden:
// the reason is kept in `warn` and shown in the pane and the report.
async function readInto($: EngineInterface, step: string, work: () => Promise<void>): Promise<string | undefined> {
  try {
    await work()
    return undefined
  } catch (error) {
    return `${step}: ${error instanceof Error ? error.message : String(error)}`
  }
}

async function refresh($: EngineInterface) {
  const now = await $.clock.now()
  const problems = await Promise.all([
    readInto($, 'usage', async () => {
      const usage = await $.session.usage()
      await update($, stats, one => ({
        ...one,
        rateLimits: usage.rateLimits,
        costUsd: usage.cost?.usd,
        contextTokens: usage.context.tokens,
        contextWindow: usage.context.window,
      }))
    }),
    readInto($, 'auth', async () => {
      const auth = await $.session.authorize()
      await update($, stats, one => ({ ...one, auth: classifyAuth(auth) }))
    }),
    readInto($, 'agents', async () => {
      const infos = await $.agent.list()
      await update($, stats, one => syncAgents(one, infos, now))
    }),
    readInto($, 'transcript', async () => {
      const rows = await $.session.messages()
      await update($, stats, one => mergeScan(one, scanMessages(rows)))
    }),
  ])
  const warn = problems.filter(Boolean).join('; ') || undefined
  await update($, stats, one => (one.warn === warn ? one : { ...one, warn }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show tokens, quota and the skills, MCP tools and commands used',
    })
    void refresh($)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    // Open first, while the person's command is what this call answers; the
    // pane is a bonus, the text below is the answer whatever happens to it.
    let seat = ''
    try {
      const opened = await $.ui.open({ id: PANE, title: 'Session info', focus: true, closeOnEscape: true, rows: 24, columns: 72 })
      seat = opened.isPlaced ? '' : `\n(pane waiting, not drawn: ${opened.reason})`
    } catch (error) {
      seat = `\n(pane could not open: ${error instanceof Error ? error.message : String(error)})`
    }
    await refresh($)
    stopTimer ??= $.clock.every(REFRESH_MS, () => void refresh($))
    const report = textReport(await read($, stats), await $.clock.now())

    return { text: `${report}${seat}` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    stopTimer?.()
    stopTimer = undefined

    return next(e)
  })

  on('command.run', async ($, e, next) => {
    if (e.command !== COMMAND) await update($, stats, one => addCommand(one, e.command))

    return next(e)
  })

  on('skill.prompt', async ($, e, next) => {
    await update($, stats, one => addSkill(one, e.skill))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await update($, stats, one => addMcpTool(one, e.tool))

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.agentId) {
      const id = started.agentId
      try {
        const now = await $.clock.now()
        await update($, stats, one => recordSpawn(one, { id, type: e.subagentType, description: e.description }, now))
      } catch {}
    }

    return started
  })

  on('turn.complete', async ($, e, next) => {
    const { usage, agentId } = e
    if (usage) {
      await update($, stats, one => addUsage(one, usage.model, usage))
      if (agentId) {
        const sum = usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
        await update($, stats, one => addAgentTokens(one, agentId, sum))
      }
    }
    await refresh($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, stats, one => ({ ...one, rateLimits: e.rateLimits, costUsd: e.cost?.usd }))

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s: Stats = await read($, stats)
    const columns = e.viewport?.columns ?? 60
    const W = Math.max(26, columns - 5) // text room inside a card: border + padding both sides
    const total = sumTokens(s)
    const all = total.input + total.output + total.cacheRead + total.cacheWrite
    const balance = describeBalance(s, await $.clock.now())
    const model = topModel(s)

    const card = (title: string, children: unknown[], badge?: string) => (
      <Box flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold color={ACCENT}>
            {title}
          </Text>
          {badge ? <Text dimColor>{badge}</Text> : <Text> </Text>}
        </Box>
        {children}
      </Box>
    )
    const pill = (text: string) => (
      <Text inverse bold color={ACCENT}>
        {' '}
        {text}{' '}
      </Text>
    )

    // 1. Header
    const header = card('Session', [
      <Box justifyContent="space-between">
        <Text dimColor>{clip(model ?? 'no model yet', Math.max(8, W - balance.plan.length - 4))}</Text>
        {pill(planBadge(balance))}
      </Box>,
      <Box justifyContent="space-between">
        <Text dimColor>spent</Text>
        <Text bold>{s.costUsd === undefined ? 'n/a' : formatUsd(s.costUsd)}</Text>
      </Box>,
    ])

    // 2. Quota
    const quotaRows = balance.lines.flatMap(line => {
      if (line.percentLeft !== undefined && line.percentUsed !== undefined) {
        const used = line.percentUsed
        const color = usedColor(used)
        const label = padEnd(clip(line.label, 11), 11)
        const isRoomy = W >= 56
        const barW = Math.max(8, Math.min(32, isRoomy ? W - 11 - 2 - 30 : W - 11 - 2 - 9))
        const filled = Math.min(barW, Math.round((Math.min(100, used) / 100) * barW))
        const meta = `${pct(used)}% used · ${pct(line.percentLeft)}% left${line.resets ? (line.resets === 'now' ? ' · resetting now' : ` · resets in ${line.resets}`) : ''}`
        return [
          <Text>
            <Text bold>{label}</Text>
            <Text bold color={color}>
              {'█'.repeat(filled)}
            </Text>
            <Text dimColor>{'░'.repeat(barW - filled)}</Text>
            <Text bold color={color}>
              {' '}
              {isRoomy ? meta : `${pct(used)}% used`}
            </Text>
          </Text>,
          isRoomy ? <Text> </Text> : <Text dimColor>{clip(`${' '.repeat(11)}${meta.replace(/^[^·]*· /, '')}`, W)}</Text>,
        ]
      }
      if (line.isNa) {
        const reason = line.value.replace(/^n\/a( for [^:]*)?:?\s*/, '')
        return [
          <Text dimColor wrap="wrap">
            {line.label} · n/a{reason ? ` — ${reason}` : ''}
          </Text>,
        ]
      }
      return [
        <Box justifyContent="space-between">
          <Text dimColor>{line.label}</Text>
          <Text bold>{clip(line.value, Math.max(8, W - line.label.length - 2))}</Text>
        </Box>,
      ]
    })
    const quota = card('Quota', [<Text dimColor>Filled = used · empty = left · resets automatically</Text>, ...quotaRows])

    // One row of label + bar + numbers; every card below draws its bars through it.
    const barRows = (
      o: { label: string; percent: number; primary: string; secondary?: string; labelW: number; w?: number; minBar?: number },
      color: string | undefined,
      emphasis = false,
    ) => {
      const r = layoutBarRow({ W: o.w ?? W, labelW: o.labelW, label: o.label, percent: o.percent, primary: o.primary, secondary: o.secondary, minBar: o.minBar })
      return [
        <Text>
          <Text bold={emphasis}>{r.label}</Text>
          <Text bold color={color}>
            {'█'.repeat(r.filled)}
          </Text>
          <Text dimColor>{'░'.repeat(r.empty)}</Text>
          <Text bold color={color}>
            {' '}
            {r.primary}
          </Text>
          {r.inline ? <Text dimColor>{`  ${r.inline}`}</Text> : null}
        </Text>,
        r.wrapped ? <Text dimColor>{clip(`${' '.repeat(o.labelW)}${r.wrapped}`, o.w ?? W)}</Text> : <Text> </Text>,
      ]
    }
    const labelW = W >= 56 ? 14 : 11

    // 3. Tokens
    const hit = cacheHitPercent(total)
    const parts: [string, string, number][] = [
      ['Input', ACCENT, total.input],
      ['Output', SECOND, total.output],
      ['Cache read', THIRD, total.cacheRead],
      ['Cache write', FOURTH, total.cacheWrite],
    ]
    const share = (n: number) => (all === 0 ? 0 : Math.round((n / all) * 100))
    const perModel = Object.entries(s.models)
      .map(([name, one]) => ({ name, sum: one.input + one.output + one.cacheRead + one.cacheWrite }))
      .sort((a, b) => b.sum - a.sum)
    const shownModels = top(perModel, 4)
    const ctxPct = s.contextTokens !== undefined && s.contextWindow ? (s.contextTokens / s.contextWindow) * 100 : undefined
    const tokens = card('Tokens', [
      <Box justifyContent="space-between">
        <Text>
          <Text bold color={ACCENT}>
            {formatInt(all)}
          </Text>
          <Text bold> tokens</Text>
          <Text dimColor> total</Text>
        </Text>
        <Text dimColor>{hit === undefined ? '' : `cache hit ${hit}%`}</Text>
      </Box>,
      <Text dimColor>Bar = share of all tokens · cache hit = cached share of input</Text>,
      ...(ctxPct !== undefined && s.contextTokens !== undefined
        ? barRows(
            {
              label: 'Context',
              percent: ctxPct,
              primary: `${pct(ctxPct)}% used`,
              secondary: `${formatInt(s.contextTokens)} / ${formatInt(s.contextWindow ?? 0)}`,
              labelW,
            },
            usedColor(ctxPct),
            true,
          )
        : s.contextTokens !== undefined
          ? [<Text dimColor>{`Context now ${formatInt(s.contextTokens)} (engine)`}</Text>]
          : []),
      ...parts.flatMap(([name, color, n]) =>
        barRows({ label: name, percent: share(n), primary: `${share(n)}%`, secondary: formatTokens(n), labelW }, color),
      ),
      ...(shownModels.shown.length > 0
        ? [
            <Text dimColor>by model</Text>,
            ...shownModels.shown.flatMap(m =>
              barRows({ label: m.name, percent: share(m.sum), primary: `${share(m.sum)}%`, secondary: formatTokens(m.sum), labelW }, ACCENT),
            ),
          ]
        : [<Text dimColor>no turns counted yet</Text>]),
      shownModels.more > 0 ? <Text dimColor>+{shownModels.more} more</Text> : <Text> </Text>,
    ])

    // 4. Activity
    const isWide = W >= 50
    const colW = isWide ? Math.floor((W - 4) / 3) : W
    const nameCol = isWide ? Math.max(6, colW - 12) : Math.min(16, colW - 14)
    const block = (title: string, count: number, rows: [string, number][], children?: (name: string) => unknown) => {
      const max = Math.max(1, ...rows.map(r => r[1]))
      const shown = top(rows, 5)
      return (
        <Box flexDirection="column" width={colW}>
          <Text>
            <Text bold>{title}</Text> {pill(String(count))}
          </Text>
          {shown.shown.length === 0 && <Text dimColor>none yet</Text>}
          {shown.shown.map(([name, n]) => (
            <Box flexDirection="column">
              {barRows({ label: name, percent: (n / max) * 100, primary: String(n), labelW: nameCol + 1, w: colW, minBar: 3 }, ACCENT)}
              {children ? children(name) : null}
            </Box>
          ))}
          {shown.more > 0 && <Text dimColor>+{shown.more} more</Text>}
        </Box>
      )
    }
    const skillRows = ranked(s.skills)
    const cmdRows = ranked(s.commands).map(([name, n]): [string, number] => [`/${name}`, n])
    const serverRows = Object.entries(s.mcp)
      .map(([server, tools]): [string, number] => [server, Object.values(tools).reduce((a, b) => a + b, 0)])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    const mcpTools = (server: string) =>
      top(ranked(s.mcp[server] ?? {}), 2).shown.map(([name, n]) => (
        <Text dimColor>{clip(`└ ${name} ×${n}`, colW)}</Text>
      ))
    const blocks = [
      block('Skills', skillRows.length, skillRows),
      block('MCP', serverRows.length, serverRows, mcpTools),
      block('Commands', cmdRows.length, cmdRows),
    ]
    const activity = card('Activity', [
      <Text dimColor>Bar = share of the most-used item in each list</Text>,
      isWide ? (
        <Box columnGap={2}>{blocks}</Box>
      ) : (
        <Box flexDirection="column" rowGap={1}>
          {blocks}
        </Box>
      ),
    ])

    // 5. Subagents
    const agents = sortAgents(s.agents)
    const byType = agentTypeCounts(s.agents)
    const running = s.agents.filter(a => a.status === 'running' || a.status === 'pending').length
    const done = s.agents.filter(a => a.status === 'completed').length
    const failed = s.agents.filter(a => a.status === 'failed' || a.status === 'killed').length
    const shownAgents = top(agents, 6)
    const now = await $.clock.now()
    const durationOf = (a: (typeof agents)[number]) => Math.max(0, (a.endedAt ?? now) - a.startedAt)
    const longest = Math.max(1, ...agents.map(durationOf))
    const subagents = card(
      'Subagents',
      s.agents.length === 0
        ? [<Text dimColor>none yet</Text>]
        : [
            <Text>
              <Text bold>{s.agents.length}</Text>
              <Text dimColor> total · </Text>
              <Text bold>{running}</Text>
              <Text dimColor> running · </Text>
              <Text bold>{done}</Text>
              <Text dimColor> done{failed > 0 ? ` · ${failed} failed` : ''}</Text>
            </Text>,
            <Text dimColor>By type: bar = share of all subagents</Text>,
            ...top(byType, 4).shown.flatMap(([name, n]) =>
              barRows(
                { label: name, percent: (n / s.agents.length) * 100, primary: String(n), secondary: `${Math.round((n / s.agents.length) * 100)}%`, labelW },
                ACCENT,
              ),
            ),
            <Text dimColor>Each subagent: bar = time relative to the longest</Text>,
            ...shownAgents.shown.flatMap(a => {
              const dot = statusDot(a.status)
              const isLive = a.status === 'running' || a.status === 'pending'
              return [
                <Text>
                  <Text color={dot.color} dimColor={dot.color === undefined}>
                    {dot.glyph}
                  </Text>
                  <Text bold={isLive} color={isLive ? dot.color : undefined} dimColor={!isLive}>
                    {` ${padEnd(dot.label, 8)}`}
                  </Text>
                  <Text bold={isLive}>{clip(a.description || a.type, Math.max(6, W - 11))}</Text>
                </Text>,
                ...barRows(
                  {
                    label: a.type,
                    percent: (durationOf(a) / longest) * 100,
                    primary: formatDuration(durationOf(a)),
                    secondary: a.tokens > 0 ? `${formatTokens(a.tokens)} tok` : '',
                    labelW,
                  },
                  dot.color,
                ),
              ]
            }),
            shownAgents.more > 0 ? <Text dimColor>+{shownAgents.more} more</Text> : <Text> </Text>,
          ],
    )

    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {quota}
        {tokens}
        {activity}
        {subagents}
        <Text dimColor>refreshes every 3s while open</Text>
        {s.warn ? <Text dimColor wrap="wrap">note: {s.warn}</Text> : <Text> </Text>}
      </Box>
    )
  })
}
