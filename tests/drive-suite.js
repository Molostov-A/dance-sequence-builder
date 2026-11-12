async function runDriveTests(check) {
  const original = { state, config: driveConfig, fetch: window.fetch, confirm: window.confirm,
    google: window.google, origin: driveCanUseOrigin, choose: chooseDriveFile, libraries: driveLibrariesReady,
    token: driveToken, until: driveTokenUntil };
  let server, version, writes, requests, sentHeaders, sentText;
  const fixture = () => {
    const data = initialState();
    data.movements = [{ id: 1, name: 'База', lead: '', follow: '' }];
    data.nodes = { 1: { id: 1, movementId: 1, parentId: null, beat: 1, length: 4, prepId: null } };
    data.roots = [1]; data.nodeOrder = [1]; data.nextNodeId = 2; data.nextMovId = 2;
    return data;
  };
  const reply = (data, status = 200, etag = '"version-' + version + '"') => ({
    ok: status >= 200 && status < 300, status,
    headers: new Headers(etag ? { ETag: etag } : {}),
    text: async () => typeof data === 'string' ? data : JSON.stringify(data)
  });
  const metadata = () => ({ id: 'linked-json', name: 'Связки.json', version,
    mimeType: 'application/json', capabilities: { canEdit: true } });
  const serve = async (url, options = {}) => {
    requests++;
    if (options.method === 'PATCH') {
      writes++; sentHeaders = options.headers; sentText = options.body;
      server = JSON.parse(options.body); version = String(Number(version) + 1);
      return reply(metadata());
    }
    return reply(url.includes('alt=media') ? server : metadata());
  };
  const setup = async () => {
    clearTimeout(driveSaveTimer); driveSaveTimer = null;
    driveApplying = true; state = fixture(); render(); driveApplying = false;
    server = JSON.parse(driveDataText(state)); version = '1'; writes = 0; requests = 0;
    driveConfig = { clientId: '123-test.apps.googleusercontent.com', apiKey: 'browser-test-key', projectNumber: '123',
      fileId: 'linked-json', fileName: 'Связки.json', version, baseHash: await driveHash(driveDataText(state)) };
    driveToken = 'fake-token-only-in-memory'; driveTokenUntil = Date.now() + 3600000;
    driveReady = true; driveConflict = false; driveBusy = false;
    window.fetch = serve; window.confirm = () => true;
    persistDriveConfig(); renderDriveUi();
  };
  const verify = async (name, fn) => {
    let value, error;
    try { value = await fn(); } catch (e) { error = e; }
    check(name, () => { if (error) throw error; return value; });
  };
  try {
    await setup();
    await verify('облако: переключение раздела не меняет содержимое файла', async () => {
      const text = driveDataText(state); setView('library');
      return text === driveDataText(state) && await driveSyncNow() && writes === 0;
    });
    await verify('облако: изменение движения сохраняется в тот же файл через PATCH', async () => {
      addMovement('Поворот'); const result = await driveSyncNow();
      return result && writes === 1 && server.movements.some(m => m.name === 'Поворот')
        && driveConfig.version === '2' && sentHeaders.get('Authorization') === 'Bearer fake-token-only-in-memory'
        && sentHeaders.get('If-Match') === '"version-1"';
    });
    check('облако: токен и настройки подключения не попадают в JSON файла', () => !sentText.includes('fake-token')
      && !sentText.includes('browser-test-key') && !sentText.includes('clientId'));
    check('облако: связь запоминается без access token', () => {
      const saved = localStorage.getItem(DRIVE_LINK_KEY);
      const loaded = loadDriveConfig();
      return loaded.fileId === 'linked-json' && loaded.version === '2' && !saved.includes('fake-token');
    });
    await verify('облако: повторная синхронизация не создаёт лишнюю запись', async () => await driveSyncNow() && writes === 1);

    await setup();
    await verify('облако: автосохранение вызывается после обычного saveState', async () => {
      const realTimer = window.setTimeout;
      window.setTimeout = (fn, ms) => realTimer(fn, ms === DRIVE_SAVE_DELAY ? 0 : ms);
      try {
        addMovement('Авто');
        for (let i = 0; i < 100 && (writes === 0 || driveBusy); i++) await new Promise(resolve => realTimer(resolve, 10));
        return writes === 1 && server.movements.some(m => m.name === 'Авто');
      } finally { window.setTimeout = realTimer; }
    });
    await setup();
    await verify('облако: загрузка новой облачной версии не вызывает обратную запись', async () => {
      server.movements[0].name = 'Облачная база'; version = '2';
      let confirmations = 0; window.confirm = () => { confirmations++; return true; };
      const result = await driveSyncNow();
      return result && state.movements[0].name === 'Облачная база' && driveConfig.version === '2'
        && writes === 0 && confirmations === 0;
    });
    await setup();
    await verify('облако: два набора изменений приостанавливают запись', async () => {
      state.movements[0].name = 'Локально'; saveState(); server.movements[0].name = 'Удалённо'; version = '2';
      await driveSyncNow();
      return driveConflict && writes === 0 && state.movements[0].name === 'Локально'
        && !document.getElementById('driveConflict').classList.contains('hidden');
    });
    await verify('облако: загрузка облачной версии разрешает конфликт', async () => {
      await loadRemoteDriveVersion();
      return !driveConflict && state.movements[0].name === 'Удалённо' && writes === 0 && driveConfig.version === '2';
    });
    await setup();
    await verify('облако: явное сохранение локальной версии разрешает конфликт', async () => {
      state.movements[0].name = 'Моя версия'; server.movements[0].name = 'Другая'; version = '2';
      await driveSyncNow(); await keepLocalDriveVersion();
      return !driveConflict && writes === 1 && server.movements[0].name === 'Моя версия' && driveConfig.version === '3';
    });
    await setup();
    await verify('облако: отмена выбора версии ничего не заменяет', async () => {
      state.movements[0].name = 'Моя'; server.movements[0].name = 'Чужая'; version = '2';
      await driveSyncNow(); window.confirm = () => false;
      await keepLocalDriveVersion(); await loadRemoteDriveVersion();
      return driveConflict && writes === 0 && state.movements[0].name === 'Моя';
    });
    await setup();
    await verify('облако: изменение версии перед PATCH обнаруживается', async () => {
      addMovement('Локальное'); let metadataRequests = 0;
      window.fetch = (url, options) => {
        if (!url.includes('alt=media') && (!options || options.method !== 'PATCH') && ++metadataRequests === 2) version = '2';
        return serve(url, options);
      };
      await driveSyncNow(); return driveConflict && writes === 0;
    });
    await setup();
    await verify('облако: HTTP 412 останавливает автосохранение', async () => {
      addMovement('Локальное');
      window.fetch = (url, options) => options && options.method === 'PATCH' ? reply('', 412) : serve(url, options);
      const result = await driveSyncNow();
      return !result && driveConflict && driveConfig.version === '1' && writes === 0;
    });
    await setup();
    await verify('облако: изменение во время записи остаётся в очереди', async () => {
      addMovement('Первое'); let changed = false;
      window.fetch = (url, options) => {
        if (options && options.method === 'PATCH' && !changed) { changed = true; addMovement('Во время записи'); }
        return serve(url, options);
      };
      await driveSyncNow();
      const pending = driveConfig.baseHash !== await driveHash(driveDataText(state));
      await driveSyncNow();
      return pending && writes === 2 && server.movements.some(m => m.name === 'Во время записи')
        && driveConfig.baseHash === await driveHash(driveDataText(state));
    });
    await setup();
    await verify('облако: потерянный ответ записи не создаёт ложный конфликт', async () => {
      addMovement('Уже записано'); server = JSON.parse(driveDataText(state)); version = '2';
      await driveSyncNow();
      return !driveConflict && writes === 0 && driveConfig.version === '2'
        && driveConfig.baseHash === await driveHash(driveDataText(state));
    });
    await setup();
    await verify('облако: истёкший токен не вызывает скрытый вход или запрос записи', async () => {
      addMovement('Офлайн'); driveTokenUntil = Date.now() - 1;
      const result = await driveSyncNow();
      return !result && requests === 0 && driveStatus === 'Нужно подключиться'
        && state.movements.some(m => m.name === 'Офлайн') && loadDriveConfig().fileId === 'linked-json';
    });
    await setup();
    await verify('облако: HTTP 401 сбрасывает доступ и сохраняет локальные данные', async () => {
      addMovement('Не терять'); window.fetch = async () => reply('', 401);
      const result = await driveSyncNow();
      return !result && !driveHasToken() && !driveReady && state.movements.some(m => m.name === 'Не терять') && writes === 0;
    });
    await setup();
    await verify('облако: отсутствие интернета не меняет базовую версию', async () => {
      const baseHash = driveConfig.baseHash; addMovement('Без сети');
      window.fetch = async () => { throw new TypeError('Failed to fetch'); };
      const result = await driveSyncNow();
      return !result && driveConfig.baseHash === baseHash && driveConfig.version === '1'
        && state.movements.some(m => m.name === 'Без сети') && driveMessage.includes('интернет');
    });
    await setup();
    await verify('облако: тайм-аут снимает блокировку синхронизации', async () => {
      const realTimer = window.setTimeout;
      window.setTimeout = (fn, ms) => realTimer(fn, ms === 20000 ? 0 : ms);
      window.fetch = (url, options) => new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
      try {
        const result = await driveSyncNow();
        return !result && !driveBusy && driveConfig.version === '1' && driveMessage.includes('20 секунд');
      } finally { window.setTimeout = realTimer; }
    });
    await setup();
    await verify('облако: файл без права записи не подключается', async () => {
      window.fetch = async () => reply({ ...metadata(), capabilities: { canEdit: false } });
      const result = await driveSyncNow();
      return !result && writes === 0 && driveMessage.includes('редактировать');
    });
    await setup();
    await verify('облако: испорченный JSON не заменяет локальные данные', async () => {
      const previous = state; version = '2'; server = '<html>not json</html>';
      const result = await driveSyncNow();
      return !result && state === previous && driveConfig.version === '1' && writes === 0;
    });
    await setup();
    await verify('облако: недопустимые счёты в облачном JSON показывают ошибку без замены', async () => {
      const previous = state; version = '2'; server.nodes[1].length = 3;
      const result = await driveSyncNow();
      return !result && state === previous && driveConfig.version === '1'
        && driveStatus === 'Не синхронизировано' && driveMessage.includes('не удалось применить');
    });
    await setup();
    await verify('облако: связывание требует подтверждения замены локальных данных', async () => {
      const previous = state; window.confirm = () => false; driveConfig.fileId = 'previous-file';
      await runDriveTask(() => linkDriveFile('linked-json'));
      return state === previous && driveConfig.fileId === 'previous-file' && writes === 0;
    });
    await setup();
    await verify('облако: успешное связывание запоминает файл после проверки данных', async () => {
      driveConfig.fileId = ''; server.movements[0].name = 'Выбранный файл';
      await runDriveTask(() => linkDriveFile('linked-json'));
      return driveConfig.fileId === 'linked-json' && state.movements[0].name === 'Выбранный файл'
        && loadDriveConfig().fileName === 'Связки.json' && writes === 0;
    });
    await setup();
    await verify('облако: отказ локального сохранения не меняет связь с файлом', async () => {
      const previous = state, realSetItem = Storage.prototype.setItem;
      driveConfig.fileId = 'previous-file';
      Storage.prototype.setItem = function (key, value) {
        if (key === STORAGE_KEY) throw new DOMException('full', 'QuotaExceededError');
        return realSetItem.call(this, key, value);
      };
      try {
        await runDriveTask(() => linkDriveFile('linked-json'));
        return state === previous && driveConfig.fileId === 'previous-file' && writes === 0;
      } finally { Storage.prototype.setItem = realSetItem; showStorageError(false); }
    });
    await setup();
    await verify('облако: отложенная загрузка не перетирает свежую локальную правку', async () => {
      window.fetch = (url, options) => {
        if (url.includes('alt=media')) addMovement('Пока загружалось');
        return serve(url, options);
      };
      const result = await runDriveTask(() => linkDriveFile('linked-json'));
      return !result && state.movements.some(m => m.name === 'Пока загружалось') && writes === 0;
    });
    await setup();
    check('облако: отвязка сохраняет локальные данные и удаляет только связь', () => {
      const previous = driveDataText(state); disconnectDrive();
      return !driveConfig.fileId && !loadDriveConfig().fileId && driveDataText(state) === previous && !driveHasToken() && writes === 0;
    });
    check('облако: file:// не запускает SDK и предлагает HTTPS', () => {
      openDriveModal();
      return document.getElementById('driveModal').classList.contains('open')
        && driveStatus.includes('HTTPS') && !document.getElementById('driveIdentityScript');
    });
    closeDriveModal();
    await setup();
    let oauthOptions, oauthRequests = 0, pickerRequests = 0;
    driveConfig.fileId = ''; driveToken = ''; driveLibrariesReady = true;
    driveCanUseOrigin = () => true;
    chooseDriveFile = () => { pickerRequests++; };
    window.google = { accounts: { oauth2: {
      hasGrantedAllScopes: () => true,
      initTokenClient: opts => { oauthOptions = opts; return { requestAccessToken: () => { oauthRequests++; } }; }
    } } };
    check('облако: OAuth запрашивает только drive.file по нажатию кнопки', () => {
      authorizeDrive();
      return oauthRequests === 1 && driveBusy && oauthOptions.scope === DRIVE_SCOPE;
    });
    check('облако: успешный OAuth открывает выбор файла и не сохраняет токен', () => {
      oauthOptions.callback({ access_token: 'new-fake-token', expires_in: 3600 });
      return driveHasToken() && !driveBusy && pickerRequests === 1 && !localStorage.getItem(DRIVE_LINK_KEY).includes('new-fake-token');
    });
    check('облако: закрытие OAuth popup возвращает кнопку подключения', () => {
      authorizeDrive(); oauthOptions.error_callback({ type: 'popup_closed' });
      return !driveBusy && driveStatus === 'Нужно подключиться';
    });
    check('облако: отказ в разрешении не связывает файл', () => {
      driveToken = ''; authorizeDrive(); oauthOptions.callback({ error: 'access_denied' });
      return !driveBusy && !driveHasToken() && !driveConfig.fileId;
    });
    let pickerCallback, builderConfig = {};
    class FakePickerBuilder {
      addView() { return this; }
      setDeveloperKey(value) { builderConfig.key = value; return this; }
      setAppId(value) { builderConfig.appId = value; return this; }
      setOAuthToken(value) { builderConfig.token = value; return this; }
      setOrigin(value) { builderConfig.origin = value; return this; }
      setTitle() { return this; }
      setCallback(callback) { pickerCallback = callback; return this; }
      build() { return { setVisible() {} }; }
    }
    window.google.picker = { PickerBuilder: FakePickerBuilder, DocsView: class { setMimeTypes() { return this; } },
      ViewId: { DOCS: 'docs' }, Action: { PICKED: 'picked', CANCEL: 'cancel' } };
    chooseDriveFile = original.choose;
    driveToken = 'picker-test-token'; driveTokenUntil = Date.now() + 3600000;
    check('облако: Picker получает реквизиты общего проекта и приостанавливает запись', () => {
      chooseDriveFile();
      return driveBusy && builderConfig.key === driveConfig.apiKey && builderConfig.appId === driveConfig.projectNumber
        && builderConfig.token === driveToken && builderConfig.origin === location.origin;
    });
    check('облако: отмена Picker возвращает управление без изменения файла', () => {
      pickerCallback({ action: 'cancel' }); return !driveBusy && !driveConfig.fileId;
    });
  } finally {
    clearTimeout(driveSaveTimer); driveSaveTimer = null;
    window.fetch = original.fetch; window.confirm = original.confirm; window.google = original.google;
    driveCanUseOrigin = original.origin; chooseDriveFile = original.choose;
    driveConfig = original.config; driveLibrariesReady = original.libraries;
    drivePicker = null;
    driveToken = original.token; driveTokenUntil = original.until;
    driveReady = false; driveBusy = false; driveConflict = false;
    driveApplying = true; state = original.state; render(); driveApplying = false;
    persistDriveConfig(); closeDriveModal(); renderDriveUi();
  }
}
