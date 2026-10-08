import { expect, mock, test } from 'claude-code/testing'

test('events change what the pane draws', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('skill.prompt', (_$, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  const ui = await $.ui.mount({
    plugin: 'session-info',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'session-info',
    props: {},
    viewport: { columns: 120, rows: 40 },
  })
  const has = async (text: RegExp) => (await ui.find({ type: 'Text', text })) !== undefined

  expect(await has(/commit/)).toBe(false)
  await $.skill.prompt({ skill: 'commit', text: 'x' })
  expect(await has(/commit/)).toBe(true)

  expect(await has(/get_issue/)).toBe(false)
  await $.tool.call({ tool: 'mcp__jira__get_issue', tool_use_id: 't1' } as never)
  expect(await has(/get_issue/)).toBe(true)
  await ui.unmount()
})

test('the timer re-reads the engine while the pane is open and stops when it closes', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  let agents: { id: string; status: string; type: string; description: string }[] = []
  let rows: unknown[] = []
  let cost = 1
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.usage', () => {
    return { value: { startedAt: 0, context: { window: 200000, tokens: 5000 }, rateLimits: [], cost: { usd: cost } } } as never
  })
  on('session.authorize', () => ({ value: { handle: 'h', kind: 'api-key' } }) as never)
  on('agent.list', () => ({ value: agents }) as never)
  on('session.messages', () => ({ value: rows }) as never)

  const ran = await $.command.run({ command: 'info', args: '' } as never)
  expect(ran.text).toContain('$1.00')
  expect(ran.text).toContain('Context now: 5,000 / 200,000')
  expect(ran.text).toContain('Subagents: none yet')

  const ui = await $.ui.mount({
    plugin: 'session-info',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'session-info',
    props: {},
    viewport: { columns: 120, rows: 40 },
  })
  const has = async (text: RegExp) => (await ui.find({ type: 'Text', text })) !== undefined

  cost = 3.6
  agents = [{ id: 'a1', status: 'running', type: 'Explore', description: 'map the repo' }]
  rows = [{ role: 'assistant', text: '', toolUses: [{ tool: 'mcp__jira__get_issue', input: {} }] }]
  await clock.advance(3000)
  expect(await has(/\$3\.60/)).toBe(true)
  expect(await has(/map the repo/)).toBe(true)
  expect(await has(/get_issue/)).toBe(true)

  expect(await has(/^ *done {2,}/)).toBe(false)
  agents = [{ id: 'a1', status: 'completed', type: 'Explore', description: 'map the repo' }]
  await clock.advance(3000)
  expect(await has(/^ *done {2,}/)).toBe(true)

  await ui.unmount()
})

test('turns and tool calls fill the Token hogs card', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }) as never)
  const ui = await $.ui.mount({
    plugin: 'session-info',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'session-info',
    props: {},
    viewport: { columns: 120, rows: 60 },
  })
  const has = async (text: RegExp) => (await ui.find({ type: 'Text', text })) !== undefined
  expect(await has(/no completed turns yet/)).toBe(true)
  expect(await has(/nothing stands out/)).toBe(true)

  const usage = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' }
  await $.turn.start({ text: 'refactor the parser', turnId: 'u1' })
  await $.tool.call({ tool: 'Read', tool_use_id: 'c1' } as never)
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 'u1', reason: 'answer', usage } as never)

  expect(await has(/refactor the parser/)).toBe(true)
  expect(await has(/1\.5k/)).toBe(true)
  expect(await has(/split evenly/)).toBe(true)
  await ui.unmount()
})
