// Renewals by sales territory, from the renewal team's own book (get_renewal_book).
// Rate = renewed ÷ (renewed + not renewed), the same rate the renewal team is paid on.
// Revoked (policy), comped, still-due and payment issues are left out of the rate, as the book does.
import { metric, pct, monthLabel } from './metric.js';

// The data keys (`territory`) are how the renewal book and community totals label each rep's book.
// Display names follow the RD seats leadership uses (Nov 3): Rep 1 South Florida … Rep 7 South East, plus Unassigned.
// `seat` is the RD seat name used by the RD check-in reads.
export const REGIONS = [
  { territory: 'Rep 1 — Southeast', id: 'r_southflorida', name: 'South Florida', rep: 'Rep 1', seat: 'South Florida', short: 'South Florida' },
  { territory: 'Rep 2 — Canada', id: 'r_toronto', name: 'Toronto', rep: 'Rep 2', seat: 'Toronto', short: 'Toronto' },
  { territory: 'Rep 3 — Chicago / Virtual / Intl', id: 'r_midwest', name: 'Midwest & MidAtlantic', rep: 'Rep 3', seat: 'MidWest & MidAtlantic', short: 'Midwest & MidAtl' },
  { territory: 'Rep 4 — NYC / NE / DC', id: 'r_newyork', name: 'New York', rep: 'Rep 4', seat: 'New York', short: 'New York' },
  { territory: 'Rep 5 — West Coast', id: 'r_westcoast', name: 'West Coast', rep: 'Rep 5', seat: 'West Coast', short: 'West Coast' },
  { territory: 'Rep 6 — Texas / Mountain', id: 'r_mountainwest', name: 'Mountain West', rep: 'Rep 6', seat: 'Mountain West', short: 'Mountain West' },
  { territory: 'Rep 7 — Atlanta', id: 'r_southeast', name: 'South East', rep: 'Rep 7', seat: 'South East', short: 'South East' },
  { territory: 'Unassigned', id: 'r_unassigned', name: 'Unassigned', rep: '', seat: null, short: 'Unassigned' },
];

// Which RD seat an event city belongs to (from where members in those cities are seated in the RD check-in reads).
export const CITY_SEAT = {
  miami: 'South Florida', 'boca raton': 'South Florida', 'fort lauderdale': 'South Florida',
  toronto: 'Toronto', vancouver: 'Toronto', calgary: 'Toronto',
  chicago: 'MidWest & MidAtlantic', philadelphia: 'MidWest & MidAtlantic', 'washington dc': 'MidWest & MidAtlantic',
  nyc: 'New York', 'new york': 'New York', boston: 'New York',
  'los angeles': 'West Coast', 'orange county': 'West Coast', 'san francisco': 'West Coast',
  austin: 'Mountain West', dallas: 'Mountain West', denver: 'Mountain West',
  tampa: 'South East', atlanta: 'South East', orlando: 'South East', nashville: 'South East', charleston: 'South East',
};

/** Upcoming events (ClickUp Master Table), each tied to a seat by its city. "Soon" = within 7 days. */
export function normalizeUpcomingEvents(raw, nowMs) {
  const p = raw?.payload;
  if (!p) return { events: [], metrics: {} };
  const soonMs = 7 * 86400000;
  const events = p.events.filter((e) => e.due_ms >= nowMs - 86400000).map((e) => {
    const city = Object.keys(CITY_SEAT).find((c) => e.name.toLowerCase().startsWith(c)) || null;
    return { ...e, city, seat: city ? CITY_SEAT[city] : null, date: new Date(e.due_ms).toISOString().slice(0, 10), soon: e.due_ms - nowMs <= soonMs };
  }).sort((a, b) => a.due_ms - b.due_ms);
  const soon = events.filter((e) => e.soon);
  const scope = 'ClickUp events table (Master Table), status live';
  return {
    events,
    metrics: {
      events_next7: metric('events_next7', 'Events in the next 7 days', soon.length, raw, { unit: 'events', scope, context: soon.map((e) => e.name.replace(/ In-Person Mastermind/, '')).join(' · ') || undefined }),
      events_this_month: metric('events_this_month', 'Events still to come this month', events.length, raw, { unit: 'events', scope }),
    },
  };
}

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
export function normalizeRegions(lastRaw, thisRaw, activeByTerritory = {}, rdRaw = null, upcoming = []) {
  const last = lastRaw?.payload, cur = thisRaw?.payload;
  return REGIONS.map((r) => {
    const a = counts(last?.by_territory?.[r.territory]);
    const b = counts(cur?.by_territory?.[r.territory]);
    const where = r.rep ? `${r.rep} · ${r.name}` : r.name;
    const scope = (p) => `${p ? monthLabel(p.month) : '—'} renewal book, ${where}`;
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
        said_leaving: r.seat && rdRaw?.payload
          ? metric(`${r.id}_said_leaving`, 'Told their RD they’re leaving', rdRaw.payload.leaving.filter((x) => x.territory === r.seat).length, rdRaw, {
            unit: 'members', scope: `RD check-in calls since ${rdRaw.payload.since}, ${r.seat} seat` })
          : metric(`${r.id}_said_leaving`, 'Told their RD they’re leaving', null, rdRaw, { unit: 'members', missingReason: r.seat ? 'RD check-ins not read' : 'No RD seat for unassigned members' }),
        active: activeByTerritory[r.territory] != null
          ? { ...metric(`${r.id}_active`, 'Active members', activeByTerritory[r.territory].value, activeByTerritory[r.territory].raw, { unit: 'members', scope: `Paid-active today, ${where}` }) }
          : metric(`${r.id}_active`, 'Active members', null, null, { unit: 'members' }),
      },
      events: upcoming.filter((e) => r.seat && e.seat === r.seat),
      row: {
        region: r.rep ? `${r.name} (${r.rep})` : r.name,
        last_renewed: a.renewed, last_decided: a.decided, last_rate: last ? pct(a.renewed, a.decided) : null,
        this_renewed: b.renewed, this_decided: b.decided, this_open: b.open,
        this_rate: cur ? pct(b.renewed, b.decided) : null,
      },
    };
  });
}
