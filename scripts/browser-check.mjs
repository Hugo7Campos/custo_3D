/** Testes reais no Edge/Chrome via DevTools, sem dependências npm. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const browserPath = process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const qa = resolve('.qa');
await mkdir(qa, { recursive: true });
const port = 4187, debugPort = 9247;
const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'pipe', windowsHide: true });
let browser, socket;
const consoleErrors = [];
const browserStderr = [];
let checks = 0;

async function waitFor(fn, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const value = await fn(); if (value) return value; } catch { /* Aguarda inicialização. */ }
    await delay(100);
  }
  throw new Error(`Tempo esgotado: ${label}`);
}
let counter = 0;
const requests = new Map();
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++counter;
    const timer = setTimeout(() => { requests.delete(id); reject(new Error(`Tempo esgotado: ${method}`)); }, 20000);
    requests.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function check(expression, message) { assert.ok(await evaluate(expression), message); checks++; console.log(`OK ${message}`); }
async function input(path, value) {
  await evaluate(`(() => { const el = document.querySelector('[data-path="${path}"]'); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
}
async function click(selector) { await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (typeof el.click === 'function') el.click(); else el.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`); }
async function navigate(page) {
  await evaluate(`location.hash = ${JSON.stringify(page)}`);
  await waitFor(() => evaluate(`!!document.querySelector('a[aria-current="page"][href="#${page}"]')`), page);
}
async function screenshot(name, width, height) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await delay(150);
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(resolve(qa, name), Buffer.from(data, 'base64'));
}

try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${port}`)).ok, 'servidor');
  browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${resolve(qa, `browser-profile-${Date.now()}`)}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  browser.stderr.on('data', data => browserStderr.push(data.toString()));
  const targets = await waitFor(async () => (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(), 'navegador');
  const target = targets.find(target => target.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const pending = requests.get(message.id); if (!pending) return;
      clearTimeout(pending.timer); requests.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params.exceptionDetails.text);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push(message.params.args.map(arg => arg.value).join(' '));
  });
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await waitFor(() => evaluate(`!!document.querySelector('.metric-value')`), 'dashboard');
  await check(`document.querySelector('h1').textContent === 'Visão geral'`, 'dashboard carrega');
  await check(`document.querySelector('.metric-value').textContent.includes('9,87')`, 'custo inicial correto na interface');
  await check(`document.querySelector('.metric-accent .metric-value').textContent.includes('21,19')`, 'preço inicial correto na interface');
  await screenshot('desktop.png', 1440, 1000);
  await navigate('simulator');
  await input('production.grams', '100,5');
  await check(`JSON.parse(localStorage.getItem('custo3d:state')).data.production.grams === 100.5`, 'vírgula decimal salva corretamente');
  await input('material.rollWeight', '');
  await check(`document.querySelector('[data-path="material.rollWeight"]').getAttribute('aria-invalid') === 'true'`, 'campo vazio apresenta validação');
  await check(`JSON.parse(localStorage.getItem('custo3d:state')).data.material.rollWeight === 1000`, 'entrada incompleta preserva último valor salvo');
  await check(`!document.querySelector('#results').textContent.includes('NaN')`, 'entrada inválida não corrompe resultados');
  await navigate('pricing');
  await navigate('simulator');
  await check(`document.querySelector('[data-path="material.rollWeight"]').value === ''`, 'rascunho inválido permanece ao navegar');
  await input('material.rollWeight', '1000');
  await input('printer.residual', '2000');
  await check(`document.querySelector('[data-path="printer.residual"]').getAttribute('aria-invalid') === 'true'`, 'residual acima da aquisição é rejeitado');
  await input('printer.residual', '300');
  await click('[data-path="extras.laborEnabled"]');
  await check(`!!document.querySelector('[data-path="extras.laborRate"]')`, 'mão de obra pode ser ativada');
  await click('[data-action="add-cost"]');
  await input('extras.custom.0.name', '<img src=x onerror=alert(1)>');
  await input('extras.custom.0.amount', '2,75');
  await check(`JSON.parse(localStorage.getItem('custo3d:state')).data.extras.custom[0].amount === 2.75`, 'custo personalizado é salvo');
  await click('[data-action="remove-cost"]');
  await click('#dialog-cancel');
  await check(`!!document.querySelector('[data-path="extras.custom.0.name"]')`, 'cancelar exclusão preserva custo');
  await click('[data-action="remove-cost"]'); await click('#dialog-confirm');
  await check(`!document.querySelector('[data-path="extras.custom.0.name"]')`, 'exclusão confirmada remove custo');
  await navigate('pricing');
  await input('pricing.margin', '86');
  await check(`document.querySelector('#results').textContent.includes('menor que 100%')`, 'soma de percentuais igual a 100% é bloqueada');
  await input('pricing.margin', '30');
  await click('[data-path="pricing.marketplaceEnabled"]');
  await check(`document.querySelector('.price-hero').textContent.includes('Venda direta')`, 'canal de venda é atualizado');
  await navigate('inflation');
  await input('inflation.months', '60');
  await check(`document.querySelectorAll('.chart-point').length === 61`, 'projeção inclui todos os 60 meses');
  await click('.chart-point:last-of-type');
  await check(`document.querySelector('.chart-tip').textContent.includes('Mês 60')`, 'gráfico responde à interação');
  await click('[data-path="inflation.components.material"]');
  await check(`JSON.parse(localStorage.getItem('custo3d:state')).data.inflation.components.material === false`, 'seleção de componentes persiste');
  await navigate('scenarios');
  await click('[data-action="add-scenario"]');
  await input('scenarios.3.name', '<b>Peça & teste</b>');
  await check(`document.querySelectorAll('.scenario-card').length === 4`, 'criação de cenário funciona');
  await check(`!document.querySelector('.comparison-table b') && document.querySelector('.comparison-table').textContent.includes('<b>Peça & teste</b>')`, 'nomes são exibidos como texto seguro');
  await screenshot('cenarios.png', 1440, 1000);
  await navigate('settings');
  await click('[data-action="set-light"]');
  await check(`document.documentElement.dataset.theme === 'light'`, 'tema claro funciona');
  await cdp('Page.reload', { ignoreCache: true });
  await waitFor(() => evaluate(`!!document.querySelector('.settings-grid')`), 'restauração');
  await check(`document.documentElement.dataset.theme === 'light'`, 'tema restaurado após recarregar');
  await check(`JSON.parse(localStorage.getItem('custo3d:state')).data.production.grams === 100.5`, 'simulação restaurada após recarregar');
  // Captura os arquivos gerados sem depender da pasta de downloads do sistema.
  await evaluate(`window.__downloads = []; URL.createObjectURL = blob => { window.__downloads.push(blob); return 'blob:qa'; }; HTMLAnchorElement.prototype.click = function() {};`);
  await click('[data-action="backup"]');
  await check(`(async () => { const data = JSON.parse(await window.__downloads[0].text()); return data.app === 'Custo3D' && data.data.scenarios.length === 4; })()`, 'backup JSON inclui configurações e cenários');
  await click('[data-action="csv"]');
  await check(`(async () => (await window.__downloads[1].text()).includes('Custo total (R$)'))()`, 'CSV exportado contém custos');
  await evaluate(`(async () => { window.__backup = await window.__downloads[0].text(); })()`);
  await click('[data-action="reset"]'); await click('#dialog-cancel');
  await check(`document.documentElement.dataset.theme === 'light'`, 'cancelamento da restauração preserva dados');
  await click('[data-action="reset"]'); await click('#dialog-confirm');
  await check(`document.documentElement.dataset.theme === 'dark'`, 'restauração confirmada retorna aos padrões');
  await evaluate(`(() => { const dt = new DataTransfer(); dt.items.add(new File([window.__backup], 'backup.json', { type: 'application/json' })); const el = document.querySelector('#backup-file'); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(() => evaluate(`document.querySelector('#confirm-dialog').open`), 'confirmação da importação');
  await click('#dialog-confirm');
  await check(`document.documentElement.dataset.theme === 'light' && JSON.parse(localStorage.getItem('custo3d:state')).data.scenarios.length === 4`, 'importação restaura backup após confirmação');
  await evaluate(`(() => { const dt = new DataTransfer(); dt.items.add(new File(['{"app":"incompatível"}'], 'bad.json')); const el = document.querySelector('#backup-file'); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(() => evaluate(`document.querySelector('#toast').textContent.includes('incompatível')`), 'rejeição de backup');
  await check(`JSON.parse(localStorage.getItem('custo3d:state')).data.scenarios.length === 4`, 'backup inválido não substitui dados');
  await navigate('overview');
  await screenshot('claro.png', 1440, 1000);
  await click('[data-action="theme"]');
  await screenshot('mobile.png', 390, 844);
  await check(`document.documentElement.scrollWidth <= innerWidth`, 'dashboard sem transbordamento em celular');
  for (const id of ['simulator', 'pricing', 'inflation', 'scenarios', 'settings']) {
    await navigate(id);
    await check(`document.documentElement.scrollWidth <= innerWidth`, `${id} sem transbordamento em celular`);
    await check(`!document.querySelector('#page-content').textContent.match(/NaN|Infinity/)`, `${id} sem valores inválidos`);
  }
  await click('[data-action="menu"]');
  await check(`document.querySelector('#sidebar').classList.contains('is-open')`, 'menu móvel abre');
  await navigate('overview');
  await waitFor(() => evaluate(`!!navigator.serviceWorker.controller`), 'service worker');
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await cdp('Page.reload');
  await waitFor(() => evaluate(`!!document.querySelector('.metric-value')`), 'recarga offline');
  await check(`document.querySelector('h1').textContent === 'Visão geral'`, 'aplicação reabre offline com cache local');
  await navigate('simulator'); await input('production.grams', '120');
  await check(`JSON.parse(localStorage.getItem('custo3d:state')).data.production.grams === 120`, 'cálculos e salvamento funcionam offline');
  assert.deepEqual(consoleErrors, [], 'não deve haver erros de JavaScript');
  console.log(`Concluído: ${checks} verificações no navegador. Capturas em .qa/.`);
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await screenshot('falha.png', 1440, 1000); } catch { /* Melhor esforço. */ }
  }
  console.error(error);
  if (!socket) console.error(browserStderr.join('').slice(-3000));
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await cdp('Browser.close'); } catch { /* Pode fechar antes da resposta. */ } socket.close(); }
  browser?.kill(); server.kill();
  for (const request of requests.values()) clearTimeout(request.timer);
}
