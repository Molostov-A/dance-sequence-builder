let state = loadState() || initialState();

function initialState() {
  return {
    movements: [], roots: [], nodes: {}, nodeOrder: [],
    nextNodeId: 1, nextMovId: 1, activePath: [],
    treeViewMode: 'path', merges: [], comboVideos: {},
    concepts: [], nextConceptId: 1,
    comboDescriptions: {}, comboDescriptionSegments: {},
    currentView: 'tree'
  };
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
  document.getElementById('navMenu').classList.remove('open');
  saveState();
  if (view === 'tree') renderTree();
  else if (view === 'combos') renderCombos();
  else if (view === 'generator') renderGenerator();
  else if (view === 'library') renderMovements();
  else if (view === 'dictionary') renderDictionary();
}