import { expect, test } from 'claude-code/testing'

test('/hello answers with text', async $ => {
  const ran = await $.command.run({ command: 'hello', args: '' } as never)

  expect(ran.text).toContain('Hello')
})
