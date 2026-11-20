import { COMPONENTS, money, number } from './finance.js';

export const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const COLORS = ['#b8f76b', '#83baf4', '#ad95ef', '#f3b879', '#6ed3be', '#ed93b2', '#d6d36c', '#9ba6aa'];

export function donut(costs) {
  let offset = 0;
  const circumference = 2 * Math.PI * 76;
  const entries = Object.entries(costs.components);
  const segments = entries.map(([key, value], i) => {
    const share = costs.total ? value / costs.total : 0;
    const length = share * circumference;
    const svg = share ? `<circle class="donut-segment" cx="110" cy="110" r="76" fill="none" stroke="${COLORS[i]}" stroke-width="23" stroke-dasharray="${Math.max(0, length - (share < 1 ? 3 : 0))} ${circumference}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)" tabindex="0" role="button" aria-label="${COMPONENTS[key]}: ${money(value)}, ${number(share * 100)}%" data-chart-info="${COMPONENTS[key]} · ${money(value)} · ${number(share * 100)}%"><title>${COMPONENTS[key]}: ${money(value)}</title></circle>` : '';
    offset += length;
    return svg;
  }).join('');
  return `<div class="donut-layout"><div class="donut-wrap"><svg viewBox="0 0 220 220" class="donut" role="group" aria-label="Participação de cada despesa"><circle cx="110" cy="110" r="76" fill="none" stroke="var(--line)" stroke-width="23"/>${segments}</svg><div class="donut-center"><span>Custo total</span><strong>${money(costs.total)}</strong><small>por peça</small></div></div><div class="legend">${entries.filter(([, value]) => value > 0).map(([key, value]) => `<button class="legend-row" data-chart-info="${COMPONENTS[key]} · ${money(value)} · ${number(value / costs.total * 100)}%"><span class="legend-name"><i style="--swatch:${COLORS[entries.findIndex(([k]) => k === key)]}"></i>${COMPONENTS[key]}</span><strong>${number(value / costs.total * 100)}%</strong><span>${money(value)}</span></button>`).join('') || '<p class="muted">Adicione custos à simulação.</p>'}</div></div><p class="chart-tip" aria-live="polite">Selecione uma despesa para ver os detalhes.</p>`;
}

export function lineChart(points) {
  const width = 660, height = 240, left = 74, right = 20, top = 20, bottom = 40;
  const max = Math.max(1, ...points.map(point => point.total)) * 1.12;
  const x = i => left + i / Math.max(1, points.length - 1) * (width - left - right);
  const y = value => height - bottom - value / max * (height - top - bottom);
  const path = points.map((point, i) => `${i ? 'L' : 'M'}${x(i)},${y(point.total)}`).join(' ');
  const grid = [0, 0.25, 0.5, 0.75, 1].map(factor => `<line x1="${left}" x2="${width - right}" y1="${y(max * factor)}" y2="${y(max * factor)}" stroke="var(--line)" stroke-dasharray="4 5"/><text x="${left - 12}" y="${y(max * factor) + 4}" text-anchor="end">${number(max * factor, 2)}</text>`).join('');
  return `<div class="line-chart"><svg viewBox="0 0 ${width} ${height}" role="group" aria-label="Evolução mensal do custo, em reais"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${path} L${x(points.length - 1)},${height - bottom} L${left},${height - bottom} Z" fill="url(#chart-fill)"/><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="3"/>${points.map((point, i) => `<circle class="chart-point" cx="${x(i)}" cy="${y(point.total)}" r="5" fill="var(--accent)" stroke="var(--panel)" stroke-width="2" tabindex="0" role="button" aria-label="Mês ${point.month}: ${money(point.total)}" data-chart-info="${point.month === 0 ? 'Hoje' : `Mês ${point.month}`} · Custo ${money(point.total)} · Preço sugerido ${money(point.price)}"><title>Mês ${point.month}: ${money(point.total)}</title></circle>`).join('')}<text x="${left}" y="${height - 12}">Hoje</text><text x="${x(points.length - 1)}" y="${height - 12}" text-anchor="end">${points.at(-1).month} meses</text></svg></div><p class="chart-tip" aria-live="polite">Passe sobre um ponto ou use Tab para explorar cada mês.</p>`;
}

export function barChart(rows) {
  const max = Math.max(1, ...rows.flatMap(row => [row.cost, row.price || 0]));
  return `<div class="bar-key"><span><i style="--swatch:var(--accent)"></i>Custo</span><span><i style="--swatch:#83baf4"></i>Preço sugerido</span></div><div class="bar-chart">${rows.map(row => `<div class="bar-row"><span>${escapeHTML(row.name)}</span><div class="bar-tracks"><button class="bar" style="--bar-color:var(--accent);width:${Math.max(1, row.cost / max * 100)}%" data-chart-info="${escapeHTML(row.name)} · Custo ${money(row.cost)}" aria-label="${escapeHTML(row.name)}: custo ${money(row.cost)}"><span>${money(row.cost)}</span></button>${row.price != null ? `<button class="bar" style="--bar-color:#83baf4;width:${Math.max(1, row.price / max * 100)}%" data-chart-info="${escapeHTML(row.name)} · Preço sugerido ${money(row.price)}" aria-label="${escapeHTML(row.name)}: preço ${money(row.price)}"><span>${money(row.price)}</span></button>` : '<small>Preço indisponível: revise os percentuais.</small>'}</div></div>`).join('')}</div><p class="chart-tip" aria-live="polite">Selecione uma barra para consultar o valor.</p>`;
}
