import { expect, test } from 'claude-code/testing'

import {
  bumpDiag,
  diagNote,
  redact,
  commandLine,
  classifyBash,
  startShell,
  finishShell,
  runningShell,
  recentShell,
  shellTotals,
  statusMark,
  shellLine,
  spinner,
  sampleContext,
  findDrops,
  downsample,
  blockFor,
  contextTrend,
  contextTrendLine,
  subagentShare,
  startTurn,
  noteTool,
  finishTurn,
  groupTool,
  scanTools,
  turnRows,
  toolRows,
  tips,
  hogLines,
  snippet,
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
  expect(textReport(emptyStats(), 0).split('\n')).toHaveLength(13)
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

const turn = (s: ReturnType<typeof emptyStats>, id: string, text: string, tools: string[], tokens: number) => {
  let next = startTurn(s, id, text)
  for (const tool of tools) next = noteTool(next, tool)
  return finishTurn(next, id, tokens)
}

test('turns: record, label, tools, order and the 2x-average highlight', () => {
  expect(snippet('  hello\n  world  ')).toBe('hello world')
  expect(snippet('x'.repeat(100))).toHaveLength(60)
  let s = emptyStats()
  s = turn(s, 't1', 'first', ['Read', 'Read'], 1000)
  s = turn(s, 't2', 'second', [], 1000)
  s = turn(s, 't3', '', ['mcp__jira__get_issue'], 1000)
  s = turn(s, 't4', 'big one', ['Bash'], 9000)
  const rows = turnRows(s, 3)
  expect(rows.map(r => r.label)).toEqual(['big one', '(continued)', 'second'])
  expect(rows[0]?.isHog).toBe(true)
  expect(rows[1]?.isHog).toBe(false)
  expect(rows[1]?.tool).toBe('mcp:jira')
  expect(turnRows(s, 4)[3]?.tool).toBe('Read ×2')
  // fewer than 3 finished turns are never judged
  expect(turnRows(turn(emptyStats(), 'a', 'x', [], 5), 3)[0]?.isHog).toBe(false)
  // a tool credits the running turn only
  expect(noteTool(s, 'Grep').turns[3]?.tools).toEqual(['Bash'])
  expect(finishTurn(emptyStats(), 'late', 7).turns[0]?.tokens).toBe(7)
})

test('tools: grouping, result sizes from the transcript, split fallback', () => {
  expect(groupTool('mcp__jira__get_issue')).toBe('mcp:jira')
  expect(groupTool('Bash')).toBe('Bash')
  const big = 'x'.repeat(100_000)
  const stats = scanTools([
    { role: 'assistant', text: '', toolUses: [{ tool: 'Read', input: {}, text: big }, { tool: 'Read', input: {}, text: 'abcd' }, { tool: 'mcp__a__b', input: {}, text: 'abcdefgh' }] },
  ])
  expect(stats.Read).toEqual({ calls: 2, chars: 100_004, bigResults: 1 })
  expect(stats['mcp:a']?.chars).toBe(8)
  const sized = toolRows({ ...emptyStats(), tools: stats })
  expect(sized.mode).toBe('size')
  expect(sized.rows[0]).toEqual({ name: 'Read', calls: 2, tokens: 25_001 })

  let s = turn(emptyStats(), 't1', 'a', ['Read', 'Bash'], 1000)
  s = turn(s, 't2', 'b', ['Read'], 600)
  const split = toolRows(s)
  expect(split.mode).toBe('split')
  expect(split.rows).toEqual([{ name: 'Read', calls: 2, tokens: 1100 }, { name: 'Bash', calls: 1, tokens: 500 }])
  expect(toolRows(emptyStats())).toEqual({ mode: 'none', rows: [] })
})

test('tips: each rule fires alone, at most three, and none when nothing stands out', () => {
  expect(tips(emptyStats())).toEqual([])
  expect(tips({ ...emptyStats(), contextTokens: 150_000, contextWindow: 200_000 })[0]).toContain('/compact')
  expect(tips({ ...emptyStats(), contextTokens: 100_000, contextWindow: 200_000 })).toEqual([])
  expect(tips({ ...emptyStats(), tools: { Read: { calls: 5, chars: 1, bigResults: 3 } } })[0]).toContain('Read returned 3 results')
  expect(tips({ ...emptyStats(), tools: { Read: { calls: 5, chars: 1, bigResults: 2 } } })).toEqual([])
  const withAgents = addUsage(emptyStats(), 'm', { input_tokens: 600, output_tokens: 0, cache_read_input_tokens: 400, cache_creation_input_tokens: 0 })
  const sub = recordSpawn(withAgents, { id: 'a', type: 'Explore', description: 'x' }, 0)
  expect(tips(addAgentTokens(sub, 'a', 500))[0]).toContain('Subagents used 50%')
  expect(tips(addAgentTokens(sub, 'a', 100))).toEqual([])
  let s = emptyStats()
  for (const [i, t] of [100, 100, 100, 1000].entries()) s = turn(s, `t${i}`, `p${i}`, [], t)
  expect(tips(s)[0]).toContain('One turn used 1.0k tokens')
  const cold = addUsage(emptyStats(), 'm', { input_tokens: 90_000, output_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 })
  expect(tips(cold)[0]).toContain('Cache hit is only 1%')
  const many = { ...cold, contextTokens: 190_000, contextWindow: 200_000, tools: { Read: { calls: 5, chars: 1, bigResults: 3 } } }
  expect(tips(many).length).toBeLessThanOrEqual(3)
})

test('hogLines feed the text report', () => {
  expect(hogLines(emptyStats())).toEqual(['Token hogs: none yet', 'Subagent share: none yet', 'Tips: nothing stands out'])
  const s = turn(emptyStats(), 't1', 'a', ['Read'], 2000)
  const text = textReport(s, 0)
  expect(text).toContain('Token hogs: Read ~2.0k (1x) [split estimate]')
  expect(text).toContain('Tips: nothing stands out')
})

test('subagentShare: denominator is main-loop + subagent tokens, top 3, red over 40%', () => {
  expect(subagentShare(emptyStats())).toBeUndefined()
  const base = addUsage(emptyStats(), 'm', { input_tokens: 700, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })
  let s = recordSpawn(base, { id: 'a', type: 'Explore', description: 'map' }, 0)
  s = recordSpawn(s, { id: 'b', type: 'general-purpose', description: 'fix' }, 0)
  s = recordSpawn(s, { id: 'c', type: 'fork', description: 'idle' }, 0)
  s = recordSpawn(s, { id: 'd', type: 'Explore', description: 'more' }, 0)
  s = addAgentTokens(addAgentTokens(addAgentTokens(s, 'a', 200), 'b', 150), 'd', 50)
  const share = subagentShare(s)
  expect(share).toMatchObject({ tokens: 400, total: 1000, percent: 40, isHog: false })
  expect(share?.top.map(a => a.id)).toEqual(['a', 'b', 'd'])
  expect(subagentShare(addAgentTokens(s, 'c', 1))).toMatchObject({ percent: 40.1, isHog: true })
  expect(subagentShare(recordSpawn(emptyStats(), { id: 'z', type: 't', description: '' }, 0))).toMatchObject({ percent: 0, isHog: false, top: [] })
  expect(textReport(addAgentTokens(s, 'c', 1), 0)).toContain('Subagent share: 40.1% of tokens (401 of 1.0k); top: Explore 200, general-purpose 150, Explore 50')
})

const ctx = (values: number[], window = 200_000) =>
  values.reduce((s, v) => sampleContext(s, v), { ...emptyStats(), contextWindow: window })

test('context samples: only changes, forced repeats, bounded', () => {
  let s = sampleContext(emptyStats(), 100)
  s = sampleContext(s, 100)
  expect(s.contextHistory).toEqual([100])
  s = sampleContext(s, 100, true)
  expect(s.contextHistory).toEqual([100, 100])
  expect(sampleContext(s, undefined)).toBe(s)
  let many = emptyStats()
  for (let i = 0; i < 100; i++) many = sampleContext(many, i)
  expect(many.contextHistory).toHaveLength(40)
  expect(many.contextHistory[39]).toBe(99)
})

test('sparkline scaling 0..window and downsampling keep the last sample', () => {
  expect(blockFor(0, 100)).toBe('▁')
  expect(blockFor(50, 100)).toBe('▅')
  expect(blockFor(100, 100)).toBe('█')
  expect(blockFor(500, 100)).toBe('█')
  expect(blockFor(5, 0)).toBe('▁')
  expect(downsample([1, 2, 3], 5)).toEqual([[0], [1], [2]])
  const buckets = downsample(Array.from({ length: 10 }, (_, i) => i), 4)
  expect(buckets).toHaveLength(4)
  expect(buckets[3]?.slice(-1)).toEqual([9])
  expect(buckets.flat()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  const t = contextTrend(ctx([0, 100_000, 200_000]), 10)
  expect(t?.cells.map(c => c.char).join('')).toBe('▁▅█')
  expect(contextTrend(ctx([1, 2, 3, 4, 5, 6, 7, 8]), 4)?.cells).toHaveLength(4)
})

test('compaction drops are detected and the trend reports min/current/peak and colour', () => {
  expect(findDrops([100, 200, 300, 120, 130])).toEqual([3])
  expect(findDrops([100, 90, 80])).toEqual([])
  expect(findDrops([0, 5])).toEqual([])
  const t = contextTrend(ctx([50_000, 150_000, 180_000, 40_000, 60_000]), 10)
  expect(t).toMatchObject({ min: 40_000, current: 60_000, peak: 180_000, drops: 1, color: 'green' })
  expect(t?.cells[3]?.isDrop).toBe(true)
  expect(contextTrend(ctx([100_000, 190_000]), 10)?.color).toBe('red')
  expect(contextTrend(ctx([100_000, 150_000]), 10)?.color).toBe('yellow')
})

test('trend needs two samples; the report line says collecting, then the numbers', () => {
  expect(contextTrend(ctx([100]), 10)).toBeUndefined()
  expect(contextTrendLine(emptyStats())).toBe('Context trend: collecting…')
  expect(contextTrendLine(ctx([50_000, 145_000, 180_000, 145_000]))).toBe('Context trend: ▃▆▇▆ 145.0k now · peak 180.0k')
  expect(contextTrendLine(ctx([180_000, 40_000]))).toContain('compacted 1x')
  expect(textReport(ctx([1000, 2000]), 0)).toContain('Context trend:')
})

test('redact masks tokens, keys, passwords, headers and URL credentials but leaves ordinary commands alone', () => {
  expect(redact('ls -la src')).toBe('ls -la src')
  expect(redact('curl -H "Authorization: Bearer abc123def456ghi789" https://x.io')).not.toContain('abc123')
  expect(redact('curl -H "Authorization: Bearer abc123def456ghi789" https://x.io')).toContain('Authorization: Bearer ***')
  expect(redact('git push https://user:hunter2@github.com/a/b')).toBe('git push https://user:***@github.com/a/b')
  expect(redact('echo ghp_abcdefghijklmnopqrstuvwxyz0123456789')).toBe('echo ***')
  expect(redact('export OPENAI_API_KEY=sk-live-abcdefghijklmnop123')).toBe('export OPENAI_API_KEY=***')
  expect(redact('DB_PASSWORD="my secret" node app.js')).toBe('DB_PASSWORD=*** node app.js')
  expect(redact('mysql --password hunter2 -u root')).toBe('mysql --password *** -u root')
  expect(redact('tool --token=abc123 --verbose')).toBe('tool --token=*** --verbose')
  expect(redact('AWS=AKIAABCDEFGHIJKLMNOP')).toBe('AWS=***')
  // names are matched by substring on purpose: a false positive (KEYBOARD) beats a leaked key
  expect(redact('KEYBOARD=us')).toBe('KEYBOARD=***')
})

test('commandLine keeps the first line, redacted, with a hint for the rest', () => {
  expect(commandLine('echo hi')).toBe('echo hi')
  expect(commandLine('\n  npm test  \nnpm run build')).toBe('npm test …(+1)')
  expect(commandLine('TOKEN=abc npm publish')).toBe('TOKEN=*** npm publish')
})

test('classifyBash reads status, exit code and output tail from what the engine exposes', () => {
  const ok = classifyBash({ text: 'a\nb\nc\nd', result: { stdout: 'a\nb\nc\nd\n', stderr: '' } })
  expect(ok).toEqual({ status: 'ok', exit: undefined, tail: ['b', 'c', 'd'] })
  const bad = classifyBash({ isError: true, text: 'Exit code 2\nboom', result: { stdout: '', stderr: 'boom TOKEN=abc\n' } })
  expect(bad).toMatchObject({ status: 'failed', exit: 2, tail: ['boom TOKEN=***'] })
  expect(classifyBash({ text: 'Exit code 1' }).status).toBe('failed')
  expect(classifyBash({ result: { stdout: '', stderr: '', timedOutAfterMs: 1000 } }).status).toBe('timeout')
  expect(classifyBash({ result: { stdout: '', stderr: '', backgroundTaskId: 'b1' } }).status).toBe('background')
  expect(classifyBash({ result: { stdout: '', stderr: '', interrupted: true } }).status).toBe('interrupted')
  expect(classifyBash({ deny: 'no' }).status).toBe('denied')
  expect(classifyBash({}).tail).toEqual([])
})

test('shell entries go running -> done with measured durations, totals and the report line', () => {
  let s = startShell(emptyStats(), { id: 'a', command: 'sleep 5', description: 'wait' }, 1000)
  s = startShell(s, { id: 'a', command: 'dup' }, 1500)
  s = startShell(s, { id: 'b', command: 'false' }, 1200)
  expect(s.shell).toHaveLength(2)
  expect(runningShell(s).map(c => c.id)).toEqual(['a', 'b'])
  expect(recentShell(s, 5)).toEqual([])
  s = finishShell(s, 'b', { isError: true, text: 'Exit code 1' }, 1300)
  s = finishShell(s, 'a', { result: { stdout: 'done\n', stderr: '' } }, 6000)
  expect(runningShell(s)).toEqual([])
  expect(recentShell(s, 5).map(c => c.id)).toEqual(['b', 'a'])
  expect(s.shell[0]).toMatchObject({ status: 'ok', endedAt: 6000, tail: ['done'] })
  expect(shellTotals(s, 9999)).toEqual({ count: 2, failed: 1, totalMs: 5100 })
  expect(statusMark(s.shell[1]!)).toEqual({ icon: '✗', word: 'exit 1', isBad: true })
  expect(statusMark(s.shell[0]!)).toEqual({ icon: '✓', word: 'ok', isBad: false })
  expect(shellLine(s)).toBe('Terminal: 0 running; 2 commands; last: ✗ 0s $ false | ✓ 5s $ sleep 5')
  const running = startShell(emptyStats(), { id: 'r', command: 'x' }, 0)
  expect(shellTotals(running, 4000).totalMs).toBe(4000)
  expect(shellLine(emptyStats())).toBe('Terminal: 0 running; 0 commands')
  expect(spinner(0)).not.toBe(spinner(1000))
})

test('shell history is bounded to 50', () => {
  let s = emptyStats()
  for (let i = 0; i < 70; i++) s = startShell(s, { id: `c${i}`, command: `echo ${i}` }, i)
  expect(s.shell).toHaveLength(50)
  expect(s.shell[49]?.id).toBe('c69')
})

test('diagnostics count events and surface in the report when tokens read 0', () => {
  expect(diagNote(emptyStats())).toBe('turn events seen: 0, with usage: 0, session measures: 0')
  let s = bumpDiag(bumpDiag(bumpDiag(emptyStats(), 'turnEvents'), 'turnEvents'), 'withUsage')
  s = bumpDiag(s, 'measures')
  expect(diagNote(s)).toBe('turn events seen: 2, with usage: 1, session measures: 1')
  expect(textReport(s, 0)).toContain('Tokens: 0 total (in 0, out 0, cache read 0, cache write 0) [turn events seen: 2, with usage: 1, session measures: 1]')
  expect(textReport(addUsage(s, 'm', usage), 0)).not.toContain('[turn events seen')
})
