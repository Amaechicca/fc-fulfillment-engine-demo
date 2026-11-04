// South Florida Command Center: pure rules (no DOM). Tested by tests/sf.test.mjs.
// Everything the page judges (health, dedupe, renewal rate, queue colour, event suggestions)
// is decided here so it can be checked on sample data.

export const SOURCE_IDS = ['gmail', 'slack', 'fathom', 'ghl', 'whatsapp', 'plaud'];

export const QUEUES = [
  { id: 'to_send', name: 'Messages to send', short: 'To send', blurb: 'Replies and follow-ups that still need to go out.' },
  { id: 'pending', name: 'Messages pending', short: 'Pending', blurb: 'Sent and waiting on the member.' },
  { id: 'new_members', name: 'New members', short: 'New members', blurb: 'Recent joins and where their onboarding stands.' },
  { id: 'at_risk', name: 'Members complaining or at risk', short: 'At risk', blurb: 'Complaints and renewal risk, merged across every source.' },
];

export const MESSAGE_STATUSES = ['to-send', 'draft-ready', 'held', 'queued', 'sent', 'error'];
export const MESSAGE_STATUS_TEXT = {
  'to-send': 'To send', 'draft-ready': 'Draft ready', held: 'Held', queued: 'Queued', sent: 'Sent', error: 'Error',
};

export function dedupKeyFor(draftId, version) { return `${draftId}:${version}`; }

/** The exact payload handed to window.SF_ACTIONS.send / saveEdit. Nothing else is sent. */
export function actionPayload(item, body = item.body) {
  return {
    draft_id: item.draft_id, thread_id: item.thread_id, recipient: item.recipient, account: item.account,
    body, version: item.version, dedup_key: item.dedup_key,
  };
}

/** Why Send is not available for an item, or null if it can be offered. */
export function sendBlocker(item, versionOk) {
  if (item.state === 'held') return `Held: ${item.hold_reason || 'no reason recorded'}`;
  if (item.state === 'sent') return 'Already sent (per the data).';
  if (item.state === 'queued') return 'Already queued to send (per the data).';
  if (!item.draft_id || !item.body) return 'No draft on record for this item.';
  if (versionOk === false) return 'The draft text does not match its version hash, so it is not safe to send.';
  if (versionOk !== true) return 'Could not verify the draft version in this browser.';
  return null;
}

/**
 * Source health from the LAST CHECK ONLY. There is no heartbeat, so nothing here ever says a source
 * is "online" now. Exactly one of:
 *   verified        "Last verified reachable <time>"     a live check succeeded at that time
 *   content-blocked "Signed in; content unreadable"      authenticated, but content can't be read (GHL)
 *   offline         "Offline (check failed at <time>)"   a live check failed
 *   unknown         "Status unknown"                     never checked, not a live check, or no result
 *   not-connected   "Not connected (coming soon)"        a future source (Plaud)
 * The age of a check never upgrades it: an old success is still only "last verified".
 * axes (optional, per check): authenticated / reachable / contentReadable / ingesting: true|false|null.
 */
const H = 3600000;
export const AXES = [['authenticated', 'Authenticated'], ['reachable', 'Reachable'], ['contentReadable', 'Content readable'], ['ingesting', 'Ingesting']];
export function sourceHealth(src) {
  if (!src || src.future) return { state: 'not-connected', label: 'Not connected (coming soon)', at: null, axes: {} };
  const c = src.check || {};
  const at = c.ranAt && Number.isFinite(Date.parse(c.ranAt)) ? c.ranAt : null;
  const axes = { ...(c.axes || {}) };
  if (!at || c.live !== true) return { state: 'unknown', label: 'Status unknown', at: null, axes: {} };
  const failed = c.succeeded === false || axes.authenticated === false || axes.reachable === false;
  if (failed) return { state: 'offline', label: 'Offline (check failed at {at})', at, axes };
  const blocked = (axes.authenticated === true && axes.contentReadable === false) || (src.id === 'ghl' && c.succeeded === true);
  if (blocked) return { state: 'content-blocked', label: 'Signed in; content unreadable', at, axes: { ...axes, authenticated: axes.authenticated ?? true, contentReadable: false } };
  if (c.succeeded === true) return { state: 'verified', label: 'Last verified reachable {at}', at, axes };
  return { state: 'unknown', label: 'Status unknown', at: null, axes: {} };
}
/** The label with its timestamp filled in by the caller's formatter. */
export function healthText(h, fmt = (iso) => iso) { return h.label.replace('{at}', h.at ? fmt(h.at) : ''); }
export const HEALTH_STATUS = { verified: 'blue', 'content-blocked': 'amber', offline: 'red', unknown: 'grey', 'not-connected': 'grey' };
export const HEALTH_SHORT = { verified: 'Last verified', 'content-blocked': 'Content unreadable', offline: 'Offline', unknown: 'Status unknown', 'not-connected': 'Not connected' };

/** GHL always carries the coverage warning; any other source does when coverage.complete is false. */
export function coverageWarning(src) {
  if (!src) return null;
  if (src.id === 'ghl') return `Content coverage incomplete${src.coverage?.note ? `: ${src.coverage.note}` : '.'}`;
  if (src.future) return null;
  if (src.coverage && src.coverage.complete === false) return `Coverage incomplete${src.coverage.note ? `: ${src.coverage.note}` : '.'}`;
  return null;
}

export function latestIso(list) {
  let best = null;
  for (const iso of list) if (iso && (!best || Date.parse(iso) > Date.parse(best))) best = iso;
  return best;
}

const QUEUE_RANK = { at_risk: 4, to_send: 3, pending: 2, new_members: 1 };
const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

/**
 * Rows that share an issueKey are one issue seen in several sources. Merge them:
 * the most recent row supplies the summary/status; links fall back to any row that has one;
 * the most urgent queue and highest severity win; every source is listed once.
 */
export function dedupeItems(items = []) {
  const groups = new Map();
  for (const it of items) {
    const key = it.issueKey || it.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  return [...groups.values()].map((rows) => {
    const byNewest = [...rows].sort((a, b) => (Date.parse(b.asOf) || 0) - (Date.parse(a.asOf) || 0));
    const top = byNewest[0];
    const first = (k) => byNewest.find((r) => r[k])?.[k];
    // the message payload travels as one unit: take it from the newest row that has a draft (else the newest with a body)
    const msg = byNewest.find((r) => r.draft_id) || byNewest.find((r) => r.body) || {};
    const seen = new Map();
    for (const r of byNewest) {
      if (!r.source || seen.has(r.source)) continue;
      seen.set(r.source, { source: r.source, asOf: r.asOf, threadUrl: r.threadUrl || null, rowId: r.id });
    }
    const facts = [];
    for (const r of rows) for (const f of r.facts || []) if (!facts.some((x) => x.label === f.label)) facts.push(f);
    return {
      ...top,
      id: top.issueKey || top.id,
      rowIds: rows.map((r) => r.id),
      queue: rows.reduce((q, r) => ((QUEUE_RANK[r.queue] || 0) > (QUEUE_RANK[q] || 0) ? r.queue : q), top.queue),
      severity: rows.reduce((s, r) => ((SEVERITY_RANK[r.severity] || 0) > (SEVERITY_RANK[s] || 0) ? r.severity : s), top.severity),
      threadUrl: msg.threadUrl || first('threadUrl') || null,
      draft_id: msg.draft_id ?? null, thread_id: msg.thread_id ?? null, recipient: msg.recipient ?? null, account: msg.account ?? null,
      body: msg.body ?? null, version: msg.version ?? null, dedup_key: msg.dedup_key ?? null,
      channel: msg.channel || top.channel, state: msg.state || top.state,
      hold_reason: msg.hold_reason || first('hold_reason') || null,
      nextStep: first('nextStep') || null,
      overdue: rows.some((r) => r.overdue),
      sources: [...seen.values()],
      asOf: latestIso(rows.map((r) => r.asOf)),
      facts,
    };
  });
}

/** Decided rate: renewed / (renewed + churned), one decimal. Null until something is decided. */
export function decidedRate(renewed, churned) {
  const r = Number(renewed), c = Number(churned);
  if (!Number.isFinite(r) || !Number.isFinite(c) || r < 0 || c < 0 || r + c === 0) return null;
  return Math.round((r / (r + c)) * 1000) / 10;
}

/**
 * Judge one period against the goal: strictly ABOVE the target (exactly 75% is not above).
 * There is no minimum sample size: the actual rate is always shown and judged as it is.
 */
export function goalVerdict(rate, target) {
  if (rate === null) return { state: 'none', status: 'grey', text: 'No decided renewals yet' };
  if (rate > target) return { state: 'above', status: 'green', text: `Above the ${target}% goal` };
  if (rate >= target - 5) return { state: 'close', status: 'amber', text: `Not above ${target}% yet` };
  return { state: 'below', status: 'red', text: `Below the ${target}% goal` };
}

/**
 * The renewal race. Only renewed/churned (and open, for what's left) are read; any other
 * field on the object (message counts, activity) is ignored on purpose. earlySample is a
 * display label from the data only: it never changes the rate or the verdict.
 */
export function renewalRace(renewal) {
  if (!renewal) return null;
  const target = Number(renewal.target) || 75;
  const cur = renewal.current || {}, pri = renewal.prior || {};
  const n = (v) => Number(v) || 0;
  const curRate = decidedRate(cur.renewed, cur.churned);
  const priRate = decidedRate(pri.renewed, pri.churned);
  const curDecided = n(cur.renewed) + n(cur.churned), priDecided = n(pri.renewed) + n(pri.churned);
  const open = n(cur.open);
  const due = curDecided + open;
  // of the still-open renewals, how many must renew to finish the period ABOVE the target
  let needToFinish = null;
  if (due) needToFinish = Math.max(0, Math.floor((target / 100) * due - n(cur.renewed)) + 1);
  const reachable = needToFinish === null ? null : needToFinish <= open;
  const curV = goalVerdict(curRate, target);
  const priV = goalVerdict(priRate, target);
  return {
    target, status: curV.status,
    current: { ...pick(cur), rate: curRate, decided: curDecided, open, needToFinish, reachable, verdict: curV, earlySample: cur.earlySample === true },
    prior: { ...pick(pri), rate: priRate, decided: priDecided, verdict: priV, earlySample: pri.earlySample === true },
  };
}
function pick(o) {
  const { label, periodStart, periodEnd, month, renewed, churned, source, asOf } = o;
  return { label, periodStart, periodEnd, month, renewed, churned, source, asOf };
}

/** Red/amber/green for a queue, from its (deduped) items. */
export function queueStatus(queueId, items, nowMs = Date.now()) {
  const list = items.filter((i) => i.queue === queueId);
  if (queueId === 'to_send') return list.some((i) => i.state === 'error') ? 'red' : list.length ? 'amber' : 'green';
  if (queueId === 'pending') {
    if (list.some((i) => i.state === 'error')) return 'red';
    return list.some((i) => i.sentAt && nowMs - Date.parse(i.sentAt) > 72 * H) ? 'amber' : 'green';
  }
  if (queueId === 'new_members') return list.some((i) => i.overdue) ? 'amber' : 'green';
  if (queueId === 'at_risk') return list.some((i) => i.severity === 'high') ? 'red' : list.length ? 'amber' : 'green';
  return 'grey';
}

// A HEURISTIC, not a rule: defaults only. The data file can set events.cluster = { minMembers, windowDays }.
export const CLUSTER_DEFAULTS = { minMembers: 3, windowDays: 60 };
export function clusterConfig(events) {
  const c = events?.cluster || {};
  const ok = (v) => Number.isInteger(v) && v > 0;
  return { minMembers: ok(c.minMembers) ? c.minMembers : CLUSTER_DEFAULTS.minMembers, windowDays: ok(c.windowDays) ? c.windowDays : CLUSTER_DEFAULTS.windowDays };
}

/**
 * Event suggestions come only from clusters in member feedback: a theme raised by at least
 * minMembers distinct VERIFIED members inside windowDays, with an idea for that theme in the data.
 * Themes with fewer members come back as early signals (evidence only, no proposed event).
 * Nothing is invented: no feedback → no suggestion and no signal.
 */
export function eventSuggestions(events, nowMs = Date.now(), override = {}) {
  const cfg = { ...clusterConfig(events), ...override };
  const fb = (events?.feedback || []).filter((f) => f.verified === true && f.theme && f.member
    && Number.isFinite(Date.parse(f.at)) && nowMs - Date.parse(f.at) <= cfg.windowDays * 24 * H && Date.parse(f.at) <= nowMs + H);
  const byTheme = new Map();
  for (const f of fb) { if (!byTheme.has(f.theme)) byTheme.set(f.theme, []); byTheme.get(f.theme).push(f); }
  const upcoming = [...(events?.rd || []), ...(events?.club || [])].filter((e) => e.status !== 'canceled' && Date.parse(e.startsAt) >= nowMs);
  const suggestions = [], early = [];
  for (const [theme, rows] of byTheme) {
    const members = [...new Set(rows.map((r) => r.member))];
    const evidence = {
      distinctVerifiedMembers: members.length,
      mentions: rows.length,
      channels: [...new Set(rows.map((r) => r.channel))].filter(Boolean),
      newest: latestIso(rows.map((r) => r.at)),
      oldest: rows.map((r) => r.at).sort()[0],
    };
    const idea = (events?.ideas || []).find((i) => i.theme === theme);
    if (members.length < cfg.minMembers || !idea) {
      early.push({ theme, evidence, members, reason: members.length < cfg.minMembers ? 'below the heuristic' : 'no event idea for this theme in the data' });
      continue;
    }
    const covered = upcoming.filter((e) => (e.themes || []).includes(theme));
    suggestions.push({
      theme, title: idea.title, format: idea.format || null, why: idea.why || null,
      proposedStart: idea.proposedStart || null, proposedEnd: idea.proposedEnd || null,
      mayBringNewMembers: Boolean(idea.mayBringNewMembers),
      kind: covered.length ? 'high-potential' : 'missing',
      alreadyCoveredBy: covered.map((e) => e.title),
      evidence, members,
    });
  }
  const byCount = (a, b) => b.evidence.distinctVerifiedMembers - a.evidence.distinctVerifiedMembers;
  return { suggestions: suggestions.sort(byCount), early: early.sort(byCount), config: cfg };
}

/** Recent (last `recentDays`) and upcoming bookings, each sorted toward "now". */
export function splitBookings(bookings = [], nowMs = Date.now(), recentDays = 14) {
  const t = (b) => Date.parse(b.startsAt);
  const valid = bookings.filter((b) => Number.isFinite(t(b)));
  return {
    upcoming: valid.filter((b) => t(b) >= nowMs).sort((a, b) => t(a) - t(b)),
    recent: valid.filter((b) => t(b) < nowMs && nowMs - t(b) <= recentDays * 24 * H).sort((a, b) => t(b) - t(a)),
  };
}

/** Stable aliases for Hide names: "Member A", "Member B"… in first-seen order. */
export function memberAliases(names) {
  const map = new Map();
  const letters = (n) => { let s = ''; n += 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  for (const n of names) if (n && !map.has(n)) map.set(n, `Member ${letters(map.size)}`);
  return map;
}

/** Schema check. Returns a list of problems (empty = fine). */
export function validateData(d) {
  const errs = [];
  const iso = (v) => v === null || v === undefined || Number.isFinite(Date.parse(v));
  if (!d || typeof d !== 'object') return ['SF_DATA is missing'];
  if (typeof d.placeholder !== 'boolean') errs.push('placeholder must be true or false');
  if (!iso(d.generatedAt) || !d.generatedAt) errs.push('generatedAt must be an ISO time');
  const ids = (d.sources || []).map((s) => s.id);
  for (const id of SOURCE_IDS) if (!ids.includes(id)) errs.push(`sources is missing "${id}"`);
  for (const s of d.sources || []) {
    if (!iso(s.asOf)) errs.push(`source ${s.id}: asOf is not a time`);
    if (!s.check || !iso(s.check.ranAt)) errs.push(`source ${s.id}: check.ranAt is not a time`);
  }
  const qids = QUEUES.map((q) => q.id);
  for (const it of d.items || []) {
    const at = `item ${it.id}`;
    if (!it.id) errs.push('an item has no id');
    if (!qids.includes(it.queue)) errs.push(`${at}: unknown queue "${it.queue}"`);
    if (!it.member) errs.push(`${at}: no member`);
    if (!it.source || !SOURCE_IDS.includes(it.source)) errs.push(`${at}: unknown source "${it.source}"`);
    if (!it.asOf || !iso(it.asOf)) errs.push(`${at}: asOf must be an ISO time`);
    if ((it.queue === 'to_send' || it.queue === 'pending') && !MESSAGE_STATUSES.includes(it.state)) errs.push(`${at}: state must be one of ${MESSAGE_STATUSES.join(', ')}`);
    if (it.state && !MESSAGE_STATUSES.includes(it.state)) errs.push(`${at}: unknown state "${it.state}"`);
    if (it.state === 'held' && !it.hold_reason) errs.push(`${at}: held items need a hold_reason`);
    if (it.draft_id) {
      for (const f of ['thread_id', 'recipient', 'account', 'body', 'version', 'dedup_key']) if (!it[f]) errs.push(`${at}: has a draft_id but no ${f}`);
      if (it.version && it.dedup_key && it.dedup_key !== dedupKeyFor(it.draft_id, it.version)) errs.push(`${at}: dedup_key must be draft_id + ':' + version`);
    }
  }
  const r = d.renewal;
  if (!r) errs.push('renewal is missing');
  else {
    for (const k of ['current', 'prior']) {
      const p = r[k];
      if (!p) { errs.push(`renewal.${k} is missing`); continue; }
      for (const f of ['renewed', 'churned']) if (!Number.isInteger(p[f]) || p[f] < 0) errs.push(`renewal.${k}.${f} must be a whole number ≥ 0`);
      if (!p.source) errs.push(`renewal.${k}.source is missing`);
      if (!p.asOf || !iso(p.asOf)) errs.push(`renewal.${k}.asOf must be an ISO time`);
      if (!p.label) errs.push(`renewal.${k}.label is missing`);
    }
  }
  for (const a of d.audits || []) if (!['pass', 'fail'].includes(a.result)) errs.push(`audit ${a.id}: result must be pass or fail`);
  const ev = d.events;
  if (ev) {
    if (!Array.isArray(ev.rd) || !Array.isArray(ev.club)) errs.push('events.rd and events.club must both be lists');
    const rdIds = new Set((ev.rd || []).map((e) => e.id));
    for (const e of ev.club || []) if (rdIds.has(e.id)) errs.push(`event ${e.id} is in both the RD and club tracks`);
  }
  for (const b of d.bookings || []) if (!iso(b.startsAt) || !b.startsAt) errs.push(`booking ${b.id}: startsAt must be an ISO time`);
  return errs;
}
