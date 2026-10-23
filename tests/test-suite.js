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

    document.title = 'TESTRESULT=' + JSON.stringify(R);
  } catch (e) {
    document.title = 'TESTERROR=' + e.message + '|' + e.stack;
  }
})();
