import type { Register } from 'claude-code'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hello', description: 'Say hello (template mod)' })

    return next(e)
  })

  on('command.run', { command: 'hello' }, () => ({ text: 'Hello from the template mod.' }))
}
