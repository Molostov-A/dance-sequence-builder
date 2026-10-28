function addMovementFromInput() {
  const input = document.getElementById('newMovInput');
  const segments = mentionSegments(input);
  const name = mentionText(input).trim();
  if (!name) return;
  addMovement(name, '', '', { name: segments });
  setMentionText(input, '');
}
function addMovement(name, lead, follow, segments) {
  if (!name) return null;
  const existing = state.movements.find(m => m.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const id = state.nextMovId++;
  const mov = { id, name, lead: lead || '', follow: follow || '' };
  if (segments) {
    if (segments.name) mov.nameSegments = segments.name;
    if (segments.lead) mov.leadSegments = segments.lead;
    if (segments.follow) mov.followSegments = segments.follow;
  }
  state.movements.push(mov);
  saveState(); render();
  return id;
}
function renameMovement(id) {
  if (!getMovement(id)) return;
  openMovementModal({ movementId: id });
}

let movementModalState = null;
let movementModalFocus = null;

function openMovementModal(opts) {
  if (!opts) return;
  const input = document.getElementById('movementNameInput');
  const leadInput = document.getElementById('movementLeadInput');
  const followInput = document.getElementById('movementFollowInput');
  const title = document.getElementById('movementModalTitle');
  const hint = document.getElementById('movementModalHint');
  const errorEl = document.getElementById('movementModalError');
  errorEl.textContent = '';

  if (opts.movementId) {
    const mov = getMovement(opts.movementId);
    if (!mov) return;
    title.textContent = 'Редактировать движение';
    hint.textContent = `Движение #${mov.id}`;
    setMentionText(input, mov.nameSegments || mov.name);
    setMentionText(leadInput, mov.leadSegments || mov.lead);
    setMentionText(followInput, mov.followSegments || mov.follow);
  } else {
    title.textContent = 'Новое движение';
    hint.textContent = 'Отредактируйте название и описание перед добавлением.';
    setMentionText(input, opts.text || '');
    setMentionText(leadInput, opts.lead || '');
    setMentionText(followInput, opts.follow || '');
  }

  movementModalState = opts;
  movementModalFocus = document.activeElement;
  document.getElementById('movementModal').classList.add('open');
  focusMentionEditor(input, true);
}

function closeMovementModal() {
  document.getElementById('movementModal').classList.remove('open');
  movementModalState = null;
  if (movementModalFocus && document.contains(movementModalFocus)) {
    movementModalFocus.focus();
  }
  movementModalFocus = null;
}

function saveMovementModal() {
  if (!movementModalState) return;
  const input = document.getElementById('movementNameInput');
  const leadInput = document.getElementById('movementLeadInput');
  const followInput = document.getElementById('movementFollowInput');
  const errorEl = document.getElementById('movementModalError');
  const name = mentionText(input).trim();
  const lead = mentionText(leadInput).trim();
  const follow = mentionText(followInput).trim();
  if (!name) {
    errorEl.textContent = 'Введите название движения.';
    input.focus();
    return;
  }

  const modalState = movementModalState;
  if (modalState.movementId) {
    const mov = getMovement(modalState.movementId);
    if (!mov) { closeMovementModal(); return; }
    const duplicate = state.movements.find(m =>
      m.id !== mov.id && m.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      errorEl.textContent = 'Такое движение уже есть в библиотеке.';
      input.focus();
      focusMentionEditor(input, true);
      return;
    }
    if (mov.name !== name || (mov.lead || '') !== lead || (mov.follow || '') !== follow) {
      mov.name = name;
      mov.nameSegments = mentionSegments(input);
      mov.lead = lead;
      mov.leadSegments = mentionSegments(leadInput);
      mov.follow = follow;
      mov.followSegments = mentionSegments(followInput);
      saveState();
      render();
      if (typeof syncFormMovementOption === 'function') syncFormMovementOption(mov.id);
    }
    if (typeof modalState.onSaved === 'function') modalState.onSaved(mov);
  } else if (typeof modalState.onSaved === 'function') {
    modalState.onSaved({
      name,
      lead,
      follow,
      nameSegments: mentionSegments(input),
      leadSegments: mentionSegments(leadInput),
      followSegments: mentionSegments(followInput)
    });
  }
  closeMovementModal();
}
function deleteMovement(id) {
  const usage = Object.values(state.nodes).filter(n => n.movementId === id).length;
  const prepUsage = Object.values(state.nodes)
    .filter(n => n.movementId !== id && n.preparation && n.preparation.movementId === id).length;
  if (usage > 0 || prepUsage > 0) {
    const parts = [];
    if (usage > 0) parts.push(`в ${usage} узл(ах) — они будут удалены вместе с продолжениями`);
    if (prepUsage > 0) parts.push(`как подготовка в ${prepUsage} узл(ах) — подготовка будет убрана`);
    if (!confirm(`Движение используется ${parts.join('; ')}. Удалить?`)) return;
  }
  if (usage > 0) {
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
    state.collapsedNodes = (state.collapsedNodes || []).filter(c => !toDelete.has(c));
    state.merges = state.merges.filter(m => !toDelete.has(m.from) && !toDelete.has(m.to));
  }
  // Подготовка ссылается на движение, а не на узел — убираем её у выживших узлов
  Object.values(state.nodes).forEach(n => {
    if (n.preparation && n.preparation.movementId === id) n.preparation = null;
  });
  if (openFormState && openFormState.draftPreparation && openFormState.draftPreparation.movementId === id) {
    openFormState.draftPreparation = null;
  }
  state.movements = state.movements.filter(m => m.id !== id);
  pruneComboVideos();
  pruneComboDescriptions();
  ensureActivePathValid();
  saveState(); render();
}
function getMovement(id) { return state.movements.find(m => m.id === id); }
function movementNotes(mov) {
  if (!mov) return '';
  const parts = [];
  if (mov.lead) parts.push('Лид: ' + mov.lead);
  if (mov.follow) parts.push('Фоллоу: ' + mov.follow);
  return parts.join('\n');
}

function renderMovements() {
  const ul = document.getElementById('movList');
  ul.innerHTML = '';
  document.getElementById('libCount').textContent = state.movements.length ? `(${state.movements.length})` : '';
  if (state.movements.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-hint'; li.textContent = 'Пока пусто';
    ul.appendChild(li); return;
  }
  rebuildMovementVideoIndex();
  state.movements.forEach(m => {
    const li = document.createElement('li');
    const notes = movementNotes(m);
    li.title = notes
      ? `${notes}\n\nОткрыть движение в модальном окне`
      : 'Открыть движение в модальном окне';
    li.onclick = () => openMovementModal({ movementId: m.id });
    const usage = Object.values(state.nodes).filter(n => n.movementId === m.id).length;
    const videoEntries = getMovementVideoEntries(m.id);
    const videoPlaceCount = videoEntries.reduce((sum, entry) => sum + entry.places.length, 0);
    const idSpan = document.createElement('span');
    idSpan.className = 'mov-id'; idSpan.textContent = '#' + m.id;
    const name = document.createElement('span');
    name.className = 'name';
    renderRichText(nameSegmentsOf(m), name);
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = usage > 0 ? usage + ' uses' : '0';
    if (usage > 0) count.classList.add('used');
    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn'; editBtn.title = 'Переименовать'; editBtn.textContent = '✎';
    editBtn.onclick = (e) => { e.stopPropagation(); renameMovement(m.id); };
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger'; delBtn.title = 'Удалить'; delBtn.textContent = '✕';
    delBtn.onclick = (e) => { e.stopPropagation(); deleteMovement(m.id); };
    li.append(idSpan, name, count);
    if (videoEntries.length) {
      const videoBtn = document.createElement('button');
      videoBtn.type = 'button';
      videoBtn.className = 'mov-video-btn';
      videoBtn.textContent = videoEntries.length > 1 ? `▶${videoEntries.length}` : '▶';
      videoBtn.title = `Видео: ${videoEntries.length} · мест: ${videoPlaceCount}`;
      videoBtn.setAttribute('aria-label', `Видео с движением ${m.name}: ${videoEntries.length}, мест: ${videoPlaceCount}`);
      videoBtn.onclick = (e) => { e.stopPropagation(); openMovementVideosModal(m.id); };
      li.appendChild(videoBtn);
    }
    li.append(editBtn, delBtn);
    ul.appendChild(li);
  });
}

let movementVideosModalState = null;
let movementVideosFocus = null;

function openMovementVideosModal(movementId) {
  const mov = getMovement(movementId);
  if (!mov) return;
  rebuildMovementVideoIndex();
  const entries = getMovementVideoEntries(movementId);
  if (entries.length === 0) return;
  const placesCount = entries.reduce((sum, entry) => sum + entry.places.length, 0);

  movementVideosFocus = document.activeElement;
  movementVideosModalState = { movementId, entries, activeIndex: 0, openUrl: '' };
  document.getElementById('movementVideosTitle').textContent = `Видео: ${mov.name}`;
  document.getElementById('movementVideosHint').textContent =
    `Видео: ${entries.length} · мест: ${placesCount}`;
  renderMovementVideoList();
  setMovementVideosEntry(0);
  document.getElementById('movementVideosModal').classList.add('open');
  document.getElementById('btnCloseMovementVideos').focus();
}

function closeMovementVideosModal() {
  document.getElementById('movementVideosModal').classList.remove('open');
  const frame = document.getElementById('movementVideosFrame');
  frame.src = 'about:blank';
  frame.hidden = true;
  const empty = document.getElementById('movementVideosEmpty');
  empty.hidden = false;
  empty.textContent = 'Видео пока не прикреплено';
  document.getElementById('movementVideosList').innerHTML = '';
  document.getElementById('movementVideosHint').textContent = '';
  document.getElementById('btnOpenMovementVideoLink').disabled = true;
  movementVideosModalState = null;
  if (movementVideosFocus && document.contains(movementVideosFocus)) movementVideosFocus.focus();
  movementVideosFocus = null;
}

function renderMovementVideoList() {
  const list = document.getElementById('movementVideosList');
  list.innerHTML = '';
  if (!movementVideosModalState) return;

  movementVideosModalState.entries.forEach((entry, idx) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'movement-video-item';

    const head = document.createElement('span');
    head.className = 'movement-video-item-head';
    head.textContent = `Комбинация #${entry.index}`;

    const places = document.createElement('span');
    places.className = 'movement-video-item-places';
    const placesLabel = document.createElement('span');
    placesLabel.className = 'movement-video-item-places-label';
    placesLabel.textContent = entry.places.length > 1 ? 'Места:' : 'Смотреть:';
    places.appendChild(placesLabel);
    entry.places.forEach(place => {
      const chip = document.createElement('span');
      chip.className = 'movement-video-place';
      chip.textContent = formatBeat(place.beat, place.length);
      places.appendChild(chip);
    });

    const seq = document.createElement('span');
    seq.className = 'movement-video-item-seq';
    seq.textContent = entry.combo.map(n => {
      const mov = getMovement(n.movementId);
      return mov ? mov.name : '???';
    }).join(' → ');

    item.append(head, places, seq);
    item.onclick = () => setMovementVideosEntry(idx);
    list.appendChild(item);
  });
}

function setMovementVideosEntry(index) {
  if (!movementVideosModalState) return;
  const entry = movementVideosModalState.entries[index];
  if (!entry) return;
  movementVideosModalState.activeIndex = index;
  const parsed = parseComboVideoUrl(entry.url);
  const frame = document.getElementById('movementVideosFrame');
  const empty = document.getElementById('movementVideosEmpty');
  const openBtn = document.getElementById('btnOpenMovementVideoLink');

  if (parsed) {
    if (frame.src !== parsed.embedUrl) frame.src = parsed.embedUrl;
    frame.hidden = false;
    empty.hidden = true;
    openBtn.disabled = false;
    movementVideosModalState.openUrl = parsed.openUrl;
  } else {
    frame.src = 'about:blank';
    frame.hidden = true;
    empty.hidden = false;
    empty.textContent = 'Ссылка на видео не распознана.';
    openBtn.disabled = true;
    movementVideosModalState.openUrl = '';
  }

  document.querySelectorAll('#movementVideosList .movement-video-item').forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });
}

function openMovementVideoLink() {
  if (!movementVideosModalState || !movementVideosModalState.openUrl) return;
  window.open(movementVideosModalState.openUrl, '_blank', 'noopener,noreferrer');
}
