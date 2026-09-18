let state = loadState() || initialState();

function initialState() {
  return {
    movements: [], roots: [], nodes: {}, nodeOrder: [],
    nextNodeId: 1, nextMovId: 1, activePath: [],
    treeViewMode: 'path'
  };
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function toggleTreeView(mode) {
  if (mode === undefined) mode = state.treeViewMode === 'path' ? 'all' : 'path';
  state.treeViewMode = mode;
  document.getElementById('btnViewPath').classList.toggle('active', mode === 'path');
  document.getElementById('btnViewAll').classList.toggle('active', mode === 'all');
  saveState();
  renderTree();
}