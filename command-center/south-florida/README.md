# South Florida Command Center

A personal, phone-first 3D member-success town for the South Florida regional director. It reuses the FC Command Center's town kit (renderer, low-poly palette, building kit, camera, fly-to, tags, tap and double-tap), styles (`../styles.css`), display helpers (`../js/data/format.js`) and the vendored three.js (`../vendor/`). **The existing Command Center page and its data are not changed.**

What's in the town:

| Building | What it is |
|---|---|
| Beach house (centre) | Home: everything at a glance |
| Post office · lifeguard tower · welcome cabana · lighthouse | The four work queues: **Messages to send**, **Messages pending**, **New members**, **Members complaining or at risk** |
| Six Art Deco storefronts on the avenue | One per source: **Gmail, Slack, Fathom, GHL, WhatsApp**, and **Plaud** (ghosted: coming soon, not connected). The lamp on each is its health. |
| Bandshell | **Events**: RD events and club events (two tracks) |
| Regatta offshore | The **renewal race** toward the goal of above 75% |

Tap a building to open its panel. Tap an item to open its situation card. Double-tap the scene to reset the view. Every building, item, event and booking shows an **as of** time and its **source**.

## Run it

```bash
cd command-center
npm test                          # includes tests/sf.test.mjs (this page's rules, on the placeholder data)
python3 -m http.server 8080       # then open http://localhost:8080/south-florida/
```

No install step and no build step for the page itself. The page needs to be served over `http://localhost` or `https://` so the browser can check each draft's version hash (on plain `http://` to another host, Send stays disabled).

## Data: one placeholder module

All data comes from **`data/sf-data.js`**, which sets `window.SF_DATA`. The committed file is a **placeholder**: every row is fake (names like "Example Member 3", links to `EXAMPLE` ids), and `placeholder: true` makes the page show a "Sample data" banner. The full schema is documented at the top of that file and checked by `validateData()` in `js/sf-model.js`.

### Real data: injected at publish time, never committed

Real data lives only in **`data/sf-data.real.js`** (same schema, `placeholder: false`). It is **gitignored** (see `.gitignore` in this folder: `data/sf-data.real.js`, `data/*.real.js`, `data/*.real.json`, `data/*.private.*`, `dist/`) and must never be committed.

```bash
cd command-center/south-florida
node scripts/bundle.mjs            # validates data/sf-data.real.js, then writes dist/ with it in place of the placeholder
```

`dist/` (also gitignored) mirrors the command-center layout (`dist/south-florida/` plus the shared `styles.css`, `format.js` and `vendor/`), ready to publish by hand. The script uploads nothing and needs no credentials. This repo adds no backend, hosting, secrets, tokens or analytics.

## The `window.SF_ACTIONS` contract (Send and Edit)

The page never sends or saves anything itself. Message cards have real **Send** and **Edit** controls that hand a payload to two hooks. A hosting wrapper **outside this repo** wires the hooks to an authenticated owner action:

```js
window.SF_ACTIONS = {
  send(payload) {},   // send this exact text
  edit(payload) {},   // persist this edited text to the real draft
};
```

`saveEdit` is accepted as an alias for `edit`. The wrapper can set `window.SF_ACTIONS` before or after the page loads, because the page looks the hooks up at tap time. Until a real hook is set, the page installs inert stubs. Using a control then shows "Nothing was sent / saved. No … action is connected to this page."

**Payload** (both hooks, frozen, and only these fields):

| Field | Meaning |
|---|---|
| `draft_id` | the real draft's id |
| `thread_id` | the conversation id |
| `recipient` | who it goes to |
| `account` | the mailbox / workspace it goes out from |
| `body` | **send:** the exact draft text visible on the card at tap time. **edit:** the edited text. |
| `version` | content hash of the item's body as the data has it: `"sha256:" + first 16 hex chars of SHA-256(UTF-8 body)`. For `edit` this is the version the edit started from, so the wrapper can detect a conflict. |
| `dedup_key` | `draft_id + ":" + version`, so the wrapper can refuse a double send of the same text |

**Rules the page keeps:**

- **Edit happens in the page.** Tapping Edit turns the draft into an editable field with **Save** and **Cancel**. Save calls `edit(payload)` with the edited body. Cancel discards the edit.
- **Send** calls `send(payload)` with the exact visible body. It is disabled, with the reason shown, while an edit is open, while the draft text is hidden by "Hide names" (tap "Show draft" first), when the text doesn't match its `version`, after the same `dedup_key` was already handed off in this session, and when the state is `sent` or `queued`.
- **Held items:** when an item's `state` is `held`, Send is disabled and the `hold_reason` is shown on the card.
- **The status always comes from the data.** After either hook returns, the card shows "Handed to the send/save action at <time>. Not confirmed." and keeps showing the item's own `state` (`to-send`, `draft-ready`, `held`, `queued`, `sent`, `error`). It never shows "saved" or "sent" because a hook was called. The card changes only when new data arrives. If a hook throws, the error is shown and the state is unchanged.
- **Fallback:** each message card also has an **"Open in Gmail"** link to the Gmail drafts folder (`https://mail.google.com/mail/u/0/#drafts`). It is labelled as a fallback and is not the Edit control.

## Rules the page enforces (tested in `tests/sf.test.mjs`)

- **Source health comes from the last check only. There is no heartbeat, and nothing is ever shown as "online".** Each source shows exactly one of:
  - "Last verified reachable <time>": a live check succeeded. This holds however recent the check was; it is never read as "up now".
  - "Offline (check failed at <time>)": a live check failed, or the check says not authenticated or not reachable.
  - "Status unknown": never checked, not a live call (cache, export, inference), or no result. WhatsApp and Fathom show this while unchecked.
  - GHL shows "Signed in; content unreadable" (authenticated, content blocked) and always carries the **content coverage incomplete** warning.
  - Plaud shows "Not connected (coming soon)".
  - Where a check reports them, the axes **authenticated / reachable / content readable / ingesting** are shown separately.
- **Deduplication:** rows with the same `issueKey` are one issue seen in several sources. They merge into one item that lists every source. (`dedup_key` is different: it is the per-draft send key above.)
- **Renewal race:** decided rate = renewed ÷ (renewed + churned), from renewal outcomes only. Message volume never moves it. The goal is **strictly above 75%**. Every rate is shown with its period label and its real denominator (e.g. "9 of 13 decided · November 2026, month to date"), next to the prior completed month as a separate baseline. There is **no minimum sample size**. An optional `earlySample: true` on a period adds a "Tiny early sample" label. It is only a label: it never changes, hides or gates the rate or the goal.
- **Events:** Regional Director events (not on the club app) and main club events are two separate lists, never merged. Event **suggestions** come only from clusters in member feedback. The threshold is a **heuristic**, labelled as one in the page and set in the data file as `events.cluster = { minMembers: 3, windowDays: 60 }`. Only distinct, verified members count. Each suggestion shows why (member count, channels, recency), the members, and a proposed date and time, and is labelled "Proposal · not scheduled · not confirmed". Themes below the heuristic appear as **early signals** with their evidence and no proposed event. With no feedback, the panel says so; no pattern is ever invented.
- **Bookings:** recent (last 14 days) and upcoming member meetings, each with member, time, status and freshness.
- **Audits:** what was checked, pass or fail, source and time.
- **Hide names** (on by default) replaces member names with "Member A, B…", hides recipients, and hides draft text until you tap "Show draft".

## `/goal` (Claude Code slash command)

`.claude/commands/goal.md` at the repository root adds **`/goal`**. It runs `node command-center/south-florida/scripts/goal.mjs` and reports:

- the goal (above 75%);
- the current-period decided rate, with its period label, denominator, source and as-of date;
- the prior completed month's rate, with the same details;
- how many still-open renewals must renew to finish above the goal.

It reads `data/sf-data.real.js` when that file exists locally, otherwise the placeholder, and says so when the numbers are sample data. It reports the cohort exactly as the data states it and applies no threshold of its own. It is read-only: no writes, no connectors, no side effects. You can also run the script directly:

```bash
node command-center/south-florida/scripts/goal.mjs [path/to/data.js]
```

## Files

| Path | What |
|---|---|
| `index.html`, `sf.css` | the page (reuses `../styles.css`) |
| `data/sf-data.js` | **placeholder** data module + schema (the real file is gitignored) |
| `js/sf-model.js` | pure rules: health, dedupe, renewal race, queue colours, event suggestions, schema check |
| `js/sf-town.js` | the 3D South Florida town (view only) |
| `js/sf-app.js` | page wiring, situation cards, the `SF_ACTIONS` hand-off |
| `scripts/goal.mjs` | the read-only goal report behind `/goal` |
| `scripts/bundle.mjs`, `scripts/load-data.mjs` | publish-time bundle with real data; data loader for Node |
| `../tests/sf.test.mjs` | tests on the placeholder data |
