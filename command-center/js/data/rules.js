// Red / amber / green rules. One place to change a threshold.
// Every threshold here is an ASSUMPTION until approved in PLAN.md (see "Open questions").
// Status meanings: green = on track, amber = watch, red = act now, grey = no data / read incomplete.

export const STATUS_ORDER = { red: 3, amber: 2, green: 1, grey: 0 };

export const RULES = {
  renewals_voluntary_rate: {
    label: 'Voluntary renewal rate (this month, decided outcomes)',
    higherIsBetter: true, green: 70, amber: 50, unit: '%',
    minSample: 20, // decided outcomes needed before we judge the rate
  },
  // Renewal target from leadership: 75%, judged per region. The amber band (60–75%) is an assumption.
  renewal_rate: {
    label: 'Renewal rate (renewed ÷ renewed + not renewed)', higherIsBetter: true, green: 75, amber: 60, unit: '%', minSample: 20,
  },
  renewal_rate_region: {
    label: 'Region renewal rate', higherIsBetter: true, green: 75, amber: 60, unit: '%', minSample: 5,
  },
  renewals_payment_failures: {
    label: 'Renewals lost to payment failure', higherIsBetter: false, green: 0, amber: 2, unit: 'members',
  },
  rd_said_leaving: {
    label: 'Members who told an RD they are leaving (60 days)', higherIsBetter: false, green: 10, amber: 25, unit: 'members',
  },
  closer_close_rate: {
    label: 'Closer median: interviews held → paid', higherIsBetter: true, green: 20, amber: 15, unit: '%',
  },
  setter_intro_show: {
    label: 'Setter median intro show rate', higherIsBetter: true, green: 55, amber: 45, unit: '%',
  },
  interview_join_rate: {
    label: 'Interview calls that ended joined/committed', higherIsBetter: true, green: 30, amber: 20, unit: '%',
  },
  unknown_source_share: {
    label: 'Intro bookings with unknown source', higherIsBetter: false, green: 10, amber: 20, unit: '%',
  },
  event_nps: {
    label: 'Event NPS (promoters − detractors)', higherIsBetter: true, green: 50, amber: 30, unit: 'pts',
  },
  pulse_frustrated: {
    label: 'Members frustrated in their own words', higherIsBetter: false, green: 20, amber: 50, unit: 'members',
  },
  app_used_30d_pct: {
    label: 'Active members who used the app in 30 days', higherIsBetter: true, green: 60, amber: 40, unit: '%',
  },
  rd_sos_unanswered: {
    label: 'RD SOS posts with no reply', higherIsBetter: false, green: 0, amber: 0, unit: 'posts',
  },
  outcome_missing_3d: {
    label: 'Interviews with no outcome recorded after 3+ days', higherIsBetter: false, green: 3, amber: 10, unit: 'prospects',
  },
  overdue_tasks: {
    label: 'Overdue open ClickUp tasks', higherIsBetter: false, green: 2, amber: 5, unit: 'tasks',
  },
  overdue_urgent_tasks: {
    label: 'Overdue urgent ClickUp tasks', higherIsBetter: false, green: 0, amber: 0, unit: 'tasks',
  },
};

/**
 * Judge one metric against one rule.
 * Never judges a number whose read was incomplete or missing (returns grey + reason).
 */
export function judge(metric, ruleId) {
  const rule = RULES[ruleId];
  if (!rule) throw new Error(`Unknown rule: ${ruleId}`);
  if (!metric || metric.value === null || metric.value === undefined || Number.isNaN(metric.value)) {
    return { status: 'grey', reason: metric?.missingReason || 'No data read' };
  }
  if (metric.complete === false) {
    return { status: 'grey', reason: 'Read was incomplete — not judged' };
  }
  if (rule.minSample && (metric.sample ?? Infinity) < rule.minSample) {
    return { status: 'grey', reason: `Only ${metric.sample} decided so far — too few to judge (needs ${rule.minSample})` };
  }
  const v = metric.value;
  let status;
  if (rule.higherIsBetter) {
    status = v >= rule.green ? 'green' : v >= rule.amber ? 'amber' : 'red';
  } else {
    status = v <= rule.green ? 'green' : v <= rule.amber ? 'amber' : 'red';
  }
  return { status, reason: describe(rule, v, status) };
}

function describe(rule, v, status) {
  const u = rule.unit === '%' ? '%' : rule.unit === 'pts' ? '' : ` ${rule.unit}`;
  if (rule.higherIsBetter) {
    return `${fmt(v)}${u} — green at ${rule.green}${u}+, amber at ${rule.amber}${u}+ (${status})`;
  }
  return `${fmt(v)}${u} — green at ${rule.green}${u} or fewer, amber up to ${rule.amber}${u} (${status})`;
}

function fmt(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Worst status of a list; grey only if everything is grey. */
export function worst(statuses) {
  const known = statuses.filter((s) => s !== 'grey');
  if (known.length === 0) return 'grey';
  return known.reduce((a, b) => (STATUS_ORDER[b] > STATUS_ORDER[a] ? b : a), 'green');
}
