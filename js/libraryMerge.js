// Выбор для объединения не является частью библиотеки/синхронизации.
let libraryMergeSelection = null;
let libraryMergeReview = null;

function libraryMergeItems(kind, data = state) { return kind === 'prep' ? data.preps || [] : data.movements; }
function renderLibraryMergeControls(kind) {
  if (libraryMergeSelection && libraryMergeSelection.context !== activeStorageKey) {
    libraryMergeSelection = null; libraryMergeReview = null;
    document.getElementById('libraryMergeModal').classList.remove('open');
  }
  const prefix = kind === 'prep' ? 'Prep' : 'Movement';
  const selection = libraryMergeSelection && libraryMergeSelection.kind === kind ? libraryMergeSelection : null;
  const items = libraryMergeItems(kind);
  if (selection && !libraryMergeReview) selection.ids = new Set([...selection.ids].filter(id => items.some(m => m.id === id)));
  document.getElementById('btnMerge' + prefix).hidden = !!selection;
  document.getElementById('btnMerge' + prefix).disabled = items.length < 2;
  document.getElementById('merge' + prefix + 'Actions').hidden = !selection;
  document.getElementById('btnReviewMerge' + prefix).disabled = !selection || selection.ids.size < 2;
  document.getElementById('merge' + prefix + 'Count').textContent = selection
    ? `Выбрано: ${selection.ids.size}` + (selection.ids.size < 2 ? ' (нужно 2+)' : '') : '';
}
function startLibraryMerge(kind) {
  libraryMergeSelection = { kind, ids: new Set(), context: activeStorageKey };
  renderMovements(); renderPreps();
}
function cancelLibraryMerge() {
  libraryMergeSelection = null; libraryMergeReview = null;
  document.getElementById('libraryMergeModal').classList.remove('open');
  renderMovements(); renderPreps();
}
function closeLibraryMergeReview() {
  libraryMergeReview = null;
  document.getElementById('libraryMergeModal').classList.remove('open');
  renderMovements(); renderPreps();
  if (libraryMergeSelection) {
    const prefix = libraryMergeSelection.kind === 'prep' ? 'Prep' : 'Movement';
    document.getElementById('btnReviewMerge' + prefix).focus();
  }
}
function decorateLibraryMergeRow(row, item, kind) {
  const selection = libraryMergeSelection;
  if (!selection || selection.kind !== kind || selection.context !== activeStorageKey) return;
  row.querySelectorAll('button').forEach(button => { button.disabled = true; });
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox'; checkbox.checked = selection.ids.has(item.id);
  checkbox.setAttribute('aria-label', 'Объединить: ' + item.name);
  row.classList.toggle('merge-selected', checkbox.checked);
  const toggle = () => {
    if (selection.ids.has(item.id)) selection.ids.delete(item.id); else selection.ids.add(item.id);
    checkbox.checked = selection.ids.has(item.id);
    row.classList.toggle('merge-selected', checkbox.checked);
    renderLibraryMergeControls(kind);
  };
  checkbox.onclick = e => { e.stopPropagation(); toggle(); };
  row.onclick = toggle;
  row.prepend(checkbox);
}
function openLibraryMergeReview() {
  const selection = libraryMergeSelection;
  if (!selection || selection.context !== activeStorageKey || selection.ids.size < 2) return;
  const items = libraryMergeItems(selection.kind).filter(m => selection.ids.has(m.id));
  if (items.length !== selection.ids.size) return;
  libraryMergeReview = { kind: selection.kind, ids: items.map(m => m.id), signature: JSON.stringify(items), context: activeStorageKey };
  document.getElementById('libraryMergeTitle').textContent = selection.kind === 'prep' ? 'Объединить препы' : 'Объединить движения';
  const list = document.getElementById('libraryMergeSources'); list.replaceChildren();
  const names = document.getElementById('libraryMergeName'); names.replaceChildren();
  items.forEach(m => {
    const li = document.createElement('li'); li.textContent = m.name; list.appendChild(li);
    const option = document.createElement('option'); option.value = m.id; option.textContent = m.name; names.appendChild(option);
  });
  const custom = document.createElement('option'); custom.value = 'new'; custom.textContent = 'Написать новое название…'; names.appendChild(custom);
  document.getElementById('libraryMergeCustomName').value = '';
  document.getElementById('libraryMergeError').textContent = '';
  updateLibraryMergeName();
  document.getElementById('libraryMergeModal').classList.add('open'); names.focus();
}
function updateLibraryMergeName() {
  const custom = document.getElementById('libraryMergeName').value === 'new';
  document.getElementById('libraryMergeCustomRow').hidden = !custom;
  if (custom) document.getElementById('libraryMergeCustomName').focus();
}

function mergedLibraryDescription(items, field) {
  const unique = items.filter((item, i) => (item[field] || '').trim()
    && items.findIndex(m => (m[field] || '').trim() === (item[field] || '').trim()) === i);
  const segments = [];
  unique.forEach((item, i) => {
    if (i) segments.push({ text: '\n\n' });
    // Совпадающее описание может быть обычным текстом у одной записи
    // и содержать @-ссылки у другой. Предпочитаем вариант со ссылками.
    const rich = items.find(m => (m[field] || '').trim() === item[field].trim()
      && (m[field + 'Segments'] || []).some(s => s.conceptId)) || item;
    segments.push(...(rich[field + 'Segments'] || [{ text: item[field] }]));
  });
  return { text: unique.map(m => m[field]).join('\n\n'), segments };
}

/* Ключ комбинации включает movementId. Переносим метаданные по новым
   ключам ДО нормализации/очистки импорта; иначе видео и описания исчезнут.
   У валидных ключей сохраняются nodeId/beat/length, поэтому коллизий нет.
   Старые невалидные ключи не должны становиться валидными после слияния. */
function remapMergedComboMetadata(data, ids, targetId) {
  ['comboVideos', 'comboDescriptions', 'comboDescriptionSegments', 'comboFolderLinks'].forEach(field => {
    const mapped = {};
    Object.entries(data[field] || {}).forEach(([key, value]) => {
      const steps = key.split('|').map(part => part.split(':').map(Number));
      if (!steps.every(([id, movementId, beat, length]) => {
        const n = data.nodes[id]; return n && n.movementId === movementId && n.beat === beat && n.length === length;
      })) return;
      const newKey = steps.map(([id, movementId, beat, length]) => [id, ids.has(movementId) ? targetId : movementId, beat, length].join(':')).join('|');
      mapped[newKey] = value;
    });
    data[field] = mapped;
  });
}

function remapMergedPrepGroups(data, ids, targetId) {
  const pins = data.treePins || { preps: {}, links: {} };
  const collapsed = new Set(data.collapsedPrepLinks || []);
  const parents = new Map();
  Object.values(data.nodes).forEach(n => {
    if (n.parentId === null || !ids.has(n.prepId)) return;
    if (!parents.has(n.parentId)) parents.set(n.parentId, new Set());
    parents.get(n.parentId).add(n.prepId);
  });
  parents.forEach((sources, parentId) => {
    const preferred = sources.has(targetId) ? targetId : [...sources][0];
    const preferredKey = prepLinkKey(parentId, preferred), targetKey = prepLinkKey(parentId, targetId);
    const wasCollapsed = collapsed.has(preferredKey);
    const pin = (pins.preps || {})[preferredKey], link = (pins.links || {})['p:' + preferredKey];
    sources.forEach(id => {
      const key = prepLinkKey(parentId, id); collapsed.delete(key);
      if (pins.preps) delete pins.preps[key];
      if (pins.links) delete pins.links['p:' + key];
    });
    if (wasCollapsed) collapsed.add(targetKey);
    if (pin) (pins.preps || (pins.preps = {}))[targetKey] = pin;
    if (link) (pins.links || (pins.links = {}))['p:' + targetKey] = link;
  });
  data.collapsedPrepLinks = [...collapsed];
}

function confirmLibraryMerge() {
  const review = libraryMergeReview;
  const error = document.getElementById('libraryMergeError');
  if (!review || review.context !== activeStorageKey) return false;
  const source = libraryMergeItems(review.kind).filter(m => review.ids.includes(m.id));
  if (JSON.stringify(source) !== review.signature) {
    error.textContent = 'Выбранные записи изменились. Закройте окно и проверьте выбор заново.'; return false;
  }
  const choice = document.getElementById('libraryMergeName').value;
  const targetId = choice === 'new' ? review.ids[0] : Number(choice);
  if (!review.ids.includes(targetId)) return false;
  const base = source.find(m => m.id === targetId);
  const name = choice === 'new' ? document.getElementById('libraryMergeCustomName').value.trim() : base.name;
  if (!name) { error.textContent = 'Введите итоговое название.'; return false; }
  if (libraryMergeItems(review.kind).some(m => !review.ids.includes(m.id) && m.name.toLowerCase() === name.toLowerCase())) {
    error.textContent = 'Такое название уже есть у записи вне выбранных. Включите её в объединение или выберите другое название.'; return false;
  }
  const data = JSON.parse(JSON.stringify(state)), ids = new Set(review.ids);
  const items = libraryMergeItems(review.kind, data), target = items.find(m => m.id === targetId);
  const ordered = [target, ...items.filter(m => ids.has(m.id) && m.id !== targetId)];
  ['lead', 'follow'].forEach(field => {
    const combined = mergedLibraryDescription(ordered, field);
    target[field] = combined.text; target[field + 'Segments'] = combined.segments;
  });
  target.name = name;
  if (choice === 'new') target.nameSegments = [{ text: name }];
  if (review.kind === 'movement') remapMergedComboMetadata(data, ids, targetId);
  else remapMergedPrepGroups(data, ids, targetId);
  Object.values(data.nodes).forEach(n => {
    const field = review.kind === 'prep' ? 'prepId' : 'movementId';
    if (ids.has(n[field])) n[field] = targetId;
  });
  const field = review.kind === 'prep' ? 'preps' : 'movements';
  data[field] = items.filter(m => !ids.has(m.id) || m.id === targetId);
  if (!applyImportedJson(JSON.stringify(data), { confirmReplace: false, reportError: false })) {
    error.textContent = 'Не удалось сохранить объединение. Прежние данные сохранены; проверьте сообщение о хранилище.'; return false;
  }
  [treeSearchQuery, treeSearchDraft].forEach(query => query.forEach(step => {
    if (step.kind === review.kind && ids.has(step.id)) step.id = targetId;
  }));
  cancelLibraryMerge();
  if (review.kind === 'movement') showMovementInLibrary(targetId);
  else {
    document.getElementById('prepLibrarySearch').value = ''; setView('preps');
    const row = document.querySelector('#prepList [data-prep-id="' + targetId + '"]');
    if (row) { row.classList.add('library-focus'); row.tabIndex = -1; row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'center' }); }
  }
  applyTreeSearchHighlights();
  return true;
}

['movement', 'prep'].forEach(kind => {
  const prefix = kind === 'prep' ? 'Prep' : 'Movement';
  document.getElementById('btnMerge' + prefix).onclick = () => startLibraryMerge(kind);
  document.getElementById('btnReviewMerge' + prefix).onclick = openLibraryMergeReview;
  document.getElementById('btnCancelMerge' + prefix).onclick = cancelLibraryMerge;
});
document.getElementById('libraryMergeName').onchange = updateLibraryMergeName;
document.getElementById('btnConfirmLibraryMerge').onclick = confirmLibraryMerge;
document.getElementById('btnBackLibraryMerge').onclick = closeLibraryMergeReview;
document.getElementById('libraryMergeModal').addEventListener('click', e => { if (e.target === e.currentTarget) document.getElementById('btnBackLibraryMerge').click(); });
document.getElementById('libraryMergeModal').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.stopPropagation(); document.getElementById('btnBackLibraryMerge').click(); }
});
