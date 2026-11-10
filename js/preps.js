/* =========================================================
   ПРЕПЫ — отдельная библиотека переходных мостиков.
   Преп стоит на линии родитель → узел (node.prepId у ребёнка), счётов не
   занимает. Из одного движения может выходить несколько продолжений за
   одним и тем же препом — в дереве они рисуются за общим блоком препа.
   ========================================================= */
function getPrep(id) { return (state.preps || []).find(p => p.id === id); }

function addPrep(name, lead, follow, segments) {
  if (!name) return null;
  if (!state.preps) state.preps = [];
  const existing = state.preps.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  if (!state.nextPrepId) state.nextPrepId = 1;
  const id = state.nextPrepId++;
  const prep = { id, name, lead: lead || '', follow: follow || '' };
  if (segments) {
    if (segments.name) prep.nameSegments = segments.name;
    if (segments.lead) prep.leadSegments = segments.lead;
    if (segments.follow) prep.followSegments = segments.follow;
  }
  state.preps.push(prep);
  saveState(); render();
  return id;
}

function addPrepFromInput() {
  const input = document.getElementById('newPrepInput');
  const name = mentionText(input).trim();
  if (!name) return;
  addPrep(name, '', '', { name: mentionSegments(input) });
  setMentionText(input, '');
}

function prepUsageCount(id) {
  return Object.values(state.nodes).filter(n => n.prepId === id).length;
}

function deletePrep(id) {
  const usage = prepUsageCount(id);
  if (usage > 0 && !confirm(`Преп стоит на ${usage} лини(ях) дерева. Удалить и убрать с линий?`)) return;
  Object.values(state.nodes).forEach(n => { if (n.prepId === id) n.prepId = null; });
  state.preps = state.preps.filter(p => p.id !== id);
  if (openFormState && openFormState.prepId === id) openFormState.prepId = null;
  saveState(); render();
}

// Преп на входящей линии узла. Корень входящей линии не имеет.
function setNodePrep(nodeId, prepId) {
  const node = state.nodes[nodeId];
  if (!node || node.parentId === null) return;
  node.prepId = prepId || null;
  saveState(); render();
}

/* Выбор препа из библиотеки с возможностью создать новый.
   onPick(prepId | null) — null означает «без препа». */
function openPrepPicker(opts) {
  const o = opts || {};
  openLibraryPicker({
    title: o.title || 'Преп на линии',
    hint: o.hint || 'Преп — переходный мостик между движениями, счётов не занимает.',
    placeholder: 'Поиск по препам или название нового препа',
    items: (state.preps || []).map(p => ({ id: p.id, text: p.name, segments: nameSegmentsOf(p) })),
    currentId: o.currentId || null,
    emptyText: 'Библиотека препов пуста',
    onPick: (id) => o.onPick(id),
    noneLabel: 'Без препа',
    onNone: o.currentId ? () => o.onPick(null) : null,
    createLabel: 'преп',
    onCreate: (text) => {
      openMovementModal({
        kind: 'prep',
        text,
        onSaved: (draft) => {
          const id = addPrep(draft.name, draft.lead, draft.follow, {
            name: draft.nameSegments, lead: draft.leadSegments, follow: draft.followSegments
          });
          o.onPick(id);
        }
      });
    }
  });
}

function openNodePrepPicker(nodeId) {
  const node = state.nodes[nodeId];
  if (!node || node.parentId === null) return;
  const parent = state.nodes[node.parentId];
  const mov = getMovement(node.movementId);
  const pmov = parent ? getMovement(parent.movementId) : null;
  openPrepPicker({
    hint: `Линия: ${pmov ? pmov.name : '???'} → ${mov ? mov.name : '???'}`,
    currentId: node.prepId,
    onPick: (prepId) => setNodePrep(nodeId, prepId)
  });
}

function renderPreps() {
  const ul = document.getElementById('prepList');
  if (!ul) return;
  ul.innerHTML = '';
  const preps = state.preps || [];
  document.getElementById('prepCount').textContent = preps.length ? `(${preps.length})` : '';
  if (preps.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-hint';
    li.textContent = 'Пока пусто. Препы можно добавлять здесь или прямо в дереве — кнопкой ‖ на карточке или в форме продолжения.';
    ul.appendChild(li);
    return;
  }
  preps.forEach(p => {
    const li = document.createElement('li');
    const notes = movementNotes(p);
    li.title = notes ? `${notes}\n\nОткрыть преп` : 'Открыть преп';
    li.onclick = () => openMovementModal({ kind: 'prep', prepId: p.id });
    const idSpan = document.createElement('span');
    idSpan.className = 'mov-id'; idSpan.textContent = '#' + p.id;
    const name = document.createElement('span');
    name.className = 'name';
    renderRichText(nameSegmentsOf(p), name);
    const usage = prepUsageCount(p.id);
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = usage > 0 ? usage + ' лин.' : '0';
    count.title = 'На скольких линиях дерева стоит преп';
    if (usage > 0) count.classList.add('used');
    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn'; editBtn.title = 'Редактировать'; editBtn.textContent = '✎';
    editBtn.onclick = (e) => { e.stopPropagation(); openMovementModal({ kind: 'prep', prepId: p.id }); };
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger'; delBtn.title = 'Удалить'; delBtn.textContent = '✕';
    delBtn.onclick = (e) => { e.stopPropagation(); deletePrep(p.id); };
    li.append(idSpan, name, count, editBtn, delBtn);
    ul.appendChild(li);
  });
}
