function addMovementFromInput() {
  const input = document.getElementById('newMovInput');
  const name = input.value.trim();
  if (!name) return;
  addMovement(name); input.value = '';
}
function addMovement(name) {
  if (!name) return null;
  const existing = state.movements.find(m => m.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const id = state.nextMovId++;
  state.movements.push({ id, name });
  saveState(); render();
  return id;
}
function renameMovement(id) {
  const mov = state.movements.find(m => m.id === id);
  if (!mov) return;
  const newName = prompt('Новое название:', mov.name);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) return;
  mov.name = trimmed;
  saveState(); render();
}
function deleteMovement(id) {
  const usage = Object.values(state.nodes).filter(n => n.movementId === id).length;
  if (usage > 0) {
    if (!confirm(`Движение используется в ${usage} узл(ах). Удалить и убрать из дерева?`)) return;
    const toDelete = new Set();
    const collect = (nid) => {
      toDelete.add(nid);
      state.nodeOrder.filter(x => state.nodes[x] && state.nodes[x].parentId === nid).forEach(collect);
    };
    Object.values(state.nodes).filter(n => n.movementId === id).forEach(n => collect(n.id));
    toDelete.forEach(nid => {
      state.roots = state.roots.filter(r => r !== nid);
      state.nodeOrder = state.nodeOrder.filter(x => x !== nid);
      delete state.nodes[nid];
    });
    state.activePath = state.activePath.filter(p => !toDelete.has(p));
  }
  state.movements = state.movements.filter(m => m.id !== id);
  ensureActivePathValid();
  saveState(); render();
}
function getMovement(id) { return state.movements.find(m => m.id === id); }

function renderMovements() {
  const ul = document.getElementById('movList');
  ul.innerHTML = '';
  document.getElementById('libCount').textContent = state.movements.length ? `(${state.movements.length})` : '';
  if (state.movements.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-hint'; li.textContent = 'Пока пусто';
    ul.appendChild(li); return;
  }
  state.movements.forEach(m => {
    const li = document.createElement('li');
    const usage = Object.values(state.nodes).filter(n => n.movementId === m.id).length;
    const name = document.createElement('span');
    name.className = 'name'; name.textContent = m.name;
    const count = document.createElement('span');
    count.className = 'count'; count.textContent = usage;
    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn'; editBtn.title = 'Переименовать'; editBtn.textContent = '✎';
    editBtn.onclick = (e) => { e.stopPropagation(); renameMovement(m.id); };
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger'; delBtn.title = 'Удалить'; delBtn.textContent = '✕';
    delBtn.onclick = (e) => { e.stopPropagation(); deleteMovement(m.id); };
    li.append(name, count, editBtn, delBtn);
    ul.appendChild(li);
  });
}