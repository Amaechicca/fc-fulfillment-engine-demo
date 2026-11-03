// Page wiring: load the snapshot, render numbers, alerts, tabs; hand buildings to the 3D town.
import { formatValue, provenance, ago, when, esc, pill, STATUS_TEXT } from './data/format.js';
import { barChart, table } from './charts.js';
import { createTown } from './town.js';

const $ = (s) => document.querySelector(s);
const FETCH_TIMEOUT_MS = 8000;

const state = { snap: null, priv: null, privError: null, hideNames: true, selected: null, tab: 'hq', town: null };

async function fetchJson(url, ms = FETCH_TIMEOUT_MS) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? `timed out after ${ms / 1000}s` : e.message);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- banner ----------

function renderBanner(loadError) {
  const el = $('#banner');
  const items = [];
  if (loadError) items.push(`Could not load the numbers (${esc(loadError)}). Nothing below is current.`);
  if (state.snap) {
    for (const s of state.snap.sources) {
      if (!s.ok) items.push(`<b>${esc(s.name)}</b>: ${esc(s.error)} — numbers from it are blank and not judged.`);
      else {
        const hours = (Date.now() - Date.parse(s.readAt)) / 3600000;
        if (hours > s.freshnessHours) items.push(`<b>${esc(s.name)}</b> was read ${ago(s.readAt)}, older than its ${s.freshnessHours === 24 ? 'daily' : `${s.freshnessHours} h`} target.`);
      }
    }
  }
  if (!items.length) { el.hidden = true; return; }
  el.hidden = false;
  el.className = `banner${loadError || state.snap?.sources.some((s) => !s.ok) ? ' bad' : ''}`;
  el.innerHTML = `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>
    <button type="button" id="retry">Try again</button>
    <span class="small muted">Try again re-reads the snapshot. To re-read FC AI and ClickUp, run the refresh in the README.</span>`;
  $('#retry').addEventListener('click', () => location.reload());
}

// ---------- five numbers ----------

function renderTop() {
  $('#q').textContent = state.snap.question;
  $('#topNumbers').innerHTML = state.snap.topNumbers.map((m) => `
    <div class="tile">
      <div class="lab">${esc(m.label)}</div>
      <div class="val">${formatValue(m, { compact: true })}</div>
      ${m.context ? `<div class="ctx">${esc(m.context)}</div>` : ''}
      <details class="prov"><summary>${m.complete === false ? '<span class="warn">Incomplete read · </span>' : ''}${m.value === null ? esc(m.missingReason || 'Not read') : `${esc(m.source)} · ${ago(m.readAt)}`}</summary>${esc(m.scope || '')}${m.note ? `<br>Note: ${esc(m.note)}` : ''}</details>
    </div>`).join('');
}

// ---------- a building's numbers (used by the detail card and the tabs) ----------

function metricCard(m) {
  return `<div class="m${m.value === null ? ' missing' : ''}">
    <div class="lab">${esc(m.label)}</div>
    <div class="val">${formatValue(m)}</div>
    <div class="prov">${m.complete === false ? '<span class="warn">Incomplete read · </span>' : ''}${esc(provenance(m))}${m.note ? `<br>Note: ${esc(m.note)}` : ''}</div>
  </div>`;
}

function areaSummary(b) {
  const checks = b.checks.length
    ? `<ul class="checks">${b.checks.map((c) => {
      const m = b.metrics.find((x) => x.id === c.metricId);
      return `<li>${pill(c.status)} <span><b>${esc(m?.label || c.metricId)}</b>: ${esc(c.reason)}</span></li>`;
    }).join('')}</ul>`
    : '';
  return `
    <p class="owner">Owner: ${b.owner?.name ? `<b>${esc(b.owner.name)}</b> <span class="muted">(${esc(b.owner.why)})</span>` : '<span class="muted">none on record</span>'}</p>
    ${checks}
    <div class="mgrid">${b.metrics.map(metricCard).join('') || '<p class="empty">No numbers for this area yet.</p>'}</div>`;
}

// ---------- names (private, optional) ----------

function namesBlock(key, columns, title) {
  const wrap = document.createElement('div');
  const h = document.createElement('h4');
  h.className = 'subH'; h.textContent = title;
  wrap.appendChild(h);
  if (state.hideNames) { wrap.insertAdjacentHTML('beforeend', '<p class="empty">Names hidden. Turn off “Hide names” to see who.</p>'); return wrap; }
  if (!state.priv) { wrap.insertAdjacentHTML('beforeend', `<p class="empty">Names are not on this copy (${esc(state.privError || 'private file not present')}). They are kept out of the shared repository.</p>`); return wrap; }
  const [k, sub] = key.split(':');
  const rows = sub ? state.priv[k]?.[sub] : state.priv[k];
  wrap.appendChild(table(rows || [], columns));
  return wrap;
}

const fmtUsd = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
const fmtPct = (v) => `${v}%`;
const taskLink = (v, r) => `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(v)}</a>`;

const PRIVATE_LISTS = {
  renewals_worth_call: { title: 'Open renewals worth a call', cols: [['name', 'Member'], ['territory', 'Territory'], ['plan_value_usd', 'Plan value', true, fmtUsd], ['due', 'Due'], ['slack_days_28d', 'Slack days (28d)', true], ['pulse', 'Pulse']] },
  renewals_silent_churn: { title: 'Left with nothing on record', cols: [['name', 'Member'], ['territory', 'Territory'], ['plan_value_usd', 'Plan value', true, fmtUsd], ['left', 'Left']] },
  rd_leaving: { title: 'Told an RD they are leaving', cols: [['name', 'Member'], ['territory', 'Territory'], ['call_date', 'Call'], ['frustrated', 'Frustrated', false, (v) => (v ? 'Yes' : 'No')], ['confidence', 'Confidence', true]] },
  closers: { title: 'Closers', cols: [['name', 'Closer'], ['interviews', 'Interviews', true], ['show_rate', 'Show %', true, fmtPct], ['closed', 'Closed', true], ['close_rate', 'Close %', true, fmtPct], ['cash_usd', 'Cash', true, fmtUsd]] },
  pipeline_hot: { title: 'Flagged hot, not closed (Oct 29 on)', cols: [['name', 'Prospect'], ['interviewed', 'Interviewed']] },
  pipeline_no_outcome: { title: 'No outcome recorded after 3+ days', cols: [['name', 'Prospect'], ['interviewed', 'Interviewed'], ['days', 'Days', true]] },
  setters: { title: 'Setters (30+ intros)', cols: [['name', 'Setter'], ['intros', 'Intros', true], ['show_rate', 'Show %', true, fmtPct], ['closed', 'Closed', true], ['on_call_dq', 'On-call DQ %', true, fmtPct]] },
};
const taskCols = [['name', 'Task', false, taskLink], ['assignees', 'Assigned'], ['priority', 'Priority'], ['due', 'Due'], ['days_late', 'Days late', true]];

// ---------- detail card ----------

function select(id) {
  state.selected = id;
  const b = state.snap.buildings.find((x) => x.id === id);
  const el = $('#detail');
  if (!b) { el.hidden = true; return; }
  state.town?.select(id);
  const alerts = state.snap.alerts.filter((a) => a.buildingId === id);
  el.hidden = false;
  el.innerHTML = `
    <div class="detailHead">
      <div><h3>${esc(b.name)}</h3><div>${pill(b.status)} <span class="muted small">${esc(b.blurb)}</span></div></div>
      <button type="button" class="closeBtn" aria-label="Close">✕</button>
    </div>
    ${b.id === 'hq' ? '<p class="owner">The five numbers at the top of the page.</p><div class="mgrid">' + state.snap.topNumbers.map(metricCard).join('') + '</div>' : areaSummary(b)}
    <h4 class="subH">Needs action</h4>
    ${alerts.length ? `<ol class="alerts">${alerts.map(alertItem).join('')}</ol>` : '<p class="empty">Nothing red or amber here.</p>'}
    <p><button type="button" class="linkBtn" id="openTab">Open the ${esc(b.name)} tab ↓</button></p>`;
  el.querySelector('.closeBtn').addEventListener('click', () => { el.hidden = true; state.town?.select(null); });
  el.querySelector('#openTab').addEventListener('click', () => { setTab(id); $('#tabsH').scrollIntoView({ behavior: 'smooth' }); });
  wireAlertDetails(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- alerts ----------

function alertItem(a) {
  const b = state.snap.buildings.find((x) => x.id === a.buildingId);
  const m = b?.metrics.find((x) => x.id === a.metricId);
  const names = a.privateList ? `<details data-list="${esc(a.privateList)}"><summary>Who</summary><div class="who"></div></details>` : '';
  return `<li class="alert ${a.status}">
    <div>${pill(a.status)} <span class="small muted">${esc(b?.name || '')}</span></div>
    <p class="t">${esc(a.title)}</p>
    <p class="d">${esc(a.detail)}</p>
    <p class="n"><b>Next step:</b> ${esc(a.nextStep)}</p>
    <div class="meta"><span><b>Owner:</b> ${esc(a.owner)}</span><span><b>At stake:</b> ${esc(a.costLabel)}</span>${m ? `<span>${esc(m.source)} · read ${ago(m.readAt)}</span>` : ''}</div>
    ${names}
  </li>`;
}

function wireAlertDetails(root) {
  root.querySelectorAll('details[data-list]').forEach((d) => {
    d.addEventListener('toggle', () => {
      if (!d.open) return;
      const key = d.dataset.list;
      const [k] = key.split(':');
      const spec = PRIVATE_LISTS[k] || { title: 'Overdue tasks', cols: taskCols };
      const box = d.querySelector('.who');
      box.innerHTML = '';
      box.appendChild(namesBlock(key, spec.cols, spec.title));
    });
  });
}

function renderAlerts() {
  const el = $('#alerts');
  el.innerHTML = state.snap.alerts.length ? state.snap.alerts.map(alertItem).join('') : '<li class="empty">Nothing red or amber.</li>';
  wireAlertDetails(el);
}

// ---------- tabs ----------

function setTab(id) {
  state.tab = id;
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.id === id)));
  renderTabPanel();
}

function renderTabs() {
  $('#tabs').innerHTML = state.snap.buildings.map((b) => {
    const t = STATUS_TEXT[b.status] || STATUS_TEXT.grey;
    return `<button type="button" class="tab" role="tab" data-id="${b.id}" aria-selected="${b.id === state.tab}">${b.id === 'hq' ? 'Overview' : esc(b.name)} <span aria-label="${t.word}">${t.icon}</span></button>`;
  }).join('');
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.id)));
  renderTabPanel();
}

function srcLine(buildingId, metricId) {
  const m = state.snap.buildings.find((b) => b.id === buildingId)?.metrics.find((x) => x.id === metricId);
  return m ? `${m.source} · read ${when(m.readAt)} · ${m.scope}` : '';
}

function renderTabPanel() {
  const b = state.snap.buildings.find((x) => x.id === state.tab);
  const el = $('#tabPanel');
  const T = state.snap.tables;
  el.innerHTML = `<div>${pill(b.status)} <span class="muted small">${esc(b.blurb)}</span></div>` + (b.id === 'hq' ? '' : areaSummary(b));
  const add = (node) => el.appendChild(node);

  switch (b.id) {
    case 'hq': {
      el.insertAdjacentHTML('beforeend', `<div class="mgrid" style="margin-top:10px">${state.snap.topNumbers.map(metricCard).join('')}</div>`);
      el.insertAdjacentHTML('beforeend', '<h4 class="subH">Every area at a glance</h4>');
      add(table(state.snap.buildings.filter((x) => x.id !== 'hq').map((x) => ({ name: x.name, status: x.status, owner: x.owner?.name || '—', alerts: state.snap.alerts.filter((a) => a.buildingId === x.id).length })),
        [['name', 'Area'], ['status', 'Status', false, (v) => pill(v)], ['owner', 'Owner'], ['alerts', 'Alerts', true]]));
      if (T.joins?.by_month) add(barChart({ title: 'New members per month (this month so far)', rows: T.joins.by_month, labelKey: 'month', valueKey: 'new_members',
        source: srcLine('fulfillment', 'joins_this_month'), columns: [['month', 'Month'], ['new_members', 'New members', true]] }));
      if (T.calls?.calls) add(barChart({ title: 'Calls the team recorded in the last two days', rows: T.calls.calls, labelKey: 'type', valueKey: 'calls',
        source: srcLine('setters', 'calls_intro_2d'), columns: [['type', 'Call type'], ['calls', 'Calls', true]] }));
      break;
    }
    case 'renewals':
      add(barChart({ title: 'Most of this month’s book is still open', rows: T.renewals.outcomes, labelKey: 'outcome', valueKey: 'members',
        source: srcLine('renewals', 'renewals_book'), columns: [['outcome', 'Outcome'], ['members', 'Members', true], ['usd', 'Plan value ($)', true]] }));
      add(namesBlock('renewals_worth_call', PRIVATE_LISTS.renewals_worth_call.cols, PRIVATE_LISTS.renewals_worth_call.title));
      add(namesBlock('renewals_silent_churn', PRIVATE_LISTS.renewals_silent_churn.cols, PRIVATE_LISTS.renewals_silent_churn.title));
      break;
    case 'community':
      add(barChart({ title: 'Members who told their RD they’re leaving, by territory', rows: T.community.rd_by_territory, labelKey: 'territory', valueKey: 'leaving',
        source: srcLine('community', 'rd_said_leaving'), columns: [['territory', 'Territory'], ['leaving', 'Leaving', true], ['undecided', 'Undecided', true]] }));
      add(barChart({ title: 'Active members by sales territory', rows: T.community.by_territory, labelKey: 'territory', valueKey: 'members',
        source: srcLine('community', 'active_members'), columns: [['territory', 'Territory'], ['members', 'Members', true]] }));
      add(barChart({ title: 'Top industries', rows: T.community.top_industries, labelKey: 'industry', valueKey: 'members',
        source: srcLine('community', 'active_members'), columns: [['industry', 'Industry'], ['members', 'Members', true]] }));
      if (T.engagement?.pulse) add(barChart({ title: `${T.engagement.pulse.filter((r) => r.pulse === 'disengaging' || r.pulse === 'frustrated').reduce((n, r) => n + r.members, 0)} members are pulling back or frustrated, in their own words`, rows: T.engagement.pulse, labelKey: 'pulse', valueKey: 'members',
        source: srcLine('community', 'pulse_frustrated'), columns: [['pulse', 'In their own words'], ['members', 'Members', true]] }));
      if (T.engagement?.app_events) add(barChart({ title: 'Event registration drives app use', rows: T.engagement.app_events, labelKey: 'action', valueKey: 'members',
        source: srcLine('community', 'app_used_30d_pct'), columns: [['action', 'App action (30 days)'], ['members', 'Members', true], ['events', 'Times', true]] }));
      add(namesBlock('rd_leaving', PRIVATE_LISTS.rd_leaving.cols, PRIVATE_LISTS.rd_leaving.title));
      break;
    case 'admissions':
      add(barChart({ title: 'Most interviews end with a next step, not a join', rows: T.admissions.outcomes, labelKey: 'outcome', valueKey: 'calls',
        source: srcLine('admissions', 'interview_calls'), columns: [['outcome', 'How the call ended'], ['calls', 'Calls', true]] }));
      add(barChart({ title: 'Travel/format is the most raised objection', rows: T.admissions.objections, labelKey: 'objection', valueKey: 'calls',
        source: srcLine('admissions', 'interview_calls'), columns: [['objection', 'Objection'], ['calls', 'Calls raising it', true]] }));
      if (T.pipeline?.verdicts) add(barChart({ title: `Largest group of recent non-closers: ${T.pipeline.verdicts[0]?.verdict}`, rows: T.pipeline.verdicts, labelKey: 'verdict', valueKey: 'prospects',
        source: srcLine('admissions', 'hot_not_closed'), columns: [['verdict', 'Where they stand'], ['prospects', 'Prospects', true]] }));
      add(namesBlock('pipeline_hot', PRIVATE_LISTS.pipeline_hot.cols, PRIVATE_LISTS.pipeline_hot.title));
      add(namesBlock('pipeline_no_outcome', PRIVATE_LISTS.pipeline_no_outcome.cols, PRIVATE_LISTS.pipeline_no_outcome.title));
      add(namesBlock('closers', PRIVATE_LISTS.closers.cols, PRIVATE_LISTS.closers.title));
      break;
    case 'setters':
      add(namesBlock('setters', PRIVATE_LISTS.setters.cols, PRIVATE_LISTS.setters.title));
      break;
    case 'marketing':
      add(barChart({ title: 'Facebook books the most intros (last touch)', rows: T.marketing.channels, labelKey: 'channel', valueKey: 'bookings',
        source: srcLine('marketing', 'intro_bookings'), columns: [['channel', 'Channel'], ['bookings', 'Bookings', true], ['closes', 'Closes', true], ['cost_usd', 'Cost ($)', true]] }));
      break;
    case 'events': {
      const rows = T.events.by_city.map((r) => ({ ...r, label: `${r.city} · ${r.kind}` }));
      add(barChart({ title: 'Event NPS by city and format', rows: rows.filter((r) => r.responses >= 5), tableRows: rows, labelKey: 'label', valueKey: 'nps',
        fmt: (v) => String(v), source: `${srcLine('events', 'event_nps')} · chart shows 5+ responses; table shows all`,
        columns: [['city', 'City'], ['kind', 'Format'], ['responses', 'Responses', true], ['avg_score', 'Avg score', true], ['nps', 'NPS', true]] }));
      break;
    }
    case 'fulfillment':
      if (T.joins?.by_month) add(barChart({ title: 'New members per month (this month so far)', rows: T.joins.by_month, labelKey: 'month', valueKey: 'new_members',
        source: srcLine('fulfillment', 'joins_this_month'), columns: [['month', 'Month'], ['new_members', 'New members', true]] }));
      break;
    case 'cash':
      el.insertAdjacentHTML('beforeend', '<p class="empty" style="margin-top:10px">This building stays grey until an accounting or bank source is connected (read-only). Nothing here is estimated.</p>');
      break;
    default:
      break;
  }

  if (b.list) {
    const row = T.tasks.find((t) => t.list === b.list);
    el.insertAdjacentHTML('beforeend', `<h4 class="subH">ClickUp “${esc(b.list)}”</h4>`);
    add(table(row ? [row] : [], [['open', 'Open', true], ['in_progress', 'In progress', true], ['on_pause', 'Paused', true], ['ideas', 'Ideas', true], ['overdue', 'Overdue', true], ['overdue_urgent', 'Overdue urgent', true]]));
    add(namesBlock(`overdue_tasks:${b.list}`, taskCols, 'Overdue tasks'));
  }
}

// ---------- sources ----------

function renderSources() {
  $('#sources').appendChild(table(state.snap.sources.map((s) => ({
    name: s.name, readAt: s.readAt ? `${when(s.readAt)} (${ago(s.readAt)})` : 'never',
    target: s.freshnessHours === 24 ? 'daily' : s.freshnessHours === 168 ? 'weekly' : `${s.freshnessHours} h`,
    state: !s.ok ? s.error : (Date.now() - Date.parse(s.readAt)) / 3600000 > s.freshnessHours ? 'Stale' : 'OK',
    note: s.note || '',
  })), [['name', 'Source'], ['readAt', 'Read'], ['target', 'Target'], ['state', 'State'], ['note', 'Read note']]));
  $('#sources').insertAdjacentHTML('beforeend', `<p class="prov">Snapshot built ${when(state.snap.builtAt)}.</p>`);
}

// ---------- boot ----------

async function boot() {
  try {
    state.snap = await fetchJson('data/snapshot.json');
  } catch (e) {
    renderBanner(e.message);
    return;
  }
  try { state.priv = await fetchJson('data/snapshot.private.json', 4000); } catch (e) { state.privError = e.message.startsWith('404') ? 'private file not present' : e.message; }

  $('#hideNames').addEventListener('change', (e) => {
    state.hideNames = e.target.checked;
    renderTabPanel(); renderAlerts();
    if (state.selected) select(state.selected);
  });

  renderBanner();
  renderTop();
  renderAlerts();
  renderTabs();
  renderSources();

  try {
    state.town = createTown({
      container: $('#town'), canvas: $('#townCanvas'), labelsEl: $('#labels'),
      buildings: state.snap.buildings.map(({ id, name, short, status, kind }) => ({ id, name, short: short || name, status, kind })),
      onSelect: select,
    });
  } catch (e) {
    console.warn('3D town unavailable:', e && (e.stack || e.message));
    $('#townFallback').hidden = false;
  }

  $('#fullscreen').addEventListener('click', () => {
    const t = $('#town');
    if (document.fullscreenElement) document.exitFullscreen();
    else (t.requestFullscreen || t.webkitRequestFullscreen)?.call(t);
  });
}

boot();
