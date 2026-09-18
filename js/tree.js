function renderRootsBar() {
  const bar = document.getElementById('rootsBar');
  bar.innerHTML = '';
  if (state.roots.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'empty';
    empty.textContent = 'Нет ни одной связки. Нажмите «+ Связка» сверху.';
    bar.appendChild(empty); return;
  }
  const label = document.createElement('span');
  label.className = 'label'; label.textContent = 'Старты:';
  bar.appendChild(label);
  const activeRootId = getActiveRootId();
  state.roots.forEach(rootId => {
    const node = state.nodes[rootId];
    if (!node) return;
    const mov = getMovement(node.movementId);
    const chip = document.createElement('span');
    chip.className = 'root-chip';
    if (rootId === activeRootId) chip.classList.add('active');
    chip.textContent = mov ? mov.name : '???';
    chip.onclick = () => setActiveNode(rootId);
    bar.appendChild(chip);
  });
}

function renderBreadcrumb() {
  const bc = document.getElementById('breadcrumb');
  bc.innerHTML = '';
  if (!state.activePath || state.activePath.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'empty'; empty.textContent = 'Нет активной ветки';
    bc.appendChild(empty); return;
  }
  state.activePath.forEach((nodeId, i) => {
    const node = state.nodes[nodeId];
    if (!node) return;
    const mov = getMovement(node.movementId);
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'sep'; sep.textContent = '›';
      bc.appendChild(sep);
    }
    const crumb = document.createElement('span');
    crumb.className = 'crumb';
    if (i === state.activePath.length - 1) crumb.classList.add('current');
    crumb.textContent = mov ? mov.name : '???';
    crumb.title = formatBeatNode(node.beat, node.length);
    crumb.onclick = () => setActiveNode(nodeId);
    bc.appendChild(crumb);
  });
}

function renderTree() {
  const inner = document.getElementById('treeInner');
  const nodesLayer = document.getElementById('nodesLayer');
  const svg = document.getElementById('linesSvg');
  const wrap = document.getElementById('treeWrap');
  const scrollLeft = wrap.scrollLeft;
  const scrollTop = wrap.scrollTop;

  nodesLayer.innerHTML = '';
  svg.innerHTML = '';

  if (state.treeViewMode === 'all') {
    renderFullTree(inner, nodesLayer, svg, wrap);
    wrap.scrollLeft = scrollLeft;
    wrap.scrollTop = scrollTop;
    if (openFormState) {
      if (!document.getElementById('formLayer').innerHTML.trim()) {
        buildForm(); showForm();
      } else positionForm();
    }
    return;
  }

  const activePath = (state.activePath || []).filter(id => state.nodes[id]);
  if (activePath.length === 0) {
    inner.style.width = '100%';
    inner.style.height = '100%';
    svg.setAttribute('width', 0);
    svg.setAttribute('height', 0);
    nodesLayer.innerHTML = '<div class="tree-empty-hint">Нет активной ветки. Добавьте связку или выберите узел.</div>';
    return;
  }

  // ===== Первый проход: предварительные позиции, чтобы отрисовать
  // карточки и замерить реальную высоту активной. Она может быть больше
  // CARD_H (бейдж «квадрат», кнопки) — с ней пересчитаем стек братьев,
  // чтобы активный не перекрывал неактивных.
  const first = computeLayout();
  const cardEls = first.cards.map(renderSpineCard);
  const miniEls = first.minis.map(renderMiniCard);
  nodesLayer.style.visibility = 'hidden'; // скрыть до финального позиционирования
  cardEls.forEach(el => nodesLayer.appendChild(el));
  miniEls.forEach(el => nodesLayer.appendChild(el));

  let activeH = CARD_H;
  const activeEl = nodesLayer.querySelector('.node-card.active');
  if (activeEl && activeEl.offsetHeight > 0) activeH = activeEl.offsetHeight;

  const cardHeights = new Map(cardEls.map((el, i) => [first.cards[i].node.id, el.offsetHeight || CARD_H]));
  const miniHeights = new Map(miniEls.map((el, i) => [first.minis[i].node.id, el.offsetHeight || MINI_H]));
  const layout = computeLayout({
    activeCardH: activeH,
    heightFor: id => cardHeights.get(id) || CARD_H,
    miniHFor: id => miniHeights.get(id) || MINI_H
  });
  const { cards, minis, width, height } = layout;
  const w = Math.max(width, 300);
  const h = Math.max(height, 300);

  cardEls.forEach((el, i) => {
    const c = cards[i];
    el.style.left = c.x + 'px';
    el.style.top = c.y + 'px';
  });
  miniEls.forEach((el, i) => {
    const m = minis[i];
    el.style.left = m.x + 'px';
    el.style.top = m.y + 'px';
  });

  inner.style.width = w + 'px';
  inner.style.height = h + 'px';
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.style.width = w + 'px';
  svg.style.height = h + 'px';
  nodesLayer.style.visibility = '';

  // ===== Merge selection mode =====
  if (mergeSelectFrom) {
    const targets = findMergeTargets(mergeSelectFrom);
    const targetSet = new Set(targets);
    nodesLayer.querySelectorAll('.node-card').forEach(el => {
      const nid = parseInt(el.dataset.nodeId, 10);
      if (targetSet.has(nid)) {
        el.classList.add('merge-target');
        el.onclick = (e) => {
          e.stopPropagation();
          addMerge(mergeSelectFrom, nid);
          mergeSelectFrom = null;
          renderTree();
        };
      }
    });
    const sourceEl = nodesLayer.querySelector(`[data-node-id="${mergeSelectFrom}"]`);
    if (sourceEl) sourceEl.classList.add('merge-source');
    const cancelHandler = (e) => {
      if (!e.target.closest('.node-card') && !e.target.closest('.icon-btn')) {
        mergeSelectFrom = null;
        renderTree();
        document.removeEventListener('click', cancelHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', cancelHandler), 0);
  }

  // ===== Соединительные линии =====

  // 1) Хребет: горизонтальные связи между крупными карточками (кроме активного)
  const spineCards = cards.filter(c => !c.isActive);
  for (let i = 1; i < spineCards.length; i++) {
    const prev = spineCards[i - 1];
    const cur = spineCards[i];
    const x1 = prev.x + prev.w;
    const y1 = prev.y + prev.h / 2;
    const x2 = cur.x;
    const y2 = cur.y + cur.h / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#3498db');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
  }

  const activeCard = cards.find(c => c.isActive);
  const lastSpine = spineCards[spineCards.length - 1];
  const siblingMinis = minis.filter(m => m.kind === 'sibling');

  // 2) Линия пути: от правого края родителя вправо на общую шину,
  //    затем по шине вниз/вверх и в ЛЕВЫЙ край активного.
  // 3) Общая шина (серая, пунктир) — в зазоре между родителем и стеком,
  //    с отводами к братьям активного. Шина в зазоре, поэтому отводы не
  //    пересекают карточку родителя даже для братьев выше активного.
  if (lastSpine && activeCard) {
    const parentRight = lastSpine.x + lastSpine.w;
    const parentMidY = lastSpine.y + lastSpine.h / 2;
    const trunkX = parentRight + H_GAP_MINI / 2;
    const activeLeft = activeCard.x;
    const activeMidY = activeCard.y + activeCard.h / 2;

    const centers = siblingMinis.map(m => m.y + m.h / 2).concat(activeMidY);
    const trunkTopY = Math.min(...centers);
    const trunkBottomY = Math.max(...centers);

    const trunk = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trunk.setAttribute('d', `M ${trunkX} ${trunkTopY} L ${trunkX} ${trunkBottomY}`);
    trunk.setAttribute('fill', 'none');
    trunk.setAttribute('stroke', '#b8c4cf');
    trunk.setAttribute('stroke-width', '1.2');
    trunk.setAttribute('stroke-dasharray', '3 3');
    svg.appendChild(trunk);

    siblingMinis.forEach(m => {
      const y = m.y + m.h / 2;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', `M ${trunkX} ${y} L ${m.x} ${y}`);
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', '#b8c4cf');
      line.setAttribute('stroke-width', '1.2');
      line.setAttribute('stroke-dasharray', '3 3');
      svg.appendChild(line);
    });

    const d = `M ${parentRight} ${parentMidY} L ${trunkX} ${parentMidY} L ${trunkX} ${activeMidY} L ${activeLeft} ${activeMidY}`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#3498db');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
  }

  // 4) Линии продолжений активного — вертикальная шина + отводы
  const childMinis = minis.filter(m => m.kind === 'child');
  if (childMinis.length > 0 && activeCard) {
    const busX = activeCard.x + activeCard.w + BUS_OFFSET;
    const yStart = activeCard.y + activeCard.h / 2;
    const bus = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    bus.setAttribute('d', `M ${activeCard.x + activeCard.w} ${yStart} L ${busX} ${yStart}`);
    bus.setAttribute('fill', 'none');
    bus.setAttribute('stroke', '#7fbf7f');
    bus.setAttribute('stroke-width', '1.8');
    svg.appendChild(bus);

    const yTop = childMinis[0].y + childMinis[0].h / 2;
    const yBottom = childMinis[childMinis.length - 1].y + childMinis[childMinis.length - 1].h / 2;
    const vBus = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const vTop = Math.min(yTop, yStart);
    const vBot = Math.max(yBottom, yStart);
    vBus.setAttribute('d', `M ${busX} ${vTop} L ${busX} ${vBot}`);
    vBus.setAttribute('fill', 'none');
    vBus.setAttribute('stroke', '#7fbf7f');
    vBus.setAttribute('stroke-width', '1.8');
    svg.appendChild(vBus);

    childMinis.forEach(m => {
      const y = m.y + m.h / 2;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', `M ${busX} ${y} L ${m.x} ${y}`);
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', '#7fbf7f');
      line.setAttribute('stroke-width', '1.5');
      svg.appendChild(line);
    });
  }

  // ===== Merge lines =====
  const allCardEls = nodesLayer.querySelectorAll('.node-card');
  const posMap = new Map();
  cards.forEach(c => posMap.set(c.node.id, c));
  minis.forEach(m => posMap.set(m.node.id, m));

  state.merges.forEach(m => {
    const fromPos = posMap.get(m.from);
    const toPos = posMap.get(m.to);
    if (!fromPos || !toPos) return;
    const x1 = fromPos.x + fromPos.w;
    const y1 = fromPos.y + fromPos.h / 2;
    const x2 = toPos.x;
    const y2 = toPos.y + toPos.h / 2;
    const dx = Math.abs(x2 - x1) * 0.5;
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#9b59b6');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-dasharray', '6 3');
    svg.appendChild(path);
  });

  wrap.scrollLeft = scrollLeft;
  wrap.scrollTop = scrollTop;

  if (openFormState) {
    if (!document.getElementById('formLayer').innerHTML.trim()) {
      buildForm(); showForm();
    } else positionForm();
  }
}

function renderSpineCard(c) {
  const node = c.node;
  const el = document.createElement('div');
  el.className = 'node-card on-path';
  el.dataset.nodeId = node.id;
  if (node.parentId === null) el.classList.add('root-node');
  if (isSquareEnd(node.beat, node.length)) el.classList.add('square-end');
  if (c.isActive) el.classList.add('active');
  if (state.merges.some(m => m.from === node.id)) el.classList.add('merge-source');
  if (state.merges.some(m => m.to === node.id)) el.classList.add('has-merge-in');
  el.style.left = c.x + 'px';
  el.style.top = c.y + 'px';

  el.onclick = (e) => {
    if (e.target.closest('.card-actions')) return;
    setActiveNode(node.id);
  };

  if (c.isActive) {
    const dot = document.createElement('div');
    dot.className = 'active-dot';
    el.appendChild(dot);
  }

  const movName = document.createElement('span');
  movName.className = 'mov-name';
  const mov = getMovement(node.movementId);
  movName.textContent = mov ? mov.name : '???';
  movName.title = mov ? mov.name : '';

  const badge = document.createElement('span');
  badge.className = 'beat-badge';
  if (isSquareEnd(node.beat, node.length)) badge.classList.add('square');
  badge.textContent = formatBeatNode(node.beat, node.length);
  if (isSquareEnd(node.beat, node.length)) {
    const sq = document.createElement('small');
    sq.textContent = '✓ квадрат';
    badge.appendChild(sq);
  }

  el.append(movName, badge);

  if (c.isActive) {
    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const replaceBtn = document.createElement('button');
    replaceBtn.className = 'icon-btn'; replaceBtn.title = 'Заменить'; replaceBtn.textContent = '⇄';
    replaceBtn.onclick = (e) => { e.stopPropagation(); replaceMovement(node.id); };

    const addBtn = document.createElement('button');
    addBtn.className = 'icon-btn'; addBtn.title = 'Продолжить'; addBtn.textContent = '+';
    const nextBeat = node.beat + node.length;
    if (allowedLengths(nextBeat).length === 0) {
      addBtn.disabled = true; addBtn.title = 'Нельзя начать';
    } else {
      addBtn.onclick = (e) => {
        e.stopPropagation();
        openForm({ parentId: node.id, isRoot: false, beat: nextBeat });
      };
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger'; delBtn.title = 'Удалить'; delBtn.textContent = '✕';
    delBtn.onclick = (e) => { e.stopPropagation(); deleteNode(node.id); };

    const existingMerge = state.merges.find(m => m.from === node.id);
    const mergeBtn = document.createElement('button');
    mergeBtn.className = 'icon-btn' + (existingMerge ? ' merge-active' : '');
    mergeBtn.title = existingMerge ? 'Отменить подключение' : 'Подключиться';
    mergeBtn.textContent = '↩';
    if (existingMerge) {
      mergeBtn.onclick = (e) => { e.stopPropagation(); removeMerge(node.id); };
    } else {
      const nextB = node.beat + node.length;
      const targets = nextB <= 32 ? findMergeTargets(node.id) : [];
      if (targets.length === 0) {
        mergeBtn.disabled = true; mergeBtn.title = 'Нет подходящих узлов';
      } else {
        mergeBtn.onclick = (e) => {
          e.stopPropagation();
          mergeSelectFrom = node.id;
          renderTree();
        };
      }
    }

    actions.append(replaceBtn, addBtn, mergeBtn, delBtn);
    el.appendChild(actions);
  }

  return el;
}

function renderMiniCard(m) {
  const node = m.node;
  const mov = getMovement(node.movementId);

  const el = document.createElement('div');
  el.className = 'mini-card ' + (m.kind === 'sibling' ? 'sibling' : 'child');
  el.dataset.nodeId = m.node.id;
  el.style.left = m.x + 'px';
  el.style.top = m.y + 'px';

  const name = document.createElement('span');
  name.className = 'mini-name';
  name.textContent = mov ? mov.name : '???';

  const beat = document.createElement('span');
  beat.className = 'mini-beat';
  beat.textContent = formatBeatNode(node.beat, node.length);

  el.append(name, beat);

  if (m.childCount > 0) {
    const plus = document.createElement('span');
    plus.className = 'mini-plus';
    plus.textContent = '+' + m.childCount;
    plus.title = `Ещё ${m.childCount} вложенных`;
    el.appendChild(plus);
  }

  el.title = `Переключиться на "${mov ? mov.name : '???'}" (${formatBeat(node.beat, node.length)})`;
  el.onclick = () => setActiveNode(node.id);
  return el;
}

/* =========================================================
   RENDER FULL TREE — отображение всех узлов всех корней.
   ========================================================= */
function renderFullTree(inner, nodesLayer, svg, wrap) {
  if (state.roots.length === 0) {
    inner.style.width = '100%';
    inner.style.height = '100%';
    svg.setAttribute('width', 0);
    svg.setAttribute('height', 0);
    nodesLayer.innerHTML = '<div class="tree-empty-hint">Нет ни одной связки. Добавьте связку или выберите узел.</div>';
    return;
  }

  const first = computeFullTreeLayout();
  const cardEls = first.cards.map(c => renderFullTreeNode(c));
  nodesLayer.style.visibility = 'hidden';
  cardEls.forEach(el => nodesLayer.appendChild(el));

  const cardHeights = new Map(cardEls.map((el, i) => [first.cards[i].node.id, el.offsetHeight || MINI_H]));
  const layout = computeFullTreeLayout({
    heightFor: id => cardHeights.get(id) || CARD_H,
    miniHFor: id => cardHeights.get(id) || MINI_H
  });
  const { cards, width, height } = layout;
  const w = Math.max(width, 300);
  const h = Math.max(height, 300);

  cardEls.forEach((el, i) => {
    const c = cards[i];
    el.style.left = c.x + 'px';
    el.style.top = c.y + 'px';
  });

  inner.style.width = w + 'px';
  inner.style.height = h + 'px';
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.style.width = w + 'px';
  svg.style.height = h + 'px';
  nodesLayer.style.visibility = '';

  // Merge selection mode in full tree
  if (mergeSelectFrom) {
    const targets = findMergeTargets(mergeSelectFrom);
    const targetSet = new Set(targets);
    nodesLayer.querySelectorAll('.node-card').forEach(el => {
      const nid = parseInt(el.dataset.nodeId, 10);
      if (targetSet.has(nid)) {
        el.classList.add('merge-target');
        el.onclick = (e) => {
          e.stopPropagation();
          addMerge(mergeSelectFrom, nid);
          mergeSelectFrom = null;
          renderTree();
        };
      }
    });
    const sourceEl = nodesLayer.querySelector(`[data-node-id="${mergeSelectFrom}"]`);
    if (sourceEl) sourceEl.classList.add('merge-source');
    const cancelHandler = (e) => {
      if (!e.target.closest('.node-card') && !e.target.closest('.icon-btn')) {
        mergeSelectFrom = null;
        renderTree();
        document.removeEventListener('click', cancelHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', cancelHandler), 0);
  }

  // Карта позиций для рисования линий
  const posMap = new Map();
  cards.forEach(c => posMap.set(c.node.id, c));

  // Рисуем линии от родителя к каждому ребёнку
  cards.forEach(c => {
    const children = getChildrenSorted(c.node.id);
    if (children.length === 0) return;

    const parentRight = c.x + c.w;
    const parentMidY = c.y + c.h / 2;
    const busX = parentRight + BUS_OFFSET;

    // Горизонтальный отвод от родителя к шине
    const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hLine.setAttribute('d', `M ${parentRight} ${parentMidY} L ${busX} ${parentMidY}`);
    hLine.setAttribute('fill', 'none');
    hLine.setAttribute('stroke', '#3498db');
    hLine.setAttribute('stroke-width', '2');
    svg.appendChild(hLine);

    // Вертикальная шина
    const childCenters = children.map(ch => {
      const cp = posMap.get(ch.id);
      return cp ? cp.y + cp.h / 2 : parentMidY;
    });
    const busTop = Math.min(parentMidY, ...childCenters);
    const busBot = Math.max(parentMidY, ...childCenters);

    const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    vLine.setAttribute('d', `M ${busX} ${busTop} L ${busX} ${busBot}`);
    vLine.setAttribute('fill', 'none');
    vLine.setAttribute('stroke', '#3498db');
    vLine.setAttribute('stroke-width', '2');
    svg.appendChild(vLine);

    // Отводы к каждому ребёнку
    children.forEach(ch => {
      const cp = posMap.get(ch.id);
      if (!cp) return;
      const cy = cp.y + cp.h / 2;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', `M ${busX} ${cy} L ${cp.x} ${cy}`);
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', '#3498db');
      line.setAttribute('stroke-width', '2');
      svg.appendChild(line);
    });
  });

  // Merge lines in full tree
  state.merges.forEach(m => {
    const fromPos = posMap.get(m.from);
    const toPos = posMap.get(m.to);
    if (!fromPos || !toPos) return;
    const x1 = fromPos.x + fromPos.w;
    const y1 = fromPos.y + fromPos.h / 2;
    const x2 = toPos.x;
    const y2 = toPos.y + toPos.h / 2;
    const dx = Math.abs(x2 - x1) * 0.5;
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#9b59b6');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-dasharray', '6 3');
    svg.appendChild(path);
  });
}

function renderFullTreeNode(c) {
  const node = c.node;
  const el = document.createElement('div');
  el.className = 'node-card';
  el.dataset.nodeId = node.id;
  if (node.parentId === null) el.classList.add('root-node');
  if (isSquareEnd(node.beat, node.length)) el.classList.add('square-end');
  if (c.isOnPath) el.classList.add('on-path');
  if (c.isOnPath && node.id === (state.activePath || []).slice(-1)[0]) el.classList.add('active');
  if (state.merges.some(m => m.from === node.id)) el.classList.add('merge-source');
  if (state.merges.some(m => m.to === node.id)) el.classList.add('has-merge-in');
  el.style.left = c.x + 'px';
  el.style.top = c.y + 'px';

  el.onclick = (e) => {
    if (e.target.closest('.card-actions')) return;
    setActiveNode(node.id);
  };

  if (c.isOnPath && node.id === (state.activePath || []).slice(-1)[0]) {
    const dot = document.createElement('div');
    dot.className = 'active-dot';
    el.appendChild(dot);
  }

  const movName = document.createElement('span');
  movName.className = 'mov-name';
  const mov = getMovement(node.movementId);
  movName.textContent = mov ? mov.name : '???';
  movName.title = mov ? mov.name : '';

  const badge = document.createElement('span');
  badge.className = 'beat-badge';
  if (isSquareEnd(node.beat, node.length)) badge.classList.add('square');
  badge.textContent = formatBeatNode(node.beat, node.length);
  if (isSquareEnd(node.beat, node.length)) {
    const sq = document.createElement('small');
    sq.textContent = '✓ квадрат';
    badge.appendChild(sq);
  }

  el.append(movName, badge);

  const isActive = c.isOnPath && node.id === (state.activePath || []).slice(-1)[0];
  if (isActive) {
    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const replaceBtn = document.createElement('button');
    replaceBtn.className = 'icon-btn'; replaceBtn.title = 'Заменить'; replaceBtn.textContent = '⇄';
    replaceBtn.onclick = (e) => { e.stopPropagation(); replaceMovement(node.id); };

    const addBtn = document.createElement('button');
    addBtn.className = 'icon-btn'; addBtn.title = 'Продолжить'; addBtn.textContent = '+';
    const nextBeat = node.beat + node.length;
    if (allowedLengths(nextBeat).length === 0) {
      addBtn.disabled = true; addBtn.title = 'Нельзя начать';
    } else {
      addBtn.onclick = (e) => {
        e.stopPropagation();
        openForm({ parentId: node.id, isRoot: false, beat: nextBeat });
      };
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger'; delBtn.title = 'Удалить'; delBtn.textContent = '✕';
    delBtn.onclick = (e) => { e.stopPropagation(); deleteNode(node.id); };

    const existingMerge = state.merges.find(m => m.from === node.id);
    const mergeBtn = document.createElement('button');
    mergeBtn.className = 'icon-btn' + (existingMerge ? ' merge-active' : '');
    mergeBtn.title = existingMerge ? 'Отменить подключение' : 'Подключиться';
    mergeBtn.textContent = '↩';
    if (existingMerge) {
      mergeBtn.onclick = (e) => { e.stopPropagation(); removeMerge(node.id); };
    } else {
      const nextB = node.beat + node.length;
      const targets = nextB <= 32 ? findMergeTargets(node.id) : [];
      if (targets.length === 0) {
        mergeBtn.disabled = true; mergeBtn.title = 'Нет подходящих узлов';
      } else {
        mergeBtn.onclick = (e) => {
          e.stopPropagation();
          mergeSelectFrom = node.id;
          renderTree();
        };
      }
    }

    actions.append(replaceBtn, addBtn, mergeBtn, delBtn);
    el.appendChild(actions);
  }

  return el;
}