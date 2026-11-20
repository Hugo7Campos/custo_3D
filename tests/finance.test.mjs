import test from 'node:test';
import assert from 'node:assert/strict';
import { productionCosts, priceFor, projectCosts, parseDecimal, roundMoney, ceilMoney, costReport } from '../src/finance.js';
import { freshState } from '../src/state.js';

const near = (actual, expected, delta = 1e-9) => assert.ok(Math.abs(actual - expected) < delta, `${actual} deveria ser próximo de ${expected}`);

test('custos de exemplo: material, energia, depreciação, manutenção e total', () => {
  const cost = productionCosts(freshState());
  near(cost.hours, 2.5);
  near(cost.components.material, 6.48375);
  near(cost.components.energy, 0.2575);
  near(cost.components.depreciation, 0.75);
  near(cost.components.maintenance, 0.375);
  near(cost.total, 9.86625);
});

test('depreciação usa aquisição menos residual e horas fracionárias', () => {
  const data = freshState();
  data.printer = { ...data.printer, acquisition: 3000, residual: 600, lifetime: 1200 };
  data.production.hours = 1; data.production.minutes = 15;
  near(productionCosts(data).components.depreciation, 2.5);
  data.printer.residual = 3000;
  assert.equal(productionCosts(data).components.depreciation, 0);
});

test('divisores zero e residual acima da aquisição são rejeitados', () => {
  for (const edit of [data => data.material.rollWeight = 0, data => data.printer.lifetime = 0, data => data.printer.residual = 9999]) {
    const data = freshState(); edit(data);
    assert.throws(() => productionCosts(data), RangeError);
  }
});

test('mão de obra opcional e múltiplos custos personalizados', () => {
  const data = freshState();
  data.extras.custom = [{ id: '1', name: 'Cola', amount: 1.5 }, { id: '2', name: 'Pintura', amount: 2.2 }];
  assert.equal(productionCosts(data).components.labor, 0);
  data.extras.laborEnabled = true; data.extras.laborMinutes = 45; data.extras.laborRate = 24;
  assert.equal(productionCosts(data).components.labor, 18);
  near(productionCosts(data).components.other, 3.7);
});

test('margem de 30% sobre venda: custo 70 implica preço 100, não 91', () => {
  const pricing = { ...freshState().pricing, marketplaceEnabled: false };
  const result = priceFor(70, pricing);
  assert.equal(result.suggested, 100);
  assert.equal(result.profit, 30);
  assert.equal(result.effectiveMargin, 30);
  assert.equal(result.breakEven, 70);
});

test('marketplace: comissão e impostos sobre a venda, tarifa fixa no numerador', () => {
  const pricing = { margin: 30, marketplaceEnabled: true, commission: 10, fixedFee: 5, taxEnabled: true, tax: 5 };
  const result = priceFor(50, pricing);
  assert.equal(result.suggested, 100);
  assert.equal(result.commissionCost, 10);
  assert.equal(result.taxCost, 5);
  assert.equal(result.profit, 30);
  assert.equal(result.breakEven, 64.71);
});

test('venda direta remove comissão e tarifa, mantendo imposto opcional', () => {
  const pricing = { margin: 20, marketplaceEnabled: true, commission: 15, fixedFee: 8, taxEnabled: true, tax: 10 };
  const result = priceFor(70, pricing, false);
  assert.equal(result.suggested, 100);
  assert.equal(result.commissionCost, 0);
  assert.equal(result.fixedFee, 0);
  assert.equal(result.taxCost, 10);
  assert.equal(result.profit, 20);
});

test('imposto desativado não altera os cálculos mesmo com alíquota preenchida', () => {
  const pricing = { ...freshState().pricing, tax: 99, taxEnabled: false };
  assert.deepEqual(priceFor(20, pricing), priceFor(20, { ...pricing, tax: 0 }));
});

test('soma igual ou superior a 100% não produz Infinity nem preço negativo', () => {
  for (const margin of [86, 90, 100]) {
    const result = priceFor(50, { ...freshState().pricing, margin });
    assert.equal(result.valid, false);
    assert.equal(result.suggested, undefined);
  }
  assert.equal(priceFor(50, { ...freshState().pricing, commission: 100 }).breakEven, null);
});

test('arredondamento para cima preserva margem e equilíbrio', () => {
  const data = freshState();
  const cost = productionCosts(data).total;
  const result = priceFor(cost, data.pricing);
  assert.equal(result.suggested, 21.19);
  assert.ok(result.effectiveMargin >= 30);
  assert.ok(result.breakEven * (1 - .14) - 2 - cost >= 0);
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(ceilMoney(2.001), 2.01);
  assert.equal(ceilMoney(2), 2);
});

test('custos e preço zerados são válidos sem taxas fixas', () => {
  const pricing = { ...freshState().pricing, fixedFee: 0 };
  const result = priceFor(0, pricing);
  assert.equal(result.suggested, 0); assert.equal(result.profit, 0); assert.equal(result.effectiveMargin, 0);
});

test('inflação composta em 6, 12 e 60 meses', () => {
  const inflation = { annual: 10, months: 12, components: { material: true } };
  near(projectCosts({ material: 100 }, inflation).total, 110);
  near(projectCosts({ material: 100 }, inflation, 6).total, 100 * Math.sqrt(1.1));
  near(projectCosts({ material: 100 }, inflation, 60).total, 161.051);
});

test('inflação respeita componentes fixos e pode ser zero', () => {
  const inflation = { annual: 10, months: 12, components: { material: true, depreciation: false } };
  near(projectCosts({ material: 100, depreciation: 30 }, inflation).total, 140);
  near(projectCosts({ material: 100, depreciation: 30 }, { ...inflation, annual: 0 }).total, 130);
  near(projectCosts({ material: 100 }, inflation, 0).total, 100);
});

test('preço futuro usa o custo projetado e preserva as mesmas taxas', () => {
  const data = freshState();
  const future = projectCosts(productionCosts(data).components, data.inflation);
  const result = priceFor(future.total, data.pricing);
  assert.ok(result.effectiveMargin >= 30);
  assert.equal(result.fixedFee, data.pricing.fixedFee);
});

test('cenários usam seus pesos e tempos sem alterar a configuração base', () => {
  const data = freshState(); const snapshot = structuredClone(data);
  const small = productionCosts(data, data.scenarios[0]);
  const large = productionCosts(data, data.scenarios[2]);
  assert.ok(large.total > small.total);
  assert.deepEqual(data, snapshot);
});

test('parsing aceita vírgula brasileira, milhar com vírgula e ponto decimal', () => {
  for (const [input, expected] of [['12,50', 12.5], ['1.234,56', 1234.56], ['1234.56', 1234.56], ['0', 0], [' 2,5 ', 2.5], [8.5, 8.5]]) assert.equal(parseDecimal(input), expected);
  for (const invalid of ['', ' ', '1,', 'abc', 'NaN', 'Infinity', '1e5', '1,2,3', '12.34,56', null, Infinity]) assert.equal(parseDecimal(invalid), null);
});

test('cálculos rejeitam negativos e números não finitos', () => {
  const data = freshState(); data.production.grams = -1;
  assert.throws(() => productionCosts(data));
  assert.throws(() => priceFor(Infinity, freshState().pricing));
  assert.throws(() => projectCosts({ material: 10 }, { annual: -1, months: 12, components: {} }));
  assert.throws(() => roundMoney(NaN));
});

test('combinações extremas têm limites de precisão explícitos', () => {
  const data = freshState();
  data.material.rollPrice = 1e6; data.material.rollWeight = .01; data.production.grams = 1e5;
  assert.throws(() => productionCosts(data));
  assert.throws(() => projectCosts({ material: 1e9 }, { annual: 100, months: 60, components: { material: true } }));
  assert.equal(priceFor(1e9, { ...freshState().pricing, margin: 99.999999, marketplaceEnabled: false }).valid, false);
  assert.equal(Object.is(roundMoney(-.001), -0), false);
});

test('CSV inclui todos os custos, decimal brasileiro e proteção contra fórmulas', () => {
  const data = freshState(); data.production.name = '=1+1'; data.scenarios[0].name = 'Peça; "A"';
  const csv = costReport(data);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"Peça; ""A"""'));
  assert.ok(csv.includes('"9,87"'));
  assert.equal(csv.split('\r\n').length, 5);
  data.pricing.margin = 100;
  assert.ok(costReport(data).includes('Percentuais inválidos'));
});
