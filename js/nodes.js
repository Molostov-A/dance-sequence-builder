function addRoot() { openForm({ parentId: null, isRoot: true, beat: 1 }); }
function addChildNode(parentId, movementId, beat, length, prepId) {
  const id = state.nextNodeId++;
  state.nodes[id] = { id, movementId, parentId, beat, length, prepId: prepId || null };
  state.nodeOrder.push(id);
  state.activePath = [...pathToNode(parentId), id];
  saveState(); render();
}
function addRootNode(movementId, length) {
  const id = state.nextNodeId++;
  state.nodes[id] = { id, movementId, parentId: null, beat: 1, length, prepId: null };
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
// Сначала продолжения без препа, затем группы по препу (по имени препа),
// внутри группы — по имени движения. Группы идут подряд, поэтому блок
// препа в раскладке может охватить всю свою группу одной шиной.
function getChildrenSorted(parentId) {
  const list = getChildren(parentId);
  const cmp = (x, y) => x.localeCompare(y, undefined, { sensitivity: 'base', numeric: true });
  const prepName = (n) => { const p = n.prepId ? getPrep(n.prepId) : null; return p ? p.name : ''; };
  const movName = (n) => { const m = getMovement(n.movementId); return m ? m.name : ''; };
  list.sort((a, b) => {
    const pa = prepName(a), pb = prepName(b);
    if (pa !== pb) {
      if (!pa) return -1;
      if (!pb) return 1;
      return cmp(pa, pb) || (a.prepId - b.prepId);
    }
    return cmp(movName(a), movName(b));
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

/* ===== Замена движения узла ===== */
function replaceMovement(nodeId) {
  const node = state.nodes[nodeId];
  if (!node) return;
  const current = getMovement(node.movementId);
  openLibraryPicker({
    title: 'Заменить движение',
    hint: `Сейчас: ${current ? current.name : '???'} · ${formatBeat(node.beat, node.length)}`,
    placeholder: 'Поиск по библиотеке или название нового движения',
    items: state.movements.map(m => ({ id: m.id, text: m.name, segments: nameSegmentsOf(m) })),
    currentId: node.movementId,
    emptyText: 'Библиотека пуста',
    onPick: (movementId) => applyReplaceMovement(nodeId, movementId),
    createLabel: 'движение',
    onCreate: (text) => {
      openMovementModal({
        text,
        onSaved: (draft) => {
          // addMovement вернёт id существующего движения, если имя уже занято
          const movId = addMovement(draft.name, draft.lead, draft.follow, {
            name: draft.nameSegments, lead: draft.leadSegments, follow: draft.followSegments
          });
          applyReplaceMovement(nodeId, movId);
        }
      });
    }
  });
}

function applyReplaceMovement(nodeId, movementId) {
  const node = state.nodes[nodeId];
  if (!node || !getMovement(movementId) || node.movementId === movementId) return;
  node.movementId = movementId;
  pruneComboVideos();
  pruneComboDescriptions();
  saveState(); render();
}

/* ===== Смена родителя =====
   Узел переезжает к другому родителю вместе со всеми продолжениями.
   Цель допустима, если продолжение у неё начинается в той же позиции
   восьмёрки, что и сам узел: тогда все счёты ветки сдвигаются на кратное 8
   и длительности остаются допустимыми (allowedLengths зависит только от
   позиции внутри восьмёрки). Нельзя переехать к себе, к своему потомку и
   к нынешнему родителю. Преп входящей линии переезжает вместе с узлом. */
function isDescendantOrSelf(nodeId, ancestorId) {
  let cur = state.nodes[nodeId];
  let guard = 0;
  while (cur && guard++ < 1000) {
    if (cur.id === ancestorId) return true;
    if (cur.parentId === null) return false;
    cur = state.nodes[cur.parentId];
  }
  return false;
}

function canReparent(nodeId, newParentId) {
  const node = state.nodes[nodeId];
  const parent = state.nodes[newParentId];
  if (!node || !parent) return false;
  if (node.parentId === newParentId) return false;
  if (isDescendantOrSelf(newParentId, nodeId)) return false;
  const nextBeat = parent.beat + parent.length;
  return beatInEighth(nextBeat) === beatInEighth(node.beat) && allowedLengths(nextBeat).length > 0;
}

function collectSubtree(nodeId) {
  const out = [];
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop();
    out.push(id);
    getChildren(id).forEach(c => stack.push(c.id));
  }
  return out;
}

function nodePathLabel(nodeId) {
  return pathToNode(nodeId).map(id => {
    const m = getMovement(state.nodes[id].movementId);
    return m ? m.name : '???';
  }).join(' › ');
}

function reparentNode(nodeId, newParentId) {
  if (!canReparent(nodeId, newParentId)) return;
  const node = state.nodes[nodeId];
  const parent = state.nodes[newParentId];
  const subtree = collectSubtree(nodeId);
  const moved = new Set(subtree);

  // Ключи видео и описаний — состав комбинации со счётами. У комбинаций,
  // проходящих через переезжающую ветку, состав меняется, и привязки теряются.
  const affected = collectCombos().filter(c => c.some(n => moved.has(n.id))
    && (getComboVideos(c).length > 0 || getComboDescription(c) || comboFolderIdsByKey(comboVideoKey(c)).length > 0));
  if (affected.length > 0
    && !confirm(`У ${affected.length} комбинац(ий) с этой веткой есть видео, описание или папки — после переноса они отвяжутся. Перенести?`)) return;

  const delta = (parent.beat + parent.length) - node.beat;
  subtree.forEach(id => { state.nodes[id].beat += delta; });
  if (node.parentId === null) {
    state.roots = state.roots.filter(r => r !== nodeId);
    node.prepId = null;
  }
  node.parentId = newParentId;
  // Закрепление считалось от старого родителя — у нового узел встаёт сам
  if (state.treePins && state.treePins.nodes) delete state.treePins.nodes[nodeId];
  // merge, который теперь ведёт в собственного предка, дал бы петлю
  state.merges = state.merges.filter(m => !isDescendantOrSelf(m.from, m.to));
  state.activePath = pathToNode(nodeId);
  const ancestors = state.activePath.slice(0, -1);
  state.collapsedNodes = (state.collapsedNodes || []).filter(c => !ancestors.includes(c));
  pruneComboVideos();
  pruneComboDescriptions();
  saveState(); render();
}

function reparentPickerItems(ids) {
  return ids.map(id => {
    const n = state.nodes[id];
    return { id, text: nodePathLabel(id), sub: formatBeat(n.beat, n.length) };
  });
}

// С карточки ребёнка: выбрать ему нового родителя.
function openChangeParentPicker(nodeId) {
  const node = state.nodes[nodeId];
  if (!node) return;
  const targets = state.nodeOrder.filter(id => canReparent(nodeId, id));
  const mov = getMovement(node.movementId);
  openLibraryPicker({
    title: 'Сменить родителя',
    hint: `«${mov ? mov.name : '???'}» переедет вместе с продолжениями. Подходят узлы, после которых движение начинается в той же позиции восьмёрки.`,
    placeholder: 'Поиск по пути в дереве',
    items: reparentPickerItems(targets),
    sort: false,
    emptyText: 'Нет подходящих узлов',
    onPick: (parentId) => reparentNode(nodeId, parentId)
  });
}

// С карточки родителя: забрать к себе чужой узел (та же операция, другая сторона).
function openAdoptChildPicker(parentId) {
  const parent = state.nodes[parentId];
  if (!parent) return;
  const candidates = state.nodeOrder.filter(id => canReparent(id, parentId));
  const mov = getMovement(parent.movementId);
  openLibraryPicker({
    title: 'Подключить продолжение',
    hint: `Выбранный узел с продолжениями станет продолжением «${mov ? mov.name : '???'}».`,
    placeholder: 'Поиск по пути в дереве',
    items: reparentPickerItems(candidates),
    sort: false,
    emptyText: 'Нет подходящих узлов',
    onPick: (childId) => reparentNode(childId, parentId)
  });
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