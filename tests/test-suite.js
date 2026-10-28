(function () {
  var R = { ok: 0, fail: 0, cases: [] };
  function check(name, fn) {
    try {
      var v = fn();
      if (v) { R.ok++; R.cases.push({ name: name, pass: true }); }
      else { R.fail++; R.cases.push({ name: name, pass: false, msg: 'false' }); }
    } catch (e) {
      R.fail++; R.cases.push({ name: name, pass: false, msg: e.message });
    }
  }
  function q(s) { return document.querySelector(s); }
  function qa(s) { return Array.from(document.querySelectorAll(s)); }

  try {
    // Детерминированное состояние, не зависит от localStorage.
    state = {
      movements: [
        { id: 1, name: 'Базовое', lead: '', follow: '' },
        { id: 2, name: 'Подготовка А', lead: '', follow: '' }
      ],
      roots: [], nodes: {}, nodeOrder: [],
      nextNodeId: 1, nextMovId: 3, activePath: [],
      treeViewMode: 'path', merges: [], comboVideos: {},
      concepts: [], nextConceptId: 1,
      comboDescriptions: {}, comboDescriptionSegments: {},
      currentView: 'tree', navPinned: true
    };
    render();

    // --- Боковое меню ---
    check('боковое меню открыто по умолчанию', function () {
      return document.body.classList.contains('nav-open');
    });
    check('боковое меню закреплено по умолчанию', function () {
      return document.body.classList.contains('nav-pinned');
    });

    // --- Добавление корневого узла ---
    addRootNode(1, 4);
    var rootId = state.roots[0];
    check('корневой узел создан', function () {
      return state.roots.length === 1 && state.nodes[rootId].movementId === 1;
    });
    check('у нового узла preparation === null', function () {
      return state.nodes[rootId].preparation === null;
    });

    render();
    var activeCard = q('.node-card.active');
    check('активная карточка отрисована', function () { return !!activeCard; });
    check('на активной карточке есть элементы управления', function () {
      return !!activeCard && !!activeCard.querySelector('.card-actions');
    });
    check('кнопок управления не меньше четырёх', function () {
      return activeCard.querySelectorAll('.card-actions .icon-btn').length >= 4;
    });
    check('есть кнопка подготовки', function () {
      return !!activeCard.querySelector('.card-actions .icon-btn[title*="Подготовка"]');
    });

    // --- Добавление дочернего узла ---
    addChildNode(rootId, 1, 5, 4);
    var childId = state.activePath[state.activePath.length - 1];
    check('дочерний узел создан', function () { return state.activePath.length === 2; });
    render();
    activeCard = q('.node-card.active');
    check('дочерний узел активен', function () {
      return activeCard && activeCard.dataset.nodeId === String(childId);
    });
    check('у дочернего узла есть элементы управления', function () {
      return !!activeCard.querySelector('.card-actions');
    });

    // --- Подготовка ---
    state.nodes[childId].preparation = { movementId: 2 };
    saveState(); render();
    check('блок подготовки отрисован на карточке', function () {
      return !!q('.node-card.active .prep-block');
    });
    check('название подготовки отрисовано', function () {
      var el = q('.node-card.active .prep-name');
      return el && el.textContent.indexOf('Подготовка А') >= 0;
    });
    check('кнопка подготовки в активном состоянии', function () {
      return !!q('.node-card.active .prep-active');
    });
    check('блок подготовки ровно один (без дублей)', function () {
      return qa('.node-card.active .prep-block').length === 1;
    });

    // --- Пикер подготовки ---
    openPrepPicker(childId);
    check('пикер подготовки открывается', function () { return !!q('.prep-picker-modal'); });
    check('пикер показывает все движения библиотеки', function () {
      return qa('.prep-picker-item').length === 2;
    });
    qa('.prep-picker-item')[0].click();
    check('выбор в пикере меняет подготовку', function () {
      return state.nodes[childId].preparation && state.nodes[childId].preparation.movementId === 1;
    });
    check('пикер закрывается после выбора', function () { return !q('.prep-picker-modal'); });

    // Возвращаем подготовку на движение 2
    state.nodes[childId].preparation = { movementId: 2 };

    // --- Комбинации ---
    var combos = collectCombos();
    check('собрана одна комбинация', function () { return combos.length === 1; });
    check('в комбинации два шага', function () { return combos[0].length === 2; });
    check('подготовка попадает в комбинацию', function () {
      return combos[0][1].preparation && combos[0][1].preparation.movementId === 2;
    });

    // --- Индекс видео по узлам ---
    var key = comboVideoKey(combos[0]);
    state.comboVideos[key] = ['https://drive.google.com/file/d/abc123/view'];
    rebuildNodeVideoIndex();
    check('видео привязано к корневому узлу', function () {
      return getNodeVideoCount(rootId) === 1;
    });
    check('видео привязано к дочернему узлу', function () {
      return getNodeVideoCount(childId) === 1;
    });

    // --- Индекс видео по движениям (подготовка) ---
    rebuildMovementVideoIndex();
    check('подготовка попадает в индекс видео движения', function () {
      var e = getMovementVideoEntries(2);
      return e.length >= 1 && e.some(function (en) { return en.places.some(function (p) { return p.prep === true; }); });
    });

    // --- Отображение подготовки в разделе Комбинации ---
    render();
    check('подготовка отображается в разделе Комбинации', function () {
      return !!q('#combosContainer .combo-prep-inline');
    });

    // --- Режим «все ветви»: элементы управления тоже должны быть ---
    state.treeViewMode = 'all';
    render();
    check('в режиме «все ветви» у активной карточки есть элементы управления', function () {
      var c = q('.node-card.active');
      return !!c && !!c.querySelector('.card-actions');
    });
    state.treeViewMode = 'path';
    render();

    // --- Переключение разделов ---
    setView('library');
    check('переключение раздела работает', function () {
      return q('#view-library').classList.contains('active');
    });
    setView('tree');

    // --- Миграция старых данных ---
    var legacy = { nodes: { a: { movementId: 1, parentId: null, beat: 1, length: 4 } } };
    normalizePreparations(legacy);
    check('нормализация добавляет preparation: null', function () {
      return legacy.nodes.a.preparation === null;
    });

    // --- Модалка движения не закрывается по клику вне окна ---
    openMovementModal({ movementId: 1 });
    check('модалка движения открылась', function () {
      return q('#movementModal').classList.contains('open');
    });
    var mvModal = q('#movementModal');
    mvModal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    check('модалка движения не закрывается по клику на фон', function () {
      return q('#movementModal').classList.contains('open');
    });
    closeMovementModal();

    // --- Поле названия: многострочность и автоувеличение ---
    openMovementModal({ movementId: 1 });
    var nameInput = q('#movementNameInput');
    check('поле названия многострочное (auto-grow)', function () {
      return nameInput.classList.contains('auto-grow');
    });
    var initialHeight = nameInput.clientHeight;
    setMentionText(nameInput, 'Строка один\nСтрока два\nСтрока три');
    check('поле названия увеличивается при многострочном тексте', function () {
      return nameInput.clientHeight > initialHeight;
    });
    check('перенос строки сохраняется в сегментах', function () {
      var txt = mentionText(nameInput);
      return txt.indexOf('\n') >= 0;
    });
    closeMovementModal();

    // --- Подготовка с числовым id переживает загрузку ---
    var withPrep = { nodes: { a: { movementId: 1, preparation: { movementId: 2 } } } };
    normalizePreparations(withPrep);
    check('нормализация сохраняет подготовку с числовым id', function () {
      return withPrep.nodes.a.preparation && withPrep.nodes.a.preparation.movementId === 2;
    });
    saveState();
    check('подготовка сохраняется после loadState', function () {
      var loaded = loadState();
      var n = loaded.nodes[childId];
      return n.preparation && n.preparation.movementId === 2;
    });

    // --- Сворачивание продолжений ---
    state.activePath = [rootId];
    toggleCollapse(rootId);
    check('свёрнутый узел скрывает продолжения', function () {
      return isCollapsed(rootId) && qa('#nodesLayer .mini-card.child').length === 0;
    });
    check('кнопка свёрнутого узла показывает число скрытых', function () {
      var t = q('.node-card.active .collapse-toggle');
      return t && t.textContent === '+1';
    });
    setActiveNode(childId);
    check('переход к скрытому узлу разворачивает предков', function () {
      return !isCollapsed(rootId);
    });

    // --- Окно замены движения ---
    replaceMovement(childId);
    check('окно замены открывается со списком движений', function () {
      return q('#replaceMovementModal').classList.contains('open') && qa('.replace-movement-item').length === 2;
    });
    q('#replaceMovementSearch').value = 'Новое';
    renderReplaceMovementList();
    check('без совпадений предлагается создать движение', function () {
      return qa('.replace-movement-item').length === 0
        && q('#btnReplaceWithNew').textContent.indexOf('Новое') >= 0;
    });
    closeReplaceMovementModal();

    // --- Удаление движения чистит производные данные ---
    var realConfirm = window.confirm;
    window.confirm = function () { return true; };
    addRootNode(1, 4);
    var otherRoot = state.roots[state.roots.length - 1];
    addMerge(childId, otherRoot);
    var delCombo = collectCombos().find(function (c) { return c[0].id === rootId; });
    var delKey = comboVideoKey(delCombo);
    state.comboDescriptions[delKey] = 'описание';
    state.nodes[otherRoot].preparation = { movementId: 2 };
    state.nodes[childId].movementId = 2;
    deleteMovement(2);
    window.confirm = realConfirm;
    check('удаление движения удаляет его узлы', function () {
      return !state.nodes[childId] && !!state.nodes[rootId];
    });
    check('удаление движения чистит merges', function () {
      return state.merges.every(function (m) { return state.nodes[m.from] && state.nodes[m.to]; });
    });
    check('удаление движения убирает подготовку', function () {
      return state.nodes[otherRoot].preparation === null;
    });
    check('удаление движения чистит описания комбинаций', function () {
      return !state.comboDescriptions[delKey];
    });

    document.title = 'TESTRESULT=' + JSON.stringify(R);
  } catch (e) {
    document.title = 'TESTERROR=' + e.message + '|' + e.stack;
  }
})();
