(async function () {
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
    check('кнопка ‖ на карточке — «Продолжить через преп» (исходящая связь)', function () {
      var b = activeCard.querySelector('.card-actions .icon-btn[title="Продолжить через преп"]');
      return b && !b.disabled;
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
    check('новая группа препа по умолчанию свёрнута', function () {
      return isPrepLinkCollapsed(rootId, prepId) && qa('#nodesLayer .prep-mark').length === 1;
    });
    check('старые данные переходят к свёрнутым препам один раз', function () {
      var legacy = JSON.parse(JSON.stringify(state));
      delete legacy.prepDefaultsVersion; legacy.collapsedPrepLinks = [];
      normalizeTreePins(legacy);
      var collapsed = legacy.collapsedPrepLinks.includes(rootId + ':' + prepId);
      legacy.collapsedPrepLinks = []; normalizeTreePins(legacy);
      return collapsed && legacy.collapsedPrepLinks.length === 0;
    });
    togglePrepLinkCollapsed(rootId, prepId);
    check('блок препа нарисован на линии', function () {
      return qa('#nodesLayer .prep-chip').length === 1;
    });

    addChildNode(rootId, 3, 5, 4, prepId);
    var child2Id = state.activePath[state.activePath.length - 1];
    check('второе продолжение за тем же препом создано', function () {
      return state.nodes[child2Id].prepId === prepId && state.nodes[child2Id].parentId === rootId;
    });
    check('добавление ребёнка не сворачивает уже развёрнутую группу', function () {
      return !isPrepLinkCollapsed(rootId, prepId);
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
    // --- Свёрнутый преп: метка на линии, без широкой колонки ---
    var colBefore = lastFullLayout.byId.get(childId).x;
    togglePrepLinkCollapsed(rootId, prepId);
    check('свёрнутый преп рисуется меткой, колонка сужается', function () {
      return qa('#nodesLayer .prep-mark').length === 1 && qa('#nodesLayer .prep-chip').length === 0
        && lastFullLayout.byId.get(childId).x === colBefore - (PREP_COL - PREP_MARK_COL);
    });
    check('блок/метка препа не наезжает на карточки', function () {
      var mark = lastFullLayout.preps[0];
      return lastFullLayout.cards.every(function (c) {
        return mark.x + mark.w <= c.x || mark.x >= c.x + c.w || mark.y + mark.h <= c.y || mark.y >= c.y + c.h;
      });
    });
    toggleAllPrepLinks();
    check('«развернуть все препы» разворачивает свёрнутые', function () {
      return state.collapsedPrepLinks.length === 0 && qa('#nodesLayer .prep-chip').length === 1;
    });
    toggleAllPrepLinks();
    check('«свернуть все препы» сворачивает все', function () {
      return state.collapsedPrepLinks.length === 1 && qa('#nodesLayer .prep-mark').length === 1;
    });
    toggleAllPrepLinks();

    // --- Тултип и кнопки на связи с препом ---
    check('у связей с препом есть хит-линии для тултипа', function () {
      return qa('#linesSvg .link-hit[data-prep-id="' + prepId + '"]').length > 0;
    });
    showPrepTooltip(prepId, 100, 100);
    check('тултип показывает название препа', function () {
      var t = q('#prepTooltip');
      return !t.classList.contains('hidden') && t.textContent.indexOf('Мостик') >= 0;
    });
    hidePrepTooltip();
    showLinkControls(q('#linesSvg .link-hit[data-link-child="' + childId + '"]'), 200, 200);
    check('на связи с препом есть кнопки «Сменить», «Убрать» и формы линии', function () {
      var t = q('#linkControls').textContent;
      return !q('#linkControls').classList.contains('hidden') && t.indexOf('Сменить') >= 0
        && t.indexOf('Убрать') >= 0 && t.indexOf('Изгиб') >= 0;
    });
    hideLinkControls(true);

    // --- Преп по центру своей линии ---
    var chip0 = lastFullLayout.preps[0];
    var bus0 = lastFullLayout.buses[rootId].x;
    check('незакреплённый преп стоит посередине между шиной и колонкой', function () {
      return Math.abs((chip0.x + chip0.w / 2) - (bus0 + chip0.colX) / 2) < 1;
    });

    // --- Форма связи: шина по умолчанию, изгиб по переключателю ---
    var linkKey = 'c:' + childId;
    state.treePins.links[linkKey] = { shape: 'bus', ex: 50 };
    renderTree();
    check('перетянутая связь остаётся шиной со своим изломом и 📌', function () {
      var hit = q('#linesSvg .link-hit[data-link-key="' + linkKey + '"]');
      return hit && hit.getAttribute('d').indexOf(' C ') < 0 && !!q('#nodesLayer .pin-badge.link-pin');
    });
    toggleLinkShape(linkKey);
    check('переключатель делает связь плавной кривой с ручкой', function () {
      var hit = q('#linesSvg .link-hit[data-link-key="' + linkKey + '"]');
      return state.treePins.links[linkKey].shape === 'curve' && hit.getAttribute('d').indexOf(' C ') > 0
        && !!q('#linesSvg .curve-handle[data-link-key="' + linkKey + '"]');
    });
    state.treePins.links[linkKey] = { shape: 'curve', hx: 10, hy: -20 };
    renderTree();
    check('кривая проходит через перетянутую ручку', function () {
      var h = q('#linesSvg .curve-handle[data-link-key="' + linkKey + '"]');
      var path = q('#linesSvg .link-hit[data-link-key="' + linkKey + '"]');
      // Хит-линия шириной 14px: точка ручки должна попасть в её обводку
      var pt = q('#linesSvg').createSVGPoint();
      pt.x = Number(h.getAttribute('cx'));
      pt.y = Number(h.getAttribute('cy'));
      return path.isPointInStroke(pt);
    });
    resetLink(linkKey);
    check('«Авто» возвращает связь на общую шину', function () {
      return !state.treePins.links[linkKey] && !q('#linesSvg .curve-handle');
    });

    // --- Перетаскивание и закрепление (полное дерево) ---
    var autoChild = { x: lastFullLayout.byId.get(childId).x, y: lastFullLayout.byId.get(childId).y };
    var parentPos = lastFullLayout.byId.get(rootId);
    state.treePins.nodes[childId] = { dx: autoChild.x - parentPos.x + 40, dy: autoChild.y - parentPos.y + 30 };
    renderTree();
    check('закреплённый блок встаёт на смещение от родителя и получает 📌', function () {
      var c = lastFullLayout.byId.get(childId);
      return c.x === autoChild.x + 40 && c.y === autoChild.y + 30
        && !!q('.node-card[data-node-id="' + childId + '"] .pin-badge');
    });
    state.treePins.buses[rootId] = { dx: 12 };
    state.treePins.preps[prepLinkKey(rootId, prepId)] = { dx: 5, dy: 5 };
    renderTree();
    check('шину и блок препа тоже можно закрепить', function () {
      var root = lastFullLayout.byId.get(rootId);
      return lastFullLayout.buses[rootId].x === root.x + root.w + 12 && lastFullLayout.preps[0].pinned
        && !!q('#btnResetPins:not(.hidden)');
    });
    unpinNode(childId);
    check('открепление возвращает автоматическое положение', function () {
      var c = lastFullLayout.byId.get(childId);
      return !state.treePins.nodes[childId] && c.x === autoChild.x && c.y === autoChild.y;
    });
    state.treePins = { nodes: {}, buses: {}, preps: {} };

    // --- Убрать преп со связи ---
    removePrepFromLink(rootId, prepId);
    check('«Убрать преп со связи» снимает его со всех линий группы', function () {
      return state.nodes[childId].prepId === null && state.nodes[child2Id].prepId === null;
    });
    setNodePrep(childId, prepId);
    setNodePrep(child2Id, prepId);
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
    check('поиск по словам: каждое слово отдельно, без учёта регистра и ё', function () {
      return searchWordsMatch('Поворот партнёрши', 'парт пов') && searchWordsMatch('Поворот партнёрши', 'ПАРТНЕР')
        && !searchWordsMatch('Поворот партнёрши', 'пов волна') && searchWordsMatch('Что угодно', '  ');
    });
    var formSearch = q('#formLayer .mov-search');
    formSearch.value = 'тор';
    formSearch.dispatchEvent(new Event('input'));
    check('строка поиска в форме оставляет только совпадения и выбирает первое', function () {
      var opts = qa('#formLayer .mov-select option');
      return opts.length === 1 && opts[0].textContent === 'Второе' && q('#formLayer .mov-select').value === '2';
    });
    formSearch.value = 'нет такого';
    formSearch.dispatchEvent(new Event('input'));
    check('без совпадений предлагается создать новое движение', function () {
      var btn = q('#formLayer .mov-search-create');
      return !btn.classList.contains('hidden') && q('#formLayer .mov-select').value === '';
    });
    q('#formLayer .mov-search-create').click();
    check('«Создать» переносит текст в поле нового движения', function () {
      return mentionText(q('#formLayer .new-mov-input')) === 'нет такого';
    });
    formSearch.value = '';
    formSearch.dispatchEvent(new Event('input'));
    q('#formLayer .mov-select').value = '1';
    check('правка выбранного движения обновляет его подпись в форме', function () {
      state.movements[0].name = 'Базовое!';
      syncFormMovementOption(1);
      var ok = q('#formLayer .mov-select option[value="1"]').textContent === 'Базовое!';
      state.movements[0].name = 'Базовое';
      return ok;
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
    // --- Одно видео в нескольких комбинациях объединяется ---
    var key2 = comboVideoKey(combos[1]);
    // та же запись Диска, но ссылка в другом виде
    state.comboVideos[key2] = ['https://drive.google.com/open?id=abc123', 'https://drive.google.com/file/d/other9/view'];
    rebuildNodeVideoIndex();
    rebuildMovementVideoIndex();
    check('одинаковое видео у узла считается один раз', function () {
      return getNodeVideoCount(rootId) === 2;
    });
    check('у движения одинаковое видео — одна запись со списком комбинаций', function () {
      var e = getMovementVideoEntries(1);
      var same = e.find(function (x) { return x.key.indexOf('abc123') >= 0; });
      return e.length === 2 && same && same.combos.length === 2
        && same.combos.map(function (c) { return c.index; }).join() === '1,2';
    });
    openMovementVideosModal(1);
    check('в окне видео движения одинаковое видео показано одной строкой с двумя комбинациями', function () {
      var items = qa('#movementVideosList .movement-video-item');
      return items.length === 2 && items[0].querySelectorAll('.video-combo-block').length === 2
        && q('#movementVideosHint').textContent.indexOf('комбинаций: 2') >= 0;
    });
    closeMovementVideosModal();
    openNodeVideosModal(rootId);
    check('в окне видео узла — то же объединение', function () {
      var items = qa('#nodeVideosList .node-video-item');
      return items.length === 2 && items[0].querySelectorAll('.video-combo-block').length === 2;
    });
    closeNodeVideosModal();
    delete state.comboVideos[key2];
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

    // --- Папки комбинаций ---
    setView('combos');
    check('без папок комбинации идут плоским списком', function () {
      return !q('#combosContainer .combo-folder') && !!q('#combosContainer .combo-toolbar .combo-add-folder');
    });
    var f1 = addComboFolder(null);
    check('новая папка сразу открывается на переименование', function () {
      return !!q('.combo-folder[data-folder-id="' + f1 + '"] .combo-folder-name-input');
    });
    renameComboFolder(f1, 'Вечеринка');
    var f2 = addComboFolder(f1);
    renameComboFolder(f2, 'Медленные');
    var allCombos = collectCombos();
    var keyA = comboVideoKey(allCombos[0]);
    setComboFolderIds(keyA, [f1, f2]);
    render();
    check('подпапка вложена в папку', function () {
      var outer = q('.combo-folder[data-folder-id="' + f1 + '"]');
      return outer && !!outer.querySelector('.combo-folder[data-folder-id="' + f2 + '"]');
    });
    check('комбинация видна в каждой своей папке, остальные — в «Без папки»', function () {
      return qa('#combosContainer .combo-list > li').length === allCombos.length + 1
        && qa('.combo-folder-loose .combo-list > li').length === allCombos.length - 1;
    });
    check('счётчик папки считает разные комбинации поддерева', function () {
      return q('.combo-folder[data-folder-id="' + f1 + '"] > .combo-folder-head .combo-folder-count').textContent === '1';
    });
    toggleComboFolderCollapsed(f1);
    check('свёрнутая папка прячет содержимое', function () {
      return !q('.combo-folder[data-folder-id="' + f2 + '"]');
    });
    toggleComboFolderCollapsed(f1);
    toggleLooseCombosCollapsed();
    check('группа «Без папки» сворачивается', function () {
      return !!q('.combo-folder-loose') && !q('.combo-folder-loose .combo-list')
        && q('.combo-folder-loose .combo-folder-toggle').textContent === '▸';
    });
    toggleLooseCombosCollapsed();
    check('и разворачивается обратно', function () {
      return qa('.combo-folder-loose .combo-list > li').length === allCombos.length - 1;
    });

    // --- Подсветка папки в дереве ---
    setView('tree');
    check('панель подсветки во вкладке дерева предлагает папки и «Без подсветки»', function () {
      var opts = qa('#treeHighlightFolder option');
      return opts.length === 3 && opts[0].value === '' && q('#treeHighlightFolder').value === ''
        && q('#treeHighlightColor').disabled;
    });
    check('без выбранной папки ничего не подсвечено', function () {
      return qa('.folder-highlight').length === 0;
    });
    setTreeHighlightFolder(String(f1));
    setTreeHighlightColor('#ff0000');
    var hlIds = highlightedNodeIds();
    check('подсвечиваются движения комбинаций папки и её подпапок', function () {
      return allCombos[0].every(function (n) { return hlIds.has(n.id); }) && hlIds.size === allCombos[0].length;
    });
    toggleTreeView('all');
    check('у подсвеченных карточек рамка выбранного цвета', function () {
      var els = qa('.node-card.folder-highlight');
      return els.length === hlIds.size && els.every(function (el) { return el.style.outline.indexOf('rgb(255, 0, 0)') >= 0; });
    });
    toggleTreeView('path');
    setTreeHighlightFolder('');
    check('«Без подсветки» снимает рамки', function () {
      return qa('.folder-highlight').length === 0 && state.treeHighlight.color === '#ff0000';
    });
    setTreeHighlightFolder(String(f2));
    setView('combos');

    openComboFoldersModal(allCombos[1], 2);
    var boxes = qa('#comboFoldersList input[type="checkbox"]');
    check('окно папок связки показывает все папки галочками', function () {
      return q('#comboFoldersModal').classList.contains('open') && boxes.length === 2;
    });
    boxes[1].checked = true;
    boxes[1].dispatchEvent(new Event('change'));
    saveComboFoldersModal();
    check('галочка кладёт связку в папку', function () {
      return comboFolderIdsByKey(comboVideoKey(allCombos[1])).join() === String(f2);
    });

    moveComboFolder(f2, null);
    moveComboFolder(f1, f2);
    check('папку можно перенести в другую папку', function () {
      return getComboFolder(f2).parentId === null && getComboFolder(f1).parentId === f2;
    });
    moveComboFolder(f2, f1);
    check('папку нельзя перенести в собственную подпапку', function () {
      return getComboFolder(f2).parentId === null;
    });

    var brokenFolders = {
      comboFolders: [{ id: 1, name: 'A', parentId: 2 }, { id: 2, name: 'B', parentId: 1 }, { id: 3, name: 'C', parentId: 99 }],
      comboFolderLinks: { k: [1, 1, 99] }
    };
    normalizeComboFolders(brokenFolders);
    check('нормализация разрывает циклы и чистит битые ссылки', function () {
      var c = brokenFolders.comboFolders;
      var loop = c[0].parentId !== null && c[1].parentId !== null;
      return !loop && c[2].parentId === null && brokenFolders.comboFolderLinks.k.join() === '1'
        && brokenFolders.nextComboFolderId === 4;
    });

    deleteComboFolder(f2);
    check('удаление папки удаляет подпапки и привязки, но не комбинации', function () {
      return state.comboFolders.length === 0 && Object.keys(state.comboFolderLinks).length === 0
        && collectCombos().length === allCombos.length;
    });
    check('удаление подсвеченной папки снимает подсветку', function () {
      return state.treeHighlight.folderId === null;
    });
    setView('tree');

    // --- Фильтры генератора ---
    var st = genSequenceStats(
      [{ movementId: 7 }, { movementId: 8 }, { movementId: 7 }, { movementId: 9 }],
      new Set(['7>8>7'])
    );
    check('статистика связки: разнообразие и новые цепочки из трёх движений', function () {
      return st.unique === 3 && st.steps === 4 && st.triples === 2 && st.newTriples === 1;
    });
    var mk = function (ids) { return ids.map(function (id, i) { return { movementId: id, beat: 1 + i * 4, length: 4 }; }); };
    genSequences = [mk([901, 901, 902]), mk([901, 902, 903]), mk([903, 902, 901, 904]), mk([905, 906])];
    genFilters = { diverse: false, novel: false };
    setView('generator');
    check('без фильтров показаны все сгенерированные связки с метками', function () {
      return qa('#genTreeContainer .gen-seq').length === 4 && qa('#genTreeContainer .gen-badge').length === 8;
    });
    setGenFilter('diverse', true);
    check('«Максимально разнообразные» оставляет связки без повторов', function () {
      // все три без повторов; порядок — по новизне (у всех 100%), затем по числу новых цепочек
      return genVisibleSequences().map(function (e) { return e.idx; }).join() === '2,1,3'
        && q('.gen-filter-summary').textContent.indexOf('самые разнообразные') >= 0;
    });
    setGenFilter('diverse', false);
    // Связка 1 повторяет готовую цепочку — её новизна ниже
    var exT = existingMovementTriples();
    genSequences.push(mk([907, 908, 909, 907]));
    var sharedTriple = Array.from(exT)[0];
    if (sharedTriple) {
      var ids = sharedTriple.split('>').map(Number);
      genSequences.push(mk(ids.concat([910])));
    }
    setGenFilter('novel', true);
    check('«Новые сочетания» оставляет связки с наибольшей долей новых цепочек', function () {
      var v = genVisibleSequences();
      var all = genSequences.map(function (s) { return genSequenceStats(s, exT).novelty; });
      var best = Math.max.apply(null, all);
      return v.length > 0 && v.every(function (e) { return e.stats.novelty === best; })
        && v.length < genSequences.length
        && q('.gen-filter-summary').textContent.indexOf('из ' + genSequences.length) >= 0;
    });
    check('номер #N остаётся номером в полном списке', function () {
      var first = genVisibleSequences()[0];
      return q('#genTreeContainer .gen-seq .gen-seq-idx').textContent === '#' + (first.idx + 1);
    });
    genSequences = [mk([905, 906]), mk([905, 906, 905])];
    genSequences[1] = mk([905, 906]);
    renderGenerator();
    check('если новых сочетаний нет ни у одной связки — пустой список с пояснением', function () {
      return genVisibleSequences().length === 0
        && q('.gen-filter-summary').textContent.indexOf('новых сочетаний нет') >= 0;
    });
    genFilters = { diverse: false, novel: false };
    genSequences = [];
    var libraryMovementId = state.movements[0].id;
    genSequences = [mk([libraryMovementId]), mk([libraryMovementId])];
    genSelectedIdx = 1; genSourceSignature = generatorSourceSignature();
    setView('generator');
    q('#movementLibrarySearch').value = 'нет такого движения'; renderMovements();
    q('#genTreeContainer .gen-movement-link').click();
    check('движение из списка генератора открывает нужную строку библиотеки', function () {
      var row = q('#movList .library-focus');
      return state.currentView === 'library' && row && Number(row.dataset.movementId) === libraryMovementId
        && document.activeElement === row && q('#movementLibrarySearch').value === '';
    });
    check('переход к движению не выбирает другую связку и не очищает генерацию', function () {
      return genSelectedIdx === 1 && genSequences.length === 2;
    });
    setView('generator');
    q('#genCombosContainer .gen-movement-link').click();
    check('движение из подробного просмотра генерации тоже открывает библиотеку', function () {
      return state.currentView === 'library' && Number(q('#movList .library-focus').dataset.movementId) === libraryMovementId;
    });
    genSequences = []; genSelectedIdx = -1;
    setView('tree');

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

    // --- Импорт: ошибки не меняют память и сохранённый JSON ---
    var realAlert = window.alert;
    var notices = [];
    window.alert = function (message) { notices.push(message); };
    var beforeImport = state;
    var beforeRaw = localStorage.getItem(STORAGE_KEY);
    check('битый JSON сохраняет прежние данные', function () {
      return !applyImportedJson('{') && state === beforeImport && localStorage.getItem(STORAGE_KEY) === beforeRaw;
    });
    check('неверные типы основных полей отклоняются', function () {
      return [null, [], { movements: {}, nodes: {}, roots: [] }, { movements: [], nodes: [], roots: [] }]
        .every(function (data) { return !applyImportedJson(JSON.stringify(data)) && state === beforeImport; });
    });
    function importFixture() {
      return { movements: [{ id: 7, name: 'Импорт' }], roots: [1], nodes: {
        1: { id: 1, movementId: 7, parentId: null, beat: 1, length: 4 },
        2: { id: 2, movementId: 7, parentId: 1, beat: 5, length: 4 }
      } };
    }
    check('несуществующее движение отклоняется без замены состояния', function () {
      var d = importFixture(); d.nodes[2].movementId = 999;
      return !applyImportedJson(JSON.stringify(d)) && state === beforeImport;
    });
    check('несуществующий родитель отклоняется', function () {
      var d = importFixture(); d.nodes[2].parentId = 999;
      return !applyImportedJson(JSON.stringify(d)) && state === beforeImport;
    });
    check('цикл родителей отклоняется', function () {
      var d = importFixture(); d.nodes[1].parentId = 2;
      return !applyImportedJson(JSON.stringify(d)) && state === beforeImport;
    });
    check('некорректные текстовые сегменты отклоняются', function () {
      var d = importFixture(); d.movements[0].nameSegments = {};
      return !applyImportedJson(JSON.stringify(d)) && state === beforeImport;
    });
    check('недопустимые счёты и длительности отклоняются', function () {
      var d = importFixture(); d.nodes[2].length = 3;
      return !applyImportedJson(JSON.stringify(d)) && state === beforeImport;
    });
    check('разрыв счётов между родителем и ребёнком отклоняется', function () {
      var d = importFixture(); d.nodes[2].beat = 9;
      return !applyImportedJson(JSON.stringify(d)) && state === beforeImport;
    });
    check('отмена импорта не меняет данные', function () {
      window.confirm = function () { return false; };
      var result = applyImportedJson(JSON.stringify(importFixture()));
      window.confirm = function () { return true; };
      return !result && state === beforeImport && localStorage.getItem(STORAGE_KEY) === beforeRaw;
    });
    check('нормализация восстанавливает индексы и счётчики', function () {
      var d = importFixture(); d.roots = [2, 1, 1, 999]; d.nodeOrder = [2, 2, 999]; d.nextNodeId = 1; d.nextMovId = 1;
      d = prepareState(d);
      return d.roots.join(',') === '1' && d.nodeOrder.join(',') === '2,1' && d.nextNodeId === 3 && d.nextMovId === 8;
    });
    check('импорт старого файла восстанавливает раздел и очищает генератор', function () {
      toggleTreeView('all');
      genSequences = [[{ movementId: 999, beat: 1, length: 4 }]];
      return applyImportedJson('\uFEFF' + JSON.stringify(importFixture())) && state.currentView === 'tree'
        && q('#view-tree').classList.contains('active') && q('#btnViewPath').classList.contains('active')
        && !q('#btnViewAll').classList.contains('active') && genSequences.length === 0;
    });
    check('неизвестный раздел переключается на дерево', function () {
      setView('missing'); return state.currentView === 'tree' && qa('.view.active').length === 1;
    });
    check('загрузка использует общую нормализацию и сохраняет активный путь', function () {
      state.activePath = [1, 2]; state.nextNodeId = 1; saveState();
      var loaded = loadState();
      return loaded.nextNodeId === 3 && loaded.activePath.join(',') === '1,2' && loaded.currentView === 'tree';
    });
    state.nextNodeId = 3; saveState();
    beforeImport = state; beforeRaw = localStorage.getItem(STORAGE_KEY);
    var realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
    check('ошибка сохранения возвращает false и показывает плашку', function () {
      return saveState() === false && !q('#storageBanner').classList.contains('hidden');
    });
    check('при отказе хранилища импорт откатывается', function () {
      var d = importFixture(); d.movements[0].name = 'Не сохранять';
      return !applyImportedJson(JSON.stringify(d)) && state === beforeImport
        && localStorage.getItem(STORAGE_KEY) === beforeRaw && !q('#storageBanner').classList.contains('hidden');
    });
    Storage.prototype.setItem = realSetItem;
    check('успешная повторная запись убирает плашку', function () {
      return saveState() === true && q('#storageBanner').classList.contains('hidden');
    });
    var realRender = render;
    var renderCount = 0;
    render = function () { if (++renderCount === 1) throw new Error('render failed'); realRender(); };
    check('ошибка отрисовки импорта не затирает сохранённый JSON', function () {
      return !applyImportedJson(JSON.stringify(importFixture())) && state === beforeImport
        && localStorage.getItem(STORAGE_KEY) === beforeRaw;
    });
    render = realRender;
    check('генератор очищается после изменения исходных данных', function () {
      resetGeneratedSequences(); genSequences = [[{ movementId: 7, beat: 1, length: 4 }]];
      addMovement('Новое'); return genSequences.length === 0;
    });
    check('смена раздела и раскладки не очищает генератор', function () {
      resetGeneratedSequences(); genSequences = [[{ movementId: 7, beat: 1, length: 4 }]];
      setView('generator'); state.treePins.nodes[1] = { dx: 60, dy: 40 }; render();
      return genSequences.length === 1;
    });
    check('добавление устаревшей связки не создаёт битые узлы', function () {
      genSequences = [[{ movementId: 999, beat: 1, length: 4 }]];
      var count = Object.keys(state.nodes).length; expandSequenceToTree(0);
      return Object.keys(state.nodes).length === count && genSequences.length === 0;
    });
    check('корректная связка на 32 счёта добавляется в дерево', function () {
      resetGeneratedSequences();
      genSequences = [Array.from({ length: 8 }, function (_, i) { return { movementId: 7, beat: i * 4 + 1, length: 4 }; })];
      var count = Object.keys(state.nodes).length; expandSequenceToTree(0);
      return Object.keys(state.nodes).length === count + 8 && genSequences.length === 0;
    });

    // --- Сетевой импорт: реальный код, детерминированные ответы сервера ---
    var driveUrl = 'https://drive.google.com/file/d/test-file/view?usp=drive_link&resourcekey=key';
    check('ссылка Drive преобразуется в CORS-адрес с resourcekey', function () {
      var u = new URL(normalizeImportUrl(driveUrl));
      return u.origin === 'https://drive.usercontent.google.com' && u.pathname === '/download'
        && u.searchParams.get('id') === 'test-file' && u.searchParams.get('resourcekey') === 'key';
    });
    check('Drive /uc и /open поддерживаются', function () {
      return ['/uc?id=test-file', '/open?id=test-file'].every(function (path) {
        return new URL(normalizeImportUrl('https://drive.google.com' + path)).searchParams.get('id') === 'test-file';
      });
    });
    check('опасные протоколы и неверные URL отклоняются', function () {
      return ['javascript:alert(1)', 'file:///test.json', 'bad url', 'https://user:password@example.com/a.json'].every(function (url) {
        try { normalizeImportUrl(url); return false; } catch (e) { return true; }
      });
    });
    var realFetch = window.fetch;
    function response(text, status, type) {
      return { ok: status === 200, status: status, headers: new Headers({ 'content-type': type || 'application/json' }),
        text: async function () { return text; } };
    }
    function prepareUrlImport(url) { openImportModal(); showImportUrlStep(); q('#importUrlInput').value = url || driveUrl; }
    var fetchUrl, fetchOptions;
    window.fetch = async function (url, opts) { fetchUrl = url; fetchOptions = opts; return response(JSON.stringify(importFixture()), 200); };
    prepareUrlImport();
    var urlSuccess = await importFromUrl();
    check('импорт Drive применяет JSON и закрывает окно', function () {
      return urlSuccess && !q('#importModal').classList.contains('open') && state.movements[0].id === 7
        && fetchOptions.credentials === 'omit' && fetchUrl.indexOf('drive.usercontent.google.com/download') > 0;
    });
    beforeImport = state; beforeRaw = localStorage.getItem(STORAGE_KEY);
    window.fetch = async function () { return response('<html>Sign in</html>', 200, 'text/html'); };
    prepareUrlImport(); await importFromUrl();
    check('HTML вместо JSON показывает объяснение и запасной путь', function () {
      return state === beforeImport && q('#importUrlError').textContent.includes('вместо JSON')
        && !q('#importUrlFallback').classList.contains('hidden') && !q('#btnImportFetch').disabled;
    });
    window.fetch = async function () { return response('', 403); };
    prepareUrlImport(); await importFromUrl();
    check('HTTP 403 не заменяет данные', function () {
      return state === beforeImport && q('#importUrlError').textContent.includes('403') && localStorage.getItem(STORAGE_KEY) === beforeRaw;
    });
    window.fetch = async function () { throw new TypeError('Failed to fetch'); };
    prepareUrlImport(); await importFromUrl();
    check('сетевая ошибка предлагает скачивание и выбор файла', function () {
      return q('#importUrlError').textContent.includes('Google Диск') && !q('#importUrlFallback').classList.contains('hidden')
        && q('#importDownloadLink').href.includes('drive.usercontent.google.com');
    });
    prepareUrlImport('https://example.com/data.json'); await importFromUrl();
    check('ошибка другого сервера не приписывается Google Диску', function () {
      return q('#importUrlError').textContent.includes('сеть недоступна') && !q('#importUrlError').textContent.includes('Google Диск');
    });
    var resolveFetch, requests = 0;
    window.fetch = function () { requests++; return new Promise(function (resolve) { resolveFetch = resolve; }); };
    prepareUrlImport(); var pendingImport = importFromUrl();
    var duplicate = await importFromUrl();
    check('повторный клик не запускает второй запрос', function () { return requests === 1 && duplicate === false && q('#btnImportFetch').disabled; });
    showImportOptionsStep();
    resolveFetch(response(JSON.stringify({ movements: [], nodes: {}, roots: [] }), 200));
    await pendingImport;
    check('ответ после отмены не применяется', function () { return state === beforeImport && !q('#btnImportFetch').disabled; });
    window.fetch = function (url, opts) { return new Promise(function (_, reject) {
      opts.signal.addEventListener('abort', function () { reject(new DOMException('aborted', 'AbortError')); });
    }); };
    var realSetTimeout = window.setTimeout;
    window.setTimeout = function (fn, ms) { return realSetTimeout(fn, ms === IMPORT_URL_TIMEOUT ? 0 : ms); };
    prepareUrlImport(); await importFromUrl();
    window.setTimeout = realSetTimeout;
    check('тайм-аут снимает блокировку и сохраняет данные', function () {
      return state === beforeImport && q('#importUrlError').textContent.includes('слишком много времени') && !q('#btnImportFetch').disabled;
    });
    window.fetch = realFetch;
    closeImportModal();
    openImportModal();
    var appliedByReader = await new Promise(function (resolve) {
      var originalApply = applyImportedJson;
      applyImportedJson = function (text) {
        applyImportedJson = originalApply;
        var applied = originalApply(text); resolve(applied); return applied;
      };
      importJson({ target: { files: [new File([JSON.stringify(importFixture())], 'download.json', { type: 'application/json' })], value: 'file' } });
    });
    check('локальный файл читается через FileReader и закрывает окно после успеха', function () {
      return appliedByReader && !q('#importModal').classList.contains('open') && state.movements[0].id === 7;
    });
    // Изменение длительности и сетка счётов с независимыми закреплениями.
    var savedTreeState = state;
    state = initialState();
    state.movements = [{ id: 1, name: 'Движение', lead: '', follow: '' }];
    state.nodes = {
      1: { id: 1, movementId: 1, parentId: null, beat: 1, length: 4, prepId: null },
      2: { id: 2, movementId: 1, parentId: 1, beat: 5, length: 4, prepId: null },
      3: { id: 3, movementId: 1, parentId: null, beat: 1, length: 2, prepId: null },
      4: { id: 4, movementId: 1, parentId: 3, beat: 3, length: 2, prepId: null },
      5: { id: 5, movementId: 1, parentId: 4, beat: 5, length: 2, prepId: null },
      6: { id: 6, movementId: 1, parentId: 5, beat: 7, length: 2, prepId: null }
    };
    state.roots = [1, 3]; state.nodeOrder = [1, 2, 3, 4, 5, 6]; state.activePath = [1, 2];
    state.treeViewMode = 'all';
    render();
    check('одинаковый счёт выровнен при разном числе движений в ветках', function () {
      return lastFullLayout.byId.get(2).x === lastFullLayout.byId.get(5).x;
    });
    check('компактная сетка не добавляет пустую колонку на четыре счёта', function () {
      var compact = fullTreeBeatColumns();
      return compact.get(4) - compact.get(3) === CARD_W + LEVEL_H_GAP
        && compact.get(2) - compact.get(1) === 2 * (CARD_W + LEVEL_H_GAP);
    });
    check('линейка содержит квадраты, восьмёрки, такты и счёты', function () {
      return !!q('.ruler-square') && !!q('.ruler-eighth') && !!q('.ruler-bar') && !!q('.ruler-beat')
        && !!q('.ruler-guide.square');
    });
    var columnState = state;
    var gridState = JSON.parse(JSON.stringify(state));
    gridState.roots = [1]; gridState.nodes = { 1: gridState.nodes[1], 2: gridState.nodes[2] };
    gridState.nodeOrder = [1, 2];
    state = gridState;
    check('ветка из четырёхсчётных движений не резервирует колонки отсутствующих узлов', function () {
      var compact = fullTreeBeatColumns();
      return compact.get(2) - compact.get(1) === CARD_W + LEVEL_H_GAP;
    });
    state = columnState;
    render();
    check('кнопка длительности открывает выбор 4 и 2 счётов', function () {
      q('.node-card.active button[title="Изменить длительность движения"]').click();
      var ok = libraryPickerState.items.length === 2;
      closeLibraryPicker(); return ok;
    });
    state.preps = [{ id: 1, name: 'Преп', lead: '', follow: '' }];
    state.nodes[2].prepId = 1;
    render();
    check('развёрнутый преп сохраняет общую колонку одинаковых счётов', function () {
      return lastFullLayout.byId.get(2).x === lastFullLayout.byId.get(5).x;
    });
    state.collapsedPrepLinks = ['1:1']; render();
    var markedX = lastFullLayout.byId.get(2).x;
    state.nodes[2].prepId = null; render();
    check('свёрнутый преп не удлиняет связь относительно связи без препа', function () {
      return lastFullLayout.byId.get(2).x === markedX;
    });
    state.nodes[2].prepId = 1;
    var confirmations = 0;
    window.confirm = function () { confirmations++; return false; };
    setNodePrep(2, null);
    check('отмена снятия препа с одной связи сохраняет преп', function () {
      return confirmations === 1 && state.nodes[2].prepId === 1;
    });
    removePrepFromLink(1, 1);
    check('снятие препа с группы из одной связи тоже требует подтверждения', function () {
      return confirmations === 2 && state.nodes[2].prepId === 1;
    });
    window.confirm = function () { return true; };
    setNodePrep(2, null);
    check('подтверждение снимает преп со связи, сохраняя библиотеку', function () {
      return state.nodes[2].prepId === null && state.preps.length === 1;
    });
    state.treePins.nodes[4] = { dx: 700, dy: 100 };
    render();
    var pinnedX = lastFullLayout.byId.get(4).x, descendantX = lastFullLayout.byId.get(5).x;
    check('закреплённая ветка имеет свою точку отсчёта', function () {
      return pinnedX === lastFullLayout.byId.get(3).x + 700
        && descendantX === pinnedX + CARD_W + LEVEL_H_GAP
        && descendantX !== lastFullLayout.byId.get(2).x;
    });
    state.nodes[2].prepId = 1; state.collapsedPrepLinks = []; render();
    check('расширение общей сетки не сдвигает закреплённую ветку', function () {
      return lastFullLayout.byId.get(4).x === pinnedX && lastFullLayout.byId.get(5).x === descendantX;
    });
    state.treePins.nodes[5] = { dx: 900, dy: 60 }; render();
    check('вложенное закрепление начинает ещё одну независимую сетку', function () {
      return lastFullLayout.byId.get(5).x === pinnedX + 900
        && lastFullLayout.byId.get(6).x === pinnedX + 900 + CARD_W + LEVEL_H_GAP;
    });
    state.treePins.nodes = {};
    check('увеличение длительности сдвигает всю последующую ветку', function () {
      return changeNodeLength(3, 4) && state.nodes[4].beat === 5 && state.nodes[5].beat === 7 && state.nodes[6].beat === 9;
    });
    check('уменьшение длительности возвращает счёты продолжений', function () {
      return changeNodeLength(3, 2) && state.nodes[4].beat === 3 && state.nodes[6].beat === 7;
    });
    state.nodes[5].length = 4; delete state.nodes[6]; state.nodeOrder.pop();
    var invalidBefore = JSON.stringify(state), lengthAlert = window.alert, alerted = false;
    window.alert = function () { alerted = true; };
    check('недопустимый сдвиг продолжения отклоняется без частичных изменений', function () {
      return !changeNodeLength(3, 4) && alerted && JSON.stringify(state) === invalidBefore;
    });
    window.alert = lengthAlert;
    state.nodes[5].length = 2;
    state.comboDescriptions = {};
    var lengthCombo = collectCombos().find(function (c) { return c.some(function (n) { return n.id === 3; }); });
    state.comboDescriptions[comboVideoKey(lengthCombo)] = 'Описание';
    invalidBefore = JSON.stringify(state);
    window.confirm = function () { return false; };
    check('отмена изменения счётов сохраняет связанные описания', function () {
      return !changeNodeLength(3, 4) && JSON.stringify(state) === invalidBefore;
    });
    window.confirm = function () { return true; };
    state = initialState();
    state.movements = [{ id: 1, name: 'Альфа' }, { id: 2, name: 'Бета' }, { id: 3, name: 'Гамма' }];
    state.preps = [{ id: 1, name: 'Первый переход' }, { id: 2, name: 'Второй переход' }];
    var searchRows = [[1,1,null,1,0],[2,2,1,5,1],[3,1,2,9,2],[4,2,1,5,1],
      [5,3,4,9,2],[6,1,null,1,0],[7,2,6,5,2],[8,3,7,9,0]];
    searchRows.forEach(function (r) {
      state.nodes[r[0]] = { id: r[0], movementId: r[1], parentId: r[2], beat: r[3], length: 4, prepId: r[4] || null };
    });
    state.roots = [1,6]; state.nodeOrder = searchRows.map(function (r) { return r[0]; }); state.activePath = [1];
    render();
    q('#movementLibrarySearch').value = 'ЛЬФ'; q('#movementLibrarySearch').dispatchEvent(new Event('input'));
    check('библиотека движений ищет по части названия без учёта регистра', function () {
      return qa('#movList li[data-movement-id]').length === 1 && q('#movList li').dataset.movementId === '1'
        && q('#libCount').textContent === '(1 из 3)';
    });
    q('#movementLibrarySearch').value = 'совпадений нет'; q('#movementLibrarySearch').dispatchEvent(new Event('input'));
    check('поиск без совпадений показывает сообщение, сохраняя библиотеку', function () {
      return !!q('#movList .empty-hint') && state.movements.length === 3;
    });
    q('#btnClearMovementSearch').click();
    check('сброс поиска возвращает все движения', function () {
      return qa('#movList li[data-movement-id]').length === 3 && q('#movementLibrarySearch').value === '';
    });
    q('#prepLibrarySearch').value = 'ПЕРВ пер'; q('#prepLibrarySearch').dispatchEvent(new Event('input'));
    check('библиотека препов ищет по частям нескольких слов', function () {
      return qa('#prepList .name').length === 1 && q('#prepList .name').textContent === 'Первый переход'
        && q('#prepCount').textContent === '(1 из 2)';
    });
    q('#prepLibrarySearch').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    check('Escape сбрасывает поиск препов', function () {
      return q('#prepLibrarySearch').value === '' && qa('#prepList .name').length === 2;
    });
    var moveA = { kind: 'movement', id: 1 }, moveB = { kind: 'movement', id: 2 }, moveC = { kind: 'movement', id: 3 };
    var prepOne = { kind: 'prep', id: 1 }, prepTwo = { kind: 'prep', id: 2 };
    check('поиск движения находит все его узлы', function () {
      var matches = findTreeSearchMatches([moveA]);
      return matches.nodes.size === 3 && matches.starts.length === 3 && !matches.links.size;
    });
    check('поиск последовательности не захватывает частичные совпадения в другой ветке', function () {
      var matches = findTreeSearchMatches([moveA,moveB,moveC]);
      return matches.starts.length === 2 && matches.nodes.size === 6 && !matches.nodes.has(2) && !matches.nodes.has(3);
    });
    check('поиск соблюдает порядок и соседство движений', function () {
      return !findTreeSearchMatches([moveA,moveC]).starts.length && !findTreeSearchMatches([moveC,moveB]).starts.length;
    });
    check('преп в последовательности ограничивает конкретный переход', function () {
      var matches = findTreeSearchMatches([moveA,prepOne,moveB]);
      return matches.starts.length === 1 && matches.nodes.size === 3 && !matches.nodes.has(7)
        && matches.preps.has('1:1') && matches.links.has('c:2') && matches.links.has('c:4');
    });
    check('одиночный преп находит все линии, а не только одну общую метку', function () {
      var matches = findTreeSearchMatches([prepOne]);
      return matches.starts.length === 2 && matches.preps.size === 1 && !matches.nodes.size;
    });
    check('последовательность препов проверяет соседние переходы', function () {
      return findTreeSearchMatches([prepOne,prepTwo]).starts.length === 2
        && !findTreeSearchMatches([prepTwo,prepOne]).starts.length;
    });
    state.merges = [{ from: 3, to: 2 }];
    check('поиск учитывает merge, перекрывающиеся совпадения и завершается при цикле', function () {
      var matches = findTreeSearchMatches([moveA,moveB,moveA,moveB]);
      return matches.starts.length === 2 && matches.links.has('m:3:2');
    });
    check('merge-переход не получает входящий преп целевого узла', function () {
      return findTreeSearchMatches([moveA,prepOne,moveB]).starts.length === 1;
    });
    state.merges = []; state.collapsedNodes = [1,6];
    runTreeSearch([moveA,moveB]);
    check('поиск раскрывает скрытые совпадения и показывает все ветви', function () {
      return state.currentView === 'tree' && state.treeViewMode === 'all' && !state.collapsedNodes.length
        && qa('#nodesLayer .search-match[data-node-id]').length === 5;
    });
    check('совпадения подсвечивают связи и показывают количество мест', function () {
      return qa('.search-link').length > 0 && !q('#treeSearchBar').hidden && q('#treeSearchCount').textContent.includes('Мест: 2');
    });
    focusTreeSearchResult(1);
    check('стрелка переводит к следующему месту совпадения', function () {
      return state.activePath[state.activePath.length - 1] === 6 && treeSearchIndex === 1;
    });
    setView('library');
    q('#movList button.count').click();
    check('клик по счётчику библиотеки движений открывает дерево с подсветкой', function () {
      return state.currentView === 'tree' && treeSearchQuery.length === 1 && treeSearchQuery[0].kind === 'movement'
        && qa('#nodesLayer .search-match[data-node-id]').length === 3;
    });
    setView('preps');
    q('#prepList button.count').click();
    check('клик по счётчику препа подсвечивает свёрнутую метку', function () {
      return state.currentView === 'tree' && treeSearchQuery[0].kind === 'prep'
        && qa('#nodesLayer .prep-mark.search-match').length === 1;
    });
    openTreeSearch(); addTreeSearchStep('movement');
    libraryPickerState.onPick(2); closeLibraryPicker();
    check('окно поиска позволяет собрать смешанную последовательность', function () {
      return treeSearchDraft.length === 2 && treeSearchDraft[1].id === 2 && !q('#btnRunTreeSearch').disabled;
    });
    closeTreeSearch();
    runTreeSearch([{ kind: 'movement', id: 999 }]);
    check('несуществующее движение показывает отсутствие совпадений', function () {
      return q('#treeSearchCount').textContent === 'Совпадений нет' && q('#btnSearchNext').disabled;
    });
    clearTreeSearch();
    check('снятие подсветки очищает карточки, метки и связи', function () {
      return q('#treeSearchBar').hidden && !qa('.search-match, .search-link').length;
    });
    runTreeSearch([moveA]);
    var searchStorageKey = activeStorageKey;
    activeStorageKey += '-search-test'; render();
    check('смена аккаунта очищает запрос и подсветку', function () {
      return !treeSearchQuery.length && q('#treeSearchBar').hidden;
    });
    activeStorageKey = searchStorageKey;
    state = initialState();
    state.movements = [{ id: 1, name: 'Дубль один', lead: 'Вести', leadSegments: [{ conceptId: 'w1', text: 'Вести' }], follow: 'Первое описание' },
      { id: 2, name: 'Дубль два', lead: 'Вести', follow: 'Второе описание' }, { id: 3, name: 'Отдельное' }];
    state.concepts = [{ id: 'w1', short: 'Вести', names: [], definition: '', media: [] }];
    state.preps = [{ id: 1, name: 'Преп один', lead: 'Раз' }, { id: 2, name: 'Преп два', lead: 'Два' }, { id: 3, name: 'Преп отдельно' }];
    for (var mergeRoot = 0; mergeRoot < 2; mergeRoot++) for (var mergeStep = 0; mergeStep < 8; mergeStep++) {
      var mergeId = mergeRoot * 8 + mergeStep + 1;
      state.nodes[mergeId] = { id: mergeId, movementId: mergeStep ? 3 : mergeRoot + 1,
        parentId: mergeStep ? mergeId - 1 : null, beat: mergeStep * 4 + 1, length: 4,
        prepId: mergeStep === 1 ? mergeRoot + 1 : null };
      state.nodeOrder.push(mergeId);
    }
    state.nodes[17] = { id: 17, movementId: 3, parentId: 1, beat: 5, length: 4, prepId: 2 };
    state.nodeOrder.push(17); state.roots = [1,9]; state.activePath = [1];
    state.treePins.nodes[9] = { dx: 500, dy: 250 };
    state.treePins.preps = { '1:1': { dx: 80, dy: 40 }, '1:2': { dx: 140, dy: 60 } };
    state.treePins.links = { 'p:1:1': { shape: 'curve', hx: 5, hy: 10 }, 'p:1:2': { shape: 'bus', ex: 77 }, 'c:2': { shape: 'curve', hx: 9, hy: 11 } };
    state.prepDefaultsVersion = 1; state.collapsedPrepLinks = ['1:1'];
    state.comboFolders = [{ id: 1, name: 'Папка', parentId: null }];
    var mergeCombo = collectCombos().find(function (c) { return c[0].id === 1; });
    var mergeOldKey = comboVideoKey(mergeCombo);
    state.comboVideos[mergeOldKey] = ['https://example.com/video']; state.comboDescriptions[mergeOldKey] = 'Описание комбинации';
    state.comboDescriptionSegments[mergeOldKey] = [{ text: 'Описание комбинации' }]; state.comboFolderLinks[mergeOldKey] = [1];
    state.currentView = 'library'; render();
    q('#btnMergeMovement').click();
    q('#movList [data-movement-id="1"] input').click();
    check('объединение требует выбрать не менее двух движений', function () { return q('#btnReviewMergeMovement').disabled; });
    q('#movementLibrarySearch').value = 'два'; renderMovements();
    q('#movList [data-movement-id="2"] input').click();
    check('выбор для объединения сохраняется при фильтрации библиотеки', function () {
      return libraryMergeSelection.ids.size === 2 && !q('#btnReviewMergeMovement').disabled;
    });
    q('#btnReviewMergeMovement').click();
    check('подтверждение перечисляет выбранные движения и предлагает их названия', function () {
      return qa('#libraryMergeSources li').length === 2 && q('#libraryMergeName').options.length === 3;
    });
    var mergeBefore = JSON.stringify(state);
    q('#libraryMergeName').value = 'new'; updateLibraryMergeName();
    q('#libraryMergeCustomName').value = 'Отдельное';
    check('объединение не допускает конфликт имени с невыбранной записью', function () {
      return !confirmLibraryMerge() && JSON.stringify(state) === mergeBefore && q('#libraryMergeError').textContent.includes('вне выбранных');
    });
    q('#libraryMergeCustomName').value = '  ';
    check('пустое итоговое название не меняет данные', function () { return !confirmLibraryMerge() && JSON.stringify(state) === mergeBefore; });
    q('#btnBackLibraryMerge').click();
    check('возврат из подтверждения сохраняет выбор без изменения данных', function () {
      return libraryMergeSelection.ids.size === 2 && JSON.stringify(state) === mergeBefore;
    });
    openLibraryMergeReview(); q('#libraryMergeName').value = '2';
    var mergeStateBeforeFailure = state;
    var mergeStorageWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
    check('отказ записи откатывает объединение и сохраняет выбор для повтора', function () {
      return !confirmLibraryMerge() && state === mergeStateBeforeFailure && state.movements.length === 3
        && libraryMergeSelection.ids.size === 2 && q('#libraryMergeModal').classList.contains('open');
    });
    Storage.prototype.setItem = mergeStorageWrite;
    check('движения объединяются с выбранным существующим названием', function () {
      return confirmLibraryMerge() && state.movements.length === 2 && !getMovement(1) && getMovement(2).name === 'Дубль два';
    });
    check('все узлы заменены без удаления веток, счётов и закреплений', function () {
      return state.nodes[1].movementId === 2 && state.nodes[9].movementId === 2 && Object.keys(state.nodes).length === 17
        && state.nodes[8].beat === 29 && state.nodes[8].parentId === 7 && state.treePins.nodes[9].dx === 500;
    });
    check('описания объединяются без дублей с сохранением @-сегментов', function () {
      return getMovement(2).lead === 'Вести' && getMovement(2).leadSegments[0].conceptId === 'w1'
        && getMovement(2).follow.includes('Первое описание') && getMovement(2).follow.includes('Второе описание');
    });
    var mergeNewKey = comboVideoKey(collectCombos().find(function (c) { return c[0].id === 1; }));
    var mergeFirstKey = comboVideoKey(collectCombos().find(function (c) { return c[0].id === 9; }));
    check('видео, описания и папки комбинаций сохраняются после объединения движений', function () {
      return state.comboVideos[mergeNewKey][0] === 'https://example.com/video' && state.comboDescriptions[mergeNewKey] === 'Описание комбинации'
        && state.comboFolderLinks[mergeNewKey][0] === 1 && !!state.comboDescriptionSegments[mergeNewKey]
        && mergeFirstKey.split('|')[0].split(':')[1] === '2' && mergeOldKey !== mergeNewKey && !state.comboVideos[mergeOldKey];
    });
    setView('preps'); startLibraryMerge('prep');
    q('#prepList [data-prep-id="1"] input').click(); q('#prepList [data-prep-id="2"] input').click();
    openLibraryMergeReview(); q('#libraryMergeName').value = '2';
    check('объединение препов заменяет все входящие связи', function () {
      return confirmLibraryMerge() && state.preps.length === 2 && !getPrep(1)
        && state.nodes[2].prepId === 2 && state.nodes[10].prepId === 2 && state.nodes[17].prepId === 2;
    });
    check('объединение групп препа сохраняет закрепления итоговой группы и форму связей детей', function () {
      return state.treePins.preps['1:2'].dx === 140 && !state.treePins.preps['1:1']
        && state.treePins.links['p:1:2'].ex === 77 && state.treePins.links['c:2'].hx === 9
        && !state.collapsedPrepLinks.includes('1:1') && !state.collapsedPrepLinks.includes('1:2');
    });
    check('объединение препов не отвязывает метаданные комбинаций', function () {
      return state.comboVideos[mergeNewKey][0] === 'https://example.com/video' && state.comboFolderLinks[mergeNewKey][0] === 1;
    });
    startLibraryMerge('prep');
    libraryMergeSelection.ids = new Set([2,3]); openLibraryMergeReview();
    q('#libraryMergeName').value = 'new'; updateLibraryMergeName(); q('#libraryMergeCustomName').value = 'Общий преп';
    check('новое название объединённых препов сохраняется', function () {
      return confirmLibraryMerge() && state.preps.length === 1 && state.preps[0].name === 'Общий преп';
    });
    state = savedTreeState; cancelLibraryMerge(); clearTreeSearch(); render();
    await runDriveTests(check);
    if (window.userImportFixture) {
      check('пользовательский файл импортируется целиком', function () {
        return applyImportedJson(JSON.stringify(window.userImportFixture))
          && state.movements.length === window.userImportFixture.movements.length
          && Object.keys(state.nodes).length === Object.keys(window.userImportFixture.nodes).length;
      });
    }
    window.alert = realAlert;
    window.confirm = realConfirm;
    document.title = 'TESTRESULT=' + JSON.stringify(R);
  } catch (e) {
    document.title = 'TESTERROR=' + e.message + '|' + e.stack;
  }
})();
