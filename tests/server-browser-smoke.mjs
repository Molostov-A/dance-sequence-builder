// Настоящий HTTP API, SQLite, cookies и браузер. Письма перехватываются в памяти;
// production API не содержит способа получить код без доступа к почте.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { readConfig } from '../server/config.mjs';
import { openStore } from '../server/store.mjs';

const chromePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
if (!chromePath) throw new Error('Set CHROME_PATH to run browser integration tests.');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dance-server-browser-'));
const crossOrigin = process.env.SMOKE_CROSS_ORIGIN === '1';
const db = openStore(':memory:'), mail = [];
const config = readConfig({ PUBLIC_URL: 'http://localhost:8080', SESSION_SECRET: 'test-secret-for-isolated-browser-integration',
  SMTP_HOST: 'test.invalid', SMTP_FROM: 'test@example.com' });
const { server } = await createApp(config, { db, sendCode: async (email, code) => { mail.push({ email, code }); } });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
config.origin = 'http://127.0.0.1:' + server.address().port;
if (crossOrigin) {
  config.frontendUrl = 'http://localhost:' + server.address().port + '/';
  config.frontendOrigin = new URL(config.frontendUrl).origin;
}
const browserUrl = crossOrigin ? config.frontendUrl : config.origin;
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-background-networking',
  '--remote-debugging-port=0', '--user-data-dir=' + path.join(temp, 'profile'), 'about:blank'], { stdio: 'ignore', windowsHide: true });
let ws, count = 0;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) {
  console.log('Checking: ' + label);
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { if (await fn()) return; }
    catch (err) { if (!/context.*destroyed|Cannot find context/i.test(err.message)) throw err; }
    await delay(25);
  }
  throw new Error('Timed out: ' + label);
}
try {
  const portFile = path.join(temp, 'profile', 'DevToolsActivePort');
  await until(() => fs.existsSync(portFile), 'Chrome startup');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let sequence = 0; const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data), task = pending.get(message.id);
    if (message.method === 'Page.javascriptDialogOpening') {
      ws.send(JSON.stringify({ id: ++sequence, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    }
    if (task) { clearTimeout(task.timer); pending.delete(message.id); message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result); }
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const check = async (label, expression) => { assert.equal(await evaluate(expression), true, label); count++; };
  await cdp('Page.enable');
  if (crossOrigin) await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'window.DANCE_API_BASE=' + JSON.stringify(config.origin) });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: browserUrl });
  await until(() => evaluate('typeof accountAvailable !== "undefined" && accountAvailable && !accountBusy'), 'API session');
  await evaluate(`window.confirm=()=>true;addMovement('Гостевая база');openAccountModal();`);
  async function login(email) {
    await evaluate(`document.getElementById('accountEmailInput').value=${JSON.stringify(email)};requestEmailCode();`);
    await until(() => evaluate('!!accountChallenge && !accountBusy'), 'email challenge');
    const code = mail.findLast(item => item.email === email).code;
    await evaluate(`document.getElementById('accountCodeInput').value=${JSON.stringify(code)};verifyEmailCode();`);
    await until(() => evaluate(`!!accountUser && accountUser.email===${JSON.stringify(email)} && accountReady && !accountBusy`), 'email login');
  }
  await login('a@example.com');
  await check('guest data is not uploaded on login', 'state.movements.length===0 && accountMeta.revision===0');
  await check('session cookie is HttpOnly', '!document.cookie.includes("dance_session")');
  if (crossOrigin) await check('cross-origin login works without third-party cookies', '!!accountAccessToken && accountCrossOrigin() && !!localStorage.getItem(ACCOUNT_TOKEN_KEY)');
  await check('server storage is account-specific', 'activeStorageKey===accountStorageKey(accountUser.id)');
  await evaluate('migrateGuestLibrary();');
  await until(() => evaluate('accountMeta.revision===1 && !accountBusy'), 'explicit guest migration');
  await check('explicit migration copies guest library', 'state.movements.some(m=>m.name==="Гостевая база")');
  await evaluate(`addMovement('Личное A')`);
  await until(() => evaluate('accountMeta.revision===2 && !accountBusy'), 'automatic save');
  await check('autosave reached real SQLite API', `(async()=>{const remote=await accountRequest('/api/data');return remote.data.movements.some(m=>m.name==='Личное A')})()`);
  await evaluate('window.previousSmokePage=true');
  await cdp('Page.reload');
  await until(() => evaluate('!window.previousSmokePage && typeof accountUser!=="undefined" && !!accountUser && accountReady && !accountBusy'), 'session restore');
  await check('reload restores authenticated account and library', 'accountUser.email==="a@example.com" && state.movements.some(m=>m.name==="Личное A")');
  await evaluate('logoutAccount();');
  await until(() => evaluate('!accountUser && !accountBusy'), 'logout');
  await check('logout hides private state and restores guest', '!state.movements.some(m=>m.name==="Личное A") && state.movements.some(m=>m.name==="Гостевая база")');
  await login('b@example.com');
  await check('second account does not inherit first account data', 'state.movements.length===0 && accountMeta.revision===0');
  await evaluate(`addMovement('Личное B')`);
  await until(() => evaluate('accountMeta.revision===1 && !accountBusy'), 'second account save');
  await evaluate('logoutAccount();'); await until(() => evaluate('!accountUser && !accountBusy'), 'second logout');
  await login('a@example.com');
  await check('returning to first account loads only its data', 'state.movements.some(m=>m.name==="Личное A") && !state.movements.some(m=>m.name==="Личное B")');
  await evaluate(`(async()=>{const remote=await accountRequest('/api/data');remote.data.movements.push({id:999,name:'Удалённая правка',lead:'',follow:''});remote.data.nextMovId=1000;await accountRequest('/api/data',{method:'PUT',body:JSON.stringify({revision:remote.revision,data:remote.data})});addMovement('Локальная правка');})()`);
  await until(() => evaluate('accountConflict && !accountBusy'), 'revision conflict');
  await check('conflict does not overwrite remote changes', `(async()=>{const remote=await accountRequest('/api/data');return remote.data.movements.some(m=>m.name==='Удалённая правка')&&!remote.data.movements.some(m=>m.name==='Локальная правка')})()`);
  await evaluate('useLocalAccountVersion();');
  await until(() => evaluate('!accountConflict && !accountBusy'), 'explicit conflict resolution');
  await check('explicit local choice is saved with revision check', `(async()=>{const remote=await accountRequest('/api/data');return remote.data.movements.some(m=>m.name==='Локальная правка')})()`);
  await cdp('Network.enable');
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await evaluate(`addMovement('Правка без сети')`);
  await until(() => evaluate('accountStatus==="Не синхронизировано" && !accountBusy'), 'offline save');
  await check('offline edits remain in the account cache', '!!accountUser && JSON.parse(localStorage.getItem(activeStorageKey)).movements.some(m=>m.name==="Правка без сети")');
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await evaluate('syncAccountNow()');
  await until(() => evaluate('accountStatus==="Сохранено на сервере" && !accountBusy'), 'online recovery');
  await check('offline edits upload after reconnection', `(async()=>{const remote=await accountRequest('/api/data');return remote.data.movements.some(m=>m.name==='Правка без сети')})()`);

  // Эмулируем вход B в другой вкладке: cookie меняется, а текущая вкладка
  // ещё содержит A. X-Account-ID должен остановить запись A в библиотеку B.
  await evaluate(`addMovement('Не отправлять пользователю B')`);
  const start = await (await fetch(config.origin + '/api/auth/email/start', { method: 'POST',
    headers: { Origin: crossOrigin ? config.frontendOrigin : config.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'b@example.com' }) })).json();
  const authenticated = await fetch(config.origin + '/api/auth/email/verify', { method: 'POST',
    headers: { Origin: crossOrigin ? config.frontendOrigin : config.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId: start.challengeId, code: mail.findLast(item => item.email === 'b@example.com').code }) });
  const loginB = await authenticated.json();
  const cookie = authenticated.headers.getSetCookie()[0].split(';')[0], cookieValue = cookie.slice(cookie.indexOf('=') + 1);
  if (crossOrigin) {
    await evaluate('localStorage.setItem(ACCOUNT_TOKEN_KEY,' + JSON.stringify(loginB.accessToken) + ');syncAccountNow()');
    await until(() => evaluate('!accountBusy'), 'separate bearer sessions');
  } else {
    await cdp('Network.setCookie', { name: 'dance_session', value: cookieValue, url: config.origin, httpOnly: true, sameSite: 'Lax' });
    await until(() => evaluate('!accountUser && !accountBusy'), 'account changed in another tab');
  }
  const privateB = await (await fetch(config.origin + '/api/data', { headers: { Cookie: cookie, 'X-Account-ID': loginB.user.id,
    ...(crossOrigin ? { Authorization: 'Bearer ' + loginB.accessToken } : {}) } })).json();
  assert.equal(privateB.data.movements.some(m => m.name === 'Не отправлять пользователю B'), false); count++;
  await check('account change preserves isolation', crossOrigin ? 'accountUser.email==="a@example.com"'
    : '!state.movements.some(m=>m.name==="Личное A") && activeStorageKey===STORAGE_KEY');
  await evaluate('window.previousSmokePage=true'); await cdp('Page.reload');
  await until(() => evaluate('!window.previousSmokePage && typeof accountUser!=="undefined" && !!accountUser && accountReady && !accountBusy'), 'new session after account change');
  await check('new cookie restores only its own account', 'accountUser.email==="b@example.com" && !state.movements.some(m=>m.name==="Не отправлять пользователю B")');
  for (const width of [1400, 900, 390]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
    await evaluate('openAccountModal()');
    await check('account dialog fits width ' + width, `(()=>{const r=document.querySelector('.account-modal').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth})()`);
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(temp, 'account-' + width + '.png'), Buffer.from(shot.data, 'base64'));
  }
  console.log('Browser integration: ' + count + ' checks passed; ' + (crossOrigin ? 'cross-origin bearer/CORS' : 'same-origin cookies') + ', real HTTP, SQLite, autosave and isolated accounts.');
  console.log('Screenshots: ' + temp);
} finally {
  if (ws) ws.close(); chrome.kill();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve)); db.close();
}
