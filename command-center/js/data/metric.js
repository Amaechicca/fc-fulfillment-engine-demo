// Shared: the source registry and the metric shape every number travels in.

export const SOURCES = {
  fcai_community_pulse: { name: 'FC AI · community totals', freshnessHours: 24 },
  fcai_renewal_diagnosis: { name: 'FC AI · renewal book & diagnosis', freshnessHours: 24 },
  fcai_rd_book_risk: { name: 'FC AI · RD check-in risk', freshnessHours: 24 },
  fcai_staff_closer: { name: 'FC AI · closer panel', freshnessHours: 24 },
  fcai_staff_setter: { name: 'FC AI · setter panel', freshnessHours: 24 },
  fcai_admissions: { name: 'FC AI · interview call outcomes', freshnessHours: 24 },
  fcai_attribution: { name: 'FC AI · channel attribution', freshnessHours: 24 },
  fcai_event_feedback: { name: 'FC AI · event feedback', freshnessHours: 168 },
  clickup_tasks: { name: 'ClickUp · Projects By Department', freshnessHours: 24 },
  fcai_member_engagement: { name: 'FC AI · member engagement (GHL, Slack, app)', freshnessHours: 24 },
  fcai_member_pulse: { name: 'FC AI · member pulse (Slack & support words)', freshnessHours: 168 },
  fcai_joins_by_month: { name: 'FC AI · membership ledger (joins)', freshnessHours: 24 },
  fcai_pipeline_prospects: { name: 'FC AI · interview pipeline (GHL outcomes)', freshnessHours: 24 },
  fathom_calls: { name: 'Fathom · recorded calls', freshnessHours: 24 },
  slack_channels: { name: 'Slack · RD SOS & welcome channels', freshnessHours: 24 },
};

// ---------- helpers ----------

export function metric(id, label, value, raw, { unit = '', scope = '', sample, note, context, missingReason } = {}) {
  return {
    id, label, value: value ?? null, unit,
    sourceId: raw?.__id ?? null,
    source: raw ? SOURCES[raw.__id]?.name ?? raw.__id : null,
    readAt: raw?.readAt ?? null,
    scope,
    complete: raw ? raw.complete !== false : false,
    ...(sample !== undefined ? { sample } : {}),
    ...(note ? { note } : {}),
    ...(context ? { context } : {}),
    ...(missingReason || !raw || value === null || value === undefined
      ? { missingReason: missingReason || (!raw ? 'Source not read' : 'Not in this read') } : {}),
  };
}

export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
export const sum = (xs) => xs.reduce((a, b) => a + (Number(b) || 0), 0);

export function monthLabel(isoMonth) {
  const [y, m] = isoMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

