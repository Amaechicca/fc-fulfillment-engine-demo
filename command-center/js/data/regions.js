// Renewals by sales territory, from the renewal team's own book (get_renewal_book).
// Rate = renewed ÷ (renewed + not renewed), the same rate the renewal team is paid on.
// Revoked (policy), comped, still-due and payment issues are left out of the rate, as the book does.
import { metric, pct, monthLabel } from './metric.js';

export const REGIONS = [
  { territory: 'Rep 1 — Southeast', id: 'r_southeast', short: 'Southeast' },
  { territory: 'Rep 2 — Canada', id: 'r_canada', short: 'Canada' },
  { territory: 'Rep 3 — Chicago / Virtual / Intl', id: 'r_chicago', short: 'Chicago/Intl' },
  { territory: 'Rep 4 — NYC / NE / DC', id: 'r_nyc', short: 'NYC/NE/DC' },
  { territory: 'Rep 5 — West Coast', id: 'r_westcoast', short: 'West Coast' },
  { territory: 'Rep 6 — Texas / Mountain', id: 'r_texas', short: 'Texas/Mtn' },
  { territory: 'Rep 7 — Atlanta', id: 'r_atlanta', short: 'Atlanta' },
];

function counts(c = {}) {
  const renewed = c.renewed || 0;
  const lost = c.not_renewed || 0;
  return { renewed, lost, decided: renewed + lost, open: (c.due || 0) + (c.payment_issue || 0), revoked: c.revoked || 0, comped: c.comped || 0 };
}

/** Whole-club book rate for one month, as a metric. */
export function bookRate(raw, id, label) {
  const p = raw?.payload;
  if (!p) return metric(id, label, null, raw, { unit: '%' });
  const s = p.summary;
  return metric(id, label, Math.round(s.renewal_rate * 1000) / 10, raw, {
    unit: '%', sample: s.renewed + s.churned,
    scope: `${monthLabel(p.month)} renewal book, all territories; renewed ÷ (renewed + not renewed)`,
    context: `${s.renewed} renewed of ${s.renewed + s.churned} decided · ${s.still_due} still open · target 75%`,
  });
}

/**
 * One entry per territory with this month's and last month's numbers.
 * @param lastRaw  last complete month's book (judged)
 * @param thisRaw  current month's book (shown, judged only once enough are decided)
 * @param activeByTerritory  { territory: active members } from the community totals
 */
export function normalizeRegions(lastRaw, thisRaw, activeByTerritory = {}) {
  const last = lastRaw?.payload, cur = thisRaw?.payload;
  return REGIONS.map((r) => {
    const a = counts(last?.by_territory?.[r.territory]);
    const b = counts(cur?.by_territory?.[r.territory]);
    const scope = (p) => `${p ? monthLabel(p.month) : '—'} renewal book, ${r.territory}`;
    return {
      ...r,
      metrics: {
        last_rate: metric(`${r.id}_last_rate`, `${last ? monthLabel(last.month).split(' ')[0] : 'Last month'} renewal rate (final)`, last ? pct(a.renewed, a.decided) : null, lastRaw, {
          unit: '%', sample: a.decided, scope: scope(last), context: `${a.renewed} renewed of ${a.decided} decided · target 75%`,
        }),
        this_rate: metric(`${r.id}_this_rate`, `${cur ? monthLabel(cur.month).split(' ')[0] : 'This month'} so far`, cur ? pct(b.renewed, b.decided) : null, thisRaw, {
          unit: '%', sample: b.decided, scope: scope(cur), context: `${b.renewed} renewed of ${b.decided} decided · ${b.open} still open`,
        }),
        this_open: metric(`${r.id}_this_open`, 'Still open this month', cur ? b.open : null, thisRaw, { unit: 'members', scope: scope(cur) }),
        this_lost: metric(`${r.id}_this_lost`, 'Not renewed this month', cur ? b.lost : null, thisRaw, { unit: 'members', scope: scope(cur) }),
        active: activeByTerritory[r.territory] != null
          ? { ...metric(`${r.id}_active`, 'Active members', activeByTerritory[r.territory].value, activeByTerritory[r.territory].raw, { unit: 'members', scope: `Paid-active today, ${r.territory}` }) }
          : metric(`${r.id}_active`, 'Active members', null, null, { unit: 'members' }),
      },
      row: {
        region: r.short,
        last_renewed: a.renewed, last_decided: a.decided, last_rate: last ? pct(a.renewed, a.decided) : null,
        this_renewed: b.renewed, this_decided: b.decided, this_open: b.open,
        this_rate: cur ? pct(b.renewed, b.decided) : null,
      },
    };
  });
}
