# fc-fulfillment-engine-demo
Interactive prototype of the Founders Club post-call fulfillment engine

## Command Center

A read-only 3D command center for every department lives in [`command-center/`](command-center/README.md).

## South Florida Command Center

A personal, phone-first 3D member-success town for the South Florida regional director lives in [`command-center/south-florida/`](command-center/south-florida/README.md). It reuses the Command Center's town kit and leaves the original page unchanged. Its data comes from one placeholder module (`command-center/south-florida/data/sf-data.js`). Real data is injected at publish time from the gitignored `sf-data.real.js` and is never committed. That README also documents the `window.SF_ACTIONS` Send/Edit hook contract.

### `/goal`

Running `/goal` in Claude Code (from `.claude/commands/goal.md`) reports South Florida's renewal goal progress. It shows the goal of above 75%, the current-period decided rate and the prior completed month's rate, each with its period, denominator, source and as-of date, all read from the data module. It is read-only. The same report is available directly:

```bash
node command-center/south-florida/scripts/goal.mjs
```
