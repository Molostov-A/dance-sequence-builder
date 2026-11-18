// Поиск — временное состояние интерфейса, отдельно от библиотеки и её синхронизации.
let treeSearchQuery = [];
let treeSearchDraft = [];
let treeSearchContext = '';
let treeSearchIndex = 0;

/* Состояния графа: движение в узле и преп на входящей связи ребёнка.
   Движения в запросе соседствуют по дереву/merge, независимо от препов.
   Явный преп проверяет конкретный переход; два препа — соседние переходы.
   Обратный проход оставляет только состояния, из которых совпадает весь
   остаток запроса. Это не перебирает все пути и завершается даже при merge-
   циклах: каждый шаг обязательно продвигает позицию в запросе. */
function findTreeSearchMatches(query) {
  const result = { nodes: new Set(), preps: new Set(), links: new Set(), starts: [], reveal: new Set() };
  if (!query.length || query.length > 32) return result;
  const entries = new Map(), outgoing = new Map();
  Object.values(state.nodes).forEach(n => {
    entries.set('m:' + n.id, { kind: 'movement', id: n.movementId, node: n });
    outgoing.set(n.id, []);
    if (n.prepId && n.parentId !== null) entries.set('p:' + n.id, { kind: 'prep', id: n.prepId, node: n });
  });
  Object.values(state.nodes).forEach(n => {
    if (outgoing.has(n.parentId)) outgoing.get(n.parentId).push({ node: n, merge: false });
  });
  (state.merges || []).forEach(m => {
    if (outgoing.has(m.from) && state.nodes[m.to]) outgoing.get(m.from).push({ node: state.nodes[m.to], merge: true });
  });
  const transitions = (key, kind) => {
    const entry = entries.get(key);
    if (entry.kind === 'prep' && kind === 'movement') return [{ key: 'm:' + entry.node.id }];
    return outgoing.get(entry.node.id).filter(edge => kind === 'movement' || !edge.merge && edge.node.prepId)
      .map(edge => ({ key: (kind === 'prep' ? 'p:' : 'm:') + edge.node.id, edge, from: entry.node.id }));
  };
  const viable = query.map(() => new Set());
  for (let i = query.length - 1; i >= 0; i--) {
    entries.forEach((entry, key) => {
      if (entry.kind !== query[i].kind || entry.id !== query[i].id) return;
      if (i === query.length - 1 || transitions(key, query[i + 1].kind).some(t => viable[i + 1].has(t.key))) viable[i].add(key);
    });
  }
  const addPrep = n => {
    result.preps.add(prepLinkKey(n.parentId, n.prepId));
    result.links.add('p:' + n.parentId + ':' + n.prepId);
    result.links.add('c:' + n.id);
  };
  let frontier = viable[0];
  result.starts = [...frontier].map(key => entries.get(key).node.id);
  for (let i = 0; i < query.length; i++) {
    const next = new Set();
    frontier.forEach(key => {
      const entry = entries.get(key);
      result.reveal.add(entry.node.id);
      if (entry.kind === 'movement') result.nodes.add(entry.node.id); else addPrep(entry.node);
      if (i === query.length - 1) return;
      transitions(key, query[i + 1].kind).forEach(t => {
        if (!viable[i + 1].has(t.key)) return;
        next.add(t.key);
        if (t.edge) {
          if (t.edge.merge) result.links.add('m:' + t.from + ':' + t.edge.node.id);
          else {
            result.links.add('c:' + t.edge.node.id);
            if (t.edge.node.prepId) addPrep(t.edge.node);
          }
        }
      });
    });
    frontier = next;
  }
  return result;
}

function treeSearchLabel(step) {
  const item = step.kind === 'prep' ? getPrep(step.id) : getMovement(step.id);
  return (step.kind === 'prep' ? '‖ ' : '') + (item ? item.name : 'Удалено из библиотеки');
}

function openTreeSearch() {
  treeSearchContext = activeStorageKey;
  treeSearchDraft = treeSearchQuery.map(s => ({ ...s }));
  renderTreeSearchDraft();
  document.getElementById('treeSearchModal').classList.add('open');
  document.getElementById('btnSearchAddMovement').focus();
}
function closeTreeSearch() {
  document.getElementById('treeSearchModal').classList.remove('open');
  document.getElementById('btnTreeSearch').focus();
}
function renderTreeSearchDraft() {
  const list = document.getElementById('treeSearchSteps');
  list.replaceChildren();
  treeSearchDraft.forEach((step, i) => {
    const row = document.createElement('li');
    const name = document.createElement('span'); name.textContent = (i + 1) + '. ' + treeSearchLabel(step);
    row.appendChild(name);
    [['↑', -1], ['↓', 1], ['✕', 0]].forEach(([text, delta]) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.className = 'icon-btn';
      button.title = delta ? 'Переместить шаг ' + (delta < 0 ? 'выше' : 'ниже') : 'Убрать шаг';
      button.disabled = delta && (i + delta < 0 || i + delta >= treeSearchDraft.length);
      button.onclick = () => {
        if (!delta) treeSearchDraft.splice(i, 1);
        else [treeSearchDraft[i], treeSearchDraft[i + delta]] = [treeSearchDraft[i + delta], treeSearchDraft[i]];
        renderTreeSearchDraft();
      };
      row.appendChild(button);
    });
    list.appendChild(row);
  });
  document.getElementById('btnRunTreeSearch').disabled = !treeSearchDraft.length;
  document.getElementById('treeSearchEmpty').hidden = !!treeSearchDraft.length;
  ['Movement', 'Prep'].forEach(kind => { document.getElementById('btnSearchAdd' + kind).disabled = treeSearchDraft.length >= 32; });
}
function addTreeSearchStep(kind) {
  if (treeSearchDraft.length >= 32) return;
  openLibraryPicker({
    title: kind === 'prep' ? 'Выберите преп для поиска' : 'Выберите движение для поиска',
    items: (kind === 'prep' ? state.preps || [] : state.movements).map(m => ({ id: m.id, text: m.name, segments: nameSegmentsOf(m) })),
    treeSearch: true,
    onPick: id => {
      if (treeSearchContext !== activeStorageKey) return;
      treeSearchDraft.push({ kind, id }); renderTreeSearchDraft(); document.getElementById('btnRunTreeSearch').focus();
    }
  });
}

function runTreeSearch(query) {
  treeSearchQuery = query.map(s => ({ ...s }));
  treeSearchContext = activeStorageKey; treeSearchIndex = 0;
  const matches = findTreeSearchMatches(treeSearchQuery);
  // Совпадения в скрытых ветках также должны стать видимыми. Раскрываем
  // только их предков; ручные координаты и свёрнутые препы сохраняются.
  const ancestors = new Set();
  matches.reveal.forEach(id => pathToNode(id).slice(0, -1).forEach(a => ancestors.add(a)));
  state.collapsedNodes = (state.collapsedNodes || []).filter(id => !ancestors.has(id));
  state.treeViewMode = 'all'; state.currentView = 'tree';
  if (matches.starts.length) state.activePath = pathToNode(matches.starts[0]);
  closeForm(); saveState(); render();
  if (isNarrowScreen()) closeNav();
  focusTreeSearchResult();
}
function showTreeUsage(kind, id) { runTreeSearch([{ kind, id }]); }
function clearTreeSearch() {
  treeSearchQuery = []; treeSearchDraft = []; treeSearchIndex = 0;
  applyTreeSearchHighlights();
}
function focusTreeSearchResult(delta = 0) {
  const matches = findTreeSearchMatches(treeSearchQuery);
  if (!matches.starts.length) return;
  treeSearchIndex = (treeSearchIndex + delta + matches.starts.length) % matches.starts.length;
  const id = matches.starts[treeSearchIndex];
  setActiveNode(id);
  const el = document.querySelector('#nodesLayer [data-node-id="' + id + '"]');
  const wrap = document.getElementById('treeWrap');
  if (el) {
    wrap.scrollLeft = Math.max(0, parseFloat(el.style.left) - wrap.clientWidth / 2 + el.offsetWidth / 2);
    wrap.scrollTop = Math.max(0, parseFloat(el.style.top) - wrap.clientHeight / 2 + el.offsetHeight / 2);
  }
}
function applyTreeSearchHighlights() {
  if (treeSearchContext && treeSearchContext !== activeStorageKey) {
    treeSearchQuery = []; treeSearchDraft = []; treeSearchIndex = 0;
    treeSearchContext = activeStorageKey;
    document.getElementById('treeSearchModal').classList.remove('open');
    if (libraryPickerState && libraryPickerState.treeSearch) closeLibraryPicker();
  }
  const matches = findTreeSearchMatches(treeSearchQuery);
  const bar = document.getElementById('treeSearchBar');
  bar.hidden = !treeSearchQuery.length;
  document.getElementById('treeSearchSummary').textContent = treeSearchQuery.map(treeSearchLabel).join(' → ');
  document.getElementById('treeSearchCount').textContent = matches.starts.length
    ? `Мест: ${matches.starts.length} · ${Math.min(treeSearchIndex + 1, matches.starts.length)} из ${matches.starts.length}` : 'Совпадений нет';
  ['btnSearchPrev', 'btnSearchNext'].forEach(id => { document.getElementById(id).disabled = !matches.starts.length; });
  document.querySelectorAll('#nodesLayer [data-node-id]').forEach(el => el.classList.toggle('search-match', matches.nodes.has(Number(el.dataset.nodeId))));
  document.querySelectorAll('#nodesLayer [data-prep-parent]').forEach(el => el.classList.toggle('search-match',
    matches.preps.has(prepLinkKey(Number(el.dataset.prepParent), Number(el.dataset.prepId)))));
  const svg = document.getElementById('linesSvg');
  svg.querySelectorAll('.search-link').forEach(el => el.remove());
  svg.querySelectorAll('[data-link-key], [data-search-merge]').forEach(el => {
    if (!matches.links.has(el.dataset.linkKey || el.dataset.searchMerge)) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', el.getAttribute('d')); path.setAttribute('class', 'search-link'); svg.appendChild(path);
  });
}

document.getElementById('btnTreeSearch').onclick = openTreeSearch;
document.getElementById('btnCloseTreeSearch').onclick = closeTreeSearch;
document.getElementById('btnSearchAddMovement').onclick = () => addTreeSearchStep('movement');
document.getElementById('btnSearchAddPrep').onclick = () => addTreeSearchStep('prep');
document.getElementById('btnRunTreeSearch').onclick = () => { closeTreeSearch(); runTreeSearch(treeSearchDraft); };
document.getElementById('btnSearchPrev').onclick = () => focusTreeSearchResult(-1);
document.getElementById('btnSearchNext').onclick = () => focusTreeSearchResult(1);
document.getElementById('btnSearchEdit').onclick = openTreeSearch;
document.getElementById('btnSearchClear').onclick = clearTreeSearch;
document.getElementById('treeSearchModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeTreeSearch(); });
document.getElementById('treeSearchModal').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.stopPropagation(); closeTreeSearch(); }
});
