import { expect, mock, test } from 'claude-code/testing'

test('/info answers with a full text report and opens the pane, even when every figure read fails', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const opened: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })

  const ran = await $.command.run({ command: 'info', args: '' } as never)

  expect(opened).toEqual(['session-info'])
  for (const part of ['Session info', 'Tokens: 0 total', 'Skills: none yet', 'MCP: none yet', 'Commands: none yet', 'Subagents: none yet']) {
    expect(ran.text).toContain(part)
  }
  expect(ran.text).not.toContain('pane waiting')
})

test('/info says why when the pane is not drawn', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'terminal too narrow' } }) as never)

  const ran = await $.command.run({ command: 'info', args: '' } as never)

  expect(ran.text).toContain('pane waiting, not drawn: terminal too narrow')
  expect(ran.text).toContain('Tokens:')
})
