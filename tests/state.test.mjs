import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, validateState, makeEnvelope, parseBackup, loadState, saveState, STORAGE_KEY } from '../src/state.js';

test('padrões válidos; cópias não compartilham arrays', () => {
  assert.deepEqual(validateState(freshState()), []);
  const a = freshState(); a.scenarios[0].name = 'Alterado';
  assert.equal(freshState().scenarios[0].name, 'Peça pequena');
});

test('backup exportado é restaurado integralmente com tema, cenários e custos', () => {
  const data = freshState(); data.theme = 'light'; data.extras.custom.push({ id: 'c1', name: 'Adesivo', amount: 1.25 });
  const envelope = makeEnvelope(data);
  assert.deepEqual(parseBackup(JSON.stringify(envelope)).data, data);
});

test('JSON inválido, versão futura, data e identificação incompatíveis são rejeitados', () => {
  assert.throws(() => parseBackup('not json'));
  for (const mutation of [e => e.version = 2, e => e.app = 'OutraApp', e => e.savedAt = 'inválida', e => e.data = null]) {
    const envelope = makeEnvelope(freshState()); mutation(envelope);
    assert.throws(() => parseBackup(JSON.stringify(envelope)));
  }
});

test('backup rejeita tipos incorretos, campos ausentes, extras, limites e relações inválidas', () => {
  for (const mutation of [
    d => d.energy.watts = '100', d => delete d.pricing.taxEnabled, d => d.hidden = true,
    d => d.material.rollWeight = 0, d => d.printer.lifetime = 0,
    d => d.printer.residual = d.printer.acquisition + 1,
    d => d.production.minutes = 60, d => d.production.hours = 1.5,
    d => d.material.rollPrice = -3, d => d.inflation.months = 61,
    d => d.production.name = '', d => d.material.type = 'Metal',
    d => d.scenarios[0].id = d.scenarios[1].id,
    d => d.extras.custom = 'incorreto', d => d.pricing.margin = 101,
  ]) {
    const envelope = makeEnvelope(freshState()); mutation(envelope.data);
    assert.throws(() => parseBackup(JSON.stringify(envelope)));
  }
});

test('campos perigosos e listas excessivas são rejeitados', () => {
  const envelope = makeEnvelope(freshState());
  envelope.data.extras.custom = Array.from({ length: 21 }, (_, i) => ({ id: `a${i}`, name: 'Custo', amount: 1 }));
  assert.throws(() => parseBackup(JSON.stringify(envelope)));
  assert.throws(() => parseBackup(JSON.stringify(makeEnvelope(freshState())).replace('"theme":"dark"', '"__proto__":{},"theme":"dark"')));
  assert.throws(() => parseBackup(' '.repeat(1000001)));
});

test('soma de taxas inválida pode ser salva e corrigida, sem invalidar o restante do backup', () => {
  const data = freshState(); data.pricing.margin = 100;
  assert.deepEqual(validateState(data), []);
  assert.equal(parseBackup(JSON.stringify(makeEnvelope(data))).data.pricing.margin, 100);
});

test('persistência salva, restaura e conserva a versão anterior se a nova entrada é inválida', () => {
  const map = new Map(); const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
  const data = freshState(); data.energy.tariff = 1.25;
  const savedAt = saveState(storage, data);
  assert.deepEqual(loadState(storage), { data, savedAt, error: null });
  const previous = map.get(STORAGE_KEY);
  data.material.rollWeight = 0;
  assert.throws(() => saveState(storage, data));
  assert.equal(map.get(STORAGE_KEY), previous);
});

test('localStorage vazio, corrompido ou bloqueado não impede inicialização', () => {
  assert.deepEqual(loadState({ getItem: () => null }).data, freshState());
  assert.ok(loadState({ getItem: () => '{corrompido' }).error);
  assert.ok(loadState({ getItem() { throw new Error('Bloqueado'); } }).error);
  assert.throws(() => saveState({ setItem() { throw new Error('Quota'); } }, freshState()));
});
