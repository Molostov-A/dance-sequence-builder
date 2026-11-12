/* Основное хранилище — сервер. Cookie сессии HttpOnly, CSRF — только в памяти.
   Кэши разных аккаунтов и гостя разделены; сервер дополнительно сверяет
   X-Account-ID, чтобы смена cookie в другой вкладке не отправила чужие данные. */
let accountUser = null;
let accountCsrf = '';
let accountProviders = { google: false, email: false };
let accountAvailable = false;
let accountReady = false;
let accountBusy = false;
let accountApplying = false;
let accountConflict = false;
let accountEpoch = 0;
let accountTimer = null;
let accountMeta = { revision: 0, baseHash: '' };
let accountHadCache = false;
let accountChallenge = '';
let accountStatus = 'На устройстве';
let accountMessage = '';
const ACCOUNT_SAVE_DELAY = 1200;
const ACCOUNT_TOKEN_KEY = STORAGE_KEY + '-api-session-' + encodeURIComponent(SERVER_API_BASE);
const ACCOUNT_FLOW_KEY = STORAGE_KEY + '-google-login-flow';
let accountAccessToken = loadAccountAccessToken();

function accountCrossOrigin() { return !!SERVER_API_BASE && new URL(SERVER_API_BASE).origin !== location.origin; }
function loadAccountAccessToken() {
  try { return accountCrossOrigin() ? localStorage.getItem(ACCOUNT_TOKEN_KEY) || '' : ''; }
  catch (e) { return ''; }
}
function saveAccountAccessToken(token) {
  accountAccessToken = token || '';
  if (!accountCrossOrigin()) return;
  if (token) localStorage.setItem(ACCOUNT_TOKEN_KEY, token); else localStorage.removeItem(ACCOUNT_TOKEN_KEY);
}
function accountEndpoint(route) { return SERVER_API_BASE + route; }
async function startAccountGoogleLogin(link) {
  if (!accountCrossOrigin()) { location.href = '/api/auth/google/start' + (link ? '?link=1' : ''); return; }
  if (link) { setAccountStatus('Откройте аккаунт на сервере', 'Привязка дополнительного Google-входа доступна в аккаунте на ' + SERVER_API_BASE); return; }
  const random = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const verifier = random(), clientState = random();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  sessionStorage.setItem(ACCOUNT_FLOW_KEY, JSON.stringify({ verifier, state: clientState }));
  const url = new URL(accountEndpoint('/api/auth/google/start'));
  url.search = new URLSearchParams({ frontend: '1', challenge, client_state: clientState }).toString();
  location.href = url.href;
}
async function finishAccountGoogleLogin() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (!params.has('auth_code') && !params.has('auth_error')) return null;
  history.replaceState(null, '', location.pathname + location.search);
  let flow;
  try { flow = JSON.parse(sessionStorage.getItem(ACCOUNT_FLOW_KEY) || 'null'); }
  finally { sessionStorage.removeItem(ACCOUNT_FLOW_KEY); }
  if (!flow || flow.state !== params.get('state')) throw new Error('Не удалось подтвердить запрос входа. Нажмите «Войти через Google» ещё раз.');
  if (params.has('auth_error')) throw new Error(params.get('auth_error') === 'verify_email'
    ? 'Войдите по коду из письма. Привязать Google к сторонней почте можно в аккаунте на сервере.' : 'Вход Google отменён или завершился ошибкой.');
  return accountRequest('/api/auth/exchange', { method: 'POST', body: JSON.stringify({ code: params.get('auth_code'), verifier: flow.verifier }) });
}

function accountStorageKey(userId) { return STORAGE_KEY + '-user-' + encodeURIComponent(userId); }
function accountMetaKey() { return activeStorageKey + '-server-sync'; }
function accountHasLibrary(data) { return !!(data.movements.length || Object.keys(data.nodes).length || (data.concepts || []).length || (data.preps || []).length); }
function persistAccountMeta() {
  try { localStorage.setItem(accountMetaKey(), JSON.stringify(accountMeta)); }
  catch (e) { showStorageError(true); throw new Error('Не удалось сохранить состояние синхронизации на устройстве.'); }
}
function loadAccountMeta() {
  try {
    const data = JSON.parse(localStorage.getItem(accountMetaKey()) || '{}');
    return { revision: Number.isSafeInteger(data.revision) && data.revision >= 0 ? data.revision : 0,
      baseHash: typeof data.baseHash === 'string' ? data.baseHash : '' };
  } catch (e) { return { revision: 0, baseHash: '' }; }
}
function setAccountStatus(status, message) {
  accountStatus = status; accountMessage = message || ''; renderAccountUi();
}
function renderAccountUi() {
  const button = document.getElementById('btnAccount');
  if (!button) return;
  button.textContent = accountUser ? 'Аккаунт: ' + accountUser.email : 'Войти и сохранять';
  document.getElementById('accountSyncStatus').textContent = accountStatus;
  document.getElementById('accountSyncStatus').title = accountMessage;
  document.getElementById('accountStatusText').textContent = accountStatus;
  document.getElementById('accountMessage').textContent = accountMessage;
  document.getElementById('accountIntro').textContent = accountUser
    ? 'Библиотека этого аккаунта автоматически сохраняется на сервере. На другом устройстве войдите с той же почтой или Google-аккаунтом.'
    : 'Войдите, чтобы сохранять свою библиотеку на сервере и открывать её на других устройствах.';
  document.getElementById('accountLogin').classList.toggle('hidden', !!accountUser);
  document.getElementById('accountSignedIn').classList.toggle('hidden', !accountUser);
  document.getElementById('accountEmailText').textContent = accountUser ? accountUser.email : '';
  const google = document.getElementById('btnAccountGoogle');
  google.disabled = accountBusy || !accountAvailable || !accountProviders.google;
  google.classList.toggle('hidden', accountAvailable && !accountProviders.google);
  document.getElementById('accountEmailLogin').classList.toggle('hidden', accountAvailable && !accountProviders.email);
  document.getElementById('accountEmailHint').textContent = accountProviders.google ? 'Или получите код на почту:' : 'Получите код на почту:';
  document.getElementById('btnAccountLinkGoogle').disabled = accountBusy || !accountProviders.google || accountCrossOrigin();
  document.getElementById('btnEmailCode').disabled = accountBusy || !accountAvailable || !accountProviders.email;
  document.getElementById('btnEmailVerify').disabled = accountBusy || !accountChallenge;
  document.getElementById('accountCodeRow').classList.toggle('hidden', !accountChallenge);
  document.getElementById('btnAccountSync').disabled = accountBusy || !accountUser || !accountReady || accountConflict;
  document.getElementById('btnAccountLogout').disabled = accountBusy || !accountUser;
  document.getElementById('accountConflict').classList.toggle('hidden', !accountConflict);
  document.getElementById('btnAccountUseServer').disabled = accountBusy || !accountUser;
  document.getElementById('btnAccountUseLocal').disabled = accountBusy || !accountUser;
  document.getElementById('btnAccountMigrate').classList.toggle('hidden', !accountUser || accountMeta.revision !== 0);
  document.getElementById('btnAccountMigrate').disabled = accountBusy || !accountReady;
}
function openAccountModal() {
  document.getElementById('accountModal').classList.add('open'); renderAccountUi();
  if (!accountAvailable) setAccountStatus('Локальный режим', 'Сохранение в аккаунте доступно на серверной версии приложения.');
}
function closeAccountModal() { document.getElementById('accountModal').classList.remove('open'); }

async function accountRequest(route, options) {
  const headers = new Headers(options && options.headers);
  headers.set('Accept', 'application/json');
  if (options && options.body) headers.set('Content-Type', 'application/json');
  if (accountUser) headers.set('X-Account-ID', accountUser.id);
  if (accountCsrf) headers.set('X-CSRF-Token', accountCsrf);
  if (accountCrossOrigin() && accountAccessToken) headers.set('Authorization', 'Bearer ' + accountAccessToken);
  const response = await fetch(accountEndpoint(route), { ...options, headers,
    credentials: accountCrossOrigin() ? 'omit' : 'same-origin', signal: AbortSignal.timeout(20000) });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new Error('Серверная версия приложения недоступна по этому адресу.');
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Ошибка сервера.');
    error.status = response.status; error.code = result.code; throw error;
  }
  return result;
}
function resetDriveForAccount() {
  driveEpoch++; driveToken = ''; driveTokenUntil = 0; driveReady = false; driveBusy = false; driveConflict = false;
  clearTimeout(driveSaveTimer); driveSaveTimer = null;
  if (drivePicker) { drivePicker.setVisible(false); drivePicker = null; }
  driveConfig = loadDriveConfig();
  setDriveStatus(driveConfig.fileId ? 'Резервный файл запомнен' : 'Не связан с файлом');
}
function activateAccountStorage(user) {
  clearTimeout(accountTimer); accountTimer = null; accountEpoch++;
  accountApplying = true;
  try {
    closeForm(); comboFocusNodeId = null; mergeSelectFrom = null;
    activeStorageKey = user ? accountStorageKey(user.id) : STORAGE_KEY;
    accountHadCache = !!localStorage.getItem(activeStorageKey);
    state = loadState() || initialState();
    accountMeta = user ? loadAccountMeta() : { revision: 0, baseHash: '' };
    accountUser = user; accountReady = false; accountConflict = false;
    resetGeneratedSequences(); resetDriveForAccount();
    render(); updateNavPinUi();
  } finally { accountApplying = false; }
}
async function acceptAccountSession(session) {
  // Сначала сохраняем старый контекст. Если локальная запись невозможна,
  // данные нельзя молча заменить другим аккаунтом.
  if (!saveState()) throw new Error('Сначала экспортируйте несохранённые локальные данные.');
  if (session.accessToken) saveAccountAccessToken(session.accessToken);
  else if (!session.user) saveAccountAccessToken('');
  activateAccountStorage(session.user);
  accountCsrf = session.csrf || ''; accountProviders = session.providers; accountAvailable = true;
  accountChallenge = '';
  if (accountUser) await reconcileAccountData();
  else if (!accountProviders.google && !accountProviders.email) {
    setAccountStatus('Вход пока не настроен', 'Владелец сервера ещё не подключил способы входа. Пока можно работать локально и экспортировать данные.');
  } else setAccountStatus('На устройстве', 'Войдите, чтобы автоматически сохранять данные на сервере.');
}
async function applyAccountRemote(remote) {
  const epoch = accountEpoch;
  const data = remote.data || initialState();
  data.currentView = state.currentView; data.navPinned = state.navPinned;
  accountApplying = true;
  try {
    if (!applyImportedJson(JSON.stringify(data), { confirmReplace: false, reportError: false })) {
      throw new Error('Не удалось применить серверные данные. Локальная копия сохранена.');
    }
  } finally { accountApplying = false; }
  const text = serializeSyncData(state);
  const baseHash = await hashSyncData(text);
  if (epoch !== accountEpoch) return;
  accountMeta = { revision: remote.revision, baseHash };
  persistAccountMeta(); accountHadCache = true; accountReady = true; accountConflict = false;
  setAccountStatus(remote.revision ? 'Сохранено на сервере' : 'Аккаунт готов');
  if (text !== serializeSyncData(state)) scheduleAccountSync();
}
async function reconcileAccountData() {
  const epoch = accountEpoch, text = serializeSyncData(state), hash = await hashSyncData(text);
  if (epoch !== accountEpoch) return;
  const remote = await accountRequest('/api/data');
  if (epoch !== accountEpoch) return;
  if (text !== serializeSyncData(state)) { scheduleAccountSync(); return; }
  if (accountMeta.baseHash && remote.revision === accountMeta.revision) {
    accountReady = true; accountConflict = false;
    if (hash !== accountMeta.baseHash) await uploadAccountData();
    else setAccountStatus(remote.revision ? 'Сохранено на сервере' : 'Аккаунт готов');
    return;
  }
  if (!accountHadCache || !accountHasLibrary(state) && !accountMeta.baseHash
    || accountMeta.baseHash && hash === accountMeta.baseHash) {
    await applyAccountRemote(remote); return;
  }
  if (remote.data && serializeSyncData(prepareState(remote.data)) === text) {
    accountMeta = { revision: remote.revision, baseHash: hash }; persistAccountMeta();
    accountReady = true; accountConflict = false; setAccountStatus('Сохранено на сервере'); return;
  }
  accountReady = true; accountConflict = true;
  setAccountStatus('Есть конфликт', 'Данные на сервере и устройстве изменились. Выберите версию перед сохранением.');
}
async function uploadAccountData() {
  const epoch = accountEpoch, text = serializeSyncData(state), hash = await hashSyncData(text);
  if (epoch !== accountEpoch) return;
  if (hash === accountMeta.baseHash) return;
  setAccountStatus('Сохраняем на сервере');
  const saved = await accountRequest('/api/data', { method: 'PUT', body: JSON.stringify({ revision: accountMeta.revision, data: JSON.parse(text) }) });
  if (epoch !== accountEpoch) return;
  accountMeta = { revision: saved.revision, baseHash: hash }; persistAccountMeta();
  setAccountStatus('Сохранено на сервере');
  if (text !== serializeSyncData(state)) scheduleAccountSync();
}
async function runAccountTask(task) {
  if (accountBusy) return false;
  accountBusy = true; renderAccountUi();
  try { await task(); return true; }
  catch (err) {
    if (err.status === 401 || err.code === 'account_changed') {
      if (!saveState()) {
        setAccountStatus('Экспортируйте данные', 'Не удалось сохранить локальную копию. Экспортируйте её перед сменой аккаунта или обновлением страницы.');
        return false;
      }
      activateAccountStorage(null); accountCsrf = '';
      saveAccountAccessToken('');
      setAccountStatus('Войдите снова', 'Сессия истекла или аккаунт изменился. Локальная копия остаётся в кэше своего аккаунта.');
    } else if (err.code === 'revision_conflict') {
      accountConflict = true;
      setAccountStatus('Есть конфликт', 'Данные изменены на другом устройстве. Выберите версию.');
    } else setAccountStatus('Не синхронизировано', err.name === 'TimeoutError' || err.name === 'AbortError'
      ? 'Сервер не ответил. Изменения остаются на устройстве.'
      : err instanceof TypeError ? 'Нет связи с сервером. Изменения остаются на устройстве.' : err.message);
    return false;
  } finally { accountBusy = false; renderAccountUi(); }
}
function scheduleAccountSync() {
  clearTimeout(accountTimer);
  accountTimer = setTimeout(() => {
    accountTimer = null;
    if (accountBusy) { scheduleAccountSync(); return; }
    syncAccountNow();
  }, ACCOUNT_SAVE_DELAY);
}
function onAccountStateSaved() {
  if (!accountApplying && accountUser && accountAvailable) scheduleAccountSync();
}
async function syncAccountNow() {
  if (!accountUser || !accountAvailable || accountBusy || accountConflict) return false;
  return runAccountTask(reconcileAccountData);
}
async function requestEmailCode() {
  return runAccountTask(async () => {
    const email = document.getElementById('accountEmailInput').value.trim();
    const result = await accountRequest('/api/auth/email/start', { method: 'POST', body: JSON.stringify({ email }) });
    accountChallenge = result.challengeId;
    setAccountStatus('Проверьте почту', 'Введите код из письма. Он действует 10 минут.');
    document.getElementById('accountCodeInput').focus();
  });
}
async function verifyEmailCode() {
  return runAccountTask(async () => {
    const code = document.getElementById('accountCodeInput').value.trim();
    const result = await accountRequest('/api/auth/email/verify', { method: 'POST', body: JSON.stringify({ challengeId: accountChallenge, code }) });
    await acceptAccountSession(result);
  });
}
async function logoutAccount() {
  return runAccountTask(async () => {
    if (!saveState()) throw new Error('Экспортируйте несохранённые данные перед выходом.');
    await accountRequest('/api/auth/logout', { method: 'POST', body: '{}' });
    saveAccountAccessToken('');
    activateAccountStorage(null); accountCsrf = '';
    setAccountStatus('На устройстве', 'Вы вышли из аккаунта. Его данные сохранены отдельно.');
  });
}
async function useServerAccountVersion() {
  if (!confirm('Заменить локальную копию данными сервера? Перед заменой можно сделать экспорт.')) return false;
  return runAccountTask(async () => {
    const epoch = accountEpoch, text = serializeSyncData(state);
    const remote = await accountRequest('/api/data');
    if (epoch !== accountEpoch) return;
    if (text !== serializeSyncData(state)) throw new Error('Данные изменились во время загрузки. Повторите выбор.');
    await applyAccountRemote(remote);
  });
}
async function useLocalAccountVersion() {
  if (!confirm('Заменить серверную версию данными этого устройства?')) return false;
  return runAccountTask(async () => {
    const epoch = accountEpoch, remote = await accountRequest('/api/data');
    if (epoch !== accountEpoch) return;
    accountMeta.revision = remote.revision; accountMeta.baseHash = '';
    accountConflict = false; accountReady = true;
    await uploadAccountData();
  });
}
async function migrateGuestLibrary() {
  if (!accountUser || accountMeta.revision !== 0 || accountBusy) return false;
  if (!confirm('Перенести гостевую библиотеку этого устройства в текущий аккаунт?')) return false;
  return runAccountTask(async () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error('На этом устройстве нет гостевой библиотеки.');
    if (!applyImportedJson(raw, { confirmReplace: false, reportError: false })) throw new Error('Не удалось перенести библиотеку.');
    await uploadAccountData();
  });
}
function initAccount() {
  document.getElementById('btnAccount').addEventListener('click', openAccountModal);
  document.getElementById('btnCloseAccount').addEventListener('click', closeAccountModal);
  document.getElementById('btnAccountGoogle').addEventListener('click', () => runAccountTask(() => startAccountGoogleLogin(false)));
  document.getElementById('btnAccountLinkGoogle').addEventListener('click', () => runAccountTask(() => startAccountGoogleLogin(true)));
  document.getElementById('btnEmailCode').addEventListener('click', requestEmailCode);
  document.getElementById('btnEmailVerify').addEventListener('click', verifyEmailCode);
  document.getElementById('btnAccountSync').addEventListener('click', syncAccountNow);
  document.getElementById('btnAccountLogout').addEventListener('click', logoutAccount);
  document.getElementById('btnAccountUseServer').addEventListener('click', useServerAccountVersion);
  document.getElementById('btnAccountUseLocal').addEventListener('click', useLocalAccountVersion);
  document.getElementById('btnAccountMigrate').addEventListener('click', migrateGuestLibrary);
  document.getElementById('accountModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeAccountModal(); });
  document.getElementById('accountModal').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeAccountModal(); } });
  window.addEventListener('online', syncAccountNow);
  setInterval(() => { if (!document.hidden) syncAccountNow(); }, 60000);
  renderAccountUi();
  if (!['https:', 'http:'].includes(location.protocol)) return;
  runAccountTask(async () => {
    let returned = null, returnError = null;
    try { returned = await finishAccountGoogleLogin(); } catch (err) { returnError = err; }
    const session = returned || await accountRequest('/api/session');
    accountAvailable = true; driveAutoSaveAllowed = false;
    clearTimeout(driveSaveTimer); driveSaveTimer = null;
    await acceptAccountSession(session);
    if (returnError) {
      setAccountStatus('Вход не завершён', returnError.message);
      openAccountModal();
    }
    const outcome = new URL(location.href).searchParams.get('auth');
    if (outcome) {
      history.replaceState(null, '', location.pathname);
      if (outcome !== 'success') {
        setAccountStatus('Вход не завершён', outcome === 'verify_email'
          ? 'Войдите по коду из письма, затем привяжите Google в окне аккаунта.' : 'Не удалось войти через Google. Повторите вход или используйте почту.');
        openAccountModal();
      }
    }
  });
}
