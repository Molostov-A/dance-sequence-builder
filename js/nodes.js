function addRoot() { openForm({ parentId: null, isRoot: true, beat: 1 }); }
function addChildNode(parentId, movementId, beat, length) {
  const id = state.nextNodeId++;
  state.nodes[id] = { id, movementId, parentId, beat, length };
  state.nodeOrder.push(id);
  state.activePath = [...pathToNode(parentId), id];
  saveState(); render();
}
function addRootNode(movementId, length) {
  const id = state.nextNodeId++;
  state.nodes[id] = { id, movementId, parentId: null, beat: 1, length };
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
  state.activePath = state.activePath.filter(p => !descendants.includes(p));
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

function replaceMovement(nodeId) {
  const node = state.nodes[nodeId];
  if (!node) return;
  const current = getMovement(node.movementId);
  const list = state.movements.map(m => `[${m.id}] ${m.name}`).join('\n');
  const input = prompt(
    `Текущее: ${current ? current.name : '???'}\n\nВведите название или ID из списка (или новое имя):\n\n${list}`,
    current ? current.name : ''
  );
  if (input === null) return;
  const trimmed = input.trim();
  if (!trimmed) return;
  let mov = state.movements.find(m => m.name.toLowerCase() === trimmed.toLowerCase());
  if (!mov) {
    const m2 = trimmed.match(/^\[(\d+)\]/);
    if (m2) mov = state.movements.find(m => m.id === parseInt(m2[1], 10));
  }
  if (!mov) {
    const idNum = parseInt(trimmed, 10);
    if (!isNaN(idNum)) mov = state.movements.find(m => m.id === idNum);
  }
  if (mov) node.movementId = mov.id;
  else node.movementId = addMovement(trimmed);
  saveState(); render();
}