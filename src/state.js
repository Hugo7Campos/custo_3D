import { productionCosts, projectCosts } from './finance.js';

export const VERSION = 1;
export const STORAGE_KEY = 'custo3d:state';
export const DEFAULTS = {
  theme: 'dark',
  production: { name: 'Suporte de mesa', grams: 65, hours: 2, minutes: 30 },
  material: { type: 'PLA', customName: 'Meu filamento', rollPrice: 95, rollWeight: 1000, waste: 5 },
  energy: { watts: 100, tariff: 1.03 },
  printer: { model: 'Bambu Lab A1 Mini', acquisition: 1800, residual: 300, lifetime: 5000, maintenance: 0.15 },
  extras: { packaging: 1.5, consumables: 0.5, laborEnabled: false, laborRate: 20, laborMinutes: 10, custom: [] },
  pricing: { margin: 30, marketplaceEnabled: true, commission: 14, fixedFee: 2, taxEnabled: false, tax: 0 },
  inflation: { annual: 4.5, months: 12, components: { material: true, energy: true, depreciation: false, maintenance: true, packaging: true, consumables: true, labor: false, other: false } },
  scenarios: [
    { id: 'small', name: 'Peça pequena', grams: 25, hours: 1, minutes: 0 },
    { id: 'medium', name: 'Peça média', grams: 65, hours: 2, minutes: 30 },
    { id: 'large', name: 'Peça grande', grams: 180, hours: 7, minutes: 0 },
  ],
};

export const freshState = () => structuredClone(DEFAULTS);

// Limites usados tanto nos campos quanto na validação estrita do backup.
export const LIMITS = {
  'production.grams': [0, 100000], 'production.hours': [0, 10000, true], 'production.minutes': [0, 59, true],
  'material.rollPrice': [0, 1000000], 'material.rollWeight': [0.01, 1000000], 'material.waste': [0, 1000],
  'energy.watts': [0, 100000], 'energy.tariff': [0, 1000],
  'printer.acquisition': [0, 10000000], 'printer.residual': [0, 10000000], 'printer.lifetime': [0.01, 1000000], 'printer.maintenance': [0, 100000],
  'extras.packaging': [0, 1000000], 'extras.consumables': [0, 1000000], 'extras.laborRate': [0, 100000], 'extras.laborMinutes': [0, 100000],
  'pricing.margin': [0, 100], 'pricing.commission': [0, 100], 'pricing.fixedFee': [0, 1000000], 'pricing.tax': [0, 100],
  'inflation.annual': [0, 100], 'inflation.months': [1, 60, true],
};

export function limitsFor(path) {
  if (/^scenarios\.\d+\.(grams|hours|minutes)$/.test(path)) return LIMITS[`production.${path.split('.').at(-1)}`];
  if (/^extras\.custom\.\d+\.amount$/.test(path)) return [0, 1000000];
  return LIMITS[path];
}
export const getPath = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
export function setPath(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((item, key) => item[key], object)[last] = value;
}

export function validateState(data) {
  const errors = [];
  function shape(value, template, path = '') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${path || 'Dados'}: estrutura inválida.`); return; }
    for (const key of Object.keys(value)) if (!(Object.hasOwn(template, key))) errors.push(`${path}.${key}: campo incompatível.`);
    for (const [key, sample] of Object.entries(template)) {
      const itemPath = path ? `${path}.${key}` : key;
      const item = value[key];
      if (Array.isArray(sample)) {
        if (!Array.isArray(item)) { errors.push(`${itemPath}: lista inválida.`); continue; }
        if (item.length > 20) errors.push(`${itemPath}: máximo de 20 itens.`);
        const model = key === 'scenarios' ? DEFAULTS.scenarios[0] : { id: '', name: '', amount: 0 };
        item.forEach((entry, index) => shape(entry, model, `${itemPath}.${index}`));
        const ids = item.map(entry => entry?.id);
        if (new Set(ids).size !== ids.length) errors.push(`${itemPath}: identificadores repetidos.`);
      } else if (typeof sample === 'object') shape(item, sample, itemPath);
      else if (typeof item !== typeof sample) errors.push(`${itemPath}: tipo inválido.`);
      else if (typeof item === 'number') {
        const [min, max, integer] = limitsFor(itemPath) ?? [0, 10000000];
        if (!Number.isFinite(item) || item < min || item > max || (integer && !Number.isInteger(item))) errors.push(`${itemPath}: valor fora dos limites.`);
      } else if (typeof item === 'string' && (!item.trim() || item.length > 100)) errors.push(`${itemPath}: use de 1 a 100 caracteres.`);
    }
  }
  shape(data, DEFAULTS);
  if (data?.theme !== 'dark' && data?.theme !== 'light') errors.push('Tema inválido.');
  if (!['PLA', 'PLA+', 'PETG', 'ABS', 'ASA', 'TPU', 'Personalizado'].includes(data?.material?.type)) errors.push('Tipo de filamento inválido.');
  if (data?.printer?.residual > data?.printer?.acquisition) errors.push('O valor residual não pode superar a aquisição.');
  if (!errors.length) {
    try {
      const costs = productionCosts(data);
      projectCosts(costs.components, data.inflation);
      data.scenarios.forEach(scenario => productionCosts(data, scenario));
    } catch (error) { errors.push(error.message); }
  }
  return errors;
}

export function makeEnvelope(data, savedAt = new Date().toISOString()) {
  const errors = validateState(data);
  if (errors.length) throw new Error(errors[0]);
  return { app: 'Custo3D', version: VERSION, savedAt, data };
}

export function parseBackup(text) {
  if (typeof text !== 'string' || text.length > 1000000) throw new Error('O backup deve ser um JSON de até 1 MB.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('O arquivo não contém um JSON válido.'); }
  if (!parsed || parsed.app !== 'Custo3D' || parsed.version !== VERSION) throw new Error('Backup incompatível com esta versão do Custo3D.');
  if (typeof parsed.savedAt !== 'string' || !Number.isFinite(Date.parse(parsed.savedAt))) throw new Error('Data do backup inválida.');
  const errors = validateState(parsed.data);
  if (errors.length) throw new Error(`Backup inválido: ${errors[0]}`);
  return parsed;
}

export function loadState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { data: freshState(), savedAt: null, error: null };
    const stored = parseBackup(raw);
    return { data: stored.data, savedAt: stored.savedAt, error: null };
  } catch {
    return { data: freshState(), savedAt: null, error: 'Não foi possível restaurar os dados locais. Os exemplos foram carregados. Exporte um backup após revisar suas configurações.' };
  }
}

export function saveState(storage, data) {
  const envelope = makeEnvelope(data);
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  return envelope.savedAt;
}
