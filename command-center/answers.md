# answers.md — the 30 planning questions (draft)

Drafted by Claude on 2026-11-03 from what the connected systems show (FC AI, ClickUp) and the existing fulfillment prototype in this repo.
**Anything marked _ASSUMED_ is a guess to confirm or correct.** Short answers are fine; edit in place.

## The business and you
1. **What we sell:** Founders Club membership for founders. Sale path: lead (paid ads, cold email, LinkedIn, referral) → setter books an **intro call** → **interview** with a closer → paid membership (new sale or payment plan) → yearly **renewal**, worked by RDs/community.
2. **Brands:** Founders Club only. _ASSUMED_ one view, all territories together, filterable by territory later.
3. **Who looks:** internal staff. Named lists (members, reps) are for staff only: they stay off the shared repository and behind “Hide names”.
4. **Three decisions + the number for each:** _ASSUMED_
   - Who do we call to save renewals this week → open renewals worth a call + plan value.
   - Is the front end (setters/closers) healthy → show rate, close rate, cash per interview.
   - Where to put marketing money → bookings and closes by channel, cost per close.
5. **Five-second question:** “Are we growing the club this month?” (confirmed).

## Systems and data
6. **Systems:** FC AI (members, renewals, RD calls, sales panels, attribution, event feedback, pipeline — built on GHL, payments, the app, Fathom, Slack). ClickUp (department projects and tasks). Slack (RD SOS, welcome channel) and Fathom (recorded calls) are read directly too. Gmail and Google Calendar are connected but personal, so they aren't used. GHL and payments are reached only through FC AI; accounting isn't reachable at all.
7. **Source of truth:** FC AI is the record for members, renewals and sales numbers (its rules say it outranks GHL tags). ClickUp is the record for tasks. Nobody is the record for cash yet.
8. **Connected to Claude Code:** FC AI, ClickUp, Slack, Fathom, Gmail, Calendar. **Not connected:** GHL directly (via FC AI only), bank/accounting (Cash stays grey), the member-support inbox.
9. **Freshness:** _ASSUMED_ daily for everything; weekly for event feedback.
10. **Numbers we don't trust:** FC AI flags member revenue as mostly self-reported; ClickUp has a task to stop 150+ GHL duplicate contacts and one to fix “should’ve been DQed” leads on the dashboard; 15% of October intro bookings have an unknown source. Closer revenue arrives labelled “cents” but reads as dollars (see PLAN).

## What to measure
11. **Money:** _ASSUMED_ new-member cash (closer panel) and renewal dollars collected (renewal book). Cash basis. No bank, receivables or payables yet.
12. **Sales:** lead = intro booking; appointment = interview; sale = first payment; cancellation = no-show/cancel on the interview. **Renewal target: 75%, per region.** New-member and new-cash targets: not set yet.
13. **Delivery:** for members, renewal outcome stages (renewed / left with reason / left silently / open worth a call / open quiet). Things get stuck in “open”.
14. **People:** owners taken from ClickUp (who is assigned most tasks in each department list). “Doing well” = the rules in PLAN.md.
15. **Marketing:** paid Facebook and Google, cold email senders, LinkedIn outbound, referrals, SDR. Judged on bookings, closes and cost per close.
16. **Red/amber/green rules:** _ASSUMED_ — see PLAN.md “Rules”. Please correct the thresholds.
17. **Weekly reports today:** Sales Ops EOW report, weekly calls report to sales, daily calls report to setters, weekly churned-members review (all from ClickUp tasks).

## The town
18. **Buildings:** HQ (centre), Renewals (bank), Community & RDs, Admissions (Closers), Setters, Marketing & Growth, Events & Partnerships, Member Fulfillment, Operations, Admin & People, CTO/AI, Cash & Finance (bank, grey until connected).
19. **Click a building:** summary card with key numbers, what needs action, owner; link to its full tab.
20. **Look:** FC green, minimal.
21. **Device:** _ASSUMED_ phone first.

## Actions and alerts
22. **Alerts:** probably a private Slack channel (to be decided), only when something turns red (Phase 2).
23. **Actions wanted:** _ASSUMED_ assign a ClickUp task, draft a Slack message to an owner, block calendar time (Phase 3).
24. **Approval:** _ASSUMED_ you approve every action after seeing a preview.
25. **Hand out work today:** ClickUp + Slack.

## Rules and limits
26. **Never:** contact a member or prospect, move money, change any record, post in a public channel.
27. **Private:** member names and plan values, per-rep performance, payroll/comp, bank details. Hidden by default; never committed to the repo.
28. **Contact rules:** SMS quiet hours and consent apply to any member text (none in Phase 1).
29. **Where it runs:** static page in this repo (`command-center/`), refreshed by Claude Code reading FC AI and ClickUp. Maintained by Chauncey.
30. **Success in 30 days:** _ASSUMED_ it is opened every morning and the renewals “worth a call” list is worked from it. Stop using it if the numbers disagree with the FC dashboards.
