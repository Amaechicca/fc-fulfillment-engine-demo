// South Florida Command Center: page wiring. Reads window.SF_DATA (data/sf-data.js), judges it with
// sf-model.js and hands buildings to the 3D town. It never writes anywhere itself: Send and Save hand
// a payload to window.SF_ACTIONS (wired by a hosting wrapper outside this repo) and never change what
// the page shows as an item's state.
import { ago, esc } from '../../js/data/format.js';
import { createTown } from './sf-town.js';
import {
  QUEUES, MESSAGE_STATUS_TEXT, sourceHealth, coverageWarning, healthText, HEALTH_STATUS, HEALTH_SHORT, AXES, dedupeItems, renewalRace,
  queueStatus, eventSuggestions, splitBookings, memberAliases, validateData, latestIso, actionPayload, sendBlocker,
} from './sf-model.js';

const $ = (s) => document.querySelector(s);
const GMAIL_DRAFTS = 'https://mail.google.com/mail/u/0/#drafts';
const STATUS_WORD = { red: '✕ Act now', amber: '! Watch', green: '✓ Clear', blue: '◷ Last verified', grey: '– Unknown', hq: '★ Home' };

// ---------- the integration hook (see README: "window.SF_ACTIONS contract") ----------
// A hosting wrapper replaces these. The stubs do nothing and say so; they never report success.
function stub(name) { const f = () => ({ connected: false }); f.__sfStub = true; f.displayName = name; return f; }
window.SF_ACTIONS = window.SF_ACTIONS || {};
// Contract: { send(payload), edit(payload) }. Save of an inline edit calls edit(payload) with the edited
// body. saveEdit is accepted as an alias for edit (an earlier name for the same hook).
for (const k of ['send', 'edit']) if (typeof window.SF_ACTIONS[k] !== 'function') window.SF_ACTIONS[k] = stub(k);
const realHook = (k) => { const f = window.SF_ACTIONS?.[k]; return typeof f === 'function' && !f.__sfStub ? f : null; };
const hookFor = (action) => (action === 'edit' ? realHook('edit') || realHook('saveEdit') : realHook(action));
const hookConnected = (action) => Boolean(hookFor(action));

const state = {
  d: null, items: [], aliases: new Map(), hideNames: true, town: null, now: Date.now(),
  view: null, // { id } building, or { id, itemId } situation card
  versionOk: new Map(), // item id → true/false/undefined (hash check)
  handoffs: new Map(), // item id → [{ action, at, outcome, detail, body }]
  editing: null, // item id being edited
  revealed: new Set(), // item ids whose draft body is shown while names are hidden
  race: null, suggestions: [], buildings: [],
};

// ---------- small helpers ----------
const who = (name) => (state.hideNames ? state.aliases.get(name) || 'Member' : name);
const srcName = (id) => state.d.sources.find((s) => s.id === id)?.name || id;
const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso), today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return d.toLocaleString('en-US', sameDay ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const fmtLong = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '—');
const fresh = (asOf, source) => `<span class="fresh" title="${esc(asOf ? fmtLong(asOf) : 'never read')}">as of ${esc(asOf ? fmtTime(asOf) : 'never')} · ${esc(source)}</span>`;
const sp = (status, text) => `<span class="pill ${status}"><i aria-hidden="true"></i>${esc(text)}</span>`;
const mstate = (s) => (s ? `<span class="mstate s-${esc(s)}">${esc(MESSAGE_STATUS_TEXT[s] || s)}</span>` : '');
const healthPill = (h) => `<span class="pill ${HEALTH_STATUS[h.state]} h-${h.state}"><i aria-hidden="true"></i>${esc(healthText(h, fmtTime))}</span>`;
const axesList = (h) => { const known = AXES.filter(([k]) => h.axes?.[k] === true || h.axes?.[k] === false); return known.length ? `<ul class="axes">${known.map(([k, label]) => `<li class="${h.axes[k] ? 'yes' : 'no'}">${h.axes[k] ? '✓' : '✕'} ${label}</li>`).join('')}</ul>` : ''; };
const summaryText = (it) => String(it.summary || '').replaceAll('{member}', who(it.member));
const pct = (v) => (v === null || v === undefined ? '—' : `${Number.isInteger(v) ? v : v.toFixed(1)}%`);

async function versionOf(body) {
  if (!window.crypto?.subtle) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return `sha256:${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)}`;
}

// ---------- banner ----------
function renderBanner(errors) {
  const items = [];
  if (state.d?.placeholder) items.push('<b>Sample data.</b> Every name, number and link on this page is fake placeholder data. Real data is added only when the page is published.');
  if (errors?.length) items.push(`<b>The data file has problems</b>, so parts of the page may be blank:<ul>${errors.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`);
  if (state.d && !state.d.placeholder && state.now - Date.parse(state.d.generatedAt) > 24 * 3600000) items.push(`This data was produced ${esc(ago(state.d.generatedAt))}. Anything time-sensitive may have changed.`);
  const el = $('#banner');
  if (!items.length) { el.hidden = true; return; }
  el.hidden = false;
  el.className = `banner${errors?.length ? ' bad' : ''}`;
  el.innerHTML = `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
}

// ---------- greeting + queue tiles ----------
function queueFresh(q) {
  const list = state.items.filter((i) => i.queue === q.id);
  const srcs = [...new Set(list.flatMap((i) => i.sources.map((s) => s.source)))];
  return { asOf: latestIso(list.map((i) => i.asOf)) || state.d.generatedAt, source: srcs.length ? srcs.map(srcName).join(', ') : 'data file' };
}

function renderHello() {
  const open = state.items.filter((i) => i.queue === 'to_send').length;
  const risk = state.items.filter((i) => i.queue === 'at_risk').length;
  const hour = new Date().getHours();
  $('#greet').textContent = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, ${state.d.director || 'there'}.`;
  $('#greetSub').innerHTML = `${open} message${open === 1 ? '' : 's'} to send · ${risk} member${risk === 1 ? '' : 's'} at risk · ${esc(state.d.region)} · data produced ${esc(fmtTime(state.d.generatedAt))}`;
  $('#subline').textContent = `${state.d.region} · member success${state.d.placeholder ? ' · SAMPLE DATA' : ''}`;
  $('#queueTiles').innerHTML = QUEUES.map((q) => {
    const n = state.items.filter((i) => i.queue === q.id).length;
    const st = queueStatus(q.id, state.items, state.now);
    const f = queueFresh(q);
    return `<button type="button" class="qTile ${st}" data-id="${q.id}">
      <span class="qLab">${esc(q.name)}</span>
      <span class="qNum">${n}</span>
      <span class="qState">${STATUS_WORD[st]}</span>
      ${fresh(f.asOf, f.source)}
    </button>`;
  }).join('');
  $('#queueTiles').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) { select(b.dataset.id); $('#town').scrollIntoView({ behavior: 'smooth', block: 'start' }); } };
}

// ---------- renewal race ----------
function laneSvg(rate, target, status, ghost = false) {
  const W = 320, x = (p) => 8 + ((W - 16) * Math.max(0, Math.min(100, p))) / 100;
  const at = rate === null ? null : x(rate);
  return `<svg viewBox="0 0 ${W} 34" class="lane" role="img" aria-label="${rate === null ? 'No rate yet' : `${pct(rate)} of a race to above ${target}%`}">
    <rect x="8" y="13" width="${W - 16}" height="8" rx="4" class="laneTrack"/>
    ${at === null ? '' : `<rect x="8" y="13" width="${Math.max(0, at - 8)}" height="8" rx="4" class="laneFill ${ghost ? 'ghost' : status}"/>`}
    <g class="finish"><rect x="${x(target) - 3}" y="4" width="6" height="26" class="chk"/><text x="${x(target)}" y="3" text-anchor="middle" class="goalT">${target}%</text></g>
    ${at === null ? '' : `<g transform="translate(${at},17)"><circle r="8" class="runner ${ghost ? 'ghost' : status}"/><text y="3.5" text-anchor="middle" class="runnerT">⛵</text></g>`}
  </svg>`;
}

function raceRow(kind, p, target) {
  const v = p.verdict;
  return `<div class="raceRow">
    <div class="raceHead">
      <span class="raceKind">${kind}</span>
      <span class="raceLabel">${esc(p.label || '—')}</span>
    </div>
    <div class="raceNums">
      <span class="raceRate ${v.status}">${pct(p.rate)}</span>
      <span class="raceDen">${p.renewed ?? 0} of ${p.decided} decided<span class="muted"> · ${esc(p.label || '')}</span></span>
      ${p.earlySample ? '<span class="earlyChip">Tiny early sample</span>' : ''}
      ${sp(v.status, v.text)}
    </div>
    ${laneSvg(p.rate, target, v.status, kind !== 'This period')}
    <div class="prov">${p.churned ?? 0} churned${p.open !== undefined ? ` · ${p.open} still open` : ''} · ${fresh(p.asOf, p.source)}</div>
  </div>`;
}

function raceMarkup(compact = false) {
  const r = state.race;
  if (!r) return '<p class="empty">No renewal data in the data file.</p>';
  const c = r.current;
  const finish = c.needToFinish === null ? '' : c.reachable
    ? `To finish ${esc(c.label?.split(',')[0] || 'the period')} above ${r.target}%: renew <b>${c.needToFinish}</b> of the <b>${c.open}</b> still open.`
    : `Even renewing all <b>${c.open}</b> still open would not finish this period above ${r.target}%.`;
  return `${compact ? '' : `<div class="raceTop"><h2 id="raceH" class="sectionH">Renewal race <span class="muted small">goal: above ${r.target}% · South Florida</span></h2></div>`}
    ${raceRow('This period', c, r.target)}
    ${raceRow('Last completed month', r.prior, r.target)}
    ${finish ? `<p class="raceNext">${finish}</p>` : ''}
    <p class="prov">Moves only on renewal outcomes: renewed ÷ (renewed + churned). Messages sent never move it. The goal is met only when a rate is strictly above ${r.target}%.</p>`;
}

// ---------- buildings for the town ----------
function buildBuildings() {
  const d = state.d, out = [];
  const openTotal = state.items.filter((i) => i.queue === 'to_send' || i.queue === 'at_risk').length;
  out.push({ id: 'home', kind: 'home', name: `${d.director || 'RD'}’s beach house`, short: d.region, status: 'hq', keyText: `${openTotal} open`, keyCaption: 'to act on',
    asOfText: `as of ${fmtTime(d.generatedAt)} · data file`, asOf: d.generatedAt, source: 'data file' });
  for (const q of QUEUES) {
    const list = state.items.filter((i) => i.queue === q.id);
    const f = queueFresh(q);
    const st = queueStatus(q.id, state.items, state.now);
    out.push({ id: q.id, kind: 'queue', name: q.name, short: q.short, status: st, keyText: String(list.length), keyCaption: list.length === 1 ? 'item' : 'items',
      asOfText: `as of ${fmtTime(f.asOf)}`, asOf: f.asOf, source: f.source, volume: { value: list.length, cap: 8 },
      flags: list.some((i) => i.state === 'error') ? { count: list.filter((i) => i.state === 'error').length, status: 'red' } : null });
  }
  const ev = d.events || {};
  out.push({ id: 'events', kind: 'events', name: 'Events', short: 'Events', status: state.suggestions.length ? 'amber' : 'green',
    keyText: `${(ev.rd || []).length} RD · ${(ev.club || []).length} club`, keyCaption: '',
    asOfText: `as of ${fmtTime(ev.asOf)}`, asOf: ev.asOf, source: ev.source || 'events' });
  for (const s of d.sources) {
    const h = sourceHealth(s);
    const warn = coverageWarning(s);
    out.push({ id: s.id, kind: 'source', name: s.name, short: s.name, status: HEALTH_STATUS[h.state], health: h, future: Boolean(s.future),
      keyText: HEALTH_SHORT[h.state], keyCaption: h.at ? fmtTime(h.at) : '', warn, warnShort: s.id === 'ghl' ? 'Content coverage incomplete' : 'Coverage incomplete',
      asOfText: s.check?.ranAt ? `checked ${fmtTime(s.check.ranAt)}` : 'never checked', asOf: s.asOf, source: s.name });
  }
  const r = state.race;
  if (r) {
    out.push({ id: 'race', kind: 'race', name: 'Renewal race', short: 'Renewal race', status: r.status,
      keyText: pct(r.current.rate), keyCaption: `${r.current.renewed} of ${r.current.decided} decided${r.current.earlySample ? ' · early sample' : ''} · goal >${r.target}%`,
      asOfText: `as of ${fmtTime(r.current.asOf)} · ${r.current.source}`, asOf: r.current.asOf, source: r.current.source,
      race: { rate: r.current.rate, prior: r.prior.rate, target: r.target } });
  }
  return out;
}

function renderBuildingList() {
  const order = { red: 0, amber: 1, green: 2, blue: 2, grey: 3, hq: -1 };
  $('#buildingList').innerHTML = [...state.buildings].sort((a, b) => order[a.status] - order[b.status]).map((b) => `
    <li data-status="${b.status}" data-warn="${b.warn ? 1 : 0}"><button type="button" data-id="${b.id}" class="bItem ${b.status}">
      <span class="bIcon" aria-hidden="true">${STATUS_WORD[b.status]?.[0] || '–'}</span><span class="bName">${esc(b.name)}</span>
      <span class="bKey">${esc(b.keyText ?? '—')} <small>${esc(b.keyCaption || '')}</small>${b.warn ? ` <span class="warnChip">⚠ ${esc(b.warnShort)}</span>` : ''}</span>
      <span class="bFresh">${esc(b.asOf ? `as of ${fmtTime(b.asOf)}` : 'never read')} · ${esc(b.source)}</span></button></li>`).join('');
  $('#buildingList').onclick = (e) => {
    const btn = e.target.closest('button[data-id]'); if (!btn) return;
    select(btn.dataset.id);
    $('#town').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

// ---------- detail sheet ----------
function select(id, itemId = null) {
  state.view = id ? { id, itemId } : null;
  if (!itemId) state.editing = null;
  renderSheet();
  const el = $('#detail');
  if (!id) return;
  const phone = $('#town').clientWidth < 640;
  state.town?.setInsets(phone ? { bottom: el.offsetHeight } : { right: el.offsetWidth + 20 });
  state.town?.select(id);
}

function closeSheet() {
  $('#detail').hidden = true; state.view = null; state.editing = null;
  state.town?.setInsets({}); state.town?.select(null);
}

function sheetHead(title, sub, back = null) {
  return `<div class="detailHead">
    <div>${back ? `<button type="button" class="backBtn" data-back="${esc(back.id)}">← ${esc(back.name)}</button>` : ''}<h3>${title}</h3>${sub ? `<div class="headSub">${sub}</div>` : ''}</div>
    <button type="button" class="closeBtn" aria-label="Close">✕</button>
  </div>`;
}

function itemRow(it) {
  const srcs = it.sources.map((s) => srcName(s.source));
  return `<li><button type="button" class="itemBtn ${it.severity === 'high' || it.state === 'error' ? 'hot' : ''}" data-item="${esc(it.id)}">
    <span class="iTop"><b>${esc(who(it.member))}</b>${mstate(it.state)}${it.severity ? `<span class="sev s-${esc(it.severity)}">${esc(it.severity)}</span>` : ''}${it.overdue ? '<span class="sev s-medium">overdue</span>' : ''}</span>
    <span class="iSum">${esc(summaryText(it))}</span>
    <span class="iMeta">${srcs.length > 1 ? `<span class="merged">Seen in ${srcs.length} sources, merged</span> · ` : ''}${fresh(it.asOf, srcs.join(' + '))}</span>
  </button></li>`;
}

function renderSheet() {
  const el = $('#detail');
  const v = state.view;
  if (!v) { el.hidden = true; return; }
  const b = state.buildings.find((x) => x.id === v.id);
  if (!b) { el.hidden = true; return; }
  el.hidden = false;
  let html = '';
  if (v.itemId) {
    const it = state.items.find((x) => x.id === v.itemId);
    html = it ? situationCard(it, b) : sheetHead('Not found', '', { id: b.id, name: b.name });
  } else if (b.kind === 'queue') {
    const q = QUEUES.find((x) => x.id === b.id);
    const list = state.items.filter((i) => i.queue === b.id)
      .sort((a, c) => (c.state === 'error') - (a.state === 'error') || ({ high: 3, medium: 2, low: 1 }[c.severity] || 0) - ({ high: 3, medium: 2, low: 1 }[a.severity] || 0) || Date.parse(c.asOf) - Date.parse(a.asOf));
    html = sheetHead(esc(b.name), `${sp(b.status, STATUS_WORD[b.status].slice(2))} ${fresh(b.asOf, b.source)}`)
      + `<p class="owner">${esc(q.blurb)}</p>`
      + (list.length ? `<ul class="itemList">${list.map(itemRow).join('')}</ul>` : '<p class="empty">Nothing here right now.</p>');
  } else if (b.kind === 'source') {
    const s = state.d.sources.find((x) => x.id === b.id);
    const related = state.items.filter((i) => i.sources.some((x) => x.source === s.id));
    html = sheetHead(esc(s.name), `${healthPill(b.health)} <span class="muted small">${esc(s.role || '')}</span>`)
      + (b.warn ? `<p class="warnBox">⚠ ${esc(b.warn)}</p>` : '')
      + `<dl class="facts">
          <dt>Health</dt><dd>${esc(healthText(b.health, fmtLong))}${axesList(b.health)}<span class="muted small">From the last check only. There is no heartbeat, so this shows when a source was last verified, not whether it is up now.</span></dd>
          <dt>Last checked</dt><dd>${s.check?.ranAt ? `${esc(fmtLong(s.check.ranAt))} <span class="muted">(${esc(ago(s.check.ranAt))}, ${s.check.live ? 'live call' : 'not a live call'})</span>` : 'Never'}</dd>
          <dt>What was checked</dt><dd>${esc(s.check?.detail || '—')}</dd>
          <dt>Data as of</dt><dd>${s.asOf ? esc(fmtLong(s.asOf)) : 'Never read'} · ${esc(s.name)}</dd>
        </dl>`
      + `<h4 class="subH">Items seen here</h4>${related.length ? `<ul class="itemList">${related.map(itemRow).join('')}</ul>` : '<p class="empty">None.</p>'}`;
  } else if (b.kind === 'race') {
    html = sheetHead('Renewal race', `${sp(b.status, state.race.current.verdict.text)}`) + raceMarkup(true);
  } else if (b.kind === 'events') {
    const ev = state.d.events || {};
    html = sheetHead('Events', fresh(ev.asOf, ev.source || 'events'))
      + `<h4 class="subH">Regional Director events <span class="trackNote">not on the club app</span></h4>${eventList(ev.rd || [])}`
      + `<h4 class="subH">Main club events <span class="trackNote club">on the club app</span></h4>${eventList(ev.club || [])}`
      + `<p><button type="button" class="linkBtn" id="toEvents">${state.suggestions.length} event suggestion${state.suggestions.length === 1 ? '' : 's'} and member bookings ↓</button></p>`;
  } else { // home
    const health = state.d.sources.map((s) => ({ s, h: sourceHealth(s) }));
    html = sheetHead(esc(b.name), fresh(b.asOf, 'data file'))
      + `<ul class="homeList">${QUEUES.map((q) => { const n = state.items.filter((i) => i.queue === q.id).length; const st = queueStatus(q.id, state.items, state.now); return `<li><button type="button" class="linkRow" data-go="${q.id}">${sp(st, String(n))} ${esc(q.name)}</button></li>`; }).join('')}
         <li><button type="button" class="linkRow" data-go="race">${sp(state.race.status, pct(state.race.current.rate))} Renewal race (${state.race.current.renewed}/${state.race.current.decided} decided)</button></li></ul>
         <h4 class="subH">Sources</h4><ul class="homeList">${health.map(({ s, h }) => `<li><button type="button" class="linkRow" data-go="${s.id}">${healthPill(h)} ${esc(s.name)}${coverageWarning(s) ? ' <span class="warnChip">⚠</span>' : ''}</button></li>`).join('')}</ul>`;
  }
  el.innerHTML = html;
  el.scrollTop = 0;
  wireSheet(el);
}

function wireSheet(el) {
  el.querySelector('.closeBtn')?.addEventListener('click', closeSheet);
  el.querySelector('[data-back]')?.addEventListener('click', (e) => select(e.currentTarget.dataset.back));
  el.querySelectorAll('[data-item]').forEach((x) => x.addEventListener('click', () => {
    const it = state.items.find((i) => i.id === x.dataset.item);
    // open the card from the item's queue building so "back" makes sense
    select(state.view.id === 'home' ? it.queue : state.view.id, it.id);
  }));
  el.querySelectorAll('[data-go]').forEach((x) => x.addEventListener('click', () => select(x.dataset.go)));
  el.querySelector('#toEvents')?.addEventListener('click', () => $('#suggestH').scrollIntoView({ behavior: 'smooth' }));
  wireMessageControls(el);
}

// ---------- situation card ----------
function situationCard(it, b) {
  const srcs = it.sources;
  const isMsg = Boolean(it.body) || it.queue === 'to_send' || it.queue === 'pending';
  const facts = [
    ['Member', esc(who(it.member))],
    ['Summary', esc(summaryText(it))],
    it.state ? ['Status', `${mstate(it.state)} <span class="muted small">from the data, never from this page</span>`] : null,
    ['Source channel', esc(srcName(it.channel || it.source))],
    ['Seen in', srcs.map((s) => `${esc(srcName(s.source))} <span class="muted small">(${esc(fmtTime(s.asOf))})</span>`).join(', ') + (srcs.length > 1 ? ' <span class="merged">merged into one item</span>' : '')],
    it.sentAt ? ['Sent', esc(fmtLong(it.sentAt))] : null,
    it.severity ? ['Severity', esc(it.severity)] : null,
    it.nextStep ? ['Next step', esc(it.nextStep)] : null,
    ...(it.facts || []).map((f) => [esc(f.label), esc(f.value)]),
    it.error ? ['Error', `<span class="errText">${esc(it.error)}</span>`] : null,
  ].filter(Boolean);
  const threadLinks = srcs.filter((s) => s.threadUrl).map((s) => `<a href="${esc(s.threadUrl)}" target="_blank" rel="noopener noreferrer">Thread in ${esc(srcName(s.source))} ↗</a>`);
  return sheetHead(esc(who(it.member)), `${mstate(it.state)} ${fresh(it.asOf, srcs.map((s) => srcName(s.source)).join(' + '))}`, { id: b.id, name: b.name })
    + `<dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}
        <dt>Thread link</dt><dd>${threadLinks.length ? threadLinks.join('<br>') : '<span class="muted">none on record</span>'}</dd>
      </dl>`
    + (isMsg ? messageBlock(it) : '');
}

function messageBlock(it) {
  const editing = state.editing === it.id;
  const hidden = state.hideNames && !state.revealed.has(it.id) && !editing;
  const vOk = state.versionOk.get(it.id);
  const blocker = it.body ? sendBlocker(it, vOk) : 'No draft on record for this item.';
  const editable = Boolean(it.draft_id && it.body) && !['sent', 'queued'].includes(it.state);
  const handed = state.handoffs.get(it.id) || [];
  const sentThisKey = handed.some((h) => h.action === 'send' && h.outcome === 'handed' && h.dedup_key === it.dedup_key);
  const sendDisabled = Boolean(blocker) || editing || hidden || sentThisKey;
  const sendWhy = blocker || (editing ? 'Save or cancel the edit first.' : hidden ? 'Show the draft first: Send sends exactly the text you can see.' : sentThisKey ? 'Already handed to the send action in this session.' : '');
  return `<section class="msg" data-msg="${esc(it.id)}">
    <h4 class="subH">Draft</h4>
    <dl class="facts small">
      <dt>To</dt><dd>${esc(state.hideNames ? 'hidden' : it.recipient || '—')}</dd>
      <dt>From</dt><dd>${esc(it.account || '—')}</dd>
      <dt>Draft</dt><dd><code>${esc(it.draft_id || 'none')}</code>${it.version ? ` · <code>${esc(it.version)}</code> ${vOk === true ? '<span class="ok">✓ text matches</span>' : vOk === false ? '<span class="errText">✕ text does not match</span>' : ''}` : ''}</dd>
    </dl>
    ${it.state === 'held' ? `<p class="holdBox"><b>Held.</b> ${esc(it.hold_reason || 'No reason recorded.')}</p>` : ''}
    ${editing
      ? `<label class="sr" for="editBody">Edit the draft</label><textarea id="editBody" class="bodyEdit" rows="8">${esc(state.editText ?? it.body)}</textarea>
         <div class="msgBtns"><button type="button" class="primary" data-act="save">Save</button><button type="button" class="ghostBtn" data-act="cancel">Cancel</button></div>`
      : hidden
        ? `<div class="bodyHidden"><span>Draft text hidden while “Hide names” is on.</span><button type="button" class="ghostBtn" data-act="reveal">Show draft</button></div>`
        : `<pre class="body" id="body-${esc(it.id)}">${esc(it.body || '')}</pre>`}
    ${editing ? '' : `<div class="msgBtns">
      <button type="button" class="primary" data-act="send" ${sendDisabled ? 'disabled aria-disabled="true"' : ''}>Send</button>
      <button type="button" class="ghostBtn" data-act="edit" ${editable ? '' : 'disabled aria-disabled="true"'}>Edit</button>
    </div>
    ${sendWhy ? `<p class="why">${esc(sendWhy)}</p>` : ''}`}
    ${handed.map((h) => `<div class="handoff ${h.outcome}">${handoffText(h, it)}</div>`).join('')}
    <p class="fallback"><a href="${GMAIL_DRAFTS}" target="_blank" rel="noopener noreferrer">Open in Gmail ↗</a> <span class="muted small">Fallback only: opens the Gmail drafts folder. It is not the Edit control.</span></p>
    <p class="prov">Send and Save hand the draft to an action outside this page${hookConnected('send') ? '' : ' (none is connected here)'}. The status above changes only when the data refreshes.</p>
  </section>`;
}

function handoffText(h, it) {
  const what = h.action === 'send' ? 'send' : 'save';
  const now = `Status still shows what the data says: ${MESSAGE_STATUS_TEXT[it.state] || it.state || '—'}.`;
  if (h.outcome === 'not-connected') return `<b>Nothing was ${what === 'send' ? 'sent' : 'saved'}.</b> No ${what} action is connected to this page (${esc(fmtTime(h.at))}).`;
  if (h.outcome === 'hook-error') return `<b>The ${what} action reported a problem</b> at ${esc(fmtTime(h.at))}: ${esc(h.detail)}. ${now}`;
  return `Handed to the ${what} action at ${esc(fmtTime(h.at))}. Not confirmed. ${now}`
    + (h.action === 'edit' ? `<details><summary>The text you handed off</summary><pre class="body">${esc(h.body)}</pre></details>` : '');
}

function wireMessageControls(root) {
  const sec = root.querySelector('[data-msg]'); if (!sec) return;
  const it = state.items.find((i) => i.id === sec.dataset.msg);
  const act = (name) => sec.querySelector(`[data-act="${name}"]`);
  act('reveal')?.addEventListener('click', () => { state.revealed.add(it.id); renderSheet(); });
  act('edit')?.addEventListener('click', () => { state.editing = it.id; state.editText = it.body; renderSheet(); $('#editBody')?.focus(); });
  act('cancel')?.addEventListener('click', () => { state.editing = null; state.editText = null; renderSheet(); });
  const ta = sec.querySelector('#editBody');
  ta?.addEventListener('input', () => { state.editText = ta.value; act('save').disabled = ta.value === it.body || !ta.value.trim(); });
  if (ta) act('save').disabled = ta.value === it.body;
  act('save')?.addEventListener('click', async () => {
    const body = ta.value;
    await handOff(it, 'edit', actionPayload(it, body), body);
    state.editing = null; state.editText = null; renderSheet();
  });
  act('send')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    // the exact text on screen at tap time
    const visible = sec.querySelector('.body')?.textContent;
    if (visible === undefined) return;
    btn.disabled = true;
    await handOff(it, 'send', actionPayload(it, visible), visible);
    renderSheet();
  });
}

async function handOff(it, action, payload, body) {
  const rec = { action, at: new Date().toISOString(), body, dedup_key: it.dedup_key };
  if (!hookConnected(action)) rec.outcome = 'not-connected';
  else {
    try { await Promise.resolve(hookFor(action)(Object.freeze({ ...payload }))); rec.outcome = 'handed'; }
    catch (err) { rec.outcome = 'hook-error'; rec.detail = err?.message || String(err); }
  }
  const list = state.handoffs.get(it.id) || [];
  list.unshift(rec); state.handoffs.set(it.id, list.slice(0, 4));
}

// ---------- events, suggestions, bookings ----------
function eventList(list) {
  if (!list.length) return '<p class="empty">None on record.</p>';
  return `<ul class="evList">${[...list].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).map((e) => `<li>
    <span class="evDate">${esc(new Date(e.startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))}<small>${esc(new Date(e.startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}</small></span>
    <span class="evBody"><b>${esc(e.title)}</b><span class="muted small">${esc(e.location || '')} · ${esc(e.status)}</span>${fresh(e.asOf, e.source)}</span>
  </li>`).join('')}</ul>`;
}

function renderEvents() {
  const ev = state.d.events || {};
  $('#events').innerHTML = `
    <div class="evTrack rd"><h3>Regional Director events</h3><p class="trackNote">RD-only. These do not go on the club app.</p>${eventList(ev.rd || [])}</div>
    <div class="evTrack club"><h3>Main club events</h3><p class="trackNote club">On the club app.</p>${eventList(ev.club || [])}</div>`;

  const sug = state.suggestions, early = state.sug.early, cfg = state.sug.config;
  const evid = (e, theme) => `${e.distinctVerifiedMembers} distinct verified member${e.distinctVerifiedMembers === 1 ? '' : 's'} raised “${esc(theme)}” (${e.mentions} mention${e.mentions === 1 ? '' : 's'}) · channels: ${e.channels.map((c) => esc(srcName(c))).join(', ')} · most recent ${esc(ago(e.newest))} (${esc(fmtTime(e.newest))}), earliest ${esc(fmtTime(e.oldest))}.`;
  const heuristic = `<p class="prov"><span class="heuristic">Heuristic</span> A theme becomes a suggestion when ${cfg.minMembers}+ distinct verified members raise it within ${cfg.windowDays} days. That threshold is a rule of thumb, not a rule; it is set in the data file (events.cluster). Unverified mentions never count. ${fresh(ev.asOf, ev.source || 'events')}</p>`;
  $('#suggestions').innerHTML = heuristic + (sug.length
    ? `<ul class="sugList">${sug.map((s) => `<li class="sug">
        <div class="sugHead"><span class="proposalChip">Proposal · not scheduled · not confirmed</span><span class="kind k-${s.kind}">${s.kind === 'missing' ? 'Missing: nothing planned on this' : 'High potential'}</span>${s.mayBringNewMembers ? '<span class="kind k-new">Could bring new members</span>' : ''}</div>
        <h4>${esc(s.title)}</h4>
        <p class="sugWhen"><b>Proposed date:</b> ${esc(fmtLong(s.proposedStart))}${s.proposedEnd ? ` – ${esc(new Date(s.proposedEnd).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}` : ''}${s.format ? ` · ${esc(s.format)}` : ''}</p>
        <div class="why"><b>Why:</b> ${evid(s.evidence, s.theme)}${s.why ? ` ${esc(s.why)}` : ''}${s.alreadyCoveredBy.length ? ` Related events already planned: ${s.alreadyCoveredBy.map(esc).join(', ')}.` : ''}</div>
        <p class="sugMembers"><b>Members:</b> ${s.members.map((m) => esc(who(m))).join(', ')}</p>
      </li>`).join('')}</ul>`
    : '<p class="empty">No theme in member feedback meets the heuristic right now, so no event is suggested. Nothing is suggested without one.</p>')
    + (early.length ? `<h4 class="subH">Early signals <span class="muted small">evidence only, no event proposed</span></h4><ul class="sugList">${early.map((e) => `<li class="sug early">
        <div class="sugHead"><span class="kind">Early signal</span><span class="muted small">${e.reason === 'below the heuristic' ? `${e.evidence.distinctVerifiedMembers} of ${cfg.minMembers} members the heuristic looks for` : esc(e.reason)}</span></div>
        <div class="why">${evid(e.evidence, e.theme)}</div>
        <p class="sugMembers"><b>Members:</b> ${e.members.map((m) => esc(who(m))).join(', ')}</p></li>`).join('')}</ul>` : '');

  const { upcoming, recent } = splitBookings(state.d.bookings || [], state.now);
  const bTable = (rows, empty) => (rows.length ? `<div class="tableWrap"><table><thead><tr><th>Member</th><th>When</th><th>Meeting</th><th>Status</th><th>Freshness</th></tr></thead><tbody>${rows.map((b) => `<tr>
      <td>${esc(who(b.member))}</td><td>${esc(fmtLong(b.startsAt))}</td><td>${esc(b.kind || '')}</td><td><span class="bstate b-${esc(b.status)}">${esc(b.status)}</span></td><td>${fresh(b.asOf, b.source)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="empty">${empty}</p>`);
  $('#bookings').innerHTML = `<div class="bookCard"><h4 class="subH">Upcoming</h4>${bTable(upcoming, 'No upcoming bookings on record.')}<h4 class="subH">Recent (last 14 days)</h4>${bTable(recent, 'No bookings in the last 14 days.')}</div>`;
}

// ---------- sources + audits ----------
function renderSources() {
  $('#sources').innerHTML = state.d.sources.map((s) => {
    const h = sourceHealth(s), w = coverageWarning(s);
    return `<button type="button" class="srcCard ${s.future ? 'future' : ''}" data-id="${s.id}">
      <span class="srcTop"><b>${esc(s.name)}</b>${healthPill(h)}</span>
      <span class="muted small">${esc(s.role || '')}</span>
      ${w ? `<span class="warnChip">⚠ ${esc(s.id === 'ghl' ? 'Content coverage incomplete' : w)}</span>` : ''}
      ${axesList(h)}
      <span class="prov">Last checked: ${s.check?.ranAt ? `${esc(fmtTime(s.check.ranAt))}${s.check.live ? '' : ' (not a live check, so it proves nothing)'}` : 'never'}</span>
      <span class="prov">${fresh(s.asOf, s.name)}</span>
    </button>`;
  }).join('');
  $('#sources').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) { select(b.dataset.id); $('#town').scrollIntoView({ behavior: 'smooth', block: 'start' }); } };
}

function renderAudits() {
  const list = [...(state.d.audits || [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const fails = list.filter((a) => a.result === 'fail').length;
  $('#auditH').innerHTML = `Audits <span class="muted small">${list.length} checks · ${fails} failed</span>`;
  $('#audits').innerHTML = list.length ? `<ol class="auditList">${list.map((a) => `<li class="audit ${a.result}">
      <span class="aRes ${a.result}">${a.result === 'pass' ? '✓ Pass' : '✕ Fail'}</span>
      <span class="aBody"><b>${esc(a.check)}</b>${a.detail ? `<span class="muted small">${esc(a.detail)}</span>` : ''}</span>
      <span class="aMeta">${esc(a.source)} · <time datetime="${esc(a.at)}">${esc(fmtLong(a.at))}</time></span>
    </li>`).join('')}</ol>` : '<p class="empty">No audit events in the data.</p>';
}

// ---------- boot ----------
async function boot() {
  state.d = window.SF_DATA;
  if (!state.d) { renderBanner(['data/sf-data.js did not load, so there is nothing to show.']); return; }
  const errors = validateData(state.d);
  renderBanner(errors);
  state.items = dedupeItems(state.d.items || []);
  state.aliases = memberAliases([...state.items.map((i) => i.member), ...(state.d.events?.feedback || []).map((f) => f.member), ...(state.d.bookings || []).map((b) => b.member)]);
  state.race = renewalRace(state.d.renewal);
  state.sug = eventSuggestions(state.d.events, state.now);
  state.suggestions = state.sug.suggestions;
  state.buildings = buildBuildings();

  // verify each draft's text against its version hash (Send stays off until it matches)
  await Promise.all(state.items.filter((i) => i.body && i.version).map(async (i) => {
    const v = await versionOf(i.body);
    state.versionOk.set(i.id, v === null ? undefined : v === i.version);
  }));

  renderHello();
  $('#race').innerHTML = raceMarkup();
  renderBuildingList();
  renderEvents();
  renderSources();
  renderAudits();

  $('#hideNames').addEventListener('change', (e) => {
    state.hideNames = e.target.checked;
    if (!state.hideNames) state.revealed.clear();
    renderEvents();
    if (state.view) renderSheet();
  });

  try {
    state.town = createTown({
      container: $('#town'), canvas: $('#townCanvas'), labelsEl: $('#labels'), buildings: state.buildings,
      onSelect: (id) => select(id), reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
  } catch (e) {
    console.warn('3D town unavailable:', e && (e.stack || e.message));
    $('#townFallback').hidden = false;
  }
  const setFilter = (mode) => {
    $('#fAll').setAttribute('aria-pressed', String(mode === 'all'));
    $('#fNeeds').setAttribute('aria-pressed', String(mode === 'needs'));
    state.town?.setFilter(mode);
    document.querySelectorAll('#buildingList li').forEach((li) => { li.hidden = mode === 'needs' && !['red', 'amber'].includes(li.dataset.status) && li.dataset.warn !== '1'; });
  };
  $('#fAll').addEventListener('click', () => setFilter('all'));
  $('#fNeeds').addEventListener('click', () => setFilter('needs'));
  $('#resetView').addEventListener('click', () => state.town?.reset());
  $('#fullscreen').addEventListener('click', () => {
    const t = $('#town');
    if (document.fullscreenElement) document.exitFullscreen();
    else Promise.resolve((t.requestFullscreen || t.webkitRequestFullscreen)?.call(t)).catch(() => {});
  });
}

boot();
