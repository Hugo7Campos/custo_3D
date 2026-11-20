import { COMPONENTS, productionCosts, priceFor, projectCosts, parseDecimal, money, number, costReport } from './finance.js';
import { freshState, getPath, setPath, limitsFor, validateState, makeEnvelope, parseBackup, loadState, saveState } from './state.js';
import { escapeHTML as esc, donut, lineChart, barChart } from './charts.js';

const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  cube: '<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5v5"/>',
  wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8V5l14-3v3M21 11h-6v5h6"/><path d="M17 13.5h.01"/>',
  trend: '<path d="M3 4v17h18M6 16l5-6 4 3 6-8M17 5h4v4"/>',
  bars: '<path d="M4 21V11h4v10M10 21V3h4v18M16 21V7h4v14"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5l1.5 1.5M5 19l1.5-1.5M17.5 6.5l1.5-1.5"/>',
  moon: '<path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 16v5h16v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8z"/>',
  spool: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="m6 6 4 4m4 4 4 4M6 18l4-4m4-4 4-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};
const icon = (name, extra = '') => `<svg class="icon ${extra}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.cube}</svg>`;
const pages = [
  ['overview', 'Visão geral', 'grid', 'Seu próximo projeto começa com bons números.'],
  ['simulator', 'Simulador de produção', 'cube', 'Cada detalhe da impressão, traduzido em custo.'],
  ['pricing', 'Precificação e lucro', 'wallet', 'Encontre um preço que valoriza o seu trabalho.'],
  ['inflation', 'Projeção de inflação', 'trend', 'Planeje hoje os custos dos próximos meses.'],
  ['scenarios', 'Comparação de cenários', 'bars', 'Explore possibilidades antes de imprimir.'],
  ['settings', 'Configurações', 'settings', 'Seu espaço de trabalho, do seu jeito.'],
];
let storage;
try { storage = window.localStorage; } catch { storage = { getItem() { throw new Error(); }, setItem() { throw new Error(); } }; }
const loaded = loadState(storage);
let state = loaded.data;
let savedAt = loaded.savedAt;
let saveError = loaded.error;
let page = pages.some(([id]) => id === location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
const drafts = new Map();
let toastTimer;
let pendingAction = null;
let offlineReady = false;
const app = document.querySelector('#app');

function field(path, label, unit = '', help = '', kind = 'number') {
  const value = drafts.has(path) ? drafts.get(path).value : getPath(state, path);
  const display = kind === 'number' && typeof value === 'number' ? String(value).replace('.', ',') : value;
  const id = 'field-' + path.replaceAll('.', '-');
  const error = drafts.get(path)?.error || '';
  return `<div class="field"><label for="${id}">${label}</label><div class="input-wrap ${error ? 'invalid' : ''}"><input id="${id}" data-path="${path}" data-kind="${kind}" type="text" ${kind === 'number' ? 'inputmode="decimal"' : 'maxlength="100"'} value="${esc(display)}" aria-invalid="${!!error}" aria-describedby="${id}-help ${id}-error" autocomplete="off">${unit ? `<span class="unit">${unit}</span>` : ''}</div><small id="${id}-help" class="field-help">${help}</small><small id="${id}-error" class="field-error">${esc(error)}</small></div>`;
}
function toggle(path, label, help = '') {
  return `<label class="toggle-row"><span>${label}${help ? `<small>${help}</small>` : ''}</span><input type="checkbox" data-path="${path}" ${getPath(state, path) ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label>`;
}
function panel(title, body, subtitle = '', extra = '') {
  return `<section class="panel ${extra}"><div class="panel-heading"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div></div>${body}</section>`;
}
function metric(label, value, note, symbol, accent = false) {
  return `<article class="metric ${accent ? 'metric-accent' : ''}"><div class="metric-label"><span>${label}</span>${icon(symbol)}</div><strong class="metric-value">${value}</strong><span class="metric-note">${note}</span></article>`;
}
function summary() {
  const costs = productionCosts(state);
  const price = priceFor(costs.total, state.pricing);
  const future = projectCosts(costs.components, state.inflation);
  return { costs, price, future, futurePrice: priceFor(future.total, state.pricing) };
}
function priceError(price) { return price.valid ? '' : `<div class="notice error" role="alert">${icon('info')}<span>${price.error}</span></div>`; }
function breakdown(costs) {
  return `<div class="cost-list">${Object.entries(costs.components).map(([key, value]) => `<div><span>${COMPONENTS[key]}</span><strong>${money(value)}</strong></div>`).join('')}<div class="cost-total"><span>Total por peça</span><strong>${money(costs.total)}</strong></div></div>`;
}

function shell() {
  document.documentElement.dataset.theme = state.theme;
  const current = pages.find(([id]) => id === page);
  app.innerHTML = `<aside class="sidebar" id="sidebar"><a class="brand" href="#overview" aria-label="Custo3D, visão geral"><img src="./icon.svg" width="38" height="38" alt=""><span>Custo<span class="brand-light">3D</span></span></a><div class="workspace-label">SEU ESTÚDIO DE IMPRESSÃO</div><nav aria-label="Navegação principal">${pages.map(([id, label, symbol]) => `<a href="#${id}" class="nav-item ${page === id ? 'active' : ''}" ${page === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></a>`).join('')}</nav><div class="sidebar-bottom"><div class="local-card">${icon('shield')}<strong>Seus dados, com você.</strong><p>Salvos neste navegador.<br>Sem conta, sem complicação.</p></div><div class="sidebar-footer"><span>Custo3D <small>v1.0</small></span><button class="icon-button" data-action="theme" aria-label="${state.theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}" title="Alternar tema">${icon(state.theme === 'dark' ? 'sun' : 'moon')}</button></div></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" data-action="menu" aria-label="Abrir menu" aria-expanded="false" aria-controls="sidebar">${icon('menu')}</button><span>Workspace</span><span class="breadcrumb-divider">/</span><strong>${current[1]}</strong></div><div class="topbar-right"><span class="saved-state" id="saved-state"></span><span class="avatar" aria-label="Espaço pessoal">HC</span></div></header><main id="main" tabindex="-1"><div class="page-heading"><div><div class="eyebrow">DA IMPRESSÃO AO LUCRO</div><h1>${current[1]}</h1><p>${current[3]}</p></div><button class="button secondary export-button" data-action="csv">${icon('download')}Exportar relatório</button></div><div id="draft-warning" role="status"></div><div id="page-content"></div><footer class="main-footer"><span>Custo3D · Mais clareza em cada camada.</span><span id="offline-status">${navigator.onLine ? 'Processamento local' : 'Você está offline'}</span></footer></main></div>`;
  const content = document.querySelector('#page-content');
  content.innerHTML = ({ overview: overviewPage, simulator: simulatorPage, pricing: pricingPage, inflation: inflationPage, scenarios: scenariosPage, settings: settingsPage })[page]();
  updateResults();
  updateSaved();
  updateDraftWarning();
  updateOffline();
}

function overviewPage() {
  return `<section class="welcome-banner"><div><span class="pill"><span class="status-dot"></span>SIMULAÇÃO ATIVA</span><h2>Boas impressões.<br><span>Melhores decisões.</span></h2><p>Conheça o custo real de cada peça<br>e transforme suas ideias em resultado.</p><a class="button primary" href="#simulator">${icon('settings')}Ajustar simulação</a></div><div class="print-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="wire-cube"><div class="cube-top"></div><div class="cube-left"></div><div class="cube-right"></div></div><span class="art-label art-label-top">IDEIA</span><span class="art-label art-label-bottom">VALOR</span><span class="art-cross">+</span></div></section><div id="results"></div>`;
}
function overviewResults() {
  const { costs, price, future } = summary();
  const greatest = Object.entries(costs.components).sort((a, b) => b[1] - a[1])[0];
  return `<div class="section-line"><h2>Sua simulação em números</h2><span class="tag">Por peça produzida</span></div><div class="metrics">${metric('Custo de fabricação', money(costs.total), 'Todos os custos incluídos', 'cube')}${metric('Custo do filamento', money(costs.components.material), `${number(state.production.grams)} g + ${number(state.material.waste)}% de perdas`, 'spool')}${metric('Energia elétrica', money(costs.components.energy), `${number(costs.hours, 2)} h · ${money(state.energy.tariff)}/kWh`, 'bolt')}${metric('Preço sugerido', money(price.suggested), `${number(state.pricing.margin)}% de margem desejada`, 'wallet', true)}</div>${priceError(price)}<div class="dashboard-grid">${panel('Para onde vai cada real', donut(costs), 'Composição do custo de fabricação', 'distribution')}${panel('O resultado da sua impressão', `<div class="profit-hero"><span>Lucro estimado por peça</span><strong>${money(price.profit)}</strong><span class="profit-badge">${price.valid ? `${number(price.effectiveMargin)}% de margem efetiva` : 'Revise os percentuais'}</span></div><div class="cost-list"><div><span>Preço de venda</span><strong>${money(price.suggested)}</strong></div><div><span>Custo de fabricação</span><strong>${money(costs.total)}</strong></div><div><span>Comissão, tarifa e impostos</span><strong>${price.valid ? money(price.commissionCost + price.fixedFee + price.taxCost) : '—'}</strong></div></div><a href="#pricing" class="text-link">Explorar precificação ${icon('wallet')}</a>`, state.pricing.marketplaceEnabled ? 'Considerando venda em marketplace' : 'Considerando venda direta')}</div><div class="bottom-grid">${panel('Na mesa de impressão', `<div class="project-overview"><div class="project-icon">${icon('cube')}</div><div><strong>${esc(state.production.name)}</strong><span>${esc(state.material.type === 'Personalizado' ? state.material.customName : state.material.type)} · ${number(state.production.grams)} g · ${state.production.hours} h ${state.production.minutes} min</span></div><a class="icon-button" href="#simulator" aria-label="Editar simulação">${icon('settings')}</a></div><div class="mini-stats"><div><span>Impressora</span><strong>${esc(state.printer.model)}</strong></div><div><span>Desgaste + manutenção</span><strong>${money(costs.components.depreciation + costs.components.maintenance)}</strong></div></div>`)}${panel('Um olhar para o futuro', `<div class="future-mini"><div><span>Custo em ${state.inflation.months} meses</span><strong>${money(future.total)}</strong></div><span class="tag warm">+${money(future.total - costs.total)}</span></div><p class="muted">Simulação com inflação de ${number(state.inflation.annual)}% ao ano nos componentes selecionados.</p><a class="text-link" href="#inflation">Ajustar projeção ${icon('trend')}</a>`)}</div><div class="insight">${icon('info')}<p><strong>Um detalhe que faz diferença.</strong> ${costs.total ? `${COMPONENTS[greatest[0]]} representa ${number(greatest[1] / costs.total * 100)}% do custo desta peça.` : 'Informe os custos para começar.'} Use o peso e o tempo estimados pelo seu fatiador para uma simulação mais próxima da realidade.</p></div>`;
}

function simulatorPage() {
  return `<div class="simulation-context"><span>${icon('cube')} Uma peça por simulação</span><span>Valores iniciais ilustrativos e editáveis</span></div><div class="form-layout"><div class="form-stack">${panel('A peça que você quer imprimir', `<div class="fields">${field('production.name', 'Nome da simulação', '', 'Não é necessário cadastrar um produto.', 'text')}${field('production.grams', 'Filamento consumido', 'g', 'Use o peso informado pelo fatiador.')}${field('production.hours', 'Tempo de impressão', 'horas')}${field('production.minutes', 'Minutos adicionais', 'min', 'De 0 a 59 minutos.')}</div>`)}${panel('Material', `<div class="fields"><div class="field"><label for="material-type">Tipo de filamento</label><select id="material-type" data-path="material.type">${['PLA', 'PLA+', 'PETG', 'ABS', 'ASA', 'TPU', 'Personalizado'].map(type => `<option ${state.material.type === type ? 'selected' : ''}>${type}</option>`).join('')}</select></div>${state.material.type === 'Personalizado' ? field('material.customName', 'Nome do material', '', '', 'text') : ''}${field('material.rollPrice', 'Preço do rolo', 'R$')}${field('material.rollWeight', 'Peso total do rolo', 'g')}${field('material.waste', 'Adicional para perdas', '%', 'Suportes, purga e desperdício extra.')}</div>`)}${panel('Energia elétrica', `<div class="fields">${field('energy.watts', 'Potência média', 'W', 'Use a média medida durante a impressão.')}${field('energy.tariff', 'Tarifa de energia', 'R$/kWh')}</div><p class="note">R$ 1,03/kWh é apenas um exemplo para simulações em Cascavel, PR. Substitua pela tarifa efetiva da sua conta.</p>`)}${printerFields()}${panel('Custos adicionais', `<div class="fields">${field('extras.packaging', 'Embalagem por peça', 'R$')}${field('extras.consumables', 'Consumíveis por peça', 'R$')}</div>${toggle('extras.laborEnabled', 'Incluir mão de obra', 'Considere apenas o tempo de trabalho dedicado à peça.')}${state.extras.laborEnabled ? `<div class="fields">${field('extras.laborRate', 'Valor da hora de trabalho', 'R$/h')}${field('extras.laborMinutes', 'Tempo de trabalho por peça', 'min')}</div>` : ''}<div class="custom-costs">${state.extras.custom.map((item, index) => `<div class="custom-row"><div class="fields">${field(`extras.custom.${index}.name`, 'Descrição', '', '', 'text')}${field(`extras.custom.${index}.amount`, 'Valor por peça', 'R$')}</div><button class="icon-button danger-text" data-action="remove-cost" data-index="${index}" aria-label="Excluir ${esc(item.name)}">${icon('trash')}</button></div>`).join('')}</div><button class="button secondary small" data-action="add-cost" ${state.extras.custom.length >= 20 ? 'disabled' : ''}>${icon('plus')}Adicionar custo</button>`)}</div><aside id="results" class="sticky-summary" aria-label="Resultado da simulação"></aside></div>`;
}
function printerFields() {
  return panel('Impressora e desgaste', `<div class="fields">${field('printer.model', 'Modelo da impressora', '', '', 'text')}${field('printer.acquisition', 'Valor de aquisição', 'R$')}${field('printer.residual', 'Valor residual estimado', 'R$', 'Quanto ela poderá valer ao final da vida útil.')}${field('printer.lifetime', 'Vida útil estimada', 'horas', 'Total de horas produtivas estimadas.')}${field('printer.maintenance', 'Manutenção por hora', 'R$/h')}</div><details class="explanation"><summary>Como funciona a depreciação?</summary><p>É a distribuição do valor da máquina ao longo de sua vida útil. Aqui: (aquisição − residual) ÷ vida útil × horas de impressão.</p></details><p class="note">A Bambu Lab A1 Mini é um exemplo. Preço, potência, vida útil e manutenção iniciais são hipóteses, não especificações oficiais.</p>`);
}
function simulatorResults() {
  const { costs, price } = summary();
  return panel('Resumo da simulação', `<div class="summary-total"><span>Custo por peça</span><strong>${money(costs.total)}</strong></div>${breakdown(costs)}<div class="summary-price"><span>Preço sugerido</span><strong>${money(price.suggested)}</strong><small>Lucro estimado: ${money(price.profit)}</small></div>${priceError(price)}<a href="#pricing" class="button primary full">${icon('wallet')}Ajustar margem e taxas</a><p class="note">Os custos consideram uma peça. Divida peso, tempo e despesas de um lote pela quantidade de peças, quando aplicável.</p>`);
}

function pricingPage() {
  return `<div class="form-layout"><div class="form-stack">${panel('Seu objetivo de lucro', `${field('pricing.margin', 'Margem de lucro desejada', '%', 'Percentual do preço de venda que permanece como lucro.')}<details class="explanation" open><summary>Margem e markup são diferentes</summary><p>Com custo de R$ 70 e venda de R$ 100, a margem é 30%. O markup sobre o custo é 42,86%. O Custo3D usa sempre a margem sobre a venda.</p></details>`)}${panel('Canal de venda', `${toggle('pricing.marketplaceEnabled', 'Vender em marketplace', 'Ative para considerar comissão e tarifa fixa.')}<div class="fields">${field('pricing.commission', 'Comissão do marketplace', '%')}${field('pricing.fixedFee', 'Tarifa fixa por transação', 'R$', 'Aplicada uma vez por peça nesta simulação.')}</div><p class="note">Na venda direta, comissão e tarifa fixa são removidas. Os campos permanecem disponíveis para a comparação.</p>`)}${panel('Impostos opcionais', `${toggle('pricing.taxEnabled', 'Incluir impostos na simulação', 'Não presumimos nenhuma alíquota automaticamente.')}${state.pricing.taxEnabled ? field('pricing.tax', 'Impostos sobre a venda', '%', 'Informe a alíquota aplicável à sua operação.') : '<p class="muted">Nenhum imposto está sendo considerado.</p>'}`)}<div class="formula-card"><span>COMO CALCULAMOS</span><p>(custo + tarifa fixa) ÷<br>(1 − margem − comissão − impostos)</p><small>Percentuais convertidos em frações decimais.</small></div></div><div id="results" class="form-stack"></div></div>`;
}
function pricingResults() {
  const { costs, price } = summary();
  const direct = priceFor(costs.total, state.pricing, false);
  const market = priceFor(costs.total, state.pricing, true);
  return `${priceError(price)}${panel('Um preço que fecha a conta', `<div class="price-hero"><span>Preço sugerido por peça</span><strong>${money(price.suggested)}</strong><span>${state.pricing.marketplaceEnabled ? 'Venda em marketplace' : 'Venda direta'}</span></div><div class="two-metrics"><div><span>Lucro estimado</span><strong class="accent-text">${money(price.profit)}</strong></div><div><span>Margem efetiva</span><strong>${price.valid ? number(price.effectiveMargin, 2) + '%' : '—'}</strong></div></div><div class="cost-list"><div><span>Custo de fabricação</span><strong>${money(costs.total)}</strong></div><div><span>Comissão</span><strong>${money(price.commissionCost)}</strong></div><div><span>Tarifa fixa</span><strong>${money(price.fixedFee)}</strong></div><div><span>Impostos</span><strong>${money(price.taxCost)}</strong></div><div class="cost-total"><span>Preço mínimo de equilíbrio</span><strong>${money(price.breakEven)}</strong></div></div><p class="note">O preço de equilíbrio cobre custos e taxas, com lucro zero antes do arredondamento. O sugerido sobe ao próximo centavo para preservar a margem desejada.</p>`, 'Calculado com todos os custos da sua simulação', 'price-panel')}${panel('Venda direta ou marketplace?', `<div class="table-scroll"><table><caption class="sr-only">Comparação dos canais de venda</caption><thead><tr><th>Resultado</th><th>Venda direta</th><th>Marketplace</th></tr></thead><tbody><tr><th>Preço sugerido</th><td>${money(direct.suggested)}</td><td>${money(market.suggested)}</td></tr><tr><th>Lucro estimado</th><td>${money(direct.profit)}</td><td>${money(market.profit)}</td></tr><tr><th>Equilíbrio</th><td>${money(direct.breakEven)}</td><td>${money(market.breakEven)}</td></tr><tr><th>Margem efetiva</th><td>${direct.valid ? number(direct.effectiveMargin, 2) + '%' : '—'}</td><td>${market.valid ? number(market.effectiveMargin, 2) + '%' : '—'}</td></tr></tbody></table></div>${!market.valid ? priceError(market) : ''}`, 'Mesma margem desejada; preços ajustados às taxas')}`;
}

function inflationPage() {
  return `<div class="notice">${icon('info')}<span>Esta projeção é hipotética. Não representa uma previsão oficial do IPCA.</span></div><div class="form-layout"><div class="form-stack">${panel('Planeje o horizonte', `<div class="fields">${field('inflation.annual', 'Inflação anual esperada', '%')}${field('inflation.months', 'Horizonte da projeção', 'meses', 'Escolha de 1 a 60 meses.')}</div><label class="range-label" for="months-range">Ajuste rápido do horizonte</label><input id="months-range" type="range" min="1" max="60" step="1" value="${state.inflation.months}" data-range="months" aria-label="Horizonte em meses"><div class="range-labels"><span>1 mês</span><span>60 meses</span></div>`)}${panel('O que será reajustado?', `<div class="check-list">${Object.entries(COMPONENTS).map(([key, label]) => `<label><input type="checkbox" data-path="inflation.components.${key}" ${state.inflation.components[key] ? 'checked' : ''}><span>${label}</span>${key === 'depreciation' ? '<small>Fixo por padrão</small>' : ''}</label>`).join('')}</div><p class="note">Componentes desmarcados permanecem fixos. Comissão, impostos e margem mantêm suas alíquotas; a tarifa fixa não é reajustada.</p>`)}<div class="formula-card"><span>INFLAÇÃO COMPOSTA</span><p>Custo × (1 + taxa anual)<sup>meses / 12</sup></p><small>Aplicada apenas aos componentes selecionados.</small></div></div><div id="results" class="form-stack"></div></div>`;
}
function inflationResults() {
  const { costs, future, futurePrice } = summary();
  const points = Array.from({ length: state.inflation.months + 1 }, (_, month) => {
    const cost = projectCosts(costs.components, state.inflation, month);
    const price = priceFor(cost.total, state.pricing);
    return { month, total: cost.total, price: price.suggested };
  });
  return `<div class="metrics two">${metric('Custo atual', money(costs.total), 'Por peça, hoje', 'cube')}${metric('Custo projetado', money(future.total), `Em ${state.inflation.months} meses`, 'trend', true)}</div>${panel('A evolução do seu custo', lineChart(points), `Inflação de ${number(state.inflation.annual)}% ao ano nos itens selecionados`)}${panel('O impacto na sua precificação', `<div class="two-metrics"><div><span>Aumento do custo</span><strong>${money(future.total - costs.total)}</strong></div><div><span>Preço sugerido no futuro</span><strong class="accent-text">${money(futurePrice.suggested)}</strong></div></div>${priceError(futurePrice)}<div class="table-scroll"><table><caption class="sr-only">Custo atual e futuro por componente</caption><thead><tr><th>Componente</th><th>Hoje</th><th>Em ${state.inflation.months} meses</th></tr></thead><tbody>${Object.entries(COMPONENTS).map(([key, label]) => `<tr><th>${label} ${state.inflation.components[key] ? '' : '<small class="fixed-label">fixo</small>'}</th><td>${money(costs.components[key])}</td><td>${money(future.components[key])}</td></tr>`).join('')}</tbody></table></div>`)}`;
}

function scenariosPage() {
  return `<div class="notice">${icon('info')}<span>Use peso e tempo do fatiador. As dimensões externas da peça, isoladamente, não determinam o consumo de material.</span></div><div class="section-line"><div><h2>Suas possibilidades</h2><p class="muted">Material, máquina, custos adicionais e taxas são compartilhados entre os cenários.</p></div><button class="button primary" data-action="add-scenario" ${state.scenarios.length >= 20 ? 'disabled' : ''}>${icon('plus')}Novo cenário</button></div><div class="scenario-cards">${state.scenarios.map((scenario, i) => `<section class="panel scenario-card"><div class="scenario-heading"><span class="project-icon">${icon('cube')}</span><button class="icon-button danger-text" data-action="remove-scenario" data-index="${i}" aria-label="Excluir ${esc(scenario.name)}">${icon('trash')}</button></div>${field(`scenarios.${i}.name`, 'Nome do cenário', '', '', 'text')}${field(`scenarios.${i}.grams`, 'Filamento consumido', 'g')}<div class="fields">${field(`scenarios.${i}.hours`, 'Horas', 'h')}${field(`scenarios.${i}.minutes`, 'Minutos', 'min')}</div></section>`).join('') || '<div class="empty-state">Crie um cenário para comparar outras peças.</div>'}</div><div id="results"></div>`;
}
function scenariosResults() {
  const rows = state.scenarios.map(scenario => {
    const costs = productionCosts(state, scenario);
    return { ...scenario, costs, price: priceFor(costs.total, state.pricing) };
  });
  if (!rows.length) return '';
  return `${panel('Custo e preço, lado a lado', barChart(rows.map(row => ({ name: row.name, cost: row.costs.total, price: row.price.suggested }))), 'Compare o investimento de produção e o preço de venda de cada peça')}${panel('Os detalhes de cada cenário', `<div class="table-scroll"><table class="comparison-table"><caption class="sr-only">Comparação financeira de todos os cenários</caption><thead><tr><th>Componente</th>${rows.map(row => `<th>${esc(row.name)}</th>`).join('')}</tr></thead><tbody><tr><th>Filamento</th>${rows.map(row => `<td>${number(row.grams)} g</td>`).join('')}</tr><tr><th>Tempo de impressão</th>${rows.map(row => `<td>${row.hours} h ${row.minutes} min</td>`).join('')}</tr>${Object.entries(COMPONENTS).map(([key, label]) => `<tr><th>${label}</th>${rows.map(row => `<td>${money(row.costs.components[key])}</td>`).join('')}</tr>`).join('')}<tr class="table-total"><th>Custo total</th>${rows.map(row => `<td>${money(row.costs.total)}</td>`).join('')}</tr><tr><th>Preço sugerido</th>${rows.map(row => `<td class="accent-text">${money(row.price.suggested)}</td>`).join('')}</tr><tr><th>Lucro estimado</th>${rows.map(row => `<td>${money(row.price.profit)}</td>`).join('')}</tr></tbody></table></div>${priceError(rows[0].price)}`, 'Todos os valores monetários em reais')}`;
}

function settingsPage() {
  return `<div class="settings-grid">${panel('Aparência', `<div class="theme-options"><button class="theme-option ${state.theme === 'dark' ? 'selected' : ''}" data-action="set-dark" aria-pressed="${state.theme === 'dark'}">${icon('moon')}<strong>Escuro</strong><span>Foco em cada detalhe</span></button><button class="theme-option ${state.theme === 'light' ? 'selected' : ''}" data-action="set-light" aria-pressed="${state.theme === 'light'}">${icon('sun')}<strong>Claro</strong><span>Uma perspectiva mais leve</span></button></div>`)}${panel('Salvamento automático', `<div class="settings-status">${icon('shield')}<div><strong>Dados salvos neste navegador</strong><p id="settings-saved"></p></div></div><p class="muted">As alterações válidas são salvas automaticamente. Os dados não são sincronizados entre dispositivos e podem ser removidos ao limpar os dados do navegador. Use backups para transferir ou guardar suas configurações.</p>`)}${panel('Backup e restauração', `<p class="muted">Exporte todas as configurações e cenários em um arquivo JSON. Para restaurar, selecione um backup do Custo3D.</p><div class="actions"><button class="button primary" data-action="backup">${icon('download')}Exportar backup</button><button class="button secondary" data-action="import">Importar backup</button></div><input id="backup-file" type="file" accept=".json,application/json" hidden><p class="note">O arquivo será validado e você poderá confirmar antes de substituir seus dados.</p>`)}${panel('Relatórios para levar com você', `<p class="muted">Baixe a simulação atual e todos os cenários em CSV. O arquivo usa ponto e vírgula e valores no formato brasileiro.</p><button class="button secondary" data-action="csv">${icon('download')}Exportar relatório CSV</button>`)}${panel('Recomeçar com os exemplos', `<p class="muted">Restaure os valores iniciais, os cenários de exemplo e o tema escuro. Exporte um backup se quiser guardar o trabalho atual.</p><button class="button danger" data-action="reset">Restaurar configurações padrão</button>`)}${panel('Sobre as simulações', `<p class="muted">O Custo3D ajuda a estimar custos e preços por peça. Não mantém estoque, pedidos ou histórico de vendas.</p><p class="muted">Todos os parâmetros iniciais são ilustrativos. Ajuste-os ao seu material, à sua impressora e ao seu canal de venda.</p><span class="version-label">Custo3D 1.0 · Dados versão 1</span>`)}</div>`;
}

function updateResults() {
  const target = document.querySelector('#results');
  if (target) target.innerHTML = ({ overview: overviewResults, simulator: simulatorResults, pricing: pricingResults, inflation: inflationResults, scenarios: scenariosResults })[page]();
}
function updateSaved() {
  const text = saveError ? 'Salvamento indisponível' : savedAt ? `Salvo às ${new Date(savedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Exemplos carregados';
  const target = document.querySelector('#saved-state');
  if (target) { target.innerHTML = `${icon(saveError ? 'info' : 'check')}<span>${text}</span>`; target.title = saveError || (savedAt ? `Último salvamento: ${new Date(savedAt).toLocaleString('pt-BR')}` : 'Suas alterações serão salvas automaticamente.'); target.classList.toggle('save-error', !!saveError); }
  const settings = document.querySelector('#settings-saved');
  if (settings) settings.textContent = saveError || (savedAt ? `Último salvamento: ${new Date(savedAt).toLocaleString('pt-BR')}` : 'Faça uma alteração para salvar sua primeira simulação.');
}
function persist() {
  try { savedAt = saveState(storage, state); saveError = null; }
  catch { const firstFailure = !saveError; saveError = 'O navegador não permitiu salvar os dados. Exporte um backup para guardar as alterações desta sessão.'; if (firstFailure) toast(saveError); }
  updateSaved();
}
function updateDraftWarning() {
  document.querySelector('#draft-warning').innerHTML = drafts.size ? `<div class="notice error">${icon('info')}<span>Há ${drafts.size} campo(s) com edição incompleta ou inválida. Resultados, backups e relatórios usam os últimos valores válidos. Corrija os campos destacados.</span></div>` : '';
}
function toast(message) {
  const el = document.querySelector('#toast');
  clearTimeout(toastTimer);
  el.textContent = message; el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; }, 6500);
}
function confirmAction(title, message, action) {
  pendingAction = action;
  document.querySelector('#dialog-title').textContent = title;
  document.querySelector('#dialog-message').textContent = message;
  document.querySelector('#dialog-confirm').textContent = 'Confirmar';
  document.querySelector('#confirm-dialog').showModal();
  document.querySelector('#dialog-cancel').focus();
}
function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function handleInput(input) {
  const path = input.dataset.path;
  if (!path || input.type === 'checkbox' || input.tagName === 'SELECT') return;
  let value = input.value;
  let error = '';
  if (input.dataset.kind === 'number') {
    value = parseDecimal(value);
    const [min, max, integer] = limitsFor(path);
    if (value === null) error = 'Informe um número válido. Exemplo: 12,50.';
    else if (value < min || value > max || (integer && !Number.isInteger(value))) error = `Use ${integer ? 'um inteiro' : 'um valor'} de ${number(min, 2)} a ${number(max, 2)}.`;
  } else if (!value.trim() || value.length > 100) error = 'Use de 1 a 100 caracteres.';
  const candidate = structuredClone(state);
  if (!error) { setPath(candidate, path, typeof value === 'string' ? value.trim() : value); error = validateState(candidate)[0] || ''; }
  if (error) drafts.set(path, { value: input.value, error });
  else { drafts.delete(path); state = candidate; persist(); updateResults(); }
  input.setAttribute('aria-invalid', String(!!error));
  input.closest('.input-wrap')?.classList.toggle('invalid', !!error);
  document.getElementById(input.id + '-error').textContent = error;
  if (path === 'inflation.months' && !error) { const range = document.querySelector('#months-range'); if (range) range.value = value; }
  updateDraftWarning();
}

app.addEventListener('input', event => {
  const input = event.target;
  if (input.dataset.range === 'months') {
    const fieldInput = document.querySelector('[data-path="inflation.months"]');
    fieldInput.value = input.value; handleInput(fieldInput);
  } else handleInput(input);
});
app.addEventListener('change', async event => {
  const input = event.target;
  if (input.id === 'backup-file') {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1000000) throw new Error('Selecione um backup de até 1 MB.');
      const backup = parseBackup(await file.text());
      confirmAction('Restaurar este backup?', `Backup de ${new Date(backup.savedAt).toLocaleString('pt-BR')}, com ${backup.data.scenarios.length} cenário(s). Suas configurações atuais serão substituídas.`, () => {
        state = backup.data; drafts.clear(); persist(); shell(); toast('Backup importado. Suas configurações foram restauradas.');
      });
    } catch (error) { toast(error.message); }
    input.value = '';
    return;
  }
  if (input.dataset.path && (input.type === 'checkbox' || input.tagName === 'SELECT')) {
    const path = input.dataset.path;
    setPath(state, path, input.type === 'checkbox' ? input.checked : input.value);
    persist();
    if (path.startsWith('inflation.')) updateResults();
    else { shell(); document.querySelector(`[data-path="${path}"]`)?.focus(); }
  }
});
app.addEventListener('click', event => {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === 'menu') { const expanded = document.querySelector('#sidebar').classList.toggle('is-open'); actionEl.setAttribute('aria-expanded', String(expanded)); return; }
  if (action === 'theme' || action === 'set-dark' || action === 'set-light') {
    state.theme = action === 'theme' ? (state.theme === 'dark' ? 'light' : 'dark') : action === 'set-dark' ? 'dark' : 'light'; persist(); shell(); document.querySelector(`[data-action="${action}"]`)?.focus();
  }
  if (action === 'csv') { download(costReport(state), 'custo3d-relatorio.csv', 'text/csv;charset=utf-8'); toast('Relatório CSV exportado com os últimos valores válidos.'); }
  if (action === 'backup') { download(JSON.stringify(makeEnvelope(state), null, 2), 'custo3d-backup.json', 'application/json'); toast('Backup exportado com os últimos valores válidos.'); }
  if (action === 'import') document.querySelector('#backup-file').click();
  if (action === 'reset') confirmAction('Restaurar os valores iniciais?', 'As configurações e os cenários atuais serão substituídos pelos exemplos. Esta ação não pode ser desfeita sem um backup.', () => { state = freshState(); drafts.clear(); persist(); shell(); toast('Configurações padrão restauradas.'); });
  if (action === 'add-cost' && state.extras.custom.length < 20) { state.extras.custom.push({ id: crypto.randomUUID(), name: 'Novo custo', amount: 0 }); persist(); shell(); document.querySelector(`[data-path="extras.custom.${state.extras.custom.length - 1}.name"]`)?.focus(); }
  if (action === 'add-scenario' && state.scenarios.length < 20) { state.scenarios.push({ id: crypto.randomUUID(), name: 'Peça personalizada', grams: state.production.grams, hours: state.production.hours, minutes: state.production.minutes }); persist(); shell(); document.querySelector(`[data-path="scenarios.${state.scenarios.length - 1}.name"]`)?.focus(); }
  if (action === 'remove-cost' || action === 'remove-scenario') {
    const isCost = action === 'remove-cost';
    const prefix = isCost ? 'extras.custom.' : 'scenarios.';
    const array = isCost ? state.extras.custom : state.scenarios;
    const index = Number(actionEl.dataset.index);
    confirmAction(isCost ? 'Excluir este custo?' : 'Excluir este cenário?', `“${array[index].name}” será removido da simulação.`, () => {
      array.splice(index, 1);
      // Reindexa também os rascunhos dos outros itens, preservando edições incompletas.
      const previous = [...drafts];
      for (const [key] of previous) if (key.startsWith(prefix)) drafts.delete(key);
      for (const [key, draft] of previous) if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length).split('.'); const oldIndex = Number(rest.shift());
        if (oldIndex !== index) drafts.set(`${prefix}${oldIndex > index ? oldIndex - 1 : oldIndex}.${rest.join('.')}`, draft);
      }
      persist(); shell();
    });
  }
});
function chartInfo(event) {
  const target = event.target.closest('[data-chart-info]');
  if (!target) return;
  const panel = target.closest('.panel');
  const tip = panel?.querySelector('.chart-tip');
  if (tip) tip.textContent = target.dataset.chartInfo;
  panel?.querySelectorAll('.chart-selected').forEach(el => el.classList.remove('chart-selected'));
  target.classList.add('chart-selected');
}
app.addEventListener('pointerover', chartInfo);
app.addEventListener('focusin', chartInfo);
app.addEventListener('click', chartInfo);
app.addEventListener('keydown', event => { if (event.target.matches('[data-chart-info]') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); chartInfo(event); } });
document.querySelector('#dialog-confirm').addEventListener('click', () => { document.querySelector('#confirm-dialog').close(); const action = pendingAction; pendingAction = null; action?.(); });
document.querySelector('#dialog-cancel').addEventListener('click', () => { pendingAction = null; document.querySelector('#confirm-dialog').close(); });
document.querySelector('#confirm-dialog').addEventListener('cancel', () => { pendingAction = null; });
window.addEventListener('hashchange', () => {
  page = pages.some(([id]) => id === location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  shell(); document.querySelector('#main').focus(); window.scrollTo({ top: 0 });
});
function updateOffline() {
  const target = document.querySelector('#offline-status');
  if (target) target.textContent = !navigator.onLine ? 'Você está offline · cálculos disponíveis' : offlineReady ? 'Disponível offline neste navegador' : 'Processamento local';
}
window.addEventListener('online', updateOffline);
window.addEventListener('offline', updateOffline);
shell();
if (loaded.error) toast(loaded.error);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => { offlineReady = true; updateOffline(); }).catch(() => { offlineReady = false; });
}
