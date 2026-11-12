/* Google Drive: выбранный файл и базовая версия хранятся отдельно от state.
   OAuth-токен живёт только в памяти. После перезапуска разрешение запрашивается
   кнопкой: GIS token model требует пользовательский жест для обновления доступа. */
const DRIVE_LINK_KEY = STORAGE_KEY + '-google-drive';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_SAVE_DELAY = 1200;
let driveConfig = loadDriveConfig();
let driveToken = '';
let driveTokenUntil = 0;
let driveReady = false;
let driveBusy = false;
let driveApplying = false;
let driveConflict = false;
let driveEpoch = 0;
let driveSaveTimer = null;
let driveLibrariesPromise = null;
let driveLibrariesReady = false;
let driveStatus = driveConfig.fileId ? 'Нужно подключиться' : 'Не связан с файлом';
let driveMessage = '';
let drivePicker = null;
let driveAutoSaveAllowed = true;

function driveConfigKey() { return activeStorageKey + '-google-drive'; }

function loadDriveConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(driveConfigKey()) || '{}');
    const clean = {};
    ['clientId', 'apiKey', 'projectNumber', 'fileId', 'fileName', 'version', 'baseHash', 'lastSyncedAt'].forEach(key => {
      if (saved && typeof saved[key] === 'string') clean[key] = saved[key];
    });
    return { ...clean, ...publishedDriveConfig() };
  } catch (e) { return publishedDriveConfig(); }
}
function publishedDriveConfig() {
  const config = GOOGLE_DRIVE_CONFIG;
  return config.clientId && config.apiKey && config.projectNumber
    ? { clientId: config.clientId, apiKey: config.apiKey, projectNumber: config.projectNumber } : {};
}
function persistDriveConfig() {
  try { localStorage.setItem(driveConfigKey(), JSON.stringify(driveConfig)); return true; }
  catch (e) {
    driveMessage = 'Не удалось запомнить связь с файлом. Экспортируйте данные перед закрытием страницы.';
    showStorageError(true);
    return false;
  }
}
function driveHasToken() { return !!driveToken && Date.now() < driveTokenUntil; }
function driveConfigured() { return !!(driveConfig.clientId && driveConfig.apiKey && driveConfig.projectNumber); }
function driveCanUseOrigin() {
  return location.protocol === 'https:' || (location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname));
}
function driveDataText(data) {
  // Положение курсора и выбранный раздел относятся к устройству. Их изменение
  // вызывает saveState, но не должно переписывать облачный файл и создавать конфликт.
  return serializeSyncData(data);
}
async function driveHash(text) {
  return hashSyncData(text);
}
function setDriveStatus(status, message) {
  driveStatus = status;
  driveMessage = message || '';
  renderDriveUi();
}
function renderDriveUi() {
  const status = document.getElementById('driveSyncStatus');
  if (!status) return;
  status.textContent = driveStatus;
  status.title = driveMessage || driveStatus;
  document.getElementById('driveStatusText').textContent = driveStatus;
  document.getElementById('driveMessage').textContent = driveMessage;
  const file = document.getElementById('driveFileLink');
  file.classList.toggle('hidden', !driveConfig.fileId);
  if (driveConfig.fileId) {
    file.textContent = driveConfig.fileName || 'Связанный JSON-файл';
    file.href = 'https://drive.google.com/file/d/' + encodeURIComponent(driveConfig.fileId) + '/view';
  }
  document.getElementById('btnDriveAuthorize').disabled = driveBusy || !driveConfigured() || !driveLibrariesReady || !driveCanUseOrigin();
  document.getElementById('btnDriveAuthorize').textContent = driveHasToken() ? 'Обновить подключение' : 'Подключиться';
  document.getElementById('btnDriveChoose').disabled = driveBusy || !driveHasToken() || !driveLibrariesReady;
  document.getElementById('btnDriveSync').disabled = driveBusy || !driveReady || !driveHasToken() || driveConflict;
  document.getElementById('btnDriveDisconnect').disabled = driveBusy || !driveConfig.fileId;
  document.getElementById('btnDriveSettingsSave').disabled = driveBusy;
  document.getElementById('driveConflict').classList.toggle('hidden', !driveConflict);
  document.getElementById('btnDriveLoadRemote').disabled = driveBusy || !driveHasToken();
  document.getElementById('btnDriveKeepLocal').disabled = driveBusy || !driveHasToken();
}
function driveLoadScript(id, src) {
  return new Promise((resolve, reject) => {
    const old = document.getElementById(id);
    if (old) old.remove();
    const script = document.createElement('script');
    script.id = id; script.src = src; script.async = true;
    const timer = setTimeout(() => { script.remove(); reject(new Error('Google не ответил. Проверьте сеть и повторите подключение.')); }, 20000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Не удалось загрузить сервисы Google.')); };
    document.head.appendChild(script);
  });
}
function ensureDriveLibraries() {
  if (driveLibrariesPromise) return driveLibrariesPromise;
  driveLibrariesPromise = Promise.all([
    window.google && google.accounts && google.accounts.oauth2 ? Promise.resolve()
      : driveLoadScript('driveIdentityScript', 'https://accounts.google.com/gsi/client'),
    window.gapi ? Promise.resolve() : driveLoadScript('drivePickerScript', 'https://apis.google.com/js/api.js')
  ]).then(() => new Promise((resolve, reject) => {
    gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Не удалось открыть выбор файлов Google.')),
      timeout: 20000, ontimeout: () => reject(new Error('Google не ответил. Повторите подключение.')) });
  })).then(() => { driveLibrariesReady = true; renderDriveUi(); }).catch(err => {
    driveLibrariesPromise = null;
    setDriveStatus('Подключение недоступно', err.message);
    throw err;
  });
  return driveLibrariesPromise;
}
function openDriveModal() {
  document.getElementById('driveIntro').textContent = driveAutoSaveAllowed
    ? 'Выберите JSON-файл один раз. Изменения будут сохраняться в него автоматически. После перезапуска может понадобиться снова нажать «Подключиться».'
    : 'Дополнительное хранилище. Основное автосохранение работает на сервере. Google Диск синхронизируется по кнопке; выбор файла может загрузить его данные после подтверждения.';
  document.getElementById('driveClientId').value = driveConfig.clientId || '';
  document.getElementById('driveApiKey').value = driveConfig.apiKey || '';
  document.getElementById('driveProjectNumber').value = driveConfig.projectNumber || '';
  document.getElementById('driveSetupOrigin').textContent = driveCanUseOrigin() ? location.origin : 'https://molostov-a.github.io';
  document.getElementById('driveSettings').open = !driveConfigured();
  document.getElementById('driveSettings').classList.toggle('hidden', !!publishedDriveConfig().clientId);
  document.getElementById('driveModal').classList.add('open');
  if (!driveCanUseOrigin()) {
    setDriveStatus('Откройте приложение по HTTPS', 'Связь с Google работает на GitHub Pages или localhost. Обычная работа с локальным файлом по-прежнему доступна.');
    return;
  }
  renderDriveUi();
  ensureDriveLibraries().catch(() => {});
}
function closeDriveModal() { document.getElementById('driveModal').classList.remove('open'); }
function saveDriveSettings() {
  if (driveBusy) return;
  const clientId = document.getElementById('driveClientId').value.trim();
  const apiKey = document.getElementById('driveApiKey').value.trim();
  const projectNumber = document.getElementById('driveProjectNumber').value.trim();
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) || !apiKey || !/^\d+$/.test(projectNumber)) {
    setDriveStatus('Проверьте настройки', 'Нужны OAuth Client ID веб-приложения, API key и числовой номер одного проекта Google Cloud.');
    return;
  }
  if (clientId !== driveConfig.clientId || apiKey !== driveConfig.apiKey || projectNumber !== driveConfig.projectNumber) {
    driveEpoch++; driveToken = ''; driveTokenUntil = 0; driveReady = false;
  }
  Object.assign(driveConfig, { clientId, apiKey, projectNumber });
  if (!persistDriveConfig()) { renderDriveUi(); return; }
  document.getElementById('driveSettings').open = false;
  setDriveStatus('Настройки сохранены', 'Нажмите «Подключиться», затем выберите JSON-файл на Google Диске.');
  if (driveCanUseOrigin()) ensureDriveLibraries().catch(() => {});
}
function authorizeDrive() {
  if (driveBusy || !driveConfigured() || !driveLibrariesReady || !driveCanUseOrigin()) return;
  const epoch = ++driveEpoch;
  driveBusy = true;
  setDriveStatus('Ожидаем разрешение Google');
  const finishError = message => {
    if (epoch !== driveEpoch) return;
    driveBusy = false;
    setDriveStatus('Нужно подключиться', message);
  };
  try {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: driveConfig.clientId, scope: DRIVE_SCOPE,
      callback: response => {
        if (epoch !== driveEpoch) return;
        driveBusy = false;
        if (response.error || !response.access_token) { finishError('Google не предоставил доступ. Попробуйте подключиться ещё раз.'); return; }
        if (!google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
          finishError('Разрешите доступ к выбранному файлу Google Диска.'); return;
        }
        driveToken = response.access_token;
        driveTokenUntil = Date.now() + Math.max(0, Number(response.expires_in) - 30) * 1000;
        if (driveConfig.fileId) runDriveTask(() => resumeDriveFile());
        else chooseDriveFile();
      },
      error_callback: () => finishError('Окно входа закрыто или заблокировано браузером. Нажмите «Подключиться» ещё раз.')
    });
    // Вызов остаётся непосредственно в обработчике клика, без await: иначе
    // браузер может заблокировать OAuth popup как открытый без жеста пользователя.
    client.requestAccessToken({ prompt: '' });
  } catch (err) { finishError(err.message); }
}
function chooseDriveFile() {
  if (driveBusy || !driveHasToken() || !driveLibrariesReady) return;
  const epoch = driveEpoch;
  driveBusy = true;
  setDriveStatus('Выберите JSON на Google Диске');
  try {
    if (drivePicker) drivePicker.setVisible(false);
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setMimeTypes('application/json,application/octet-stream,text/plain');
    drivePicker = new google.picker.PickerBuilder().addView(view)
      .setDeveloperKey(driveConfig.apiKey).setAppId(driveConfig.projectNumber)
      .setOAuthToken(driveToken).setOrigin(location.origin)
      .setTitle('Выберите JSON конструктора связок')
      .setCallback(data => {
        if (epoch !== driveEpoch) return;
        if (data.action === google.picker.Action.PICKED) {
          driveBusy = false;
          const file = data.docs && data.docs[0];
          if (file && file.id) runDriveTask(() => linkDriveFile(file.id));
          else setDriveStatus('Файл не выбран', 'Google не передал ID файла. Повторите выбор.');
        } else if (data.action === google.picker.Action.CANCEL) {
          driveBusy = false;
          setDriveStatus(driveConfig.fileId ? 'Файл не изменён' : 'Выберите файл', 'Выбор файла отменён.');
        } else if (data.action === 'error') {
          driveBusy = false;
          setDriveStatus('Не удалось выбрать файл', 'Проверьте настройки Google Picker и повторите выбор.');
        }
      }).build();
    drivePicker.setVisible(true);
    renderDriveUi();
  } catch (err) {
    driveBusy = false;
    setDriveStatus('Не удалось выбрать файл', err.message);
  }
}
async function driveRequest(url, options) {
  if (!driveHasToken()) {
    driveReady = false;
    const error = new Error('Срок доступа Google истёк. Нажмите «Подключиться»; изменения остаются на устройстве.');
    error.auth = true; throw error;
  }
  const epoch = driveEpoch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const headers = new Headers(options && options.headers);
    headers.set('Authorization', 'Bearer ' + driveToken);
    const res = await fetch(url, { ...options, headers, credentials: 'omit', signal: controller.signal });
    // Читаем тело до снятия тайм-аута: сервер может зависнуть после заголовков.
    const text = await res.text();
    if (epoch !== driveEpoch) throw new Error('Подключение изменилось. Повторите синхронизацию.');
    if (!res.ok) {
      const error = new Error(res.status === 401 ? 'Нажмите «Подключиться», чтобы обновить доступ Google.'
        : res.status === 403 ? 'Google запретил доступ. Проверьте разрешение на изменение файла и настройки проекта.'
        : res.status === 404 ? 'Файл недоступен этому приложению. Нажмите «Выбрать JSON» и выберите его через Google.'
        : res.status === 412 ? 'Файл изменён на другом устройстве. Выберите, какую версию использовать.'
        : 'Ошибка Google Диска: HTTP ' + res.status);
      error.status = res.status;
      if (res.status === 401) { driveToken = ''; driveTokenUntil = 0; driveReady = false; error.auth = true; }
      if (res.status === 412) driveConflict = true;
      throw error;
    }
    return { text, etag: res.headers.get('ETag') };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Google Диск не ответил за 20 секунд. Изменения остаются на устройстве.');
    if (err instanceof TypeError) throw new Error('Нет связи с Google Диском. Проверьте интернет и повторите синхронизацию.');
    throw err;
  } finally { clearTimeout(timer); }
}
async function driveMetadata(fileId) {
  const result = await driveRequest('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId)
    + '?fields=id,name,mimeType,version,modifiedTime,capabilities(canEdit)&supportsAllDrives=true');
  const file = JSON.parse(result.text);
  if (!file.id || !file.version || !file.capabilities || !file.capabilities.canEdit) {
    throw new Error('Для синхронизации нужен JSON-файл, который вы можете редактировать.');
  }
  return { ...file, etag: result.etag };
}
async function readDriveFile(fileId) {
  const before = await driveMetadata(fileId);
  const content = await driveRequest('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media&supportsAllDrives=true');
  const after = await driveMetadata(fileId);
  if (before.version !== after.version) throw new Error('Файл изменился во время загрузки. Повторите синхронизацию.');
  // Структуру проверяем до предложения заменить локальные данные.
  const data = prepareState(JSON.parse(content.text.replace(/^\uFEFF/, '')));
  return { metadata: after, text: content.text, data };
}
async function acceptDriveFile(remote, ask) {
  const epoch = driveEpoch;
  // Навигация остаётся локальной, в облаке хранится библиотека и раскладка.
  remote.data.currentView = state.currentView;
  remote.data.navPinned = state.navPinned;
  driveApplying = true;
  let applied;
  try { applied = applyImportedJson(JSON.stringify(remote.data), { confirmReplace: ask, reportError: false }); }
  finally { driveApplying = false; }
  if (!applied) {
    if (!ask) throw new Error('Облачный файл не удалось применить: проверьте данные и доступность локального хранилища. Локальная версия сохранена.');
    return false;
  }
  const acceptedText = driveDataText(state);
  const baseHash = await driveHash(acceptedText);
  if (epoch !== driveEpoch) return false;
  Object.assign(driveConfig, { fileId: remote.metadata.id, fileName: remote.metadata.name,
    version: remote.metadata.version, baseHash, lastSyncedAt: new Date().toISOString() });
  driveReady = true; driveConflict = false;
  const remembered = persistDriveConfig();
  setDriveStatus('Синхронизировано', remembered ? 'Изменения будут автоматически сохраняться в этот файл.' : driveMessage);
  if (acceptedText !== driveDataText(state)) scheduleDriveSave();
  return true;
}
async function linkDriveFile(fileId) {
  setDriveStatus('Загружаем файл');
  const local = driveDataText(state);
  const remote = await readDriveFile(fileId);
  if (local !== driveDataText(state)) throw new Error('Данные изменились во время загрузки. Выберите файл ещё раз.');
  if (!await acceptDriveFile(remote, true)) setDriveStatus('Связь не изменена', 'Замена локальных данных отменена или не удалось сохранить файл на устройстве.');
}
async function resumeDriveFile() {
  if (!driveConfig.fileId) return;
  const epoch = driveEpoch, fileId = driveConfig.fileId;
  const local = driveDataText(state);
  const hash = await driveHash(local);
  if (epoch !== driveEpoch) return;
  const metadata = await driveMetadata(fileId);
  if (epoch !== driveEpoch) return;
  if (local !== driveDataText(state)) { scheduleDriveSave(); return; }
  if (metadata.version === driveConfig.version) {
    driveReady = true; driveConflict = false;
    if (hash !== driveConfig.baseHash) await uploadDriveChanges();
    else setDriveStatus('Синхронизировано');
    return;
  }
  if (hash !== driveConfig.baseHash) {
    // Запрос записи мог дойти до Google, а его ответ — потеряться. Если
    // содержимое совпало, связываем версии без повторной записи и без конфликта.
    const remote = await readDriveFile(driveConfig.fileId);
    if (local !== driveDataText(state)) { scheduleDriveSave(); return; }
    if (driveDataText(remote.data) === local) {
      driveConfig.version = remote.metadata.version;
      driveConfig.baseHash = hash;
      driveConfig.fileName = remote.metadata.name;
      driveReady = true; driveConflict = false;
      persistDriveConfig(); setDriveStatus('Синхронизировано'); return;
    }
    driveReady = true; driveConflict = true;
    setDriveStatus('Две версии данных', 'На устройстве и в облаке есть изменения. Автосохранение приостановлено до выбора версии.');
    return;
  }
  const remote = await readDriveFile(driveConfig.fileId);
  if (local !== driveDataText(state)) { scheduleDriveSave(); return; }
  await acceptDriveFile(remote, false);
}
async function uploadDriveChanges(force) {
  if (!driveReady || driveConflict || !driveConfig.fileId) return;
  const epoch = driveEpoch, fileId = driveConfig.fileId;
  const text = driveDataText(state);
  const hash = await driveHash(text);
  if (epoch !== driveEpoch) return;
  if (!force && hash === driveConfig.baseHash) { setDriveStatus('Синхронизировано'); return; }
  setDriveStatus('Сохраняем на Google Диск');
  const metadata = await driveMetadata(fileId);
  if (epoch !== driveEpoch) return;
  if (metadata.version !== driveConfig.version) {
    driveConflict = true;
    setDriveStatus('Две версии данных', 'Облачный файл изменился. Выберите версию перед записью.');
    return;
  }
  const headers = { 'Content-Type': 'application/json; charset=UTF-8' };
  if (metadata.etag) headers['If-Match'] = metadata.etag;
  const result = await driveRequest('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId)
    + '?uploadType=media&fields=id,name,version&supportsAllDrives=true', { method: 'PATCH', headers, body: text });
  const saved = JSON.parse(result.text);
  if (!saved.version) throw new Error('Google не подтвердил версию файла. Повторите подключение перед следующей записью.');
  // Базой становится именно отправленный снимок: изменения, сделанные во время
  // PATCH, остаются несохранёнными и отправятся следующим отдельным запросом.
  Object.assign(driveConfig, { version: saved.version, fileName: saved.name || driveConfig.fileName,
    baseHash: hash, lastSyncedAt: new Date().toISOString() });
  const remembered = persistDriveConfig();
  if (text !== driveDataText(state)) scheduleDriveSave();
  else setDriveStatus('Синхронизировано', remembered ? '' : driveMessage);
}
async function runDriveTask(task) {
  if (driveBusy) return false;
  const epoch = driveEpoch;
  driveBusy = true; renderDriveUi();
  try { await task(); return true; }
  catch (err) {
    if (epoch !== driveEpoch) return false;
    setDriveStatus(driveConflict ? 'Две версии данных' : err.auth ? 'Нужно подключиться' : 'Не синхронизировано', err.message);
    return false;
  } finally { if (epoch === driveEpoch) { driveBusy = false; renderDriveUi(); } }
}
function scheduleDriveSave() {
  clearTimeout(driveSaveTimer);
  driveSaveTimer = setTimeout(() => {
    driveSaveTimer = null;
    if (driveBusy) { scheduleDriveSave(); return; }
    driveSyncNow();
  }, DRIVE_SAVE_DELAY);
}
function onDriveStateSaved() {
  if (!driveAutoSaveAllowed || driveApplying || !driveConfig.fileId) return;
  scheduleDriveSave();
}
async function driveSyncNow() {
  if (!driveConfig.fileId || driveBusy) return false;
  if (!driveHasToken()) {
    driveReady = false;
    setDriveStatus('Нужно подключиться', 'Файл запомнен. Нажмите «Подключиться», чтобы загрузить и сохранить изменения.');
    return false;
  }
  if (driveConflict) { renderDriveUi(); return false; }
  return runDriveTask(() => resumeDriveFile());
}
function loadRemoteDriveVersion() {
  if (driveBusy || !driveHasToken()) return;
  if (!confirm('Заменить локальные данные облачной версией? Несохранённые в облаке изменения на этом устройстве будут заменены.')) return;
  return runDriveTask(async () => {
    const local = driveDataText(state);
    const remote = await readDriveFile(driveConfig.fileId);
    if (local !== driveDataText(state)) throw new Error('Локальные данные изменились во время загрузки. Повторите выбор версии.');
    await acceptDriveFile(remote, false);
  });
}
function keepLocalDriveVersion() {
  if (driveBusy || !driveHasToken()) return;
  if (!confirm('Записать данные этого устройства поверх облачного файла? Текущая облачная версия будет заменена.')) return;
  return runDriveTask(async () => {
    const metadata = await driveMetadata(driveConfig.fileId);
    driveConfig.version = metadata.version;
    driveConflict = false; driveReady = true;
    await uploadDriveChanges(true);
  });
}
function disconnectDrive() {
  if (driveBusy) return;
  driveEpoch++; driveToken = ''; driveTokenUntil = 0; driveReady = false; driveConflict = false;
  clearTimeout(driveSaveTimer); driveSaveTimer = null;
  if (drivePicker) { drivePicker.setVisible(false); drivePicker = null; }
  ['fileId', 'fileName', 'version', 'baseHash', 'lastSyncedAt'].forEach(key => { delete driveConfig[key]; });
  const remembered = persistDriveConfig();
  setDriveStatus('Не связан с файлом', remembered ? 'Данные остаются на устройстве. Облачный файл не удалён.' : driveMessage);
}
function initDriveSync() {
  document.getElementById('btnDriveCloud').addEventListener('click', openDriveModal);
  document.getElementById('btnCloseDrive').addEventListener('click', closeDriveModal);
  document.getElementById('btnDriveSettingsSave').addEventListener('click', saveDriveSettings);
  document.getElementById('btnDriveAuthorize').addEventListener('click', authorizeDrive);
  document.getElementById('btnDriveChoose').addEventListener('click', chooseDriveFile);
  document.getElementById('btnDriveSync').addEventListener('click', driveSyncNow);
  document.getElementById('btnDriveDisconnect').addEventListener('click', disconnectDrive);
  document.getElementById('btnDriveLoadRemote').addEventListener('click', loadRemoteDriveVersion);
  document.getElementById('btnDriveKeepLocal').addEventListener('click', keepLocalDriveVersion);
  document.getElementById('driveModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeDriveModal(); });
  document.getElementById('driveModal').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeDriveModal(); } });
  window.addEventListener('online', () => { if (driveAutoSaveAllowed && driveHasToken()) driveSyncNow(); });
  setInterval(() => {
    if (!driveAutoSaveAllowed || document.hidden || !driveConfig.fileId) return;
    if (driveHasToken()) driveSyncNow();
    else if (driveToken && !driveBusy) { driveReady = false; setDriveStatus('Нужно подключиться', 'Срок доступа Google истёк. Изменения остаются на устройстве.'); }
  }, 60000);
  renderDriveUi();
}
