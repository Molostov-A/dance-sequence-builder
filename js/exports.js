function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
function downloadJson(obj, filename) {
  let dataStr;
  try { dataStr = JSON.stringify(obj, null, 2); }
  catch (e) { alert('Ошибка сериализации: ' + e.message); return; }
  let blob;
  try { blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' }); }
  catch (e) { blob = new Blob([dataStr], { type: 'application/json' }); }
  if (window.navigator && window.navigator.msSaveOrOpenBlob) {
    window.navigator.msSaveOrOpenBlob(blob, filename); return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a);
  try {
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 5000);
  } catch (e) {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showExportModal(dataStr);
  }
}
function showExportModal(text) {
  const modal = document.getElementById('exportModal');
  const ta = document.getElementById('exportText');
  ta.value = text; modal.classList.add('open');
}
function closeExportModal() { document.getElementById('exportModal').classList.remove('open'); }
function copyExportText() {
  const ta = document.getElementById('exportText'); ta.select();
  try { document.execCommand('copy'); alert('Скопировано'); }
  catch (e) { alert('Не удалось скопировать. Выделите текст вручную.'); }
}
function exportAll() {
  const data = { ...state }; delete data.activePath;
  downloadJson(data, `${APP_NAME}_${timestamp()}.json`);
}
function exportCombos() {
  const combos = collectCombos();
  const out = {
    app: APP_NAME,
    exportedAt: new Date().toISOString(),
    combos: combos.map((combo, idx) => {
      const totalBeats = combo.reduce((s, n) => s + n.length, 0);
      return {
        index: idx + 1, totalBeats, squares: totalBeats / 32,
        videos: getComboVideos(combo),
        description: getComboDescription(combo),
        folders: comboFolderIdsByKey(comboVideoKey(combo)).map(comboFolderPath),
        steps: combo.map((n, i) => {
          const mov = getMovement(n.movementId);
          const step = {
            movement: mov ? mov.name : '???',
            movementId: n.movementId,
            lead: mov ? (mov.lead || '') : '',
            follow: mov ? (mov.follow || '') : '',
            beat: n.beat, length: n.length,
            beatInEighth: beatInEighth(n.beat),
            label: formatBeatShort(n.beat, n.length),
            eighth: eighthNumber(n.beat)
          };
          // Преп линии, по которой пришли в этот шаг (см. comboStepPrep)
          const prep = comboStepPrep(combo, i);
          if (prep) {
            step.prep = {
              prepId: prep.id,
              name: prep.name,
              lead: prep.lead || '',
              follow: prep.follow || ''
            };
          }
          return step;
        })
      };
    })
  };
  downloadJson(out, `${APP_NAME}_combos_${timestamp()}.json`);
}
function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => { if (applyImportedJson(e.target.result)) closeImportModal(); };
  reader.onerror = () => { alert('Не удалось прочитать файл. Выберите его ещё раз.'); };
  reader.readAsText(file);
  event.target.value = '';
}
function applyImportedJson(text, options) {
  options = options || {};
  const previous = state;
  const generated = { sequences: genSequences, selected: genSelectedIdx, signature: genSourceSignature };
  const previousFocus = comboFocusNodeId;
  const previousMerge = mergeSelectFrom;
  const previousNavOpen = navIsOpen();
  let replaced = false;
  try {
    const data = prepareState(JSON.parse(String(text).replace(/^\uFEFF/, '')));
    Object.values(data.nodes).forEach(n => {
      const parent = n.parentId === null ? null : data.nodes[n.parentId];
      if (!allowedLengths(n.beat).includes(n.length)
        || (parent && n.beat !== parent.beat + parent.length)) {
        throw new Error('Недопустимый счёт или длительность у узла ' + n.id);
      }
    });
    if (options.confirmReplace !== false && !confirm('Заменить текущие данные импортом?')) return false;
    state = data;
    replaced = true;
    // Рендер тоже проверяем до записи: setView внутри render вызывает saveState.
    // Временная приостановка не даёт частичному импорту затереть прежний JSON.
    stateSaveSuspended = true;
    pruneComboVideos();
    pruneComboDescriptions();
    pruneMentions();
    ensureActivePathValid();
    resetGeneratedSequences();
    comboFocusNodeId = null;
    mergeSelectFrom = null;
    render();
    updateNavPinUi();
    if (navIsPinned() && !isNarrowScreen()) openNav(); else closeNav();
    stateSaveSuspended = false;
    if (!saveState()) throw new Error('Импорт не сохранён. Хранилище браузера недоступно или заполнено.');
    closeForm();
    return true;
  } catch (err) {
    if (replaced) {
      state = previous;
      genSequences = generated.sequences;
      genSelectedIdx = generated.selected;
      genSourceSignature = generated.signature;
      comboFocusNodeId = previousFocus;
      mergeSelectFrom = previousMerge;
      stateSaveSuspended = true;
      try {
        render(); updateNavPinUi();
        if (previousNavOpen) openNav(); else closeNav();
      } catch (renderError) { console.error('Не удалось восстановить интерфейс', renderError); }
    }
    stateSaveSuspended = false;
    if (options.reportError !== false) alert('Не удалось импортировать данные: ' + err.message);
    return false;
  }
}
function normalizeImportUrl(url) {
  const u = new URL(url);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) {
    throw new Error('Нужна ссылка HTTP или HTTPS без логина и пароля.');
  }
  const host = u.hostname.toLowerCase();
  if (['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com'].includes(host)) {
    const m = u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
    const id = m ? m[1] : u.searchParams.get('id');
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('В ссылке Google Диска не найден ID файла.');
    const download = new URL('https://drive.usercontent.google.com/download');
    download.searchParams.set('id', id);
    download.searchParams.set('export', 'download');
    download.searchParams.set('authuser', '0');
    download.searchParams.set('confirm', 't');
    const resourceKey = u.searchParams.get('resourcekey');
    if (resourceKey) download.searchParams.set('resourcekey', resourceKey);
    return download.href;
  }
  return u.href;
}
let importUrlController = null;
const IMPORT_URL_TIMEOUT = 20000;

function cancelImportRequest() {
  if (importUrlController) importUrlController.abort();
  importUrlController = null;
  document.getElementById('btnImportFetch').disabled = false;
  document.getElementById('btnImportFetch').textContent = 'Импортировать';
  document.getElementById('importUrlInput').disabled = false;
}
function openImportModal() {
  cancelImportRequest();
  document.getElementById('importUrlError').textContent = '';
  document.getElementById('importUrlInput').value = '';
  document.getElementById('importUrlFallback').classList.add('hidden');
  showImportOptionsStep();
  document.getElementById('importModal').classList.add('open');
}
function closeImportModal() {
  cancelImportRequest();
  document.getElementById('importModal').classList.remove('open');
}
function showImportOptionsStep() {
  cancelImportRequest();
  document.getElementById('importStep1').classList.remove('hidden');
  document.getElementById('importStep2').classList.add('hidden');
}
function showImportUrlStep() {
  document.getElementById('importStep1').classList.add('hidden');
  document.getElementById('importStep2').classList.remove('hidden');
  document.getElementById('importUrlInput').focus();
}
async function importFromUrl() {
  if (importUrlController) return false;
  const input = document.getElementById('importUrlInput');
  const errorEl = document.getElementById('importUrlError');
  const url = (input.value || '').trim();
  if (!url) {
    errorEl.textContent = 'Вставьте ссылку на JSON-файл.';
    input.focus();
    return false;
  }
  errorEl.textContent = '';
  const fallback = document.getElementById('importUrlFallback');
  fallback.classList.add('hidden');
  let downloadUrl;
  try { downloadUrl = normalizeImportUrl(url); }
  catch (err) { errorEl.textContent = 'Некорректная ссылка: ' + err.message; return false; }
  document.getElementById('importDownloadLink').href = downloadUrl;
  const controller = new AbortController();
  importUrlController = controller;
  const button = document.getElementById('btnImportFetch');
  button.disabled = true;
  button.textContent = 'Загрузка…';
  input.disabled = true;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, IMPORT_URL_TIMEOUT);
  try {
    const res = await fetch(downloadUrl, { signal: controller.signal, credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status + (res.status === 403 ? ': доступ к файлу запрещён.' : ''));
    const text = await res.text();
    if (importUrlController !== controller) return false;
    if (/^\s*</.test(text) || /text\/html/i.test(res.headers.get('content-type') || '')) {
      throw new Error('По ссылке получена страница сайта вместо JSON. Проверьте доступ к файлу.');
    }
    // Не оставляем таймер активным во время диалога подтверждения.
    clearTimeout(timer);
    const applied = applyImportedJson(text);
    if (applied) closeImportModal();
    return applied;
  } catch (err) {
    if (importUrlController !== controller) return false;
    const isDrive = new URL(downloadUrl).hostname === 'drive.usercontent.google.com';
    errorEl.textContent = timedOut ? 'Загрузка заняла слишком много времени. Повторите попытку или выберите файл.'
      : isDrive && err instanceof TypeError
        ? 'Google Диск не разрешил прямой импорт. Скачайте файл и выберите JSON на устройстве.'
      : 'Не удалось загрузить JSON: ' + (err instanceof TypeError
        ? 'сеть недоступна или сайт запрещает чтение файла приложением.'
        : err.message);
    fallback.classList.remove('hidden');
    return false;
  } finally {
    clearTimeout(timer);
    if (importUrlController === controller) cancelImportRequest();
  }
}
