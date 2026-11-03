# PLAN — FC Command Center

A 3D “town” of Founders Club: one building per department, ringed red / amber / green / grey. Built from `answers.md`.
**Phase 1 is built and waiting for your check. Nothing starts on Phase 2 until you say so.**

## How data flows

```
FC AI (GHL, payments, app) · ClickUp · Fathom · Slack
        ──(Claude Code reads, read-only)──▶ data/raw/*.json        (gitignored: has names)
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
| **Community & RDs** (added) | frustrated / disengaging / thriving members (their own words in Slack & support), engagement score, % on Slack, % used the app in 30 days, % in a mastermind | FC AI member queries over GHL, Slack links, app events, masterminds | today / 30 days |
| | RD SOS posts (30 d) and how many have no reply | Slack #team-rd-sos | 30 days |
| | RD check-in calls recorded | Fathom | last 2 days |
| **Admissions** (added) | flagged hot but not closed; no outcome in GHL 3+ days after the interview; interviewed since Oct 1 and not closed; October joins per the membership ledger (cross-check against the closer panel) | `list_pipeline_prospects` (GHL outcomes), membership ledger | Oct 29 → today |
| | interview / sales follow-up calls recorded | Fathom | last 2 days |
| **Setters** (added) | intro calls recorded | Fathom | last 2 days |
| **Member Fulfillment** (added) | new members this month and by month; onboarding calls; new-member intros in #0-welcome-introductions | membership ledger, Fathom, Slack | month / 2 days / 7 days |
| **Every department** | open, in progress, paused, overdue, overdue urgent | ClickUp “Projects By Department” | now |
| **Cash & Finance** | cash, receivables, payables | none connected → grey, blank | — |

Owner of each building = the person assigned the most tasks in that department’s ClickUp list (Renewals: Chauncey, assigned “Renewal Outreach Execution”).

## Rules (ASSUMED — please correct)

All in `js/data/rules.js`. Grey = no data, an incomplete read, or too small a sample. Grey is never judged.

| Rule | Green | Amber | Red |
|---|---|---|---|
| **Renewal rate, club and each region** (renewed ÷ renewed + not renewed; club needs 20+ decided, a region 5+) | ≥ 75% **(your target)** | ≥ 60% (assumed) | < 60% |
| Renewal payment failures | 0 | ≤ 2 | > 2 |
| Told an RD they’re leaving (60 d) | ≤ 10 | ≤ 25 | > 25 |
| Closer median close rate (held → paid) | ≥ 20% | ≥ 15% | < 15% |
| Interviews ending joined/committed | ≥ 30% | ≥ 20% | < 20% |
| Setter median intro show rate | ≥ 55% | ≥ 45% | < 45% |
| Intro bookings with unknown source | ≤ 10% | ≤ 20% | > 20% |
| Event NPS | ≥ 50 | ≥ 30 | < 30 |
| Members frustrated in their own words | ≤ 20 | ≤ 50 | > 50 |
| Active members who used the app in 30 days | ≥ 60% | ≥ 40% | < 40% |
| RD SOS posts with no reply | 0 | — | ≥ 1 |
| Interviews with no outcome after 3+ days | ≤ 3 | ≤ 10 | > 10 |
| Overdue open ClickUp tasks (per dept) | ≤ 2 | ≤ 5 | > 5 |
| Overdue *urgent* ClickUp tasks | 0 | — | ≥ 1 |

A building takes its worst rule. Alerts list every red/amber item, red first, then by dollars at stake, each with a next step and owner.

## What the first build shows (read 2026-11-03 21:21 UTC)

- **Red:** Renewals (17.6% voluntary rate, 6 of 34 decided, 103 still open, $496,985 plan value “worth a call”), Community & RDs (26 said leaving), Admissions (16 overdue ClickUp tasks, 3 urgent).
- **Amber:** Setters (50.2% median show), Marketing (15.3% unknown source).
- **Green:** Events (NPS 59), Fulfillment, Ops, Admin, CTO/AI. **Grey:** Cash.

## Known data caveats

- **GHL has no direct connector here.** Everything from GHL (pipeline outcomes, contacts, territories) comes through FC AI, which reads GHL. GHL contact-created dates are almost all blank, so lead volume from GHL isn't shown.
- **Slack member support moved to DM/email on Sep 28**, so the support channel has nothing to measure. Member-support volume needs the support inbox (not connected).
- **The Slack welcome-channel read stops after one page.** New-member intros show as "at least 32" and are not judged.
- **Fathom calls are sorted by meeting title** (intro, interview, check-in, onboarding, internal). Calls with other titles can land in the wrong bucket. The window is two days to keep the read complete.
- **October joins: 193 by the membership ledger vs 197 by the closer panel.** Both are shown; they count slightly different things.
- **App check-ins are 0 in 30 days**: the app's check-in isn't used, so event attendance isn't shown.

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

## Step 2: the 3D town (built Nov 3)

Built to the "Goal and Prompt" brief:
- **Look:** low-poly, game-style town with a camera tilted about 40°, sunlight and soft shadows, roads, trees, a river and cars. Light and dark mode.
- **Layout:** HQ on a central plaza. The sale road runs **Lead → Appointment → Sale → Delivery → Paid** (Marketing → Setters → Closers → Fulfillment → Payments), then on to the Renewals bank. The other departments ring the back of the plaza, and the sales regions are neighbourhoods farther out.
- **Shapes match the job:** bank (Renewals), sales tower (Closers), call centre with dish (Setters), billboard (Marketing), event tent, delivery warehouse, factory (Ops), office (Admin), data centre (AI), clubhouse (Community), a see-through MOCK vault (Payments), houses (regions).
- **Status:** red / amber / green / grey ring, always with an icon. Only red pulses.
- **Height:** shows volume on a capped scale (open tasks, renewals due, active members), explained in the legend.
- **Tags:** each building has a floating tag with its name, one key number and a flag count. Tags never overlap or run off the edge; when there's no room they shrink to a status pin. On a phone, only areas that need action get full tags.
- **Interaction:** tap a building and the camera flies to it, with a panel showing numbers, needs-action items, owner and sources (bottom sheet on phones). Filters: All / Needs action. Every building is also a button in a plain list. Drag to turn, pinch to zoom, double-tap to reset.
- **Performance:** respects reduced motion and pauses rendering off screen.

## Red means "act today" (rule change, Nov 3)

- A month that is over (October's final renewal rate) can make a building **amber, never red**.
- A region turns red on this month's rate only once **10+** of its renewals are decided.
- Result today: **3 red buildings** (Renewals 18.2% this month, Community 26 said leaving, Closers 3 urgent tasks overdue), each with an owner and a next step in its alert.

## Regions

Each sales territory is a small house on the outer ring of the town, coloured by **last month's final renewal rate** against 75%. This month's rate so far is shown beside it and is judged once 5+ renewals in that region are decided. Source: the renewal team's own book (`get_renewal_book`), split by territory.

## Payments check (the $1.73M)

**Decision (Nov 3):** use the HQ dashboard numbers for now. Every cash and renewal figure on the page comes from the dashboard's own panels, read through FC AI, and is labelled "HQ dashboard … (via FC AI)". **Payments (Commas / Whop)** is a see-through placeholder building marked MOCK. Its slots (cash today, cash this month, failed payments, refunds, subscriptions per processor) stay blank, with no estimates, until access is granted.


- No Commas or Whop connector is available here. The HQ dashboard (which reads both) is blocked by this environment's network rules and needs a staff Google login.
- FC AI's payment records summed by channel give $963,910 from 110 closes for October. That counts only people whose intro was booked in October, so it can't confirm or refute the $1,725,010 (all cash dated in October, including payment-plan installments, 197 deals).
- **Still to do:** compare October new-member cash on the HQ dashboard (or a Commas + Whop export) with $1,725,010.

## Open questions

1. Targets for new members and new cash per month (renewals: 75% per region, done).
2. Is the 60% line for "red" right, or should anything under 75% be red?
3. Which private Slack channel should alerts go to (Phase 2)?
