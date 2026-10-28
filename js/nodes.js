function addRoot() { openForm({ parentId: null, isRoot: true, beat: 1 }); }
function addChildNode(parentId, movementId, beat, length) {
  const id = state.nextNodeId++;
  state.nodes[id] = { id, movementId, parentId, beat, length, preparation: null };
  state.nodeOrder.push(id);
  state.activePath = [...pathToNode(parentId), id];
  saveState(); render();
}
function addRootNode(movementId, length) {
  const id = state.nextNodeId++;
  state.nodes[id] = { id, movementId, parentId: null, beat: 1, length, preparation: null };
  state.nodeOrder.push(id);
  state.roots.push(id);
  state.activePath = [id];
  saveState(); render();
}
function deleteNode(id) {
  if (!state.nodes[id]) return;
  const descendants = [];
  const collect = (nid) => {
    descendants.push(nid);
    state.nodeOrder.filter(x => state.nodes[x] && state.nodes[x].parentId === nid).forEach(collect);
  };
  collect(id);
  if (descendants.length > 1) {
    if (!confirm(`Удалить узел и все его продолжения (${descendants.length - 1})?`)) return;
  }
  descendants.forEach(nid => {
    state.roots = state.roots.filter(r => r !== nid);
    state.nodeOrder = state.nodeOrder.filter(x => x !== nid);
    delete state.nodes[nid];
  });
  state.merges = state.merges.filter(m => !descendants.includes(m.from) && !descendants.includes(m.to));
  state.collapsedNodes = (state.collapsedNodes || []).filter(c => !descendants.includes(c));
  state.activePath = state.activePath.filter(p => !descendants.includes(p));
  pruneComboVideos();
  pruneComboDescriptions();
  ensureActivePathValid();
  saveState(); render();
}
function getChildren(parentId) {
  return state.nodeOrder.map(id => state.nodes[id]).filter(n => n && n.parentId === parentId);
}
function getChildrenSorted(parentId) {
  const list = getChildren(parentId);
  list.sort((a, b) => {
    const ma = getMovement(a.movementId);
    const mb = getMovement(b.movementId);
    const na = ma ? ma.name : '';
    const nb = mb ? mb.name : '';
    return na.localeCompare(nb, undefined, { sensitivity: 'base', numeric: true });
  });
  return list;
}

/* ===== Сворачивание поддеревьев =====
   Свёрнутый узел остаётся видимым, но его продолжения не раскладываются
   и не рисуются (в обоих режимах дерева). На данные и комбинации это
   не влияет — только на отображение. */
function isCollapsed(nodeId) {
  return (state.collapsedNodes || []).includes(nodeId);
}
function getVisibleChildren(nodeId) {
  return isCollapsed(nodeId) ? [] : getChildrenSorted(nodeId);
}
function toggleCollapse(nodeId) {
  if (!state.nodes[nodeId]) return;
  if (isCollapsed(nodeId)) {
    state.collapsedNodes = (state.collapsedNodes || []).filter(c => c !== nodeId);
  } else {
    state.collapsedNodes = (state.collapsedNodes || []).concat(nodeId);
    // Активный узел внутри свёрнутого поддерева стал бы невидимым —
    // поднимаем активность на сам свёрнутый узел.
    const idx = state.activePath.indexOf(nodeId);
    if (idx >= 0 && idx < state.activePath.length - 1) {
      state.activePath = state.activePath.slice(0, idx + 1);
    }
  }
  saveState(); render();
}

/* ===== Замена движения узла =====
   Модалка со списком библиотеки (поиск по названию) и кнопкой создания
   нового движения через общую модалку движения (название + лид/фоллоу). */
let replaceMovementNodeId = null;

function replaceMovement(nodeId) {
  const node = state.nodes[nodeId];
  if (!node) return;
  replaceMovementNodeId = nodeId;
  const current = getMovement(node.movementId);
  document.getElementById('replaceMovementHint').textContent =
    `Сейчас: ${current ? current.name : '???'} · ${formatBeat(node.beat, node.length)}`;
  const search = document.getElementById('replaceMovementSearch');
  search.value = '';
  renderReplaceMovementList();
  document.getElementById('replaceMovementModal').classList.add('open');
  search.focus();
}

function closeReplaceMovementModal() {
  document.getElementById('replaceMovementModal').classList.remove('open');
  replaceMovementNodeId = null;
}

function replaceMovementMatches() {
  const q = document.getElementById('replaceMovementSearch').value.trim().toLowerCase();
  return state.movements
    .filter(m => !q || m.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
}

function renderReplaceMovementList() {
  const node = state.nodes[replaceMovementNodeId];
  const list = document.getElementById('replaceMovementList');
  list.innerHTML = '';
  const query = document.getElementById('replaceMovementSearch').value.trim();
  const matches = replaceMovementMatches();
  if (matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'replace-movement-empty';
    empty.textContent = state.movements.length ? 'Ничего не найдено' : 'Библиотека пуста';
    list.appendChild(empty);
  }
  matches.forEach(m => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'replace-movement-item';
    const name = document.createElement('span');
    name.className = 'replace-movement-name';
    renderRichText(nameSegmentsOf(m), name);
    item.appendChild(name);
    if (node && m.id === node.movementId) {
      item.classList.add('current');
      const mark = document.createElement('span');
      mark.className = 'replace-movement-current';
      mark.textContent = 'текущее';
      item.appendChild(mark);
    }
    item.onclick = () => applyReplaceMovement(m.id);
    list.appendChild(item);
  });

  const exact = query && state.movements.some(m => m.name.toLowerCase() === query.toLowerCase());
  document.getElementById('btnReplaceWithNew').textContent =
    query && !exact ? `+ Создать «${query}»` : '+ Новое движение';
}

function applyReplaceMovement(movementId) {
  const node = state.nodes[replaceMovementNodeId];
  closeReplaceMovementModal();
  if (!node || !getMovement(movementId) || node.movementId === movementId) return;
  node.movementId = movementId;
  pruneComboVideos();
  pruneComboDescriptions();
  saveState(); render();
}

function replaceWithNewMovement() {
  const nodeId = replaceMovementNodeId;
  const text = document.getElementById('replaceMovementSearch').value.trim();
  // Модалка движения лежит в DOM раньше и при одинаковом z-index оказалась бы
  // под окном замены — закрываем замену, узел помним в замыкании.
  closeReplaceMovementModal();
  openMovementModal({
    text,
    onSaved: (draft) => {
      if (!state.nodes[nodeId]) return;
      // addMovement вернёт id существующего движения, если имя уже занято
      const movId = addMovement(draft.name, draft.lead, draft.follow, {
        name: draft.nameSegments, lead: draft.leadSegments, follow: draft.followSegments
      });
      replaceMovementNodeId = nodeId;
      applyReplaceMovement(movId);
    }
  });
}

function onReplaceMovementKeydown(e) {
  if (e.isComposing) return;
  if (e.key === 'Escape') { e.preventDefault(); closeReplaceMovementModal(); }
  else if (e.key === 'Enter' && e.target.id === 'replaceMovementSearch') {
    e.preventDefault();
    const query = e.target.value.trim().toLowerCase();
    const matches = replaceMovementMatches();
    const exact = matches.find(m => m.name.toLowerCase() === query);
    if (exact) applyReplaceMovement(exact.id);
    else if (matches.length === 1) applyReplaceMovement(matches[0].id);
    else if (matches.length === 0 && query) replaceWithNewMovement();
  }
}

/* ===== MERGE (side branches) ===== */
let mergeSelectFrom = null;

function findMergeTargets(fromNodeId) {
  const fromNode = state.nodes[fromNodeId];
  if (!fromNode) return [];
  const nextBeat = fromNode.beat + fromNode.length;
  if (nextBeat > 32) return [];
  const targetBeatPos = beatInEighth(nextBeat);

  const ancestors = new Set();
  let cur = fromNode;
  let guard = 0;
  while (cur && guard++ < 1000) {
    ancestors.add(cur.id);
    if (cur.parentId === null) break;
    cur = state.nodes[cur.parentId];
  }

  return state.nodeOrder.filter(id => {
    if (id === fromNodeId) return false;
    const node = state.nodes[id];
    if (!node) return false;
    if (ancestors.has(id)) return false;
    if (beatInEighth(node.beat) !== targetBeatPos) return false;
    return true;
  });
}

function addMerge(fromId, toId) {
  state.merges = state.merges.filter(m => m.from !== fromId);
  state.merges.push({ from: fromId, to: toId });
  saveState(); render();
}

function removeMerge(fromId) {
  state.merges = state.merges.filter(m => m.from !== fromId);
  saveState(); render();
}