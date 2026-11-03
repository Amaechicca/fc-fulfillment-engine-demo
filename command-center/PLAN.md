# PLAN — FC Command Center

A 3D “town” of Founders Club: one building per department, ringed red / amber / green / grey. Built from `answers.md`.
**Phase 1 is built and waiting for your check. Nothing starts on Phase 2 until you say so.**

## How data flows

```
FC AI + ClickUp ──(Claude Code reads, read-only)──▶ data/raw/*.json        (gitignored: has names)
                                                     │
                       node scripts/build-snapshot.mjs (js/data/*: clean, calculate, judge)
                                                     ▼
                         data/snapshot.json  (numbers only, committed)
                         data/snapshot.private.json (names, gitignored)
                                                     ▼
                                index.html (3D town, alerts, tabs)
```

The browser cannot call FC AI or ClickUp itself, so a page load never hits a live system. Each number carries the time it was read; the banner says when a source is older than its target.

## Buildings and every number

| Building | Number | Source (FC AI tool / ClickUp) | Scope |
|---|---|---|---|
| **HQ** | Active members | `get_community_pulse` | today, all |
| | Voluntary renewal rate | `renewal_month_diagnosis` | this month’s book |
| | New members closed | `staff_performance` (closer), sum of rows | last month |
| | New-member cash | same, sum of rows | last month |
| | Told an RD they’re leaving | `rd_book_risk` (60 days) | all territories |
| **Renewals** | book, renewed, $ collected, voluntary rate, open worth a call (+$), silent churn (+$), payment failures | `renewal_month_diagnosis` | this month |
| **Community & RDs** | leaving, undecided, leaving & frustrated, by territory; members by territory & industry | `rd_book_risk`, `get_community_pulse` | 60 days / today |
| **Admissions (Closers)** | median close rate, show rate, cash/interview; interview outcomes & objections | `staff_performance` closer, `admissions_diagnosis` | last month / month-to-date |
| **Setters** | median intro show, intro→close, on-call DQ, cash/intro; setters under 45% show | `staff_performance` setter | last month |
| **Marketing & Growth** | intro bookings, unknown-source share, Facebook spend & spend per close, LinkedIn qualified leads, bookings by channel | `attribution_report` | last month |
| **Events & Partnerships** | event NPS, responses, by city | `event_feedback` | since Sep 1 |
| **Every department** | open, in progress, paused, overdue, overdue urgent | ClickUp “Projects By Department” | now |
| **Cash & Finance** | cash, receivables, payables | none connected → grey, blank | — |

Owner of each building = the person assigned the most tasks in that department’s ClickUp list (Renewals: Chauncey, assigned “Renewal Outreach Execution”).

## Rules (ASSUMED — please correct)

All in `js/data/rules.js`. Grey = no data, an incomplete read, or too small a sample. Grey is never judged.

| Rule | Green | Amber | Red |
|---|---|---|---|
| Voluntary renewal rate (needs 20+ decided) | ≥ 70% | ≥ 50% | < 50% |
| Renewal payment failures | 0 | ≤ 2 | > 2 |
| Told an RD they’re leaving (60 d) | ≤ 10 | ≤ 25 | > 25 |
| Closer median close rate (held → paid) | ≥ 20% | ≥ 15% | < 15% |
| Interviews ending joined/committed | ≥ 30% | ≥ 20% | < 20% |
| Setter median intro show rate | ≥ 55% | ≥ 45% | < 45% |
| Intro bookings with unknown source | ≤ 10% | ≤ 20% | > 20% |
| Event NPS | ≥ 50 | ≥ 30 | < 30 |
| Overdue open ClickUp tasks (per dept) | ≤ 2 | ≤ 5 | > 5 |
| Overdue *urgent* ClickUp tasks | 0 | — | ≥ 1 |

A building takes its worst rule. Alerts list every red/amber item, red first, then by dollars at stake, each with a next step and owner.

## What the first build shows (read 2026-11-03 21:21 UTC)

- **Red:** Renewals (17.6% voluntary rate, 6 of 34 decided, 103 still open, $496,985 plan value “worth a call”), Community & RDs (26 said leaving), Admissions (16 overdue ClickUp tasks, 3 urgent).
- **Amber:** Setters (50.2% median show), Marketing (15.3% unknown source).
- **Green:** Events (NPS 59), Fulfillment, Ops, Admin, CTO/AI. **Grey:** Cash.

## Known data caveats

- Closer revenue per rep arrives labelled “cents”, but the team median (labelled USD) is the same size, so it’s read as USD ($1,725,010 for October). **Check this once against payments.**
- November renewals are early in the month. The rate is judged because 34 outcomes are decided, but 103 are still open.
- Raw reads were saved by hand from the connector output for this first build. Some reads keep only the needed fields; each source’s “Read note” on the page says what was kept.

## Phases

| Phase | What | Done when |
|---|---|---|
| **1 · Read-only town** (built) | data layer + tests, 3D town, top 5, alerts, tabs, freshness banner, hide names | every number matches FC AI / ClickUp, and it works on your phone. **Gate: you check the numbers.** |
| 2 · Alerts that find you | daily scheduled refresh; Slack DM only when something turns red | a week with no false alarms and nothing missed. **Gate: you approve actions and who may take them.** |
| 3 · Actions with a preview | assign ClickUp task, draft Slack message, block calendar time; each shows exactly what goes out, confirm click, log | every action has preview + confirm + log. **Gate: hand-off rules.** |
| 4 · Delegation loop | tasks to owners in Slack; town tracks assigned → accepted → done → checked | you can see who owes what without asking. |

## Open questions (answers change the design)

1. What is the five-second question? I used “Are we growing the club this month?”
2. Monthly targets: new members, new cash, renewal rate. With these, the rules become “on pace to target” instead of my guesses.
3. Are the thresholds above right, especially renewals (70/50) and RD “leaving” (10/25)?
4. Who should see named lists (members, reps, comp-related tasks)? Today they’re hidden by default and never committed.
5. For Phase 2, where should alerts go: Slack DM to you, a private channel, or email?
