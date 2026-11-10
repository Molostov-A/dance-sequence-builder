/* =========================================================
   РУЧНАЯ РАСКЛАДКА ДЕРЕВА (только режим «все ветви»)
   state.treePins:
     nodes: { [nodeId]: { dx, dy } } — левый верхний угол карточки относительно
            левого верхнего угла РОДИТЕЛЯ (у корня — относительно холста);
     buses: { [parentId]: { dx } } — вертикальная шина родителя: отступ от его
            правого края (по умолчанию BUS_OFFSET);
     preps: { ['parentId:prepId']: { dx, dy } } — блок препа относительно родителя;
     links: { [linkKey]: { shape: 'bus', ex } | { shape: 'curve', hx, hy } } —
            форма отдельной связи. linkKey: 'c:<ребёнок>' (линия к ребёнку от
            родителя или от блока препа) или 'p:<родитель>:<преп>' (линия от
            родителя к блоку препа). 'bus' — своя шина: излом на ex от точки
            выхода; 'curve' — плавная кривая через ручку, смещённую на (hx, hy)
            от середины линии. Без записи связь идёт по общей шине родителя.
   Закрепление ставится само при перетаскивании; открепление (📌) возвращает
   автоматическое положение. Незакреплённые элементы едут вместе с родителем,
   поэтому перенос карточки переносит и всю её ветку.

   state.collapsedPrepLinks: ['parentId:prepId'] — свёрнутые препы (маленькая
   метка на линии вместо блока). Работает в обоих режимах дерева.
   ========================================================= */
function prepLinkKey(parentId, prepId) { return parentId + ':' + prepId; }

function treePins() {
  if (!state.treePins) state.treePins = { nodes: {}, buses: {}, preps: {}, links: {} };
  if (!state.treePins.links) state.treePins.links = {};
  return state.treePins;
}

function hasAnyTreePins() {
  const p = state.treePins;
  return !!p && (Object.keys(p.nodes || {}).length + Object.keys(p.buses || {}).length
    + Object.keys(p.preps || {}).length + Object.keys(p.links || {}).length) > 0;
}

function linkSetting(key) {
  return ((state.treePins || {}).links || {})[key] || null;
}

// Переключить форму связи: шина ↔ изгиб. Новый изгиб — плавная кривая
// через середину линии; дальше её можно тянуть за ручку.
function toggleLinkShape(key) {
  const links = treePins().links;
  const cur = links[key];
  if (cur && cur.shape === 'curve') delete links[key];
  else links[key] = { shape: 'curve', hx: 0, hy: 0 };
  saveState(); renderTree();
}

function resetLink(key) {
  delete treePins().links[key];
  saveState(); renderTree();
}

function unpinNode(id) { delete treePins().nodes[id]; saveState(); renderTree(); }
function unpinBus(id) { delete treePins().buses[id]; saveState(); renderTree(); }
function unpinPrep(key) { delete treePins().preps[key]; saveState(); renderTree(); }

function resetTreePins() {
  if (!hasAnyTreePins()) return;
  if (!confirm('Открепить все блоки и связи и вернуть автоматическую раскладку?')) return;
  state.treePins = { nodes: {}, buses: {}, preps: {}, links: {} };
  saveState(); renderTree();
}

/* ===== Сворачивание препов ===== */
function isPrepLinkCollapsed(parentId, prepId) {
  return (state.collapsedPrepLinks || []).includes(prepLinkKey(parentId, prepId));
}

function togglePrepLinkCollapsed(parentId, prepId) {
  const key = prepLinkKey(parentId, prepId);
  const list = state.collapsedPrepLinks || [];
  state.collapsedPrepLinks = list.includes(key) ? list.filter(k => k !== key) : list.concat(key);
  saveState(); renderTree();
}

function allPrepLinkKeys() {
  const keys = new Set();
  Object.values(state.nodes).forEach(n => {
    if (n.prepId && n.parentId !== null) keys.add(prepLinkKey(n.parentId, n.prepId));
  });
  return Array.from(keys);
}

function anyPrepLinkExpanded() {
  const collapsed = new Set(state.collapsedPrepLinks || []);
  return allPrepLinkKeys().some(k => !collapsed.has(k));
}

function toggleAllPrepLinks() {
  state.collapsedPrepLinks = anyPrepLinkExpanded() ? allPrepLinkKeys() : [];
  saveState(); renderTree();
}

// Убрать преп со связей: со всех линий родителя, на которых он стоит
function removePrepFromLink(parentId, prepId) {
  const children = getChildren(parentId).filter(c => c.prepId === prepId);
  if (children.length === 0) return;
  const prep = getPrep(prepId);
  if (children.length > 1
    && !confirm(`Убрать преп «${prep ? prep.name : '???'}» со связей к ${children.length} продолжениям?`)) return;
  children.forEach(c => { c.prepId = null; });
  saveState(); render();
}

// Кнопки в шапке дерева: «свернуть/развернуть все препы» и «сбросить закрепления»
function updateTreeToolbar() {
  const prepsBtn = document.getElementById('btnTogglePreps');
  const resetBtn = document.getElementById('btnResetPins');
  if (prepsBtn) {
    const hasPreps = allPrepLinkKeys().length > 0;
    const expanded = anyPrepLinkExpanded();
    prepsBtn.disabled = !hasPreps;
    prepsBtn.title = !hasPreps ? 'В дереве нет препов'
      : (expanded ? 'Свернуть все препы' : 'Развернуть все препы');
    prepsBtn.classList.toggle('active', hasPreps && !expanded);
  }
  if (resetBtn) {
    const show = state.treeViewMode === 'all' && hasAnyTreePins();
    resetBtn.classList.toggle('hidden', !show);
  }
}

/* ===== Перетаскивание =====
   Работает только в режиме «все ветви». Перетаскивание начинается после
   сдвига на DRAG_THRESHOLD, иначе это обычный клик. Во время перетаскивания
   пишется закрепление и перерисовывается только дерево (renderTree), поэтому
   ветка и линии едут вместе с блоком. Слушатели — на window: DOM дерева
   пересоздаётся на каждом шаге, захват указателя на элементе потерялся бы. */
const DRAG_THRESHOLD = 4;
let treeDrag = null;
let treeDragSuppressClick = false;
let treeDragFrame = 0;
let lastFullLayout = null;   // последняя раскладка полного дерева: позиции для старта перетаскивания

function treeDragEnabled() { return state.treeViewMode === 'all'; }

function startTreeDrag(e, spec) {
  if (!treeDragEnabled() || e.button > 0) return;
  if (e.target.closest('button, input, .card-actions')) return;
  treeDrag = Object.assign({ x0: e.clientX, y0: e.clientY, moved: false }, spec);
  window.addEventListener('pointermove', onTreeDragMove);
  window.addEventListener('pointerup', onTreeDragEnd);
  window.addEventListener('pointercancel', onTreeDragEnd);
}

function onTreeDragMove(e) {
  if (!treeDrag) return;
  const dx = e.clientX - treeDrag.x0;
  const dy = e.clientY - treeDrag.y0;
  if (!treeDrag.moved) {
    if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    treeDrag.moved = true;
    document.body.classList.add('tree-dragging');
    hidePrepTooltip();
  }
  e.preventDefault();
  const pins = treePins();
  if (treeDrag.kind === 'bus') {
    pins.buses[treeDrag.id] = { dx: Math.max(6, treeDrag.startDx + dx) };
  } else if (treeDrag.kind === 'link-bus') {
    // Своя шина связи: двигается только излом по горизонтали, форма остаётся шиной
    treePins().links[treeDrag.id] = { shape: 'bus', ex: Math.max(6, treeDrag.startEx + dx) };
  } else if (treeDrag.kind === 'link-curve') {
    treePins().links[treeDrag.id] = { shape: 'curve', hx: treeDrag.startHx + dx, hy: treeDrag.startHy + dy };
  } else {
    const nx = Math.max(0, treeDrag.startX + dx);
    const ny = Math.max(0, treeDrag.startY + dy);
    const pin = { dx: nx - treeDrag.baseX, dy: ny - treeDrag.baseY };
    if (treeDrag.kind === 'node') pins.nodes[treeDrag.id] = pin;
    else pins.preps[treeDrag.id] = pin;
  }
  if (!treeDragFrame) {
    treeDragFrame = requestAnimationFrame(() => { treeDragFrame = 0; renderTree(); });
  }
}

function onTreeDragEnd() {
  window.removeEventListener('pointermove', onTreeDragMove);
  window.removeEventListener('pointerup', onTreeDragEnd);
  window.removeEventListener('pointercancel', onTreeDragEnd);
  if (treeDrag && treeDrag.moved) {
    treeDragSuppressClick = true;
    setTimeout(() => { treeDragSuppressClick = false; }, 0);
    document.body.classList.remove('tree-dragging');
    saveState();
    renderTree();
  }
  treeDrag = null;
}

// Клик, которым закончилось перетаскивание, не должен выбирать узел/открывать преп
document.addEventListener('click', (e) => {
  if (!treeDragSuppressClick) return;
  treeDragSuppressClick = false;
  e.stopPropagation();
  e.preventDefault();
}, true);

function startNodeDrag(e, nodeId) {
  if (!lastFullLayout) return;
  const el = lastFullLayout.byId.get(nodeId);
  if (!el) return;
  const node = state.nodes[nodeId];
  const parent = node.parentId !== null ? lastFullLayout.byId.get(node.parentId) : null;
  startTreeDrag(e, {
    kind: 'node', id: nodeId,
    startX: el.x, startY: el.y,
    baseX: parent ? parent.x : 0, baseY: parent ? parent.y : 0
  });
}

function startPrepDrag(e, chip) {
  if (!lastFullLayout) return;
  const parent = lastFullLayout.byId.get(chip.parentId);
  if (!parent) return;
  startTreeDrag(e, {
    kind: 'prep', id: prepLinkKey(chip.parentId, chip.prepId),
    startX: chip.x, startY: chip.y, baseX: parent.x, baseY: parent.y
  });
}

// info: { shape: 'bus', ex } — текущий излом от точки выхода,
//       { shape: 'curve', hx, hy } — текущее смещение ручки.
function startLinkDrag(e, key, info) {
  if (info.shape === 'curve') {
    startTreeDrag(e, { kind: 'link-curve', id: key, startHx: info.hx, startHy: info.hy });
  } else {
    startTreeDrag(e, { kind: 'link-bus', id: key, startEx: info.ex });
  }
}

function startBusDrag(e, parentId) {
  if (!lastFullLayout) return;
  const parent = lastFullLayout.byId.get(parentId);
  const bus = lastFullLayout.buses[parentId];
  if (!parent || !bus) return;
  startTreeDrag(e, { kind: 'bus', id: parentId, startDx: bus.x - (parent.x + parent.w) });
}

/* ===== Тултип препа =====
   Показывается при наведении на линии с препом (невидимые широкие «хит»-линии
   в SVG с data-prep-id), на блок препа и на свёрнутую метку. */
function showPrepTooltip(prepId, x, y) {
  const prep = getPrep(prepId);
  const tip = document.getElementById('prepTooltip');
  if (!prep || !tip) return;
  tip.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'prep-tooltip-title';
  title.append('Преп: ');
  const name = document.createElement('span');
  renderRichText(nameSegmentsOf(prep), name);
  title.appendChild(name);
  tip.appendChild(title);
  const notes = movementNotes(prep);
  if (notes) {
    const body = document.createElement('div');
    body.className = 'prep-tooltip-notes';
    body.textContent = notes;
    tip.appendChild(body);
  }
  tip.classList.remove('hidden');
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = Math.min(x + 14, window.innerWidth - w - 8);
  const top = y + 16 + h > window.innerHeight - 8 ? y - h - 10 : y + 16;
  tip.style.left = Math.max(8, left) + 'px';
  tip.style.top = Math.max(8, top) + 'px';
}

function hidePrepTooltip() {
  const tip = document.getElementById('prepTooltip');
  if (tip) tip.classList.add('hidden');
}

function initPrepTooltip() {
  const wrap = document.getElementById('treeWrap');
  wrap.addEventListener('mousemove', (e) => {
    if (treeDrag && treeDrag.moved) return;
    const el = e.target.closest('[data-prep-id]');
    if (!el) { hidePrepTooltip(); return; }
    showPrepTooltip(Number(el.getAttribute('data-prep-id')), e.clientX, e.clientY);
  });
  wrap.addEventListener('mouseleave', hidePrepTooltip);
  wrap.addEventListener('scroll', hidePrepTooltip);
}
