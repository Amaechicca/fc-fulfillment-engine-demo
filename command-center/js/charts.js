// One chart type: a horizontal bar chart with one message, direct value labels,
// a hover tooltip, and a table view. Single series, so the title names it (no legend box).
import { esc } from './data/format.js';

let tipEl;
function tip() {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.hidden = true; document.body.appendChild(tipEl); }
  return tipEl;
}

/**
 * @param {object} o
 * @param {string} o.title   the one message, e.g. "Travel/format is the most raised objection"
 * @param {Array}  o.rows
 * @param {string} o.labelKey
 * @param {string} o.valueKey
 * @param {(v:number)=>string} [o.fmt]
 * @param {string} o.source  provenance line
 * @param {Array<[string,string,boolean?]>} [o.columns] table columns [key, header, numeric]
 * @param {Array}  [o.tableRows] rows for the table view when it should show more than the chart
 */
export function barChart({ title, rows, labelKey, valueKey, fmt = (v) => v.toLocaleString('en-US'), source, columns, tableRows = rows }) {
  const id = `c${Math.random().toString(36).slice(2, 8)}`;
  const wrap = document.createElement('figure');
  wrap.className = 'chart';
  wrap.style.margin = '8px 0 14px';
  const data = rows.filter((r) => r[valueKey] !== null && r[valueKey] !== undefined);
  const max = Math.max(1, ...data.map((r) => r[valueKey]));
  const rowH = 26, labelW = 150, valueW = 64, W = 560, H = data.length * rowH + 6;
  const barW = W - labelW - valueW;

  const bars = data.map((r, i) => {
    const w = Math.max(2, (r[valueKey] / max) * barW);
    const y = i * rowH + 4;
    const label = String(r[labelKey]);
    const short = label.length > 22 ? `${label.slice(0, 21)}…` : label;
    return `<g data-i="${i}">
      <text x="${labelW - 8}" y="${y + 13}" text-anchor="end">${esc(short)}</text>
      <rect class="bar" x="${labelW}" y="${y + 2}" width="${w}" height="16" rx="4"></rect>
      <rect x="0" y="${y}" width="${W}" height="${rowH}" fill="transparent"></rect>
      <text class="v" x="${labelW + w + 6}" y="${y + 13}">${esc(fmt(r[valueKey]))}</text>
    </g>`;
  }).join('');

  const cols = columns || [[labelKey, labelKey], [valueKey, valueKey, true]];
  const table = `<div class="tableWrap"><table><thead><tr>${cols.map(([, h, n]) => `<th${n ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${tableRows.map((r) => `<tr>${cols.map(([k, , n]) => `<td${n ? ' class="num"' : ''}>${r[k] === null || r[k] === undefined ? '—' : esc(n && typeof r[k] === 'number' ? r[k].toLocaleString('en-US') : r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  wrap.innerHTML = `
    <div class="chartHead"><h4 id="${id}">${esc(title)}</h4><button type="button" class="linkBtn" aria-pressed="false">Table view</button></div>
    <div class="viz"><svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}">
      <line class="base" x1="${labelW}" x2="${labelW}" y1="0" y2="${H}"></line>${bars}</svg></div>
    <div class="tbl" hidden>${table}</div>
    <figcaption class="chartSrc">${esc(source)}</figcaption>`;

  const btn = wrap.querySelector('button');
  btn.addEventListener('click', () => {
    const showTable = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(showTable));
    btn.textContent = showTable ? 'Chart view' : 'Table view';
    wrap.querySelector('.viz').hidden = showTable;
    wrap.querySelector('.tbl').hidden = !showTable;
  });

  wrap.querySelectorAll('g[data-i]').forEach((g) => {
    const r = data[Number(g.dataset.i)];
    const show = (e) => { const t = tip(); t.hidden = false; t.textContent = `${r[labelKey]}: ${fmt(r[valueKey])}`; t.style.left = `${Math.min(e.clientX + 12, innerWidth - 220)}px`; t.style.top = `${e.clientY + 12}px`; };
    g.addEventListener('pointermove', show);
    g.addEventListener('pointerleave', () => { tip().hidden = true; });
  });
  return wrap;
}

export function table(rows, columns) {
  const el = document.createElement('div');
  el.className = 'tableWrap';
  if (!rows?.length) { el.innerHTML = '<p class="empty">Nothing to show.</p>'; return el; }
  el.innerHTML = `<table><thead><tr>${columns.map(([, h, n]) => `<th${n ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${columns.map(([k, , n, f]) => {
      const v = r[k];
      const out = v === null || v === undefined ? '—' : f ? f(v, r) : n && typeof v === 'number' ? v.toLocaleString('en-US') : esc(Array.isArray(v) ? v.join(', ') : v);
      return `<td${n ? ' class="num"' : ''}>${out}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table>`;
  return el;
}
