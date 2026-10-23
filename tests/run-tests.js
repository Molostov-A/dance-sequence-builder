'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const tmpRoot = path.join(os.tmpdir(), 'opencode');
if (!fs.existsSync(tmpRoot)) fs.mkdirSync(tmpRoot, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(tmpRoot, 'dlc-tests-'));

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(path.join(projectRoot, 'css'), path.join(tmpDir, 'css'));
copyDir(path.join(projectRoot, 'js'), path.join(tmpDir, 'js'));
fs.copyFileSync(path.join(projectRoot, 'index.html'), path.join(tmpDir, 'index.html'));

const suite = fs.readFileSync(path.join(__dirname, 'test-suite.js'), 'utf8');
let html = fs.readFileSync(path.join(tmpDir, 'index.html'), 'utf8');
html = html.replace('</body>', '<script>\n' + suite + '\n</script>\n</body>');
fs.writeFileSync(path.join(tmpDir, 'index.html'), html, 'utf8');

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.error('Chrome not found. Set CHROME_PATH env var.');
  process.exit(2);
}

const profile = path.join(tmpRoot, 'chrome-profile-tests-' + Date.now());
const url = 'file:///' + path.join(tmpDir, 'index.html').split(path.sep).join('/');

let stdout = '';
try {
  stdout = execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--allow-file-access-from-files',
    '--user-data-dir=' + profile,
    '--window-size=1400,900',
    '--virtual-time-budget=6000',
    '--dump-dom',
    url
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
} catch (e) {
  stdout = (e.stdout || '') + '\n' + (e.stderr || '');
}

const titleMatch = stdout.match(/<title>([\s\S]*?)<\/title>/);
const title = titleMatch ? titleMatch[1] : '';

if (/^TESTERROR=/.test(title)) {
  console.error('Тесты упали с ошибкой:\n' + title.replace(/^TESTERROR=/, ''));
  process.exit(1);
}
if (!/^TESTRESULT=/.test(title)) {
  console.error('Не удалось получить результат тестов. Заголовок:\n' + title);
  console.error(stdout.slice(0, 2000));
  process.exit(1);
}

const R = JSON.parse(title.replace(/^TESTRESULT=/, ''));
console.log('Пройдено: ' + R.ok + ', упало: ' + R.fail);
let failed = false;
for (const c of R.cases) {
  if (!c.pass) {
    failed = true;
    console.error('  FAIL: ' + c.name + (c.msg ? ' — ' + c.msg : ''));
  }
}
if (!failed) console.log('Все проверки пройдены.');
process.exit(failed ? 1 : 0);
