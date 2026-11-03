# FC Command Center

A live 3D “town” of Founders Club. Each department is a building, ringed by how it’s doing:
**red ✕ act now · amber ! watch · green ✓ on track · grey – no data.** Phase 1 is read-only: nothing here can send, write or change anything.

## Run it

```bash
cd command-center
npm test                                   # data-layer tests on sample data
node scripts/build-snapshot.mjs            # rebuild data/snapshot*.json from data/raw/
python3 -m http.server 8080                # then open http://localhost:8080
```

No install step. three.js 0.128 (MIT) is vendored in `vendor/`.

## Refresh the numbers

The page reads `data/snapshot.json`; it never calls a live system. To refresh, ask Claude Code in this folder:

> Re-read FC AI (community pulse, this month’s renewal diagnosis, RD book risk 60 days, last month’s closer and setter panels, month-to-date admissions diagnosis, last month’s attribution, event feedback since Sep 1) and ClickUp “Projects By Department” tasks, read-only. Save each as `data/raw/<source id>.json` in the same shape, then run `node scripts/build-snapshot.mjs` and `npm test`.

Source ids are listed in `js/data/snapshot.js` → `SOURCES`. A missing raw file shows as a failed source in the banner, and its numbers show as blank and grey, never guessed.

## Where each number comes from

Every number on the page shows its source, when it was read and its scope (tap ⓘ on the top tiles). The full map is in [PLAN.md](PLAN.md).

## Privacy

- `data/snapshot.json` (committed) has numbers only, no member or per-rep names.
- `data/raw/` and `data/snapshot.private.json` hold names and are **gitignored**. The page loads the private file only when it exists locally, and only shows names when “Hide names” is off.
- No credentials in the page or repo. Connectors hold their own.

## Files

| Path | What |
|---|---|
| `js/data/rules.js` | red/amber/green thresholds (one place to change) |
| `js/data/snapshot.js` | cleaning, calculating, judging, alerts (pure, tested) |
| `scripts/build-snapshot.mjs` | raw reads → snapshot files |
| `js/town.js` | the 3D town (view only) |
| `js/app.js`, `js/charts.js` | page, alerts, tabs, charts with table view |
| `tests/` | `node --test` on synthetic sample data |
| `answers.md`, `PLAN.md` | the planning answers and the plan |
