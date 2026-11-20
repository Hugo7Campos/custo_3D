/** Cálculos puros: valores intermediários não são arredondados. */
export const COMPONENTS = {
  material: 'Filamento', energy: 'Energia', depreciation: 'Depreciação',
  maintenance: 'Manutenção', packaging: 'Embalagem', consumables: 'Consumíveis',
  labor: 'Mão de obra', other: 'Outros custos',
};

export function parseDecimal(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  // Aceita 1234,56; 1.234,56; 1234.56. Ponto isolado é decimal.
  const normalized = text.includes(',')
    ? (/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(text) ? text.replaceAll('.', '').replace(',', '.') : '')
    : (/^-?\d+(?:\.\d+)?$/.test(text) ? text : '');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function roundMoney(value) {
  if (!Number.isFinite(value)) throw new RangeError('Valor monetário inválido.');
  return Math.round((value + Number.EPSILON * Math.max(1, Math.abs(value))) * 100) / 100 || 0;
}

export function ceilMoney(value) {
  if (!Number.isFinite(value)) throw new RangeError('Valor monetário inválido.');
  return Math.ceil(value * 100 - 1e-8) / 100 || 0;
}

function positive(value, label, allowZero = true) {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new RangeError(`${label}: informe um número ${allowZero ? 'maior ou igual a zero' : 'maior que zero'}.`);
  }
  return value;
}

export function productionCosts(data, scenario = data.production) {
  const { material, energy, printer, extras } = data;
  const hours = positive(scenario.hours, 'Horas') + positive(scenario.minutes, 'Minutos') / 60;
  const acquisition = positive(printer.acquisition, 'Aquisição');
  const residual = positive(printer.residual, 'Valor residual');
  if (residual > acquisition) throw new RangeError('O valor residual não pode superar o valor de aquisição.');
  const components = {
    material: positive(material.rollPrice, 'Preço do rolo') / positive(material.rollWeight, 'Peso do rolo', false)
      * positive(scenario.grams, 'Filamento utilizado') * (1 + positive(material.waste, 'Perdas') / 100),
    energy: positive(energy.watts, 'Potência') / 1000 * hours * positive(energy.tariff, 'Tarifa'),
    depreciation: (acquisition - residual) / positive(printer.lifetime, 'Vida útil', false) * hours,
    maintenance: positive(printer.maintenance, 'Manutenção') * hours,
    packaging: positive(extras.packaging, 'Embalagem'),
    consumables: positive(extras.consumables, 'Consumíveis'),
    labor: extras.laborEnabled ? positive(extras.laborRate, 'Valor da mão de obra') * positive(extras.laborMinutes, 'Minutos de trabalho') / 60 : 0,
    other: extras.custom.reduce((sum, item) => sum + positive(item.amount, 'Custo personalizado'), 0),
  };
  const total = Object.values(components).reduce((sum, cost) => sum + cost, 0);
  if (!Number.isFinite(total) || total > 1e9) throw new RangeError('O custo por peça deve ser de até R$ 1 bilhão. Revise peso, preço e vida útil.');
  return { components, total, hours };
}

/** A margem usa o preço de venda como base. O preço é elevado ao próximo centavo. */
export function priceFor(cost, pricing, marketplace = pricing.marketplaceEnabled) {
  positive(cost, 'Custo');
  const margin = positive(pricing.margin, 'Margem') / 100;
  const commission = marketplace ? positive(pricing.commission, 'Comissão') / 100 : 0;
  const tax = pricing.taxEnabled ? positive(pricing.tax, 'Impostos') / 100 : 0;
  const fixedFee = marketplace ? positive(pricing.fixedFee, 'Tarifa fixa') : 0;
  const sum = margin + commission + tax;
  const equilibrium = commission + tax >= 1 ? null : (cost + fixedFee) / (1 - commission - tax);
  const breakEven = equilibrium === null || equilibrium > 1e12 ? null : ceilMoney(equilibrium);
  if (sum >= 1 - 1e-12) return { valid: false, error: 'A soma de margem, comissão e impostos deve ser menor que 100%.', breakEven };
  const rawPrice = (cost + fixedFee) / (1 - sum);
  if (!Number.isFinite(rawPrice) || rawPrice > 1e12) return { valid: false, error: 'O preço excede o limite de precisão. Reduza os custos ou os percentuais.', breakEven };
  const suggested = ceilMoney(rawPrice);
  const commissionCost = suggested * commission;
  const taxCost = suggested * tax;
  const profit = suggested - cost - fixedFee - commissionCost - taxCost;
  return { valid: true, suggested, breakEven, profit, effectiveMargin: suggested ? profit / suggested * 100 : 0,
    commissionCost, taxCost, fixedFee, revenue: suggested - commissionCost - taxCost - fixedFee };
}

export function projectCosts(components, inflation, months = inflation.months) {
  positive(inflation.annual, 'Inflação');
  positive(months, 'Meses');
  const factor = (1 + inflation.annual / 100) ** (months / 12);
  const projected = Object.fromEntries(Object.entries(components).map(([key, value]) => [key, positive(value, COMPONENTS[key] || key) * (inflation.components[key] ? factor : 1)]));
  const total = Object.values(projected).reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total > 1e9) throw new RangeError('O custo projetado por peça deve ser de até R$ 1 bilhão. Reduza os custos ou a inflação.');
  return { components: projected, total, factor };
}

export const money = value => value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(roundMoney(value));
export const number = (value, digits = 1) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(value);

function csvCell(value) {
  let text = typeof value === 'number' ? roundMoney(value).toFixed(2).replace('.', ',') : String(value ?? '');
  // Neutraliza fórmulas quando o CSV é aberto em uma planilha.
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function costReport(data) {
  const rows = [['Cenário', 'Filamento (g)', 'Tempo (h)', ...Object.values(COMPONENTS).map(label => `${label} (R$)`), 'Custo total (R$)', 'Preço sugerido (R$)', 'Lucro (R$)', 'Margem efetiva (%)']];
  for (const scenario of [data.production, ...data.scenarios]) {
    const cost = productionCosts(data, scenario);
    const price = priceFor(cost.total, data.pricing);
    rows.push([scenario.name, scenario.grams, cost.hours, ...Object.values(cost.components), cost.total,
      price.valid ? price.suggested : 'Percentuais inválidos', price.valid ? price.profit : '', price.valid ? price.effectiveMargin : '']);
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}
