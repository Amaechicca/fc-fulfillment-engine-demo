// Turns raw connector reads into the snapshot the page renders.
// Pure functions only: no file or network access here, so it runs the same in Node tests and the browser.
//
// Every number leaves this file as a "metric": value + source + when it was read + scope + whether the read was complete.
// Anything a person's name is attached to goes into `private`, never into `public`.

import { judge, worst } from './rules.js';
import { SOURCES, metric, pct, sum, monthLabel } from './metric.js';
import { REGIONS, normalizeRegions, bookRate } from './regions.js';
import { normalizeEngagement, normalizePulse, normalizeJoins, normalizePipeline, normalizeFathom, normalizeSlack } from './engagement.js';

export { SOURCES } from './metric.js';

// ---------- per-source normalizers ----------

export function normalizeCommunity(raw) {
  const p = raw?.payload;
  return {
    metrics: {
      active_members: metric('active_members', 'Active members', p?.active_members, raw, { unit: 'members', scope: 'Whole community, paid-active today', context: 'Paid and active today' }),
    },
    tables: p ? {
      by_territory: Object.entries(p.by_sales_territory).map(([k, v]) => ({ territory: k, members: v })),
      top_industries: Object.entries(p.industry_top10).map(([k, v]) => ({ industry: k.replace(/_/g, ' '), members: v })),
    } : {},
  };
}

export function normalizeRenewals(raw) {
  const p = raw?.payload;
  if (!p) return { metrics: {}, tables: {}, private: {} };
  const s = p.summary;
  const month = s.window.from.slice(0, 7);
  const scope = `${monthLabel(month)} renewal book, all territories`;
  const decided = s.renewed.count + s.voluntary_churn.count + s.silent_churn.count + s.payment_failures.count + s.other_exits.count;
  const worthCall = p.columns.open_worth_a_call || [];
  const worthCallUsd = sum(worthCall.map((r) => r.plan_value_usd));
  const silentUsd = s.silent_churn.usd;
  return {
    metrics: {
      renewals_book: metric('renewals_book', 'Members up for renewal', s.book_count, raw, { unit: 'members', scope }),
      renewals_renewed: metric('renewals_renewed', 'Renewed so far', s.renewed.count, raw, { unit: 'members', scope }),
      renewals_collected_usd: metric('renewals_collected_usd', 'Renewal dollars collected', s.renewed.usd, raw, { unit: 'usd', scope }),
      renewals_voluntary_rate: metric('renewals_voluntary_rate', 'Voluntary renewal rate', s.voluntary_rate_pct, raw, {
        unit: '%', scope: `${scope}; renewed ÷ decided, excluding policy exits`, sample: decided,
        context: `${s.renewed.count} renewed of ${decided} decided · ${s.open.worth_a_call + s.open.quiet} still open`,
      }),
      renewals_open: metric('renewals_open', 'Still open', s.open.worth_a_call + s.open.quiet, raw, { unit: 'members', scope }),
      renewals_open_usd: metric('renewals_open_usd', 'Open renewal value', s.open.usd, raw, { unit: 'usd', scope }),
      renewals_worth_call: metric('renewals_worth_call', 'Open and worth a call', s.open.worth_a_call, raw, { unit: 'members', scope }),
      renewals_worth_call_usd: metric('renewals_worth_call_usd', 'Plan value of “worth a call”', worthCallUsd, raw, { unit: 'usd', scope }),
      renewals_silent_churn: metric('renewals_silent_churn', 'Left with nothing on record', s.silent_churn.count, raw, { unit: 'members', scope }),
      renewals_silent_churn_usd: metric('renewals_silent_churn_usd', 'Plan value lost silently', silentUsd, raw, { unit: 'usd', scope }),
      renewals_payment_failures: metric('renewals_payment_failures', 'Payment failures', s.payment_failures.count, raw, { unit: 'members', scope }),
    },
    tables: {
      outcomes: [
        { outcome: 'Renewed', members: s.renewed.count, usd: s.renewed.usd },
        { outcome: 'Left, reason on record', members: s.voluntary_churn.count, usd: s.voluntary_churn.usd },
        { outcome: 'Left silently', members: s.silent_churn.count, usd: s.silent_churn.usd },
        { outcome: 'Other exit', members: s.other_exits.count, usd: s.other_exits.usd },
        { outcome: 'Policy exit (intended)', members: s.policy_exits.count, usd: s.policy_exits.usd },
        { outcome: 'Payment failure', members: s.payment_failures.count, usd: s.payment_failures.usd },
        { outcome: 'Open — worth a call', members: s.open.worth_a_call, usd: worthCallUsd },
        { outcome: 'Open — quiet', members: s.open.quiet, usd: s.open.usd - worthCallUsd },
      ],
    },
    private: {
      renewals_worth_call: worthCall.map((r) => ({
        name: r.name, territory: r.territory, plan_value_usd: r.plan_value_usd, due: r.event_date,
        slack_days_28d: r.engagement?.slack_active_days_28d ?? null, pulse: r.engagement?.pulse ?? null,
      })),
      renewals_silent_churn: (p.columns.silent_churn || []).map((r) => ({
        name: r.name, territory: r.territory, plan_value_usd: r.plan_value_usd, left: r.event_date,
      })),
    },
  };
}

export function normalizeRdRisk(raw) {
  const p = raw?.payload;
  if (!p) return { metrics: {}, tables: {}, private: {} };
  const scope = `RD check-in calls since ${p.since}, all territories, member's own words (confidence ≥ 0.6)`;
  const byTerritory = {};
  for (const r of p.leaving) (byTerritory[r.territory] ??= { territory: r.territory, leaving: 0, undecided: 0 }).leaving++;
  for (const r of p.undecided) (byTerritory[r.territory] ??= { territory: r.territory, leaving: 0, undecided: 0 }).undecided++;
  return {
    metrics: {
      rd_said_leaving: metric('rd_said_leaving', 'Told an RD they are leaving', p.leaving.length, raw, { unit: 'members', scope, context: `${p.undecided.length} more undecided · last 60 days` }),
      rd_undecided: metric('rd_undecided', 'Undecided on staying', p.undecided.length, raw, { unit: 'members', scope }),
      rd_leaving_frustrated: metric('rd_leaving_frustrated', 'Leaving and frustrated', p.leaving.filter((r) => r.frustrated).length, raw, { unit: 'members', scope }),
    },
    tables: {
      by_territory: Object.values(byTerritory).sort((a, b) => b.leaving - a.leaving || b.undecided - a.undecided),
    },
    private: {
      rd_leaving: p.leaving.map((r) => ({ name: r.name, territory: r.territory, call_date: r.call_date, frustrated: r.frustrated, confidence: r.confidence })),
    },
  };
}

export function normalizeClosers(raw) {
  const p = raw?.payload;
  if (!p) return { metrics: {}, tables: {}, private: {} };
  const scope = `Closers, ${p.window.from} to ${p.window.to} (exclusive)`;
  const deals = sum(p.rows.map((r) => r.deals_closed_total));
  const cash = sum(p.rows.map((r) => r.total_closer_revenue_cents));
  return {
    metrics: {
      new_members_closed: metric('new_members_closed', 'New members closed', deals, raw, { unit: 'members', scope: `${scope}; first payment in window`, context: `${monthLabel(p.window.from.slice(0, 7))}` }),
      new_member_cash_usd: metric('new_member_cash_usd', 'New-member cash collected', cash, raw, {
        unit: 'usd', context: `${monthLabel(p.window.from.slice(0, 7))}`, scope: `${scope}; new sale + payment plan, refunds netted`,
        note: 'This is the HQ dashboard’s sales-panel figure (via FC AI). It is not yet reconciled with what Commas and Whop collected — the Payments building is a placeholder until they are connected.',
      }),
      closer_close_rate: metric('closer_close_rate', 'Median close rate (held → paid)', p.team_medians.occurred_to_close_rate, raw, { unit: '%', scope: `${scope}; team median of ${p.team_size}` }),
      closer_show_rate: metric('closer_show_rate', 'Median interview show rate', p.team_medians.interview_show_rate, raw, { unit: '%', scope: `${scope}; team median` }),
      closer_cash_per_interview: metric('closer_cash_per_interview', 'Median cash per interview', p.team_medians.cash_per_interview_occurred_usd, raw, { unit: 'usd', scope: `${scope}; team median` }),
    },
    tables: {},
    private: {
      closers: p.rows.map((r) => ({ name: r.name, interviews: r.interviews_occurred, show_rate: r.interview_show_rate, closed: r.deals_closed_total, close_rate: r.occurred_to_close_rate, cash_usd: r.total_closer_revenue_cents })),
    },
  };
}

export function normalizeSetters(raw) {
  const p = raw?.payload;
  if (!p) return { metrics: {}, tables: {}, private: {} };
  const scope = `Setters, ${p.window.from} to ${p.window.to} (exclusive); team median of ${p.team_size}`;
  return {
    metrics: {
      setter_intro_show: metric('setter_intro_show', 'Median intro show rate', p.team_medians.intro_show_rate, raw, { unit: '%', scope }),
      setter_intro_to_close: metric('setter_intro_to_close', 'Median intro → close', p.team_medians.intro_to_close_rate, raw, { unit: '%', scope }),
      setter_on_call_dq: metric('setter_on_call_dq', 'Median on-call DQ rate', p.team_medians.on_call_dq_rate, raw, { unit: '%', scope }),
      setter_cash_per_intro: metric('setter_cash_per_intro', 'Median cash per intro', p.team_medians.cash_per_intro_usd, raw, { unit: 'usd', scope }),
      setters_below_45_show: metric('setters_below_45_show', 'Setters (30+ intros) under 45% show', p.rows.filter((r) => r.intros_scheduled >= 30 && r.intro_show_rate < 45).length, raw, { unit: 'setters', scope: scope.replace(/; team median.*/, '; setters with 30+ intros scheduled') }),
    },
    tables: {},
    private: {
      setters: p.rows.map((r) => ({ name: r.name, intros: r.intros_scheduled, show_rate: r.intro_show_rate, closed: r.closed, on_call_dq: r.on_call_dq_rate })),
    },
  };
}

export function normalizeAdmissions(raw) {
  const p = raw?.payload;
  if (!p) return { metrics: {}, tables: {} };
  const scope = `Interview calls ${raw.args.from} to ${raw.args.to}, read from transcripts`;
  const o = p.outcomes;
  const LABEL = { travel_format: 'Travel / format', time: 'Time', price: 'Price', partner_check: 'Partner check', fit_value: 'Fit / value', competitor: 'Competitor', timing: 'Timing', none_stated: 'None stated' };
  return {
    metrics: {
      interview_calls: metric('interview_calls', 'Interview calls read', p.calls, raw, { unit: 'calls', scope }),
      interview_join_rate: metric('interview_join_rate', 'Ended joined / committed', pct(o.joined_or_committed, p.calls), raw, { unit: '%', scope }),
      interview_travel_objection: metric('interview_travel_objection', 'Calls raising travel/format', pct(p.objections_raised.travel_format, p.calls), raw, { unit: '%', scope }),
    },
    tables: {
      outcomes: [
        { outcome: 'Joined / committed', calls: o.joined_or_committed },
        { outcome: 'Booked next step', calls: o.booked_next_step },
        { outcome: 'Thinking about it', calls: o.thinking_about_it },
        { outcome: 'Declined', calls: o.declined },
        { outcome: 'No engagement', calls: o.no_prospect_engagement },
      ],
      objections: Object.entries(p.objections_raised).map(([k, v]) => ({ objection: LABEL[k] || k, calls: v })).sort((a, b) => b.calls - a.calls),
    },
  };
}

export function normalizeAttribution(raw) {
  const p = raw?.payload;
  if (!p) return { metrics: {}, tables: {} };
  const scope = `Intro bookings ${p.window.start} to ${p.window.end}, last-touch`;
  const c = p.coverage;
  const fb = p.rows.find((r) => r.channel === 'paid' && r.person === 'facebook');
  const li = p.rows.find((r) => r.channel === 'outbound' && r.person === 'LinkedIn');
  const label = (r) => (r.person ? `${r.channel} · ${r.person}` : r.channel === 'unknown' ? 'unknown source' : `${r.channel} (no sender)`);
  return {
    metrics: {
      intro_bookings: metric('intro_bookings', 'Intro calls booked', c.intro_bookings, raw, { unit: 'bookings', scope }),
      unknown_source_share: metric('unknown_source_share', 'Bookings with unknown source', pct(c.last_touch_unknown, c.intro_bookings), raw, { unit: '%', scope }),
      fb_spend_usd: metric('fb_spend_usd', 'Facebook ad spend', fb ? Math.round(fb.cost_usd) : null, raw, { unit: 'usd', scope: `${p.window.start} to ${p.window.end}` }),
      fb_cost_per_close: metric('fb_cost_per_close', 'Facebook spend per last-touch close', fb && fb.closes_last ? Math.round(fb.cost_usd / fb.closes_last) : null, raw, {
        unit: 'usd', scope: `${scope}; worst case (all spend on last-touch closes)`,
      }),
      linkedin_qualified: metric('linkedin_qualified', 'LinkedIn qualified leads', li?.qualified_leads ?? null, raw, { unit: 'leads', scope: `${p.window.start} to ${p.window.end}` }),
    },
    tables: {
      channels: p.rows.filter((r) => r.bookings_last > 0)
        .map((r) => ({ channel: label(r), bookings: r.bookings_last, closes: r.closes_last, cost_usd: r.cost_usd == null ? null : Math.round(r.cost_usd) }))
        .sort((a, b) => b.bookings - a.bookings),
    },
  };
}

export function normalizeEvents(raw) {
  const p = raw?.payload;
  if (!p) return { metrics: {}, tables: {} };
  const scope = `Post-event surveys since ${raw.args.since}, all cities`;
  const responses = sum(p.aggregates.map((a) => a.responses));
  const promoters = sum(p.aggregates.map((a) => a.promoters));
  const detractors = sum(p.aggregates.map((a) => a.detractors));
  const nps = responses ? Math.round(((promoters - detractors) / responses) * 100) : null;
  const complete = responses === p.total_responses;
  return {
    metrics: {
      event_nps: { ...metric('event_nps', 'Event NPS', nps, raw, { unit: 'pts', scope: `${scope}; ${responses} responses` }), complete: raw.complete !== false && complete },
      event_responses: metric('event_responses', 'Survey responses', responses, raw, { unit: 'responses', scope }),
    },
    tables: {
      by_city: p.aggregates.map((a) => ({ city: a.city, kind: a.kind, responses: a.responses, avg_score: a.avg_score, nps: Math.round(((a.promoters - a.detractors) / a.responses) * 100) }))
        .sort((a, b) => b.responses - a.responses),
    },
  };
}

const OPEN = new Set(['to do', 'in progress']);

export function normalizeTasks(raw, nowMs) {
  const p = raw?.payload;
  if (!p) return { byList: {}, private: {} };
  const byList = {};
  const priv = {};
  for (const t of p.tasks) {
    const L = (byList[t.list] ??= { list: t.list, open: 0, in_progress: 0, on_pause: 0, ideas: 0, overdue: 0, overdue_urgent: 0, assigneeCounts: {} });
    if (OPEN.has(t.status)) L.open++;
    if (t.status === 'in progress') L.in_progress++;
    if (t.status === 'on pause') L.on_pause++;
    if (t.status === 'ideas') L.ideas++;
    for (const a of t.assignees) L.assigneeCounts[a] = (L.assigneeCounts[a] || 0) + 1;
    const overdue = OPEN.has(t.status) && t.due_ms && t.due_ms < nowMs;
    if (overdue) {
      L.overdue++;
      if (t.priority === 'urgent') L.overdue_urgent++;
      (priv[t.list] ??= []).push({
        name: t.name, url: t.url, priority: t.priority, status: t.status,
        due: new Date(t.due_ms).toISOString().slice(0, 10),
        days_late: Math.floor((nowMs - t.due_ms) / 86400000), assignees: t.assignees,
      });
    }
  }
  for (const L of Object.values(byList)) {
    const top = Object.entries(L.assigneeCounts).sort((a, b) => b[1] - a[1])[0];
    L.topAssignee = top ? top[0] : null;
    delete L.assigneeCounts;
  }
  for (const k of Object.keys(priv)) priv[k].sort((a, b) => b.days_late - a.days_late);
  return { byList, private: priv };
}

function taskMetrics(tasks, raw, list) {
  const L = tasks.byList[list];
  const scope = `ClickUp list “${list}”, open = to do / in progress`;
  if (!L) {
    return {
      overdue: metric(`overdue_${list}`, 'Overdue open tasks', null, raw, { unit: 'tasks', scope, missingReason: raw ? `No tasks in “${list}”` : 'ClickUp not read' }),
    };
  }
  return {
    overdue: metric(`overdue_${list}`, 'Overdue open tasks', L.overdue, raw, { unit: 'tasks', scope }),
    overdue_urgent: metric(`overdue_urgent_${list}`, 'Overdue urgent tasks', L.overdue_urgent, raw, { unit: 'tasks', scope }),
    open: metric(`open_${list}`, 'Open tasks (to do + in progress)', L.open, raw, { unit: 'tasks', scope }),
    on_pause: metric(`paused_${list}`, 'Paused tasks', L.on_pause, raw, { unit: 'tasks', scope }),
  };
}

// ---------- buildings ----------

// Owner = the person assigned most tasks in that department's ClickUp list (derived, not guessed),
// unless an explicit owner is set with the reason.
export const BUILDINGS = [
  { id: 'hq', name: 'HQ', short: 'HQ', kind: 'hq', blurb: 'The five-second numbers.' },
  { id: 'renewals', name: 'Renewals', short: 'Renewals', kind: 'bank', ownerOverride: { name: 'Chauncey Amaechi', why: 'assigned “Renewal Outreach Execution” in ClickUp' }, blurb: 'This month’s renewal book.' },
  { id: 'community', name: 'Community & RDs', short: 'Community', list: 'Community', blurb: 'What members tell their RD, and community tasks.' },
  { id: 'admissions', name: 'Admissions (Closers)', short: 'Closers', list: 'Admissions', blurb: 'Interviews → paid members.' },
  { id: 'setters', name: 'Setters (Front End)', short: 'Setters', list: 'Growth', blurb: 'Intro calls booked and shown.' },
  { id: 'marketing', name: 'Marketing & Growth', short: 'Marketing', list: 'Marketing & Product', blurb: 'Where intro bookings come from and what they cost.' },
  { id: 'events', name: 'Events & Partnerships', short: 'Events', list: 'Events & Partnerships', blurb: 'How events land with members.' },
  { id: 'fulfillment', name: 'Member Fulfillment', short: 'Fulfillment', list: 'Member Fulfillment Queue', blurb: 'Post-call follow-through for members.' },
  { id: 'operations', name: 'Operations', short: 'Ops', list: 'Operations', blurb: 'Tools, vendors, systems.' },
  { id: 'admin', name: 'Admin & People', short: 'Admin', list: 'Admin', blurb: 'Hiring, onboarding, staff support.' },
  { id: 'ai', name: 'CTO / AI', short: 'AI', list: 'CTO/AI', blurb: 'Internal product and AI work.' },
  {
    id: 'payments', name: 'Payments (Commas / Whop)', short: 'Payments', kind: 'placeholder',
    blurb: 'Placeholder until Commas and Whop are connected. Cash numbers come from the HQ dashboard for now.',
    noSource: 'Commas and Whop are not connected yet (placeholder)',
    planned: [['payments_today', 'Cash collected today', 'usd'], ['payments_mtd', 'Cash collected this month', 'usd'], ['payments_failed', 'Failed payments (7 days)', 'payments'],
      ['payments_refunds', 'Refunds (30 days)', 'usd'], ['payments_by_processor', 'Active subscriptions: Commas vs Whop', 'members']],
  },
  { id: 'cash', name: 'Cash & Finance', short: 'Cash', kind: 'bank', blurb: 'Bank balance, money owed, money owing.', noSource: 'No accounting or bank connector is connected yet' },
];

/**
 * Build the whole snapshot.
 * @param {Record<string, object>} raws  raw reads keyed by source id (missing = not read)
 * @param {number} nowMs                 the "as of" clock, injected for testability
 */
export function buildSnapshot(raws, nowMs) {
  const r = Object.fromEntries(Object.entries(raws).map(([k, v]) => [k, v ? { ...v, __id: k } : v]));

  const community = normalizeCommunity(r.fcai_community_pulse);
  const renewals = normalizeRenewals(r.fcai_renewal_diagnosis);
  const rd = normalizeRdRisk(r.fcai_rd_book_risk);
  const closers = normalizeClosers(r.fcai_staff_closer);
  const setters = normalizeSetters(r.fcai_staff_setter);
  const admissions = normalizeAdmissions(r.fcai_admissions);
  const attribution = normalizeAttribution(r.fcai_attribution);
  const events = normalizeEvents(r.fcai_event_feedback);
  const tasks = normalizeTasks(r.clickup_tasks, nowMs);
  const engagement = normalizeEngagement(r.fcai_member_engagement);
  const pulse = normalizePulse(r.fcai_member_pulse);
  const joins = normalizeJoins(r.fcai_joins_by_month, closers.metrics.new_members_closed?.value ?? null);
  const pipeline = normalizePipeline(r.fcai_pipeline_prospects, nowMs);
  const fathom = normalizeFathom(r.fathom_calls);
  const slack = normalizeSlack(r.slack_channels);
  const activeByTerritory = Object.fromEntries(Object.entries(r.fcai_community_pulse?.payload?.by_sales_territory || {})
    .map(([t, v]) => [t, { value: v, raw: r.fcai_community_pulse }]));
  const regions = normalizeRegions(r.fcai_renewal_book_last, r.fcai_renewal_book_this, activeByTerritory);
  const bookThis = bookRate(r.fcai_renewal_book_this, 'renewals_book_rate', 'Renewal rate this month');
  const bookLast = bookRate(r.fcai_renewal_book_last, 'renewals_book_rate_last', 'Renewal rate last month (final)');

  const M = {
    ...community.metrics, ...renewals.metrics, ...rd.metrics, ...closers.metrics,
    ...setters.metrics, ...admissions.metrics, ...attribution.metrics, ...events.metrics,
    renewals_book_rate: bookThis, renewals_book_rate_last: bookLast,
    ...engagement.metrics, ...pulse.metrics, ...joins.metrics, ...pipeline.metrics, ...fathom.metrics, ...slack.metrics,
  };

  const missing = (id, label, unit, reason) => metric(id, label, null, null, { unit, missingReason: reason });

  // Which metrics each building shows, and which ones are judged by which rule.
  const spec = {
    hq: { show: ['active_members', 'renewals_book_rate', 'new_members_closed', 'new_member_cash_usd', 'rd_said_leaving'], judge: [] },
    renewals: {
      show: ['renewals_book_rate', 'renewals_book_rate_last', 'renewals_voluntary_rate', 'renewals_renewed', 'renewals_book', 'renewals_collected_usd', 'renewals_worth_call', 'renewals_worth_call_usd', 'renewals_silent_churn', 'renewals_silent_churn_usd', 'renewals_payment_failures'],
      judge: [['renewals_book_rate', 'renewal_rate'], ['renewals_book_rate_last', 'renewal_rate_last'], ['renewals_payment_failures', 'renewals_payment_failures']],
    },
    community: {
      show: ['rd_said_leaving', 'rd_undecided', 'rd_leaving_frustrated', 'pulse_frustrated', 'pulse_disengaging', 'pulse_thriving', 'engagement_score',
        'on_slack_pct', 'app_used_30d_pct', 'mastermind_seated_pct', 'rd_sos_30d', 'rd_sos_unanswered', 'calls_rd_2d', 'active_members'],
      judge: [['rd_said_leaving', 'rd_said_leaving'], ['pulse_frustrated', 'pulse_frustrated'], ['app_used_30d_pct', 'app_used_30d_pct'], ['rd_sos_unanswered', 'rd_sos_unanswered']],
    },
    admissions: {
      show: ['new_members_closed', 'joins_last_month_ledger', 'new_member_cash_usd', 'closer_close_rate', 'closer_show_rate', 'interview_join_rate', 'interview_travel_objection',
        'hot_not_closed', 'outcome_missing_3d', 'not_closed_since_oct1', 'calls_interview_2d'],
      judge: [['closer_close_rate', 'closer_close_rate'], ['interview_join_rate', 'interview_join_rate'], ['outcome_missing_3d', 'outcome_missing_3d']],
    },
    setters: { show: ['setter_intro_show', 'setter_intro_to_close', 'setter_on_call_dq', 'setter_cash_per_intro', 'setters_below_45_show', 'calls_intro_2d'], judge: [['setter_intro_show', 'setter_intro_show']] },
    marketing: { show: ['intro_bookings', 'unknown_source_share', 'fb_spend_usd', 'fb_cost_per_close', 'linkedin_qualified'], judge: [['unknown_source_share', 'unknown_source_share']] },
    events: { show: ['event_nps', 'event_responses'], judge: [['event_nps', 'event_nps']] },
    fulfillment: { show: ['joins_this_month', 'calls_onboarding_2d', 'welcome_intros_7d', 'member_support_moved'], judge: [] },
    operations: { show: [], judge: [] },
    admin: { show: [], judge: [] },
    ai: { show: [], judge: [] },
    payments: { show: [], judge: [] },
    cash: { show: [], judge: [] },
  };

  const buildings = BUILDINGS.map((b) => {
    const s = spec[b.id];
    const metrics = s.show.map((id) => M[id] ?? missing(id, id, '', 'Source not read'));
    const checks = s.judge.map(([mid, rid]) => ({ metricId: mid, ruleId: rid, ...judge(M[mid], rid) }));

    if (b.list) {
      const tm = taskMetrics(tasks, r.clickup_tasks, b.list);
      metrics.push(...Object.values(tm));
      checks.push({ metricId: tm.overdue.id, ruleId: 'overdue_tasks', ...judge(tm.overdue, 'overdue_tasks') });
      if (tm.overdue_urgent) checks.push({ metricId: tm.overdue_urgent.id, ruleId: 'overdue_urgent_tasks', ...judge(tm.overdue_urgent, 'overdue_urgent_tasks') });
    }
    if (b.planned) {
      for (const [id, label, unit] of b.planned) metrics.push(missing(id, label, unit, b.noSource));
    } else if (b.noSource) {
      metrics.push(missing('cash_balance', 'Cash in bank', 'usd', b.noSource));
      metrics.push(missing('receivables', 'Money owed to us', 'usd', b.noSource));
      metrics.push(missing('payables', 'Money we owe', 'usd', b.noSource));
    }

    const L = b.list ? tasks.byList[b.list] : null;
    const owner = b.ownerOverride
      ? { name: b.ownerOverride.name, why: b.ownerOverride.why }
      : L?.topAssignee ? { name: L.topAssignee, why: `most-assigned in ClickUp “${b.list}”` } : { name: null, why: 'No owner on record' };

    const status = b.kind === 'hq' ? 'hq' : worst(checks.map((c) => c.status));
    return { id: b.id, name: b.name, short: b.short, kind: b.kind || 'dept', list: b.list ?? null, blurb: b.blurb, owner, status, checks, metrics };
  });

  // One small house per sales territory, coloured by last month's final renewal rate against the 75% target.
  for (const g of regions) {
    const checks = [
      { metricId: g.metrics.last_rate.id, ruleId: 'renewal_rate_last', ...judge(g.metrics.last_rate, 'renewal_rate_last') },
      { metricId: g.metrics.this_rate.id, ruleId: 'renewal_rate_region', ...judge(g.metrics.this_rate, 'renewal_rate_region') },
    ];
    buildings.push({
      id: g.id, name: g.territory.replace(/^Rep \d+ — /, ''), short: g.short, kind: 'region', list: null,
      blurb: `Sales territory ${g.territory}: renewals against the 75% target.`,
      owner: { name: null, why: 'Territory rep (not named in the renewal book)' },
      status: worst(checks.map((c) => c.status)), checks, metrics: Object.values(g.metrics),
    });
  }

  const alerts = buildAlerts({ M, buildings, tasks });
  const missedLast = buildings.filter((b) => b.kind === 'region' && b.checks[0]?.status === 'amber');
  if (missedLast.length) {
    alerts.push({
      id: 'regions_missed_last_month', buildingId: missedLast[0].id, status: 'amber',
      title: `${missedLast.length} of ${REGIONS.length} regions finished last month under the 75% renewal target`,
      detail: missedLast.map((b) => `${b.short} ${b.metrics.find((m) => m.id.endsWith('_last_rate')).value}%`).join(' · '),
      costUsd: null, costLabel: `${M.renewals_book_rate_last?.value ?? '—'}% club-wide last month`,
      nextStep: 'Each territory rep works this month’s open renewals, furthest-behind regions first.',
      owner: 'Territory reps; Chauncey Amaechi for the club', metricId: missedLast[0].metrics[0].id,
    });
  }
  const below = buildings.filter((b) => b.kind === 'region' && b.status === 'red');
  if (below.length) {
    alerts.unshift({
      id: 'regions_below_target', buildingId: below[0].id, status: 'red',
      title: `${below.length} region${below.length === 1 ? ' is' : 's are'} under 60% renewals this month (target 75%)`,
      detail: below.map((b) => `${b.short} ${b.metrics.find((m) => m.id.endsWith('_this_rate')).value}%`).join(' · '),
      costUsd: null, costLabel: `${M.renewals_book_rate_last?.value ?? '—'}% club-wide last month`,
      nextStep: 'Each territory rep works this month’s open renewals; start with the regions furthest below target.',
      owner: 'Territory reps; Chauncey Amaechi for the club', metricId: below[0].metrics[0].id,
    });
  }

  const sources = Object.entries(SOURCES).map(([id, s]) => {
    const raw = r[id];
    const ageHours = raw?.readAt ? (nowMs - Date.parse(raw.readAt)) / 3600000 : null;
    return {
      id, name: s.name, freshnessHours: s.freshnessHours,
      readAt: raw?.readAt ?? null,
      ok: Boolean(raw) && raw.complete !== false,
      error: !raw ? 'Not read' : raw.complete === false ? 'Read was incomplete' : null,
      note: raw?.note ?? null,
    };
  });

  decorateForTown(buildings, alerts, M, tasks);

  return {
    builtAt: new Date(nowMs).toISOString(),
    question: 'Are we growing the club this month?',
    topNumbers: spec.hq.show.map((id) => M[id] ?? missing(id, id, '', 'Source not read')),
    buildings,
    alerts,
    sources,
    tables: {
      community: { ...community.tables, rd_by_territory: rd.tables.by_territory },
      renewals: renewals.tables,
      admissions: admissions.tables,
      marketing: attribution.tables,
      events: events.tables,
      tasks: Object.values(tasks.byList).sort((a, b) => b.overdue - a.overdue),
      engagement: { ...engagement.tables, ...pulse.tables },
      joins: joins.tables,
      pipeline: pipeline.tables,
      calls: fathom.tables,
      regions: regions.map((g) => ({ id: g.id, ...g.row, status: buildings.find((b) => b.id === g.id)?.status })),
    },
    private: {
      ...renewals.private, ...rd.private, ...closers.private, ...setters.private,
      overdue_tasks: tasks.private,
      ...pipeline.private,
    },
  };
}

// ---------- town: key number, height, flags ----------

// The one number on each building's floating tag.
const KEY = {
  hq: ['active_members', 'members'], renewals: ['renewals_book_rate', 'renewed this month'], community: ['rd_said_leaving', 'said they’re leaving'],
  admissions: ['new_members_closed', 'closed last month'], setters: ['setter_intro_show', 'intro show rate'], marketing: ['intro_bookings', 'intros booked'],
  events: ['event_nps', 'event NPS'], fulfillment: ['joins_this_month', 'new members this month'],
};
// Height = how much is going on, on a capped scale (the legend explains it).
export const VOLUME_CAPS = { tasks: 40, renewals: 150, members: 400 };

export function decorateForTown(buildings, alerts, M, tasks) {
  for (const b of buildings) {
    const own = alerts.filter((a) => a.buildingId === b.id);
    b.flags = { count: own.length, status: own.some((a) => a.status === 'red') ? 'red' : own.length ? 'amber' : null };
    let key = null;
    if (KEY[b.id]) key = { metricId: KEY[b.id][0], caption: KEY[b.id][1] };
    else if (b.list) key = { metricId: `overdue_${b.list}`, caption: 'overdue tasks' };
    else if (b.kind === 'region') {
      const cur = b.metrics.find((m) => m.id.endsWith('_this_rate'));
      key = (cur?.sample ?? 0) >= 5
        ? { metricId: cur.id, caption: 'renewed this month' }
        : { metricId: b.metrics.find((m) => m.id.endsWith('_last_rate')).id, caption: 'renewed last month' };
    }
    b.key = key;
    if (b.list && tasks.byList[b.list]) b.volume = { value: tasks.byList[b.list].open, cap: VOLUME_CAPS.tasks, unit: 'open tasks' };
    else if (b.id === 'renewals' && M.renewals_book?.value != null) b.volume = { value: M.renewals_book.value, cap: VOLUME_CAPS.renewals, unit: 'renewals due this month' };
    else if (b.kind === 'region') {
      const a = b.metrics.find((m) => m.id.endsWith('_active'));
      b.volume = a?.value != null ? { value: a.value, cap: VOLUME_CAPS.members, unit: 'active members' } : null;
    } else b.volume = null;
  }
}

// ---------- alerts ----------

const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * Everything red or amber, ranked by cost of delay:
 * status first, then dollars at stake (when the data gives a dollar figure), then how many people/tasks.
 */
export function buildAlerts({ M, buildings, tasks }) {
  const B = Object.fromEntries(buildings.map((b) => [b.id, b]));
  const out = [];
  const check = (bid, mid) => B[bid]?.checks.find((c) => c.metricId === mid);
  const ownerOf = (bid) => B[bid]?.owner?.name || 'Unassigned';

  const add = (a) => { if (a.status === 'red' || a.status === 'amber') out.push(a); };

  // Renewals: open book worth a call this week.
  if (M.renewals_worth_call?.value) {
    const c = check('renewals', 'renewals_voluntary_rate');
    add({
      id: 'renewals_worth_call', buildingId: 'renewals', status: c?.status === 'grey' ? 'amber' : c?.status ?? 'amber',
      title: `${M.renewals_worth_call.value} open renewals are engaged and worth a call`,
      detail: `Voluntary renewal rate so far is ${M.renewals_voluntary_rate.value}% with ${M.renewals_open.value} still open.`,
      costUsd: M.renewals_worth_call_usd.value, costLabel: `${usd(M.renewals_worth_call_usd.value)} plan value open`,
      nextStep: 'Work the “worth a call” list this week, highest plan value first.',
      owner: ownerOf('renewals'), metricId: 'renewals_worth_call', privateList: 'renewals_worth_call',
    });
  }
  if (M.renewals_silent_churn?.value) {
    add({
      id: 'renewals_silent', buildingId: 'renewals', status: 'amber',
      title: `${M.renewals_silent_churn.value} members left this month with nothing on record`,
      detail: 'No call, support thread or note in their own words before they went.',
      costUsd: M.renewals_silent_churn_usd.value, costLabel: `${usd(M.renewals_silent_churn_usd.value)} plan value lost`,
      nextStep: 'Book exit conversations; add them to the weekly churn review.',
      owner: 'Ivan Dukovski (assigned “Weekly Review of Churned Members” in ClickUp)',
      metricId: 'renewals_silent_churn', privateList: 'renewals_silent_churn',
    });
  }

  // Community: members who told their RD they're leaving.
  const rdc = check('community', 'rd_said_leaving');
  if (rdc) {
    add({
      id: 'rd_leaving', buildingId: 'community', status: rdc.status,
      title: `${M.rd_said_leaving.value} members told an RD they're leaving (${M.rd_leaving_frustrated.value} frustrated)`,
      detail: `${M.rd_undecided.value} more are undecided. ${rdc.reason}.`,
      costUsd: null, costLabel: 'Plan value not in this read',
      nextStep: 'Each RD calls back their frustrated “leaving” members first; verify against RD notes.',
      owner: 'Each territory’s RD', metricId: 'rd_said_leaving', privateList: 'rd_leaving',
    });
  }

  // Admissions / setters / marketing / events: one alert per failing rule.
  const ruleAlerts = [
    ['admissions', 'closer_close_rate', 'Closer close rate is below target', 'Review the bottom closers’ calls against the top two; check follow-up close rate.'],
    ['admissions', 'interview_join_rate', 'Fewer interviews end with a join', `Travel/format comes up on ${M.interview_travel_objection?.value}% of calls — prepare a format answer for the pitch.`],
    ['setters', 'setter_intro_show', 'Intro show rate is below target', `${M.setters_below_45_show?.value ?? '—'} setters (30+ intros) are under 45% show; coach or rebalance their calendars.`],
    ['marketing', 'unknown_source_share', 'Too many bookings have no known source', 'Fix tracking on the booking forms so spend can be judged.'],
    ['events', 'event_nps', 'Event scores are slipping', 'Read the detractor comments by city.'],
    ['community', 'pulse_frustrated', `${M.pulse_frustrated?.value ?? '—'} members are frustrated in their own words (Slack, support)`, 'RDs read each member’s evidence quote and reach out; check overlap with the “leaving” list.'],
    ['community', 'app_used_30d_pct', 'Fewer members are using the app', 'Promote the next events and announcements in the app.'],
    ['community', 'rd_sos_unanswered', 'An RD SOS post has no reply', 'Answer it in #team-rd-sos today.'],
    ['admissions', 'outcome_missing_3d', `${M.outcome_missing_3d?.value ?? '—'} interviews have no outcome in GHL after 3+ days`, 'Closers record the outcome on each card so the pipeline and dashboard are right.', 'pipeline_no_outcome'],
  ];
  for (const [bid, mid, title, nextStep, privateList] of ruleAlerts) {
    const c = check(bid, mid);
    if (!c) continue;
    add({
      id: `${bid}_${mid}`, buildingId: bid, status: c.status, title, detail: c.reason,
      costUsd: null,
      costLabel: mid === 'unknown_source_share' && M.fb_spend_usd?.value ? `${usd(M.fb_spend_usd.value)} Facebook spend in the window` : '—',
      nextStep, owner: ownerOf(bid), metricId: mid, ...(privateList ? { privateList } : {}),
    });
  }

  // Overdue tasks per department.
  for (const b of buildings) {
    const c = b.checks.find((x) => x.ruleId === 'overdue_tasks');
    if (!c) continue;
    const urgent = b.checks.find((x) => x.ruleId === 'overdue_urgent_tasks');
    const status = worst([c.status, urgent?.status ?? 'grey']);
    const L = tasks.byList[b.list];
    if (!L || L.overdue === 0) continue;
    add({
      id: `tasks_${b.id}`, buildingId: b.id, status,
      title: `${b.name}: ${L.overdue} overdue task${L.overdue === 1 ? '' : 's'}${L.overdue_urgent ? ` (${L.overdue_urgent} urgent)` : ''}`,
      detail: `In ClickUp “${b.list}”.`,
      costUsd: null, costLabel: '—',
      nextStep: 'Re-date or close each overdue task; urgent ones first.',
      owner: b.owner.name || 'Unassigned', metricId: `overdue_${b.list}`, privateList: `overdue_tasks:${b.list}`,
    });
  }

  const rank = { red: 2, amber: 1 };
  return out.sort((a, b) =>
    rank[b.status] - rank[a.status] || (b.costUsd ?? -1) - (a.costUsd ?? -1) || a.title.localeCompare(b.title));
}
