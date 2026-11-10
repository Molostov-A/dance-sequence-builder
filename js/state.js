let state = loadState() || initialState();

function initialState() {
  return {
    movements: [], roots: [], nodes: {}, nodeOrder: [],
    nextNodeId: 1, nextMovId: 1, activePath: [],
    treeViewMode: 'path', merges: [], comboVideos: {},
    concepts: [], nextConceptId: 1,
    comboDescriptions: {}, comboDescriptionSegments: {},
    currentView: 'tree', navPinned: true,
    collapsedNodes: [],
    preps: [], nextPrepId: 1
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
/* Препы — отдельная библиотека (state.preps). Преп стоит на ЛИНИИ
   родитель → узел и хранится в узле-ребёнке как node.prepId: в дереве у узла
   ровно одна входящая линия, поэтому это и есть преп этой линии. Счётов
   преп не занимает. Дети с одинаковым prepId рисуются за одним блоком препа.

   Старый формат: node.preparation = { movementId } — подготовка, висящая
   на самом узле. Такой преп копируется из библиотеки движений в библиотеку
   препов (по имени, без дублей) и переносится на все ИСХОДЯЩИЕ линии узла —
   то есть на детей, у которых своего препа ещё нет. У листа исходящих линий
   нет, его старая подготовка теряется. */
function normalizePreps(data) {
  if (!Array.isArray(data.preps)) data.preps = [];
  data.preps = data.preps.filter(p => p && typeof p === 'object' && p.id && typeof p.name === 'string');
  const maxPrepId = Math.max(0, ...data.preps.map(p => Number(p.id) || 0));
  if (!data.nextPrepId || data.nextPrepId <= maxPrepId) data.nextPrepId = maxPrepId + 1;
  const nodes = data.nodes && typeof data.nodes === 'object' ? data.nodes : {};
  const movements = Array.isArray(data.movements) ? data.movements : [];
  const nodeList = Object.keys(nodes).map(id => nodes[id]).filter(n => n && typeof n === 'object');

  const prepFromMovement = (movementId) => {
    const mov = movements.find(m => m.id === movementId || String(m.id) === String(movementId));
    if (!mov || !mov.name) return null;
    const existing = data.preps.find(p => p.name.toLowerCase() === mov.name.toLowerCase());
    if (existing) return existing.id;
    const prep = { id: data.nextPrepId++, name: mov.name, lead: mov.lead || '', follow: mov.follow || '' };
    if (mov.nameSegments) prep.nameSegments = mov.nameSegments;
    if (mov.leadSegments) prep.leadSegments = mov.leadSegments;
    if (mov.followSegments) prep.followSegments = mov.followSegments;
    data.preps.push(prep);
    return prep.id;
  };

  nodeList.forEach(n => {
    const old = n.preparation;
    delete n.preparation;
    if (!old || typeof old !== 'object' || old.movementId === undefined || old.movementId === null) return;
    const prepId = prepFromMovement(old.movementId);
    if (!prepId) return;
    nodeList.forEach(c => {
      if (c.parentId === n.id && !c.prepId) c.prepId = prepId;
    });
  });

  nodeList.forEach(n => {
    const valid = n.parentId !== null && n.parentId !== undefined
      && data.preps.some(p => p.id === n.prepId);
    if (!valid) n.prepId = null;
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
    normalizePreps(data);
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
  else if (view === 'preps') renderPreps();
  else if (view === 'dictionary') renderDictionary();
}