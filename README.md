# claude-mods

A personal [Claude Code](https://claude.com/claude-code) plugin marketplace (`fernando-mods`). Each mod is a folder under `plugins/`.

## Mods

| Mod | What it does |
| --- | --- |
| [`session-info`](plugins/session-info/README.md) | `/info` opens a live pane: tokens, quota or spend by plan, and the skills, MCP tools, commands and subagents used in the session |

## Install

```
claude plugin marketplace add <owner>/claude-mods
claude plugin install session-info@fernando-mods --scope user
```

Then start a new Claude Code session. (For a private repo, `gh auth login` first so git can clone it.)

## Update

```
claude plugin marketplace update fernando-mods
claude plugin uninstall session-info@fernando-mods --scope user
claude plugin install session-info@fernando-mods --scope user
```

Bump `version` in the mod's `plugin.json` on every change, or the update may not take effect. Start a new session afterwards.

## Add a new mod

1. `cp -R plugins/_template plugins/<mod>` and edit it (see `plugins/_template/README.md`).
2. `claude plugin validate plugins/<mod>` and `claude plugin test plugins/<mod>`.
3. List it in `.claude-plugin/marketplace.json` with `"source": "./plugins/<mod>"`.
4. Add a row to the table above, bump versions, commit.

`plugins/_template` is not listed in the marketplace on purpose.

Check the whole repo with `claude plugin validate .`.
