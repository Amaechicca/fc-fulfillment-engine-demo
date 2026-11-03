// Display helpers shared by the page. No business logic here.

export const STATUS_TEXT = {
  red: { icon: '✕', word: 'Act now' },
  amber: { icon: '!', word: 'Watch' },
  green: { icon: '✓', word: 'On track' },
  grey: { icon: '–', word: 'No data' },
  hq: { icon: '★', word: 'Headquarters' },
};

export function formatValue(m, { compact = false } = {}) {
  if (!m || m.value === null || m.value === undefined) return '—';
  const v = m.value;
  switch (m.unit) {
    case 'usd':
      if (compact && Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
      if (compact && Math.abs(v) >= 1e4) return `$${Math.round(v / 1e3)}k`;
      return `$${Math.round(v).toLocaleString('en-US')}`;
    case '%': return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
    case 'pts': return `${v}`;
    default: return Number(v).toLocaleString('en-US');
  }
}

export function ago(iso, nowMs = Date.now()) {
  if (!iso) return 'never read';
  const mins = Math.round((nowMs - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function when(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

/** "FC AI · closer panel · read 2 h ago · Closers, Oct 1–Nov 1" */
export function provenance(m) {
  if (!m) return '';
  if (m.value === null || m.value === undefined) return `No number: ${m.missingReason || 'not read'}`;
  const parts = [m.source, `read ${ago(m.readAt)}`, m.scope].filter(Boolean);
  return parts.join(' · ');
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function pill(status) {
  const t = STATUS_TEXT[status] || STATUS_TEXT.grey;
  return `<span class="pill ${status}"><i aria-hidden="true"></i>${t.icon} ${t.word}</span>`;
}
