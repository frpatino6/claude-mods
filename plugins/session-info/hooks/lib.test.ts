import { expect, test } from 'claude-code/testing'

import {
  layoutBarRow,
  scanMessages,
  mergeScan,
  textReport,
  recordSpawn,
  addAgentTokens,
  syncAgents,
  sortAgents,
  agentTypeCounts,
  statusDot,
  formatDuration,
  countdown,
  planBadge,
  topModel,
  segments,
  cacheHitPercent,
  top,
  addCommand,
  addMcpTool,
  addSkill,
  addUsage,
  classifyAuth,
  describeBalance,
  emptyStats,
  formatTokens,
  formatUsd,
  formatInt,
  bar,
  usedColor,
  pct,
  shares,
  clip,
  rule,
  padStart,
  sumTokens,
} from './lib'

const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 1 }

test('addUsage sums per model and sumTokens totals', () => {
  let s = addUsage(emptyStats(), 'a', usage)
  s = addUsage(s, 'a', usage)
  s = addUsage(s, 'b', usage)
  expect(s.models.a?.input).toBe(20)
  expect(sumTokens(s)).toEqual({ input: 30, output: 15, cacheRead: 300, cacheWrite: 3 })
})

test('counts skills, commands and only mcp__ tools', () => {
  let s = addSkill(addSkill(emptyStats(), 'commit'), 'commit')
  s = addCommand(s, 'clear')
  s = addMcpTool(s, 'mcp__jira__get_issue')
  s = addMcpTool(s, 'mcp__jira__get_issue')
  s = addMcpTool(s, 'Bash')
  expect(s.skills.commit).toBe(2)
  expect(s.commands.clear).toBe(1)
  expect(s.mcp).toEqual({ jira: { get_issue: 2 } })
})

test('subscription shows remaining windows, never a plan tier or invented balance', () => {
  const s = {
    ...emptyStats(),
    auth: 'bearer' as const,
    costUsd: 1.5,
    rateLimits: [
      { kind: 'five_hour', percentUsed: 30, resetsAt: new Date(1_000_000 + 90 * 60_000).toISOString() },
      { kind: 'seven_day', percentUsed: 12.5 },
    ],
  }
  const b = describeBalance(s, 1_000_000)
  expect(b.plan).toContain('Subscription')
  expect(b.lines[0]?.value).toBe('30% used · 70% left · resets in 1h 30m')
  expect(b.lines[1]?.value).toContain('12.5% used · 87.5% left')
  expect(b.lines.some(l => l.isNa && l.label === 'Plan tier')).toBe(true)
})

test('api key shows spend and n/a balance', () => {
  const b = describeBalance({ ...emptyStats(), auth: 'api-key', costUsd: 0.5 }, 0)
  expect(b.plan).toContain('API key')
  expect(b.lines[0]?.value).toBe('$0.50')
  expect(b.lines[1]?.isNa).toBe(true)
})

test('bearer with no windows, no credential and unknown are n/a', () => {
  expect(describeBalance({ ...emptyStats(), auth: 'bearer' }, 0).lines[0]?.isNa).toBe(true)
  expect(describeBalance({ ...emptyStats(), auth: 'none' }, 0).plan).toContain('3P')
  expect(describeBalance(emptyStats(), 0).plan).toBe('Unknown')
})

test('spend_limit gateway and helpers', () => {
  const b = describeBalance({ ...emptyStats(), rateLimits: [{ kind: 'spend_limit', percentUsed: 120 }] }, 0)
  expect(b.plan).toContain('Gateway')
  expect(b.lines[0]?.value).toContain('120% used · 0% left')
  expect(classifyAuth(null)).toBe('none')
  expect(classifyAuth({ kind: 'api-key' })).toBe('api-key')
  expect(formatTokens(1500)).toBe('1.5k')
})

test('formatInt, bar, usedColor, pct, shares, clip, rule and padStart', () => {
  expect(formatInt(1234567)).toBe('1,234,567')
  expect(formatInt(12)).toBe('12')
  expect(bar(50, 10)).toBe('█████░░░░░')
  expect(bar(150, 4)).toBe('████')
  expect(bar(-5, 4)).toBe('░░░░')
  expect(usedColor(59.9)).toBe('green')
  expect(usedColor(60)).toBe('yellow')
  expect(usedColor(85)).toBe('yellow')
  expect(usedColor(85.1)).toBe('red')
  expect(pct(52)).toBe('52')
  expect(pct(47.5)).toBe('47.5')
  expect(pct(7.000000001)).toBe('7')
  expect(shares([62, 8, 30])).toEqual([62, 8, 30])
  expect(shares([0, 0])).toEqual([0, 0])
  expect(clip('abcdefgh', 5)).toBe('abcd…')
  expect(clip('abc', 5)).toBe('abc')
  expect(rule(3)).toBe('───')
  expect(padStart('7', 3)).toBe('  7')
  expect(formatUsd(0)).toBe('$0.00')
})

test('countdown formats minutes, hours, days and now', () => {
  const at = (ms: number) => new Date(1_000_000 + ms).toISOString()
  expect(countdown(at(45 * 60_000), 1_000_000)).toBe('45m')
  expect(countdown(at(90 * 60_000), 1_000_000)).toBe('1h 30m')
  expect(countdown(at((2 * 1440 + 180) * 60_000), 1_000_000)).toBe('2d 3h')
  expect(countdown(at(-1), 1_000_000)).toBe('now')
  expect(countdown(undefined, 0)).toBe('')
  expect(countdown('nope', 0)).toBe('')
})

test('segments always sum to the width and keep tiny values visible', () => {
  expect(segments([50, 50], 10)).toEqual([5, 5])
  const cells = segments([1000, 1, 0], 20)
  expect(cells.reduce((a, b) => a + b, 0)).toBe(20)
  expect(cells[1]).toBe(1)
  expect(cells[2]).toBe(0)
  expect(segments([0, 0], 8)).toEqual([0, 0])
})

test('planBadge, topModel, cacheHitPercent and top', () => {
  expect(planBadge(describeBalance({ ...emptyStats(), auth: 'api-key' }, 0))).toBe('API KEY')
  expect(planBadge(describeBalance(emptyStats(), 0))).toBe('UNKNOWN')
  expect(planBadge(describeBalance({ ...emptyStats(), auth: 'none' }, 0))).toBe('3P')
  const s = addUsage(addUsage(emptyStats(), 'small', usage), 'big', { ...usage, output_tokens: 999 })
  expect(topModel(s)).toBe('big')
  expect(topModel(emptyStats())).toBeUndefined()
  expect(cacheHitPercent({ input: 10, output: 5, cacheRead: 90, cacheWrite: 0 })).toBe(90)
  expect(cacheHitPercent({ input: 0, output: 5, cacheRead: 0, cacheWrite: 0 })).toBeUndefined()
  expect(top([1, 2, 3, 4], 3)).toEqual({ shown: [1, 2, 3], more: 1 })
})

test('subagents: record, tokens, sync, ordering and counts', () => {
  let s = recordSpawn(emptyStats(), { id: 'a', type: 'Explore', description: 'find x' }, 100)
  s = recordSpawn(s, { id: 'a', type: 'Explore', description: 'dup' }, 150)
  s = recordSpawn(s, { id: 'b', type: 'general-purpose', description: 'do y' }, 200)
  s = recordSpawn(s, { id: 'c', type: 'Explore', description: 'z' }, 300)
  expect(s.agents).toHaveLength(3)
  s = addAgentTokens(s, 'a', 40)
  s = addAgentTokens(s, 'a', 2)
  expect(s.agents[0]?.tokens).toBe(42)
  s = syncAgents(s, [{ id: 'a', status: 'completed' }, { id: 'b', status: 'running' }], 1000)
  expect(s.agents.map(a => a.status)).toEqual(['completed', 'running', 'completed'])
  expect(s.agents[0]?.endedAt).toBe(1000)
  expect(s.agents[1]?.endedAt).toBeUndefined()
  expect(sortAgents(s.agents).map(a => a.id)).toEqual(['b', 'c', 'a'])
  expect(agentTypeCounts(s.agents)).toEqual([['Explore', 2], ['general-purpose', 1]])
  s = syncAgents(s, [], 2000)
  expect(s.agents[1]?.status).toBe('completed')
  expect(s.agents[0]?.endedAt).toBe(1000)
})

test('statusDot and formatDuration', () => {
  expect(statusDot('running').color).toBe('yellow')
  expect(statusDot('completed').color).toBe('green')
  expect(statusDot('failed').color).toBe('red')
  expect(statusDot('idle').glyph).toBe('○')
  expect(formatDuration(4_000)).toBe('4s')
  expect(formatDuration(125_000)).toBe('2m 5s')
  expect(formatDuration(3_900_000)).toBe('1h 5m')
})

test('textReport is compact, covers every section and works on empty stats', () => {
  expect(textReport(emptyStats(), 0).split('\n')).toHaveLength(8)
  let s = addUsage(emptyStats(), 'm', usage)
  s = addSkill(s, 'commit')
  s = addMcpTool(s, 'mcp__jira__get_issue')
  s = addCommand(s, 'clear')
  s = recordSpawn(s, { id: 'a', type: 'Explore', description: 'x' }, 0)
  const text = textReport({ ...s, auth: 'api-key', costUsd: 2 }, 0)
  for (const part of ['API key', 'Tokens: 116 total', 'commit x1', 'jira x1', '/clear x1', '1 (1 running) - Explore x1', '$2.00']) {
    expect(text).toContain(part)
  }
})

test('textReport uses the same used/left wording as the pane', () => {
  const s = { ...emptyStats(), auth: 'bearer' as const, rateLimits: [{ kind: 'five_hour', percentUsed: 48 }] }
  expect(textReport(s, 0)).toContain('5-hour: 48% used · 52% left')
})

test('syncAgents adopts agents it never saw spawn', () => {
  const s = syncAgents(emptyStats(), [{ id: 'z', status: 'running', type: 'Explore', description: 'look' }], 5)
  expect(s.agents).toHaveLength(1)
  expect(s.agents[0]).toMatchObject({ id: 'z', type: 'Explore', description: 'look', status: 'running' })
})

test('scanMessages reads skills, mcp tools and typed slash commands from the transcript; mergeScan keeps the larger count', () => {
  const rows = [
    { role: 'user' as const, text: '/commit now', toolUses: [] },
    { role: 'user' as const, text: '/info', toolUses: [] },
    { role: 'user' as const, text: 'plain', toolUses: [] },
    {
      role: 'assistant' as const,
      text: '',
      toolUses: [
        { tool: 'Skill', input: { skill: 'simplify' } },
        { tool: 'mcp__jira__get_issue', input: {} },
        { tool: 'mcp__jira__get_issue', input: {} },
        { tool: 'Bash', input: {} },
      ],
    },
  ]
  const scan = scanMessages(rows)
  expect(scan.skills).toEqual({ simplify: 1 })
  expect(scan.mcp).toEqual({ jira: { get_issue: 2 } })
  expect(scan.commands).toEqual({ commit: 1 })
  let s = addSkill(addSkill(emptyStats(), 'simplify'), 'simplify')
  s = mergeScan(s, scan)
  expect(s.skills.simplify).toBe(2)
  expect(s.mcp.jira?.get_issue).toBe(2)
})

test('textReport shows the engine context and any refresh warning', () => {
  const text = textReport({ ...emptyStats(), contextTokens: 1234, contextWindow: 200000, warn: 'usage: boom' }, 0)
  expect(text).toContain('Context now: 1,234 / 200,000 tokens (engine)')
  expect(text).toContain('Note: usage: boom')
})

test('layoutBarRow keeps label and primary on the bar row and wraps the secondary when narrow', () => {
  const roomy = layoutBarRow({ W: 80, labelW: 12, label: 'Input', percent: 50, primary: '50%', secondary: '1.2k' })
  expect(roomy.label).toBe('Input       ')
  expect(roomy.filled + roomy.empty).toBe(32)
  expect(roomy.filled).toBe(16)
  expect(roomy.inline).toBe('1.2k')
  expect(roomy.wrapped).toBe('')
  const narrow = layoutBarRow({ W: 40, labelW: 12, label: 'Cache read very long', percent: 100, primary: '30%', secondary: '5k' })
  expect(narrow.label).toHaveLength(12)
  expect(narrow.label.trim().endsWith('…')).toBe(true)
  expect(narrow.inline).toBe('')
  expect(narrow.wrapped).toBe('5k')
  expect(narrow.empty).toBe(0)
  const noSecond = layoutBarRow({ W: 20, labelW: 8, label: 'x', percent: 0, primary: '3', minBar: 3 })
  expect(noSecond.filled).toBe(0)
  expect(noSecond.filled + noSecond.empty).toBeGreaterThanOrEqual(3)
  expect(layoutBarRow({ W: 80, labelW: 8, label: 'x', percent: 250, primary: '1' }).empty).toBe(0)
})
