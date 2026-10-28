let state = loadState() || initialState();

function initialState() {
  return {
    movements: [], roots: [], nodes: {}, nodeOrder: [],
    nextNodeId: 1, nextMovId: 1, activePath: [],
    treeViewMode: 'path', merges: [], comboVideos: {},
    concepts: [], nextConceptId: 1,
    comboDescriptions: {}, comboDescriptionSegments: {},
    currentView: 'tree', navPinned: true,
    collapsedNodes: []
  };
}
function normalizeCollapsedNodes(data) {
  const nodes = data.nodes || {};
  data.collapsedNodes = Array.isArray(data.collapsedNodes)
    ? data.collapsedNodes.filter(id => nodes[id])
    : [];
}
function normalizeComboVideos(data) {
  if (!data.comboVideos || typeof data.comboVideos !== 'object') {
    data.comboVideos = {};
    return;
  }
  Object.keys(data.comboVideos).forEach(key => {
    const v = data.comboVideos[key];
    if (typeof v === 'string') data.comboVideos[key] = [v];
    else if (Array.isArray(v)) data.comboVideos[key] = v.filter(x => typeof x === 'string');
    else delete data.comboVideos[key];
  });
}
function normalizePreparations(data) {
  if (!data.nodes || typeof data.nodes !== 'object') return;
  Object.keys(data.nodes).forEach(id => {
    const n = data.nodes[id];
    if (!n || typeof n !== 'object') return;
    if (n.preparation === undefined) {
      n.preparation = null;
      return;
    }
    if (n.preparation === null) return;
    // id движений — числа (nextMovId++); строки допускаем для старых/ручных файлов
    const pmid = n.preparation && n.preparation.movementId;
    if (typeof n.preparation !== 'object'
      || !((typeof pmid === 'number' && pmid > 0) || (typeof pmid === 'string' && pmid))) {
      n.preparation = null;
      return;
    }
    n.preparation = { movementId: n.preparation.movementId };
  });
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.merges) data.merges = [];
    normalizeComboVideos(data);
    if (!Array.isArray(data.concepts)) data.concepts = [];
    if (!data.nextConceptId) data.nextConceptId = 1;
    if (!data.comboDescriptions || typeof data.comboDescriptions !== 'object') data.comboDescriptions = {};
    if (!data.comboDescriptionSegments || typeof data.comboDescriptionSegments !== 'object') data.comboDescriptionSegments = {};
    if (!data.currentView) data.currentView = 'tree';
    if (typeof data.navPinned !== 'boolean') data.navPinned = true;
    normalizePreparations(data);
    normalizeCollapsedNodes(data);
    return data;
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
function setView(view) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + view);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });
  saveState();
  if (view === 'tree') renderTree();
  else if (view === 'combos') renderCombos();
  else if (view === 'generator') renderGenerator();
  else if (view === 'library') renderMovements();
  else if (view === 'dictionary') renderDictionary();
}