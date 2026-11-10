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
  function follows(a, b) { return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); }

  try {
    // Детерминированное состояние, не зависит от localStorage.
    state = {
      movements: [
        { id: 1, name: 'Базовое', lead: '', follow: '' },
        { id: 2, name: 'Второе', lead: '', follow: '' },
        { id: 3, name: 'Третье', lead: '', follow: '' }
      ],
      roots: [], nodes: {}, nodeOrder: [],
      nextNodeId: 1, nextMovId: 4, activePath: [],
      treeViewMode: 'path', merges: [], comboVideos: {},
      concepts: [], nextConceptId: 1,
      comboDescriptions: {}, comboDescriptionSegments: {},
      currentView: 'tree', navPinned: true
    };
    render();
    var realConfirm = window.confirm;
    window.confirm = function () { return true; };

    // --- Боковое меню ---
    check('боковое меню открыто по умолчанию', function () {
      return document.body.classList.contains('nav-open');
    });
    check('боковое меню закреплено по умолчанию', function () {
      return document.body.classList.contains('nav-pinned');
    });
    check('в меню есть раздел «Библиотека препов»', function () {
      return !!q('.nav-item[data-view="preps"]');
    });

    // --- Добавление корневого узла ---
    addRootNode(1, 4);
    var rootId = state.roots[0];
    check('корневой узел создан', function () {
      return state.roots.length === 1 && state.nodes[rootId].movementId === 1;
    });
    check('у корня нет препа', function () {
      return state.nodes[rootId].prepId === null;
    });

    render();
    var activeCard = q('.node-card.active');
    check('активная карточка отрисована', function () { return !!activeCard; });
    check('на активной карточке есть элементы управления', function () {
      return !!activeCard && !!activeCard.querySelector('.card-actions');
    });
    check('у корня кнопка препа недоступна (нет входящей линии)', function () {
      var b = activeCard.querySelector('.card-actions .icon-btn[title*="входящей"]');
      return b && b.disabled;
    });
    check('есть кнопки смены родителя и перехода к комбинациям', function () {
      return !!activeCard.querySelector('.icon-btn[title*="родителя"]')
        && !!activeCard.querySelector('.icon-btn[title*="комбинации"]');
    });

    // --- Дети и препы на линиях ---
    addChildNode(rootId, 2, 5, 4);
    var childId = state.activePath[state.activePath.length - 1];
    check('дочерний узел создан без препа', function () {
      return state.activePath.length === 2 && state.nodes[childId].prepId === null;
    });

    var prepId = addPrep('Мостик', 'лид тянет', '');
    check('преп добавлен в отдельную библиотеку', function () {
      return state.preps.length === 1 && state.movements.length === 3 && getPrep(prepId).name === 'Мостик';
    });
    check('имена препов уникальны без учёта регистра', function () {
      return addPrep('мостик') === prepId && state.preps.length === 1;
    });
    setNodePrep(childId, prepId);
    check('преп ставится на входящую линию узла', function () {
      return state.nodes[childId].prepId === prepId;
    });
    check('блок препа нарисован на линии', function () {
      return qa('#nodesLayer .prep-chip').length === 1;
    });

    addChildNode(rootId, 3, 5, 4, prepId);
    var child2Id = state.activePath[state.activePath.length - 1];
    check('второе продолжение за тем же препом создано', function () {
      return state.nodes[child2Id].prepId === prepId && state.nodes[child2Id].parentId === rootId;
    });
    check('два продолжения за одним препом — один блок препа', function () {
      return qa('#nodesLayer .prep-chip').length === 1;
    });
    toggleTreeView('all');
    check('в режиме «все ветви» тоже один блок препа', function () {
      return qa('#nodesLayer .prep-chip').length === 1;
    });
    check('в режиме «все ветви» у активной карточки есть элементы управления', function () {
      var c = q('.node-card.active');
      return !!c && !!c.querySelector('.card-actions');
    });
    toggleTreeView('path');

    // --- Окно выбора препа ---
    openNodePrepPicker(childId);
    check('окно выбора препа открывается со списком и пунктом «Без препа»', function () {
      return q('#libraryPickerModal').classList.contains('open')
        && qa('#libraryPickerList .library-picker-item:not(.library-picker-none)').length === 1
        && !!q('#libraryPickerList .library-picker-none');
    });
    q('#libraryPickerList .library-picker-none').click();
    check('«Без препа» снимает преп с линии', function () {
      return state.nodes[childId].prepId === null && !q('#libraryPickerModal').classList.contains('open');
    });
    setNodePrep(childId, prepId);

    // --- Форма продолжения с препом ---
    openForm({ parentId: rootId, isRoot: false, beat: 5, prepId: prepId });
    check('форма показывает выбранный преп линии', function () {
      var el = q('#formLayer .prep-form-name');
      return el && el.textContent.indexOf('Мостик') >= 0;
    });
    closeForm();
    openForm({ parentId: null, isRoot: true, beat: 1 });
    check('у формы новой связки нет строки препа', function () {
      return !q('#formLayer .prep-form-row');
    });
    closeForm();

    // --- Комбинации ---
    var combos = collectCombos();
    check('собраны две комбинации', function () { return combos.length === 2; });
    check('преп попадает в шаг комбинации', function () {
      var p = comboStepPrep(combos[0], 1);
      return p && p.id === prepId;
    });
    render();
    check('преп отображается между шагами в разделе Комбинации', function () {
      return qa('#combosContainer .combo-prep').length === 2;
    });

    // --- Переход из дерева к комбинациям узла ---
    showCombosForNode(childId);
    check('переход открывает раздел Комбинации с фильтром по узлу', function () {
      return state.currentView === 'combos' && !!q('.combo-focus-bar')
        && qa('#combosContainer .combo-list > li').length === 1
        && !!q('#combosContainer .mov.focus');
    });
    clearComboFocus();
    check('«Показать все» снимает фильтр', function () {
      return !q('.combo-focus-bar') && qa('#combosContainer .combo-list > li').length === 2;
    });
    setView('tree');

    // --- Индекс видео по узлам ---
    var key = comboVideoKey(combos[0]);
    state.comboVideos[key] = ['https://drive.google.com/file/d/abc123/view'];
    rebuildNodeVideoIndex();
    check('видео привязано к корневому узлу', function () {
      return getNodeVideoCount(rootId) === 1;
    });
    delete state.comboVideos[key];
    rebuildNodeVideoIndex();

    // --- Библиотеки: поле добавления сверху ---
    setView('library');
    check('переключение раздела работает', function () {
      return q('#view-library').classList.contains('active');
    });
    check('в библиотеке движений поле добавления над списком', function () {
      return follows(q('#newMovInput'), q('#movList'));
    });
    setView('preps');
    check('раздел препов показывает библиотеку препов', function () {
      return q('#view-preps').classList.contains('active') && qa('#prepList li').length === 1;
    });
    check('в библиотеке препов поле добавления над списком', function () {
      return follows(q('#newPrepInput'), q('#prepList'));
    });
    setView('tree');

    // --- Миграция старой «подготовки на узле» на исходящие линии ---
    var legacy = {
      movements: [{ id: 1, name: 'Базовое' }, { id: 2, name: 'Подг', lead: 'л' }],
      nodes: {
        1: { id: 1, movementId: 1, parentId: null, beat: 1, length: 4, preparation: { movementId: 2 } },
        2: { id: 2, movementId: 1, parentId: 1, beat: 5, length: 4 },
        3: { id: 3, movementId: 1, parentId: 1, beat: 5, length: 4 }
      }
    };
    normalizePreps(legacy);
    check('миграция переносит подготовку в библиотеку препов', function () {
      return legacy.preps.length === 1 && legacy.preps[0].name === 'Подг' && legacy.preps[0].lead === 'л';
    });
    check('миграция ставит преп на исходящие линии', function () {
      var pid = legacy.preps[0].id;
      return legacy.nodes[2].prepId === pid && legacy.nodes[3].prepId === pid;
    });
    check('миграция убирает старое поле и не ставит преп корню', function () {
      return legacy.nodes[1].preparation === undefined && legacy.nodes[1].prepId === null;
    });
    saveState();
    check('преп линии сохраняется после loadState', function () {
      var loaded = loadState();
      return loaded.nodes[childId].prepId === prepId && loaded.preps.length === 1;
    });

    // --- Модалка движения не закрывается по клику вне окна ---
    openMovementModal({ movementId: 1 });
    check('модалка движения открылась', function () {
      return q('#movementModal').classList.contains('open');
    });
    q('#movementModal').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    check('модалка движения не закрывается по клику на фон', function () {
      return q('#movementModal').classList.contains('open');
    });
    closeMovementModal();

    // --- Модалка в режиме препа ---
    openMovementModal({ kind: 'prep', prepId: prepId });
    check('модалка открывает преп на редактирование', function () {
      return q('#movementModalTitle').textContent.indexOf('преп') >= 0
        && mentionText(q('#movementNameInput')) === 'Мостик';
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
      return mentionText(nameInput).indexOf('\n') >= 0;
    });
    closeMovementModal();

    // --- Сворачивание продолжений ---
    state.activePath = [rootId];
    toggleCollapse(rootId);
    check('свёрнутый узел скрывает продолжения и их препы', function () {
      return isCollapsed(rootId) && qa('#nodesLayer .mini-card.child').length === 0
        && qa('#nodesLayer .prep-chip').length === 0;
    });
    check('кнопка свёрнутого узла показывает число скрытых', function () {
      var t = q('.node-card.active .collapse-toggle');
      return t && t.textContent === '+2';
    });
    setActiveNode(childId);
    check('переход к скрытому узлу разворачивает предков', function () {
      return !isCollapsed(rootId);
    });

    // --- Окно замены движения ---
    replaceMovement(childId);
    check('окно замены открывается со списком движений', function () {
      return q('#libraryPickerModal').classList.contains('open')
        && qa('#libraryPickerList .library-picker-item').length === 3
        && !!q('#libraryPickerList .library-picker-item.current');
    });
    q('#libraryPickerSearch').value = 'Новое';
    renderLibraryPickerList();
    check('без совпадений предлагается создать движение', function () {
      return qa('#libraryPickerList .library-picker-item').length === 0
        && q('#btnLibraryPickerNew').textContent.indexOf('Новое') >= 0;
    });
    closeLibraryPicker();

    // --- Смена родителя ---
    addChildNode(childId, 1, 9, 4);
    var grandId = state.activePath[state.activePath.length - 1];
    check('смена родителя допустима при той же позиции в восьмёрке', function () {
      return canReparent(grandId, child2Id);
    });
    check('нельзя переехать к своему потомку и к нынешнему родителю', function () {
      return !canReparent(childId, grandId) && !canReparent(grandId, childId);
    });
    openChangeParentPicker(grandId);
    check('окно смены родителя предлагает подходящие узлы', function () {
      return qa('#libraryPickerList .library-picker-item').length >= 1;
    });
    closeLibraryPicker();
    reparentNode(grandId, child2Id);
    check('узел переехал к новому родителю', function () {
      return state.nodes[grandId].parentId === child2Id && state.nodes[grandId].beat === 9
        && state.activePath.join(',') === [rootId, child2Id, grandId].join(',');
    });
    addRootNode(1, 2);
    var shortRoot = state.roots[state.roots.length - 1];
    addChildNode(shortRoot, 1, 3, 2);
    var shortChild = state.activePath[state.activePath.length - 1];
    check('переезд к узлу с другой позицией в восьмёрке запрещён', function () {
      return !canReparent(grandId, shortRoot);
    });
    check('и к узлу без допустимого продолжения тоже', function () {
      return !canReparent(grandId, shortChild);
    });
    // Цепочка до 16-го счёта: продолжение с 17-го — снова 1-я позиция восьмёрки
    addRootNode(1, 4);
    var longRoot = state.roots[state.roots.length - 1];
    addChildNode(longRoot, 1, 5, 4);
    addChildNode(state.activePath[state.activePath.length - 1], 1, 9, 4);
    addChildNode(state.activePath[state.activePath.length - 1], 1, 13, 4);
    var at16 = state.activePath[state.activePath.length - 1];
    openAdoptChildPicker(at16);
    check('окно «подключить продолжение» открывается', function () {
      return q('#libraryPickerTitle').textContent.indexOf('Подключить') >= 0
        && qa('#libraryPickerList .library-picker-item').length >= 1;
    });
    closeLibraryPicker();
    reparentNode(grandId, at16);
    check('при переезде счёты ветки сдвигаются', function () {
      return state.nodes[grandId].parentId === at16 && state.nodes[grandId].beat === 17;
    });

    // --- Удаление препа ---
    deletePrep(prepId);
    check('удаление препа снимает его со всех линий', function () {
      return state.preps.length === 0
        && Object.values(state.nodes).every(function (n) { return n.prepId !== prepId; });
    });

    // --- Удаление движения чистит производные данные ---
    addMerge(child2Id, shortRoot);
    var delCombo = collectCombos().find(function (c) { return c[0].id === rootId; });
    var delKey = comboVideoKey(delCombo);
    state.comboDescriptions[delKey] = 'описание';
    deleteMovement(2);
    check('удаление движения удаляет его узлы', function () {
      return !state.nodes[childId] && !!state.nodes[rootId];
    });
    check('удаление движения чистит merges', function () {
      return state.merges.every(function (m) { return state.nodes[m.from] && state.nodes[m.to]; });
    });
    check('удаление движения чистит описания комбинаций', function () {
      return !state.comboDescriptions[delKey];
    });

    window.confirm = realConfirm;
    document.title = 'TESTRESULT=' + JSON.stringify(R);
  } catch (e) {
    document.title = 'TESTERROR=' + e.message + '|' + e.stack;
  }
})();
