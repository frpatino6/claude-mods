# session-info

`/info` opens a pane (and prints a plain-text report, so you see output even if the pane cannot draw). The pane refreshes every 3 seconds while open.

## Cards

- **Session**: model, plan badge, spend this session.
- **Quota**: one bar per rate-limit window (5-hour, weekly) filled with % **used**, coloured by use (green under 60%, yellow 60-85%, red over 85%), with % left and the reset countdown.
- **Tokens**: total, context-window usage, and per-category and per-model bars (share of all tokens).
- **Activity**: skills, MCP servers and tools, and slash commands used, from hooks and from the transcript.
- **Subagents**: totals, counts by type, and one row per subagent with status, duration bar and tokens.

## Balance and quota per plan

The plan is inferred from what the API reports. Nothing is invented; unavailable figures read `n/a` with the reason.

| Account | Shown |
| --- | --- |
| Subscription (Pro / Max / Team) | 5-hour and weekly windows. Pro vs Max is not exposed to mods. |
| API key (pay-as-you-go / Enterprise billing) | Session spend only. Account balance and org limits are not exposed. |
| Gateway with a spend limit | The spend-limit window. |
| Logged in, no windows reported | `n/a` until a response arrives; session spend. |
| Third-party provider | `n/a`; session spend. |

## Limitations

- The engine exposes no cumulative token total, only the current context size. Token totals come from turns counted since the mod loaded.
- Subagent duration is measured by the mod; a subagent that disappears from the engine's list while running is shown as done (a failure then cannot be told apart).
- A skill typed as `/name` can also appear under Commands.

## Develop

```
claude plugin validate plugins/session-info
claude plugin test plugins/session-info
```
