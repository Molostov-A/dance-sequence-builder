let activeStorageKey = STORAGE_KEY;
let state = loadState() || initialState();
let stateSaveSuspended = false;

function isStateRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function validStateId(value) { return Number.isSafeInteger(value) && value > 0; }
function normalizeCurrentView(view) {
  return ['tree', 'library', 'preps', 'combos', 'generator', 'dictionary'].includes(view) ? view : 'tree';
}
// Только чистые проверки и миграции: этот путь используется при ранней
// загрузке state.js, когда beat.js и функции интерфейса ещё не объявлены.
function prepareState(data) {
  if (!isStateRecord(data) || !Array.isArray(data.movements)
    || !isStateRecord(data.nodes) || !Array.isArray(data.roots)) {
    throw new Error('Ожидаются массивы movements, roots и объект nodes.');
  }
  const checkSegments = (item, fields) => fields.forEach(field => {
    if (item[field] === undefined || item[field] === null) return;
    if (!Array.isArray(item[field]) || item[field].some(s => !isStateRecord(s)
      || (s.text !== undefined && typeof s.text !== 'string')
      || (s.conceptId !== undefined && typeof s.conceptId !== 'string'))) {
      throw new Error('Некорректные текстовые сегменты: ' + field);
    }
  });
  const checkLibrary = (list, label) => {
    const ids = new Set(), names = new Set();
    list.forEach(m => {
      if (!isStateRecord(m) || !validStateId(m.id) || typeof m.name !== 'string' || !m.name.trim()) {
        throw new Error('Некорректная запись библиотеки: ' + label);
      }
      const name = m.name.trim().toLowerCase();
      if (ids.has(m.id) || names.has(name)) throw new Error('Повтор ID или названия: ' + label);
      ids.add(m.id); names.add(name);
      ['lead', 'follow'].forEach(field => {
        if (m[field] === undefined || m[field] === null) m[field] = '';
        if (typeof m[field] !== 'string') throw new Error('Некорректное поле ' + field);
      });
      checkSegments(m, ['nameSegments', 'leadSegments', 'followSegments']);
    });
    return ids;
  };
  const movementIds = checkLibrary(data.movements, 'движения');
  const nodes = Object.values(data.nodes);
  Object.keys(data.nodes).forEach(key => {
    const n = data.nodes[key];
    if (!isStateRecord(n) || !validStateId(n.id) || String(n.id) !== key
      || !movementIds.has(n.movementId) || !validStateId(n.beat) || !validStateId(n.length)
      || (n.parentId !== null && !validStateId(n.parentId))) {
      throw new Error('Некорректный узел: ' + key);
    }
  });
  // Цвета обхода исключают циклы без рекурсии и повторных обходов длинных веток.
  const done = new Set();
  nodes.forEach(n => {
    const path = new Set();
    let cur = n;
    while (cur && !done.has(cur.id)) {
      if (path.has(cur.id)) throw new Error('Цикл родителей в дереве.');
      path.add(cur.id);
      if (cur.parentId === null) break;
      cur = data.nodes[cur.parentId];
      if (!cur) throw new Error('У узла отсутствует родитель.');
    }
    path.forEach(id => done.add(id));
  });
  const order = Array.isArray(data.nodeOrder) ? data.nodeOrder : [];
  data.nodeOrder = Array.from(new Set(order.filter(id => validStateId(id) && data.nodes[id])
    .concat(nodes.map(n => n.id))));
  data.roots = Array.from(new Set(data.roots.filter(id => validStateId(id) && data.nodes[id] && data.nodes[id].parentId === null)
    .concat(data.nodeOrder.filter(id => data.nodes[id].parentId === null))));
  const nextId = (value, ids) => {
    const max = ids.reduce((a, id) => Math.max(a, id), 0);
    return validStateId(value) && value > max ? value : max + 1;
  };
  data.nextNodeId = nextId(data.nextNodeId, nodes.map(n => n.id));
  data.nextMovId = nextId(data.nextMovId, data.movements.map(m => m.id));
  const active = Array.isArray(data.activePath) ? data.activePath : [];
  data.activePath = active.every((id, i) => data.nodes[id]
    && (i === 0 ? data.roots.includes(id) : data.nodes[id].parentId === active[i - 1])) ? active : [];
  if (Array.isArray(data.merges)) {
    const from = new Set();
    data.merges = data.merges.filter(m => {
      if (!isStateRecord(m) || !validStateId(m.from) || !validStateId(m.to)
        || !data.nodes[m.from] || !data.nodes[m.to] || m.from === m.to || from.has(m.from)) return false;
      from.add(m.from); return true;
    });
  } else data.merges = [];
  normalizeComboVideos(data);
  if (!Array.isArray(data.concepts)) data.concepts = [];
  const conceptIds = new Set();
  data.concepts.forEach(c => {
    if (!isStateRecord(c) || typeof c.id !== 'string' || !/^w[1-9]\d*$/.test(c.id)
      || conceptIds.has(c.id) || typeof c.short !== 'string' || !c.short.trim()) {
      throw new Error('Некорректная запись словаря.');
    }
    conceptIds.add(c.id);
    c.names = Array.isArray(c.names) ? c.names.filter(n => typeof n === 'string') : [];
    c.definition = typeof c.definition === 'string' ? c.definition : '';
    c.media = Array.isArray(c.media) ? c.media.filter(m => isStateRecord(m) && typeof m.url === 'string') : [];
    checkSegments(c, ['definitionSegments']);
  });
  data.nextConceptId = nextId(data.nextConceptId, data.concepts.map(c => Number(c.id.slice(1))));
  ['comboDescriptions', 'comboDescriptionSegments', 'comboFolderLinks'].forEach(field => {
    if (!isStateRecord(data[field])) data[field] = {};
  });
  Object.values(data.comboDescriptionSegments).forEach(segments => checkSegments({ segments }, ['segments']));
  data.currentView = normalizeCurrentView(data.currentView);
  if (!['path', 'all'].includes(data.treeViewMode)) data.treeViewMode = 'path';
  if (typeof data.navPinned !== 'boolean') data.navPinned = true;
  normalizePreps(data);
  checkLibrary(data.preps, 'препы');
  normalizeCollapsedNodes(data);
  normalizeComboFolders(data);
  normalizeTreePins(data);
  return data;
}

function initialState() {
  return {
    movements: [], roots: [], nodes: {}, nodeOrder: [],
    nextNodeId: 1, nextMovId: 1, activePath: [],
    treeViewMode: 'path', merges: [], comboVideos: {},
    concepts: [], nextConceptId: 1,
    comboDescriptions: {}, comboDescriptionSegments: {},
    currentView: 'tree', navPinned: true,
    collapsedNodes: [],
    preps: [], nextPrepId: 1,
    comboFolders: [], nextComboFolderId: 1, comboFolderLinks: {}, collapsedComboFolders: [],
    treePins: { nodes: {}, buses: {}, preps: {}, links: {} }, collapsedPrepLinks: [],
    looseCombosCollapsed: false,
    treeHighlight: { folderId: null, color: '#e67e22' }
  };
}
// Папки комбинаций: битые записи отбрасываются, родитель, которого нет
// (или который замкнул бы цикл), сбрасывается в корень.
function normalizeComboFolders(data) {
  if (!Array.isArray(data.comboFolders)) data.comboFolders = [];
  data.comboFolders = data.comboFolders
    .filter(f => f && typeof f === 'object' && f.id && typeof f.name === 'string')
    .map(f => ({ id: f.id, name: f.name, parentId: f.parentId || null }));
  const byId = new Map(data.comboFolders.map(f => [f.id, f]));
  data.comboFolders.forEach(f => {
    if (f.parentId && !byId.has(f.parentId)) f.parentId = null;
    const seen = new Set([f.id]);
    let cur = f.parentId ? byId.get(f.parentId) : null;
    while (cur) {
      if (seen.has(cur.id)) { f.parentId = null; break; }
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }
  });
  const maxId = Math.max(0, ...data.comboFolders.map(f => Number(f.id) || 0));
  if (!data.nextComboFolderId || data.nextComboFolderId <= maxId) data.nextComboFolderId = maxId + 1;
  const links = data.comboFolderLinks && typeof data.comboFolderLinks === 'object' ? data.comboFolderLinks : {};
  Object.keys(links).forEach(key => {
    const ids = Array.isArray(links[key]) ? Array.from(new Set(links[key].filter(id => byId.has(id)))) : [];
    if (ids.length) links[key] = ids; else delete links[key];
  });
  data.comboFolderLinks = links;
  data.collapsedComboFolders = Array.isArray(data.collapsedComboFolders)
    ? data.collapsedComboFolders.filter(id => byId.has(id))
    : [];
  // Подсветка папки в дереве: папка может пропасть, цвет — только #rrggbb
  const hl = data.treeHighlight && typeof data.treeHighlight === 'object' ? data.treeHighlight : {};
  data.treeHighlight = {
    folderId: byId.has(hl.folderId) ? hl.folderId : null,
    color: /^#[0-9a-f]{6}$/i.test(hl.color || '') ? hl.color : '#e67e22'
  };
}
function normalizeCollapsedNodes(data) {
  const nodes = data.nodes || {};
  data.collapsedNodes = Array.isArray(data.collapsedNodes)
    ? data.collapsedNodes.filter(id => nodes[id])
    : [];
}
// Ручные закрепления и свёрнутые препы (см. treePins.js). Функция живёт
// здесь, а не в treePins.js: loadState() выполняется при загрузке этого файла,
// когда следующие скрипты ещё не подключены.
function normalizeTreePins(data) {
  const nodes = data.nodes || {};
  const pins = data.treePins && typeof data.treePins === 'object' ? data.treePins : {};
  const num = v => typeof v === 'number' && isFinite(v);
  const clean = (map, valid, check) => {
    const out = {};
    Object.keys(map && typeof map === 'object' ? map : {}).forEach(k => {
      const v = map[k];
      if (valid(k) && v && check(v)) out[k] = v;
    });
    return out;
  };
  // Группа препа существует, пока у родителя есть ребёнок с этим препом
  const prepGroupExists = (key) => {
    const [pid, prepId] = key.split(':').map(Number);
    return !!nodes[pid] && Object.keys(nodes).some(id => nodes[id].parentId === pid && nodes[id].prepId === prepId);
  };
  // Ключ связи: 'c:<id ребёнка>' — линия к ребёнку (от родителя или от блока
  // его препа); 'p:<id родителя>:<id препа>' — линия от родителя к блоку препа.
  const linkExists = (key) => {
    const parts = key.split(':');
    if (parts[0] === 'c') {
      const n = nodes[parts[1]];
      return !!n && n.parentId !== null && n.parentId !== undefined;
    }
    return parts[0] === 'p' && prepGroupExists(parts[1] + ':' + parts[2]);
  };
  const linkValid = v => (v.shape === 'bus' && num(v.ex))
    || (v.shape === 'curve' && num(v.hx) && num(v.hy));
  data.treePins = {
    nodes: clean(pins.nodes, k => !!nodes[k], v => num(v.dx) && num(v.dy)),
    buses: clean(pins.buses, k => !!nodes[k], v => num(v.dx)),
    preps: clean(pins.preps, prepGroupExists, v => num(v.dx) && num(v.dy)),
    links: clean(pins.links, linkExists, linkValid)
  };
  data.collapsedPrepLinks = Array.isArray(data.collapsedPrepLinks)
    ? data.collapsedPrepLinks.filter(k => typeof k === 'string' && prepGroupExists(k))
    : [];
}

function normalizeComboVideos(data) {
  if (!isStateRecord(data.comboVideos)) {
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
function showStorageError(failed) {
  const banner = document.getElementById('storageBanner');
  if (banner) banner.classList.toggle('hidden', !failed);
}
function saveState() {
  if (stateSaveSuspended) return true;
  try {
    localStorage.setItem(activeStorageKey, JSON.stringify(state));
  } catch (e) {
    showStorageError(true);
    return false;
  }
  showStorageError(false);
  // Сбой постановки облачной записи в очередь не меняет результат уже
  // успешной локальной записи и не должен ломать транзакцию импорта.
  try { if (typeof onDriveStateSaved === 'function') onDriveStateSaved(); }
  catch (e) { console.error('Не удалось запланировать облачное сохранение', e); }
  try { if (typeof onAccountStateSaved === 'function') onAccountStateSaved(); }
  catch (e) { console.error('Не удалось запланировать серверное сохранение', e); }
  return true;
}
function loadState() {
  try {
    const raw = localStorage.getItem(activeStorageKey);
    if (!raw) return null;
    return prepareState(JSON.parse(raw));
  } catch (e) {
    // Не теряем данные молча: сохраняем нечитаемую копию рядом и пишем в консоль.
    // Иначе первое же saveState() затёрло бы их пустым состоянием.
    console.error('Не удалось загрузить сохранённые данные', e);
    try {
      const raw = localStorage.getItem(activeStorageKey);
      if (raw) localStorage.setItem(activeStorageKey + '-broken-' + Date.now(), raw);
    } catch (e2) {}
    return null;
  }
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
  view = normalizeCurrentView(view);
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
