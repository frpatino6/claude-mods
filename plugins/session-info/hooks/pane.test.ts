import { expect, mock, test } from 'claude-code/testing'

test('the Pane draws its cards on terminal and desktop, wide and narrow', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const columns of [44, 120]) {
      const ui = await $.ui.mount({
        plugin: 'session-info',
        surface,
        component: 'Pane',
        requestId: 'session-info',
        props: {},
        viewport: { columns, rows: 40 },
      })
      for (const title of ['Session', 'Quota', 'Tokens', 'Activity', 'Subagents']) {
        expect(await ui.find({ type: 'Text', text: title })).toBeDefined()
      }
      await ui.unmount()
    }
  }
})
