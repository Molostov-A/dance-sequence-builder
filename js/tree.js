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
    renderRichText(nameSegmentsOf(mov), chip);
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
    renderRichText(nameSegmentsOf(mov), crumb);
    crumb.title = formatBeatNode(node.beat, node.length);
    crumb.onclick = () => setActiveNode(nodeId);
    bc.appendChild(crumb);
  });
}

function renderTree() {
  rebuildNodeVideoIndex();
  updateTreeToolbar();
  if (!(treeDrag && treeDrag.moved)) hideLinkControls(true);
  if (state.treeViewMode !== 'all') lastFullLayout = null;
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
  const { cards, minis, preps, width, height } = layout;
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
  // Блоки препов фиксированной высоты — замерять не нужно, ставим сразу
  preps.forEach(p => nodesLayer.appendChild(renderPrepChip(p)));
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

  // 1) Хребет: горизонтальные связи между крупными карточками (кроме активного).
  //    Если на линии стоит преп, она разрывается блоком препа посередине.
  const spineCards = cards.filter(c => !c.isActive);
  for (let i = 1; i < spineCards.length; i++) {
    const prev = spineCards[i - 1];
    const cur = spineCards[i];
    const x1 = prev.x + prev.w;
    const y1 = prev.y + prev.h / 2;
    const x2 = cur.x;
    const y2 = cur.y + cur.h / 2;
    const chip = preps.find(p => p.kind === 'spine' && p.members[0] === cur.node.id);
    const link = { 'data-link-child': cur.node.id };
    if (chip) {
      const cy = chip.y + chip.h / 2;
      const d1 = `M ${x1} ${y1} L ${chip.x} ${cy}`;
      const d2 = `M ${chip.x + chip.w} ${cy} L ${x2} ${y2}`;
      svgLine(svg, d1, '#3498db', 2);
      svgLine(svg, d2, '#3498db', 2);
      Object.assign(link, { 'data-prep-id': chip.prepId });
      svgHit(svg, d1, link);
      svgHit(svg, d2, link);
    } else {
      const d = `M ${x1} ${y1} L ${x2} ${y2}`;
      svgLine(svg, d, '#3498db', 2);
      svgHit(svg, d, link);
    }
  }

  const activeCard = cards.find(c => c.isActive);
  const lastSpine = spineCards[spineCards.length - 1];
  const siblingMinis = minis.filter(m => m.kind === 'sibling');

  // 2) Общая шина (серая, пунктир) — в зазоре между родителем и стеком,
  //    с отводами к братьям активного (и к блокам их препов). Шина в зазоре,
  //    поэтому отводы не пересекают карточку родителя даже для братьев
  //    выше активного.
  // 3) Линия пути (синяя) поверх серой: от правого края родителя на шину,
  //    по шине к активному (или к блоку его препа) и в ЛЕВЫЙ край активного.
  if (lastSpine && activeCard) {
    const parentRight = lastSpine.x + lastSpine.w;
    const parentMidY = lastSpine.y + lastSpine.h / 2;
    const trunkX = parentRight + H_GAP_MINI / 2;
    const activeLeft = activeCard.x;
    const activeMidY = activeCard.y + activeCard.h / 2;
    const stackChips = preps.filter(p => p.kind === 'sibling');

    drawFanOut(svg, {
      fromX: trunkX, fromY: parentMidY, busX: trunkX,
      items: siblingMinis.concat(activeCard),
      chips: stackChips,
      stroke: '#b8c4cf', width: 1.2, dash: '3 3'
    });

    const chip = stackChips.find(p => p.members.includes(activeCard.node.id));
    if (chip) {
      const cy = chip.y + chip.h / 2;
      const subX = chip.subX;
      svgLine(svg, `M ${parentRight} ${parentMidY} L ${trunkX} ${parentMidY} L ${trunkX} ${cy} L ${chip.x} ${cy}`, '#3498db', 2);
      svgLine(svg, `M ${chip.x + chip.w} ${cy} L ${subX} ${cy} L ${subX} ${activeMidY} L ${activeLeft} ${activeMidY}`, '#3498db', 2);
    } else {
      svgLine(svg, `M ${parentRight} ${parentMidY} L ${trunkX} ${parentMidY} L ${trunkX} ${activeMidY} L ${activeLeft} ${activeMidY}`, '#3498db', 2);
    }
  }

  // 4) Линии продолжений активного — вертикальная шина + отводы (через препы)
  const childMinis = minis.filter(m => m.kind === 'child');
  if (childMinis.length > 0 && activeCard) {
    drawFanOut(svg, {
      fromX: activeCard.x + activeCard.w, fromY: activeCard.y + activeCard.h / 2,
      busX: activeCard.x + activeCard.w + BUS_OFFSET,
      items: childMinis,
      chips: preps.filter(p => p.kind === 'child'),
      stroke: '#7fbf7f', width: 1.8
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

function renderCardTitle(node) {
  const row = document.createElement('div');
  row.className = 'card-title-row';

  const mov = getMovement(node.movementId);
  const movName = document.createElement('span');
  movName.className = 'mov-name';
  renderRichText(nameSegmentsOf(mov), movName);
  const notes = movementNotes(mov);
  movName.title = mov ? (notes ? `${mov.name}\n\n${notes}` : mov.name) : '';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'icon-btn card-edit-mov';
  editBtn.title = mov ? 'Редактировать движение' : 'Движение не найдено';
  editBtn.textContent = '✎';
  editBtn.disabled = !mov;
  editBtn.onclick = (e) => {
    e.stopPropagation();
    openMovementModal({ movementId: node.movementId });
  };

  const videoCount = getNodeVideoCount(node.id);
  if (videoCount > 0) {
    const videoBtn = document.createElement('button');
    videoBtn.type = 'button';
    videoBtn.className = 'icon-btn card-video-mov';
    videoBtn.title = `Видео комбинаций (${videoCount})`;
    videoBtn.setAttribute('aria-label', videoBtn.title);
    videoBtn.textContent = videoCount > 1 ? `▶${videoCount}` : '▶';
    videoBtn.onclick = (e) => {
      e.stopPropagation();
      openNodeVideosModal(node.id);
    };
    row.append(movName, videoBtn, editBtn);
  } else {
    row.append(movName, editBtn);
  }
  return row;
}
// Кнопка «свернуть/развернуть продолжения» сидит на правой кромке карточки —
// ровно там, откуда выходят линии к детям, поэтому читается как «узел ветки».
// У свёрнутого узла показывает, сколько потомков скрыто.
function renderCollapseToggle(node, container) {
  if (getChildren(node.id).length === 0) return;
  const collapsed = isCollapsed(node.id);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'collapse-toggle' + (collapsed ? ' collapsed' : '');
  if (collapsed) {
    const hidden = countAllDescendants(node.id);
    btn.textContent = '+' + hidden;
    btn.title = `Развернуть продолжения (${hidden})`;
  } else {
    btn.textContent = '−';
    btn.title = 'Свернуть все продолжения';
  }
  btn.setAttribute('aria-label', btn.title);
  btn.onclick = (e) => {
    e.stopPropagation();
    toggleCollapse(node.id);
  };
  container.appendChild(btn);
}
/* ===== Линии и блоки препов ===== */
function svgLine(svg, d, stroke, width, dash) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', stroke);
  path.setAttribute('stroke-width', String(width));
  if (dash) path.setAttribute('stroke-dasharray', dash);
  svg.appendChild(path);
  return path;
}

// Невидимая широкая линия поверх настоящей — ловит наведение (тултип препа,
// кнопки управления связью) и перетаскивание шины. attrs — data-атрибуты.
function svgHit(svg, d, attrs, className) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('class', 'link-hit' + (className ? ' ' + className : ''));
  Object.keys(attrs).forEach(k => path.setAttribute(k, String(attrs[k])));
  svg.appendChild(path);
  return path;
}

// Разветвление «родитель → колонка детей» с учётом препов. Дети без препа
// получают отвод прямо с шины родителя (busX). Группа детей с общим препом —
// один отвод в левый край блока препа, а от правого края блока — своя
// короткая шина (chip.subX) с отводами к каждому ребёнку группы. Так видно,
// что все эти продолжения идут через один и тот же мостик.
// Отвод к каждому ребёнку получает хит-линию data-link-child (кнопки
// управления связью), участки через преп — ещё и data-prep-id (тултип).
function drawFanOut(svg, o) {
  const mid = it => it.y + it.h / 2;
  const inChip = new Set();
  o.chips.forEach(ch => ch.members.forEach(id => inChip.add(id)));
  const entries = [];
  o.items.forEach(it => { if (!inChip.has(it.node.id)) entries.push({ x: it.x, y: mid(it), childId: it.node.id }); });
  o.chips.forEach(ch => entries.push({ x: ch.x, y: mid(ch), chip: ch }));
  if (entries.length === 0) return;

  if (o.fromX !== o.busX) svgLine(svg, `M ${o.fromX} ${o.fromY} L ${o.busX} ${o.fromY}`, o.stroke, o.width, o.dash);
  const ys = entries.map(e => e.y).concat(o.fromY);
  const busD = `M ${o.busX} ${Math.min(...ys)} L ${o.busX} ${Math.max(...ys)}`;
  svgLine(svg, busD, o.stroke, o.width, o.dash);
  entries.forEach(e => {
    const d = `M ${o.busX} ${e.y} L ${e.x} ${e.y}`;
    svgLine(svg, d, o.stroke, o.width, o.dash);
    if (e.chip) svgHit(svg, d, { 'data-prep-id': e.chip.prepId });
    else svgHit(svg, d, { 'data-link-child': e.childId });
  });

  const byId = new Map(o.items.map(it => [it.node.id, it]));
  o.chips.forEach(ch => {
    const cy = mid(ch);
    const subX = ch.subX;
    const members = ch.members.map(id => byId.get(id)).filter(Boolean);
    const mys = members.map(mid).concat(cy);
    const outD = `M ${ch.x + ch.w} ${cy} L ${subX} ${cy}`;
    const subD = `M ${subX} ${Math.min(...mys)} L ${subX} ${Math.max(...mys)}`;
    svgLine(svg, outD, o.stroke, o.width, o.dash);
    svgLine(svg, subD, o.stroke, o.width, o.dash);
    svgHit(svg, outD, { 'data-prep-id': ch.prepId });
    svgHit(svg, subD, { 'data-prep-id': ch.prepId });
    members.forEach(m => {
      const d = `M ${subX} ${mid(m)} L ${m.x} ${mid(m)}`;
      svgLine(svg, d, o.stroke, o.width, o.dash);
      svgHit(svg, d, { 'data-prep-id': ch.prepId, 'data-link-child': m.node.id });
    });
  });

  // Шину полного дерева можно перетаскивать влево-вправо (закрепляется)
  if (o.busParentId !== undefined) {
    const hit = svgHit(svg, busD, { 'data-bus-parent': o.busParentId }, 'bus-hit');
    hit.addEventListener('pointerdown', (e) => startBusDrag(e, o.busParentId));
  }
}

// Маленькая кнопка «📌» у закреплённого элемента — открепить
function renderPinBadge(title, onUnpin) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pin-badge';
  btn.textContent = '📌';
  btn.title = title;
  btn.onclick = (e) => { e.stopPropagation(); onUnpin(); };
  return btn;
}

/* Блок препа на линии (поверх связи). Развёрнутый: название и кнопки,
   появляющиеся при наведении: «+» — новое продолжение за этим препом,
   «–» — свернуть, «✕» — убрать преп со связей. Клик по названию —
   редактирование препа. Свёрнутый — круглая метка «‖», клик разворачивает.
   В полном дереве блок можно перетаскивать (закрепляется). */
function renderPrepChip(chip) {
  const prep = getPrep(chip.prepId);
  const parent = state.nodes[chip.parentId];
  const el = document.createElement('div');
  el.className = chip.collapsed ? 'prep-mark' : 'prep-chip';
  el.setAttribute('data-prep-id', chip.prepId);
  el.style.left = chip.x + 'px';
  el.style.top = chip.y + 'px';
  el.style.width = chip.w + 'px';
  el.style.height = chip.h + 'px';
  if (chip.pinned) el.classList.add('pinned');
  el.addEventListener('pointerdown', (e) => startPrepDrag(e, chip));

  if (chip.collapsed) {
    el.textContent = '‖';
    el.setAttribute('aria-label', `Преп ${prep ? prep.name : ''} (свёрнут)`);
    el.onclick = (e) => { e.stopPropagation(); togglePrepLinkCollapsed(chip.parentId, chip.prepId); };
  } else {
    const name = document.createElement('span');
    name.className = 'prep-chip-name';
    renderRichText(nameSegmentsOf(prep), name);
    el.onclick = (e) => {
      e.stopPropagation();
      if (prep) openMovementModal({ kind: 'prep', prepId: prep.id });
    };
    el.appendChild(name);

    const btns = document.createElement('span');
    btns.className = 'prep-chip-btns';
    const btn = (text, title, onClick, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'prep-chip-btn' + (cls ? ' ' + cls : '');
      b.textContent = text;
      b.title = title;
      b.onclick = (e) => { e.stopPropagation(); onClick(); };
      return b;
    };
    if (parent) {
      const nextBeat = parent.beat + parent.length;
      const add = btn('+', 'Новое продолжение за этим препом',
        () => openForm({ parentId: parent.id, isRoot: false, beat: nextBeat, prepId: chip.prepId }), 'add');
      add.disabled = allowedLengths(nextBeat).length === 0;
      btns.appendChild(add);
    }
    btns.append(
      btn('–', 'Свернуть преп', () => togglePrepLinkCollapsed(chip.parentId, chip.prepId)),
      btn('✕', 'Убрать преп со связи', () => removePrepFromLink(chip.parentId, chip.prepId), 'danger')
    );
    el.appendChild(btns);
  }
  if (chip.pinned) {
    el.appendChild(renderPinBadge('Открепить блок препа: вернуть автоматическое положение',
      () => unpinPrep(prepLinkKey(chip.parentId, chip.prepId))));
  }
  return el;
}

/* ===== Кнопки управления связью =====
   При наведении на линию родитель → ребёнок рядом с курсором появляется
   плашка #linkControls: «‖ Преп» (поставить), а если преп есть — «⇄ Сменить»
   и «✕ Убрать». Плашка живёт в #treeInner (вне #nodesLayer), поэтому
   переживает перерисовку; прячется с задержкой, чтобы до неё можно было
   довести мышь. */
let linkControlsTimer = 0;

function showLinkControls(childId, clientX, clientY) {
  const node = state.nodes[childId];
  const box = document.getElementById('linkControls');
  if (!node || node.parentId === null || !box) return;
  clearTimeout(linkControlsTimer);
  if (box.dataset.childId === String(childId) && !box.classList.contains('hidden')) return;
  box.dataset.childId = childId;
  box.innerHTML = '';
  const prep = node.prepId ? getPrep(node.prepId) : null;
  const btn = (text, title, onClick, cls) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'link-ctl-btn' + (cls ? ' ' + cls : '');
    b.textContent = text;
    b.title = title;
    b.onclick = (e) => { e.stopPropagation(); hideLinkControls(true); onClick(); };
    return b;
  };
  if (prep) {
    box.append(
      btn('⇄ Сменить преп', `Сейчас: ${prep.name}`, () => openNodePrepPicker(childId)),
      btn('✕ Убрать преп', 'Убрать преп с этой связи', () => setNodePrep(childId, null), 'danger')
    );
  } else {
    box.append(btn('‖ Добавить преп', 'Поставить преп на эту связь', () => openNodePrepPicker(childId)));
  }
  const inner = document.getElementById('treeInner').getBoundingClientRect();
  box.style.left = (clientX - inner.left + 8) + 'px';
  box.style.top = (clientY - inner.top - 34) + 'px';
  box.classList.remove('hidden');
}

function hideLinkControls(now) {
  const box = document.getElementById('linkControls');
  if (!box) return;
  clearTimeout(linkControlsTimer);
  const hide = () => { box.classList.add('hidden'); box.dataset.childId = ''; };
  if (now) hide();
  else linkControlsTimer = setTimeout(hide, 350);
}

function initLinkControls() {
  const wrap = document.getElementById('treeWrap');
  const box = document.getElementById('linkControls');
  wrap.addEventListener('mouseover', (e) => {
    if (treeDrag && treeDrag.moved) return;
    const hit = e.target.closest && e.target.closest('[data-link-child]');
    if (hit) showLinkControls(Number(hit.getAttribute('data-link-child')), e.clientX, e.clientY);
  });
  wrap.addEventListener('mouseout', (e) => {
    if (e.target.closest && e.target.closest('[data-link-child]')) hideLinkControls(false);
  });
  box.addEventListener('mouseenter', () => clearTimeout(linkControlsTimer));
  box.addEventListener('mouseleave', () => hideLinkControls(false));
}

// Кнопки управления активной карточкой — общие для обоих режимов дерева.
function renderCardActions(node) {
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const button = (text, title, onClick, className) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn' + (className ? ' ' + className : '');
    btn.title = title;
    btn.textContent = text;
    if (onClick) btn.onclick = (e) => { e.stopPropagation(); onClick(); };
    else btn.disabled = true;
    return btn;
  };

  const replaceBtn = button('⇄', 'Заменить движение', () => replaceMovement(node.id));

  const nextBeat = node.beat + node.length;
  const canContinue = allowedLengths(nextBeat).length > 0;
  const addBtn = button('+', canContinue ? 'Продолжить' : 'Нельзя начать',
    canContinue ? () => openForm({ parentId: node.id, isRoot: false, beat: nextBeat }) : null);

  // Преп на ИСХОДЯЩЕЙ связи: выбрать/создать преп и сразу добавить
  // продолжение за ним. Преп существующей связи меняется на самой линии.
  const prepBtn = button('‖', canContinue ? 'Продолжить через преп' : 'Нельзя начать',
    canContinue ? () => openPrepPicker({
      title: 'Продолжить через преп',
      hint: 'Выберите или создайте преп — затем откроется форма нового движения за ним.',
      onPick: (prepId) => openForm({ parentId: node.id, isRoot: false, beat: nextBeat, prepId })
    }) : null);

  const existingMerge = state.merges.find(m => m.from === node.id);
  let mergeBtn;
  if (existingMerge) {
    mergeBtn = button('↩', 'Отменить подключение', () => removeMerge(node.id), 'merge-active');
  } else {
    const targets = nextBeat <= 32 ? findMergeTargets(node.id) : [];
    mergeBtn = targets.length === 0
      ? button('↩', 'Нет подходящих узлов', null)
      : button('↩', 'Подключиться', () => { mergeSelectFrom = node.id; renderTree(); });
  }

  const hasParentTargets = state.nodeOrder.some(id => canReparent(node.id, id));
  const parentBtn = button('⤴', hasParentTargets ? 'Сменить родителя' : 'Сменить родителя: нет подходящих узлов',
    hasParentTargets ? () => openChangeParentPicker(node.id) : null);
  const hasAdoptCandidates = state.nodeOrder.some(id => canReparent(id, node.id));
  const adoptBtn = button('⤵', hasAdoptCandidates ? 'Подключить другой узел продолжением' : 'Подключить продолжение: нет подходящих узлов',
    hasAdoptCandidates ? () => openAdoptChildPicker(node.id) : null);

  const combosBtn = button('≡', 'Показать комбинации с этим движением', () => showCombosForNode(node.id));
  const delBtn = button('✕', 'Удалить', () => deleteNode(node.id), 'danger');

  actions.append(replaceBtn, addBtn, prepBtn, mergeBtn, parentBtn, adoptBtn, combosBtn, delBtn);
  return actions;
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

  const titleRow = renderCardTitle(node);

  const badge = document.createElement('span');
  badge.className = 'beat-badge';
  if (isSquareEnd(node.beat, node.length)) badge.classList.add('square');
  badge.textContent = formatBeatNode(node.beat, node.length);
  if (isSquareEnd(node.beat, node.length)) {
    const sq = document.createElement('small');
    sq.textContent = '✓ квадрат';
    badge.appendChild(sq);
  }

  el.append(titleRow, badge);
  renderCollapseToggle(node, el);

  if (c.isActive) {
    el.appendChild(renderCardActions(node));
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
  renderRichText(nameSegmentsOf(mov), name);

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

  const videoCount = getNodeVideoCount(node.id);
  if (videoCount > 0) {
    const videoBtn = document.createElement('button');
    videoBtn.type = 'button';
    videoBtn.className = 'mini-video-btn';
    videoBtn.title = `Видео комбинаций (${videoCount})`;
    videoBtn.setAttribute('aria-label', videoBtn.title);
    videoBtn.textContent = videoCount > 1 ? `▶${videoCount}` : '▶';
    videoBtn.onclick = (e) => {
      e.stopPropagation();
      openNodeVideosModal(node.id);
    };
    el.appendChild(videoBtn);
  }

  const notes = movementNotes(mov);
  el.title = `Переключиться на "${mov ? mov.name : '???'}" (${formatBeat(node.beat, node.length)})`
    + (notes ? `\n\n${notes}` : '');
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
  const { cards, preps, buses, width, height } = layout;
  lastFullLayout = layout;
  const w = Math.max(width, 300);
  const h = Math.max(height, 300);

  cardEls.forEach((el, i) => {
    const c = cards[i];
    el.style.left = c.x + 'px';
    el.style.top = c.y + 'px';
    // Перетаскивание карточки закрепляет её относительно родителя
    el.addEventListener('pointerdown', (e) => startNodeDrag(e, c.node.id));
    if (c.pinned) {
      el.classList.add('pinned');
      el.appendChild(renderPinBadge('Открепить: вернуть автоматическое положение', () => unpinNode(c.node.id)));
    }
  });

  inner.style.width = w + 'px';
  inner.style.height = h + 'px';
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.style.width = w + 'px';
  svg.style.height = h + 'px';
  preps.forEach(p => nodesLayer.appendChild(renderPrepChip(p)));
  Object.keys(buses).forEach(pid => {
    if (!buses[pid].pinned) return;
    const parent = layout.byId.get(Number(pid));
    const badge = renderPinBadge('Открепить линию: вернуть автоматическое положение', () => unpinBus(Number(pid)));
    badge.classList.add('bus-pin');
    badge.style.left = (buses[pid].x - 9) + 'px';
    badge.style.top = (parent.y + parent.h / 2 - 26) + 'px';
    nodesLayer.appendChild(badge);
  });
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

  // Линии от родителя к детям — через блоки препов, если они есть
  cards.forEach(c => {
    const children = getVisibleChildren(c.node.id);
    if (children.length === 0) return;
    drawFanOut(svg, {
      fromX: c.x + c.w, fromY: c.y + c.h / 2,
      busX: buses[c.node.id] ? buses[c.node.id].x : c.x + c.w + BUS_OFFSET,
      busParentId: c.node.id,
      items: children.map(ch => posMap.get(ch.id)).filter(Boolean),
      chips: preps.filter(p => p.parentId === c.node.id),
      stroke: '#3498db', width: 2
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

  const titleRow = renderCardTitle(node);

  const badge = document.createElement('span');
  badge.className = 'beat-badge';
  if (isSquareEnd(node.beat, node.length)) badge.classList.add('square');
  badge.textContent = formatBeatNode(node.beat, node.length);
  if (isSquareEnd(node.beat, node.length)) {
    const sq = document.createElement('small');
    sq.textContent = '✓ квадрат';
    badge.appendChild(sq);
  }

  el.append(titleRow, badge);
  renderCollapseToggle(node, el);

  const isActive = c.isOnPath && node.id === (state.activePath || []).slice(-1)[0];
  if (isActive) {
    el.appendChild(renderCardActions(node));
  }

  return el;
}