---
description: Report South Florida renewal goal progress (read-only)
allowed-tools: Bash(node command-center/south-florida/scripts/goal.mjs:*), Read
---

Report the South Florida renewal goal progress. This is **read-only reporting**: do not edit, create or delete any file, do not run any other command, do not call any connector, and do not send anything.

1. Run exactly this, from the repository root:

   ```
   node command-center/south-florida/scripts/goal.mjs $ARGUMENTS
   ```

   With no argument it reads `command-center/south-florida/data/sf-data.real.js` if that file exists on this machine (it is gitignored and never committed), otherwise the committed placeholder `command-center/south-florida/data/sf-data.js`.

2. Report back, using only what the script printed:
   - the goal: **above 75%** (exactly 75% is not above);
   - the **current-period decided rate**, with its period label, its denominator (renewed of decided), its verdict, its source and its as-of date;
   - the **prior completed month rate**, with the same label, denominator, verdict, source and date;
   - how many still-open renewals must renew to finish the period above the goal, if printed.

3. If the script says the data is PLACEHOLDER SAMPLE DATA, say so first and plainly: the numbers are fake.

Report the cohort and period exactly as the data states them (e.g. "9 of 13 decided, November 2026, month to date"). If the script marks a period "tiny early sample", repeat that label, but do not change, hide or discount the rate because of it, and do not invent any minimum sample size: there is none. The goal is met only when the verdict says "Above the 75% goal" (strictly above 75%). Do not compute rates yourself, and never use message counts or activity as progress.
