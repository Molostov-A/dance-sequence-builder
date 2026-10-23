function getConcept(id) { return state.concepts.find(c => c.id === id); }
function findConceptByShort(short) {
  const s = (short || '').trim().toLowerCase();
  return state.concepts.find(c => (c.short || '').toLowerCase() === s);
}
function newConceptId() { return 'w' + (state.nextConceptId++); }
function conceptTextFromSegments(segments) {
  return (segments || []).map(s => {
    if (s.conceptId) { const c = getConcept(s.conceptId); return c ? c.short : (s.text || ''); }
    return s.text || '';
  }).join('');
}

function collectConceptUsage(conceptId) {
  const out = [];
  state.movements.forEach(mov => {
    if ((mov.nameSegments || []).some(s => s.conceptId === conceptId)) out.push(`Движение «${mov.name}» — название`);
    if ((mov.leadSegments || []).some(s => s.conceptId === conceptId)) out.push(`Движение «${mov.name}» — лид`);
    if ((mov.followSegments || []).some(s => s.conceptId === conceptId)) out.push(`Движение «${mov.name}» — фоллоу`);
  });
  state.concepts.forEach(c => {
    if (c.id === conceptId) return;
    if ((c.definitionSegments || []).some(s => s.conceptId === conceptId)) out.push(`Понятие «${c.short}» — определение`);
  });
  return out;
}

function replaceConceptReferences(oldId, repl) {
  const replaceIn = (segments) => {
    if (!segments) return segments;
    return segments.map(s => s.conceptId === oldId ? Object.assign({}, repl) : s);
  };
  state.movements.forEach(mov => {
    mov.nameSegments = replaceIn(mov.nameSegments);
    mov.leadSegments = replaceIn(mov.leadSegments);
    mov.followSegments = replaceIn(mov.followSegments);
    if (mov.nameSegments) mov.name = conceptTextFromSegments(mov.nameSegments);
    if (mov.leadSegments) mov.lead = conceptTextFromSegments(mov.leadSegments);
    if (mov.followSegments) mov.follow = conceptTextFromSegments(mov.followSegments);
  });
  state.concepts.forEach(c => {
    c.definitionSegments = replaceIn(c.definitionSegments);
    if (c.definitionSegments) c.definition = conceptTextFromSegments(c.definitionSegments);
  });
}

function pruneMentions() {
  const clean = (segments) => {
    if (!segments) return segments;
    return segments.filter(s => !s.conceptId || getConcept(s.conceptId)).map(s => {
      if (s.conceptId && !getConcept(s.conceptId)) return { text: '' };
      return s;
    });
  };
  state.movements.forEach(mov => {
    mov.nameSegments = clean(mov.nameSegments);
    mov.leadSegments = clean(mov.leadSegments);
    mov.followSegments = clean(mov.followSegments);
    if (mov.nameSegments) mov.name = conceptTextFromSegments(mov.nameSegments);
    if (mov.leadSegments) mov.lead = conceptTextFromSegments(mov.leadSegments);
    if (mov.followSegments) mov.follow = conceptTextFromSegments(mov.followSegments);
  });
  state.concepts.forEach(c => {
    c.definitionSegments = clean(c.definitionSegments);
    if (c.definitionSegments) c.definition = conceptTextFromSegments(c.definitionSegments);
  });
}

function renderDictionary() {
  const ul = document.getElementById('conceptList');
  ul.innerHTML = '';
  document.getElementById('dictCount').textContent = state.concepts.length ? `(${state.concepts.length})` : '';
  if (state.concepts.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-hint';
    li.textContent = 'Пока пусто';
    ul.appendChild(li);
    return;
  }
  state.concepts.forEach(c => {
    const li = document.createElement('li');
    const usage = collectConceptUsage(c.id).length;
    li.onclick = () => openConceptModal({ conceptId: c.id });
    const shortSpan = document.createElement('span');
    shortSpan.className = 'concept-short';
    shortSpan.textContent = c.short;
    const namesSpan = document.createElement('span');
    namesSpan.className = 'concept-names';
    namesSpan.textContent = (c.names || []).join(' · ');
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = usage > 0 ? usage + ' uses' : '0';
    if (usage > 0) count.classList.add('used');
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'icon-btn';
    editBtn.title = 'Редактировать';
    editBtn.textContent = '✎';
    editBtn.onclick = (e) => { e.stopPropagation(); openConceptModal({ conceptId: c.id }); };
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'icon-btn danger';
    delBtn.title = 'Удалить';
    delBtn.textContent = '✕';
    delBtn.onclick = (e) => { e.stopPropagation(); deleteConcept(c.id); };
    li.append(shortSpan, namesSpan, count, editBtn, delBtn);
    ul.appendChild(li);
  });
}

let conceptModalState = null;
let conceptModalFocus = null;
let conceptModalNames = [];
let conceptModalMedia = [];

function openConceptModal(opts) {
  const c = opts && opts.conceptId ? getConcept(opts.conceptId) : null;
  conceptModalState = { conceptId: c ? c.id : null };
  conceptModalFocus = document.activeElement;
  conceptModalNames = c ? (c.names || []).slice() : [];
  conceptModalMedia = c ? (c.media || []).map(m => ({ type: m.type, url: m.url, label: m.label })) : [];
  document.getElementById('conceptModalTitle').textContent = c ? 'Редактировать понятие' : 'Новое понятие';
  document.getElementById('conceptModalHint').textContent = c ? `Понятие #${c.id}` : 'Заполните данные понятия.';
  document.getElementById('conceptShortInput').value = c ? c.short : '';
  setMentionText(document.getElementById('conceptDefinitionInput'), c ? (c.definitionSegments || c.definition) : '');
  document.getElementById('conceptModalError').textContent = '';
  renderConceptNamesList();
  renderConceptMediaList();
  document.getElementById('conceptModal').classList.add('open');
  document.getElementById('conceptShortInput').focus();
}

function closeConceptModal() {
  document.getElementById('conceptModal').classList.remove('open');
  conceptModalState = null;
  if (conceptModalFocus && document.contains(conceptModalFocus)) conceptModalFocus.focus();
  conceptModalFocus = null;
}

function renderConceptNamesList() {
  const list = document.getElementById('conceptNamesList');
  list.innerHTML = '';
  conceptModalNames.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'concept-name-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = name;
    input.placeholder = 'Вариант полного названия';
    input.oninput = () => { conceptModalNames[i] = input.value; };
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn danger';
    del.textContent = '✕';
    del.title = 'Удалить вариант';
    del.onclick = () => { conceptModalNames.splice(i, 1); renderConceptNamesList(); };
    row.append(input, del);
    list.appendChild(row);
  });
}

function addConceptName() {
  conceptModalNames.push('');
  renderConceptNamesList();
  const inputs = document.querySelectorAll('#conceptNamesList .concept-name-row input');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function renderConceptMediaList() {
  const list = document.getElementById('conceptMediaList');
  list.innerHTML = '';
  conceptModalMedia.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'concept-media-row';
    const typeSel = document.createElement('select');
    typeSel.className = 'concept-media-type';
    const ov = document.createElement('option');
    ov.value = 'video'; ov.textContent = 'Видео';
    const oi = document.createElement('option');
    oi.value = 'image'; oi.textContent = 'Картинка';
    typeSel.append(ov, oi);
    typeSel.value = m.type || 'video';
    typeSel.onchange = () => { conceptModalMedia[i].type = typeSel.value; };
    const url = document.createElement('input');
    url.type = 'url';
    url.className = 'concept-media-url';
    url.value = m.url || '';
    url.placeholder = 'Ссылка (YouTube / Google Drive)';
    url.oninput = () => { conceptModalMedia[i].url = url.value; };
    const label = document.createElement('input');
    label.type = 'text';
    label.className = 'concept-media-label';
    label.value = m.label || '';
    label.placeholder = 'Подпись';
    label.oninput = () => { conceptModalMedia[i].label = label.value; };
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn danger';
    del.textContent = '✕';
    del.title = 'Удалить медиа';
    del.onclick = () => { conceptModalMedia.splice(i, 1); renderConceptMediaList(); };
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'icon-btn';
    preview.textContent = '▶';
    preview.title = 'Открыть';
    preview.onclick = () => {
      const cur = conceptModalMedia[i];
      if (!cur || !cur.url) return;
      openMediaModal(cur.url, cur.type, cur.label);
    };
    row.append(typeSel, url, label, preview, del);
    list.appendChild(row);
  });
}

function addConceptMedia() {
  conceptModalMedia.push({ type: 'video', url: '', label: '' });
  renderConceptMediaList();
}

function saveConceptModal() {
  const shortInput = document.getElementById('conceptShortInput');
  const errorEl = document.getElementById('conceptModalError');
  const short = shortInput.value.trim();
  if (!short) {
    errorEl.textContent = 'Введите сокращённое наименование.';
    shortInput.focus();
    return;
  }
  const id = conceptModalState.conceptId;
  const dup = findConceptByShort(short);
  if (dup && (!id || dup.id !== id)) {
    errorEl.textContent = 'Такое сокращение уже используется.';
    shortInput.focus();
    shortInput.select();
    return;
  }

  const names = [];
  document.querySelectorAll('#conceptNamesList .concept-name-row input').forEach(input => {
    const v = input.value.trim();
    if (v) names.push(v);
  });
  const definitionInput = document.getElementById('conceptDefinitionInput');
  const definition = mentionText(definitionInput);
  const definitionSegments = mentionSegments(definitionInput);
  const media = [];
  document.querySelectorAll('#conceptMediaList .concept-media-row').forEach(row => {
    const type = row.querySelector('.concept-media-type').value;
    const url = row.querySelector('.concept-media-url').value.trim();
    const label = row.querySelector('.concept-media-label').value.trim();
    if (url) media.push({ type, url, label });
  });

  errorEl.textContent = '';
  if (id) {
    const c = getConcept(id);
    c.short = short;
    c.names = names;
    c.definition = definition;
    c.definitionSegments = definitionSegments;
    c.media = media;
  } else {
    state.concepts.push({ id: newConceptId(), short, names, definition, definitionSegments, media });
  }
  saveState();
  render();
  closeConceptModal();
}

function deleteConcept(id) {
  const c = getConcept(id);
  if (!c) return;
  const usage = collectConceptUsage(id);
  if (usage.length === 0) {
    if (!confirm(`Удалить понятие «${c.short}»?`)) return;
    state.concepts = state.concepts.filter(x => x.id !== id);
    saveState(); render();
    return;
  }
  openConceptDeleteModal(c, usage);
}

let conceptDeleteState = null;

function openConceptDeleteModal(c, usage) {
  conceptDeleteState = { conceptId: c.id };
  document.getElementById('conceptDeleteTitle').textContent = `Удалить понятие «${c.short}»`;
  document.getElementById('conceptDeleteHint').textContent = 'Понятие используется в этих местах:';
  const ul = document.getElementById('conceptDeleteUsage');
  ul.innerHTML = '';
  usage.forEach(label => {
    const li = document.createElement('li');
    li.textContent = label;
    ul.appendChild(li);
  });
  const conceptSel = document.getElementById('conceptReplaceConcept');
  conceptSel.innerHTML = '';
  state.concepts.forEach(x => {
    if (x.id === c.id) return;
    const opt = document.createElement('option');
    opt.value = x.id;
    opt.textContent = `${x.short} — ${(x.names || [])[0] || ''}`;
    conceptSel.appendChild(opt);
  });
  document.getElementById('conceptDeleteStep1').classList.remove('hidden');
  document.getElementById('conceptDeleteStep2').classList.add('hidden');
  document.getElementById('conceptReplaceKind').value = 'concept';
  document.getElementById('conceptReplaceText').value = '';
  updateConceptReplaceKind();
  document.getElementById('conceptDeleteModal').classList.add('open');
}

function closeConceptDeleteModal() {
  document.getElementById('conceptDeleteModal').classList.remove('open');
  conceptDeleteState = null;
}

function confirmConceptDelete() {
  document.getElementById('conceptDeleteStep1').classList.add('hidden');
  document.getElementById('conceptDeleteStep2').classList.remove('hidden');
}

function updateConceptReplaceKind() {
  const kind = document.getElementById('conceptReplaceKind').value;
  document.getElementById('conceptReplaceConcept').classList.toggle('hidden', kind !== 'concept');
  document.getElementById('conceptReplaceText').classList.toggle('hidden', kind !== 'text');
}

function replaceAndDeleteConcept() {
  if (!conceptDeleteState) return;
  const id = conceptDeleteState.conceptId;
  const kind = document.getElementById('conceptReplaceKind').value;
  let repl;
  if (kind === 'concept') {
    const newId = document.getElementById('conceptReplaceConcept').value;
    if (!newId) return;
    repl = { conceptId: newId };
  } else {
    repl = { text: document.getElementById('conceptReplaceText').value };
  }
  replaceConceptReferences(id, repl);
  state.concepts = state.concepts.filter(c => c.id !== id);
  closeConceptDeleteModal();
  saveState(); render();
}
