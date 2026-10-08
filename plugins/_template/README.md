# Template mod

Copy this folder to `plugins/<your-mod>/`, then:

1. Rename `name` in `.claude-plugin/plugin.json` and set a `description`.
2. Replace `hooks/register.tsx` and `hooks/register.test.ts`.
3. `claude plugin validate plugins/<your-mod>` and `claude plugin test plugins/<your-mod>`.
4. Add it to `.claude-plugin/marketplace.json` (`"source": "./plugins/<your-mod>"`).

This folder is deliberately not listed in the marketplace.
