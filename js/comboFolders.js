/* =========================================================
   ПАПКИ КОМБИНАЦИЙ
   state.comboFolders — дерево папок [{ id, name, parentId }] (вложенность
   любая). state.comboFolderLinks[comboKey] — массив id папок комбинации:
   папки работают как метки, одна комбинация может лежать в нескольких
   папках и показывается в каждой. Ключ — comboVideoKey(combo), как у видео
   и описаний: при изменении состава связки привязка отпадает вместе с ними
   (чистит pruneComboDescriptions). Свёрнутые папки — state.collapsedComboFolders.
   ========================================================= */
let comboFolderEditingId = null;   // папка, у которой сейчас открыто поле имени
let comboFoldersModalState = null;

function getComboFolder(id) { return (state.comboFolders || []).find(f => f.id === id); }

function childComboFolders(parentId) {
  return (state.comboFolders || [])
    .filter(f => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
}

function comboFolderSubtreeIds(id) {
  const out = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    out.push(cur);
    childComboFolders(cur).forEach(f => stack.push(f.id));
  }
  return out;
}

function comboFolderPath(id) {
  const names = [];
  let f = getComboFolder(id);
  let guard = 0;
  while (f && guard++ < 100) {
    names.unshift(f.name);
    f = f.parentId ? getComboFolder(f.parentId) : null;
  }
  return names.join(' / ');
}

function comboFolderIdsByKey(key) {
  const ids = (state.comboFolderLinks || {})[key];
  return Array.isArray(ids) ? ids.filter(id => getComboFolder(id)) : [];
}

function setComboFolderIds(key, ids) {
  if (!state.comboFolderLinks) state.comboFolderLinks = {};
  const clean = Array.from(new Set(ids)).filter(id => getComboFolder(id));
  if (clean.length) state.comboFolderLinks[key] = clean;
  else delete state.comboFolderLinks[key];
}

function addComboFolder(parentId) {
  if (!state.comboFolders) state.comboFolders = [];
  if (!state.nextComboFolderId) state.nextComboFolderId = 1;
  const id = state.nextComboFolderId++;
  state.comboFolders.push({ id, name: 'Новая папка', parentId: parentId || null });
  if (parentId) {
    state.collapsedComboFolders = (state.collapsedComboFolders || []).filter(c => c !== parentId);
  }
  comboFolderEditingId = id;
  saveState(); render();
  return id;
}

function renameComboFolder(id, name) {
  comboFolderEditingId = null;
  const folder = getComboFolder(id);
  const trimmed = (name || '').trim();
  if (folder && trimmed && trimmed !== folder.name) folder.name = trimmed;
  saveState(); render();
}

function deleteComboFolder(id) {
  const folder = getComboFolder(id);
  if (!folder) return;
  const ids = comboFolderSubtreeIds(id);
  const nested = ids.length - 1;
  const msg = `Удалить папку «${folder.name}»` + (nested ? ` и вложенные папки (${nested})` : '')
    + '? Сами комбинации останутся.';
  if (!confirm(msg)) return;
  const gone = new Set(ids);
  state.comboFolders = state.comboFolders.filter(f => !gone.has(f.id));
  Object.keys(state.comboFolderLinks || {}).forEach(key => setComboFolderIds(key, state.comboFolderLinks[key]));
  state.collapsedComboFolders = (state.collapsedComboFolders || []).filter(c => !gone.has(c));
  saveState(); render();
}

function toggleComboFolderCollapsed(id) {
  const list = state.collapsedComboFolders || [];
  state.collapsedComboFolders = list.includes(id) ? list.filter(c => c !== id) : list.concat(id);
  saveState(); render();
}

// Перенос папки в другую папку или в корень. В себя и в свои подпапки нельзя.
function openMoveComboFolderPicker(id) {
  const folder = getComboFolder(id);
  if (!folder) return;
  const forbidden = new Set(comboFolderSubtreeIds(id));
  const targets = state.comboFolders.filter(f => !forbidden.has(f.id) && f.id !== folder.parentId);
  openLibraryPicker({
    title: 'Переместить папку',
    hint: `«${folder.name}» переедет вместе с вложенными папками и комбинациями.`,
    placeholder: 'Поиск папки',
    items: targets.map(f => ({ id: f.id, text: comboFolderPath(f.id) })),
    emptyText: 'Нет других папок',
    noneLabel: 'В корень (верхний уровень)',
    onNone: folder.parentId ? () => moveComboFolder(id, null) : null,
    onPick: (parentId) => moveComboFolder(id, parentId)
  });
}

function moveComboFolder(id, parentId) {
  const folder = getComboFolder(id);
  if (!folder || (parentId && comboFolderSubtreeIds(id).includes(parentId))) return;
  folder.parentId = parentId || null;
  if (parentId) state.collapsedComboFolders = (state.collapsedComboFolders || []).filter(c => c !== parentId);
  saveState(); render();
}

/* ===== Окно «Папки комбинации» — отметить папки галочками ===== */
function openComboFoldersModal(combo, index) {
  const key = comboVideoKey(combo);
  comboFoldersModalState = { key, selected: new Set(comboFolderIdsByKey(key)) };
  document.getElementById('comboFoldersTitle').textContent = `Папки связки #${index}`;
  document.getElementById('comboFolderNewInput').value = '';
  renderComboFoldersModalList();
  document.getElementById('comboFoldersModal').classList.add('open');
  document.getElementById('btnSaveComboFolders').focus();
}

function closeComboFoldersModal() {
  document.getElementById('comboFoldersModal').classList.remove('open');
  comboFoldersModalState = null;
}

function renderComboFoldersModalList() {
  const list = document.getElementById('comboFoldersList');
  list.innerHTML = '';
  if (!comboFoldersModalState) return;
  if (!(state.comboFolders || []).length) {
    const empty = document.createElement('div');
    empty.className = 'library-picker-empty';
    empty.textContent = 'Папок пока нет — создайте первую ниже.';
    list.appendChild(empty);
    return;
  }
  const walk = (parentId, depth) => {
    childComboFolders(parentId).forEach(f => {
      const row = document.createElement('label');
      row.className = 'combo-folders-row';
      row.style.paddingLeft = (8 + depth * 18) + 'px';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = comboFoldersModalState.selected.has(f.id);
      cb.onchange = () => {
        if (cb.checked) comboFoldersModalState.selected.add(f.id);
        else comboFoldersModalState.selected.delete(f.id);
      };
      const name = document.createElement('span');
      name.textContent = '📁 ' + f.name;
      row.append(cb, name);
      list.appendChild(row);
      walk(f.id, depth + 1);
    });
  };
  walk(null, 0);
}

// Новая папка из окна сразу отмечается для этой комбинации.
function addComboFolderFromModal() {
  if (!comboFoldersModalState) return;
  const input = document.getElementById('comboFolderNewInput');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  if (!state.comboFolders) state.comboFolders = [];
  if (!state.nextComboFolderId) state.nextComboFolderId = 1;
  const id = state.nextComboFolderId++;
  state.comboFolders.push({ id, name, parentId: null });
  comboFoldersModalState.selected.add(id);
  input.value = '';
  saveState();
  renderComboFoldersModalList();
}

function saveComboFoldersModal() {
  if (!comboFoldersModalState) return;
  setComboFolderIds(comboFoldersModalState.key, Array.from(comboFoldersModalState.selected));
  closeComboFoldersModal();
  saveState(); render();
}

/* ===== Рендер дерева папок в разделе «Комбинации» =====
   entries — [{ combo, idx, key }] уже с учётом фильтра по узлу. Папка
   показывает свои подпапки, затем свои комбинации; счётчик — число
   разных комбинаций во всём поддереве. При активном фильтре папки без
   подходящих комбинаций скрываются. Комбинации без папок — в группе
   «Без папки» внизу. Если папок нет вовсе — обычный плоский список. */
function renderComboFolderTree(container, entries, renderItem, filtered) {
  const folders = state.comboFolders || [];
  if (folders.length === 0) {
    const ul = document.createElement('ul');
    ul.className = 'combo-list';
    entries.forEach(e => ul.appendChild(renderItem(e)));
    container.appendChild(ul);
    return;
  }

  const byFolder = new Map();
  const loose = [];
  entries.forEach(e => {
    const ids = comboFolderIdsByKey(e.key);
    if (ids.length === 0) loose.push(e);
    ids.forEach(id => {
      if (!byFolder.has(id)) byFolder.set(id, []);
      byFolder.get(id).push(e);
    });
  });
  const subtreeCount = (id) => {
    const keys = new Set();
    comboFolderSubtreeIds(id).forEach(fid => (byFolder.get(fid) || []).forEach(e => keys.add(e.key)));
    return keys.size;
  };

  const renderFolder = (folder, depth) => {
    const count = subtreeCount(folder.id);
    if (filtered && count === 0) return null;
    const collapsed = (state.collapsedComboFolders || []).includes(folder.id);
    const box = document.createElement('div');
    box.className = 'combo-folder';
    box.dataset.folderId = folder.id;

    const head = document.createElement('div');
    head.className = 'combo-folder-head';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'combo-folder-toggle';
    toggle.textContent = collapsed ? '▸' : '▾';
    toggle.title = collapsed ? 'Развернуть папку' : 'Свернуть папку';
    toggle.onclick = () => toggleComboFolderCollapsed(folder.id);
    head.appendChild(toggle);

    if (comboFolderEditingId === folder.id) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'combo-folder-name-input';
      input.value = folder.name;
      let done = false;
      const finish = (save) => {
        if (done) return;
        done = true;
        if (save) renameComboFolder(folder.id, input.value);
        else { comboFolderEditingId = null; render(); }
      };
      input.onkeydown = (e) => {
        if (e.isComposing) return;
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      };
      input.onblur = () => finish(true);
      head.appendChild(input);
      setTimeout(() => { input.focus(); input.select(); }, 0);
    } else {
      const name = document.createElement('span');
      name.className = 'combo-folder-name';
      name.textContent = '📁 ' + folder.name;
      name.title = 'Нажмите, чтобы свернуть или развернуть';
      name.onclick = () => toggleComboFolderCollapsed(folder.id);
      head.appendChild(name);
    }

    const countEl = document.createElement('span');
    countEl.className = 'combo-folder-count';
    countEl.textContent = String(count);
    countEl.title = 'Комбинаций в папке и подпапках';
    head.appendChild(countEl);

    const actions = document.createElement('span');
    actions.className = 'combo-folder-actions';
    const btn = (text, title, onClick, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'icon-btn' + (cls ? ' ' + cls : '');
      b.textContent = text;
      b.title = title;
      b.onclick = (e) => { e.stopPropagation(); onClick(); };
      return b;
    };
    actions.append(
      btn('+', 'Новая подпапка', () => addComboFolder(folder.id)),
      btn('✎', 'Переименовать', () => { comboFolderEditingId = folder.id; render(); }),
      btn('⇱', 'Переместить в другую папку', () => openMoveComboFolderPicker(folder.id)),
      btn('✕', 'Удалить папку', () => deleteComboFolder(folder.id), 'danger')
    );
    head.appendChild(actions);
    box.appendChild(head);

    if (!collapsed) {
      const body = document.createElement('div');
      body.className = 'combo-folder-body';
      childComboFolders(folder.id).forEach(sub => {
        const el = renderFolder(sub, depth + 1);
        if (el) body.appendChild(el);
      });
      const own = byFolder.get(folder.id) || [];
      if (own.length) {
        const ul = document.createElement('ul');
        ul.className = 'combo-list';
        own.forEach(e => ul.appendChild(renderItem(e)));
        body.appendChild(ul);
      } else if (!body.children.length) {
        const empty = document.createElement('div');
        empty.className = 'combo-folder-empty';
        empty.textContent = 'Пусто. Добавьте сюда комбинацию кнопкой «📁» в её строке.';
        body.appendChild(empty);
      }
      box.appendChild(body);
    }
    return box;
  };

  childComboFolders(null).forEach(f => {
    const el = renderFolder(f, 0);
    if (el) container.appendChild(el);
  });

  if (loose.length) {
    const box = document.createElement('div');
    box.className = 'combo-folder combo-folder-loose';
    const head = document.createElement('div');
    head.className = 'combo-folder-head';
    const name = document.createElement('span');
    name.className = 'combo-folder-name';
    name.textContent = 'Без папки';
    const countEl = document.createElement('span');
    countEl.className = 'combo-folder-count';
    countEl.textContent = String(loose.length);
    head.append(name, countEl);
    const ul = document.createElement('ul');
    ul.className = 'combo-list';
    loose.forEach(e => ul.appendChild(renderItem(e)));
    const body = document.createElement('div');
    body.className = 'combo-folder-body';
    body.appendChild(ul);
    box.append(head, body);
    container.appendChild(box);
  }
}
