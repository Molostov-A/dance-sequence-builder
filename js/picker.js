/* =========================================================
   Общее окно выбора из списка (#libraryPickerModal).
   Используется для замены движения, выбора препа на линии и выбора
   узла при смене родителя. Поиск фильтрует по тексту пункта; при
   onCreate внизу есть кнопка создания нового элемента с текстом поиска.

   opts = {
     title, hint, placeholder,
     items: [{ id, text, segments?, sub? }],   // text — для поиска и сортировки
     currentId,                                // помечается «текущее»
     sort: true,                               // сортировать по text
     onPick(id),
     createLabel: 'движение', onCreate(text),  // необязательно
     noneLabel: 'Без препа', onNone()          // необязательно, пункт сверху
   }
   ========================================================= */
let libraryPickerState = null;

function openLibraryPicker(opts) {
  libraryPickerState = opts;
  document.getElementById('libraryPickerTitle').textContent = opts.title || 'Выбрать';
  document.getElementById('libraryPickerHint').textContent = opts.hint || '';
  const search = document.getElementById('libraryPickerSearch');
  search.value = '';
  search.placeholder = opts.placeholder || 'Поиск';
  document.getElementById('btnLibraryPickerNew').classList.toggle('hidden', !opts.onCreate);
  renderLibraryPickerList();
  document.getElementById('libraryPickerModal').classList.add('open');
  search.focus();
}

function closeLibraryPicker() {
  document.getElementById('libraryPickerModal').classList.remove('open');
  libraryPickerState = null;
}

function libraryPickerMatches() {
  if (!libraryPickerState) return [];
  const q = document.getElementById('libraryPickerSearch').value.trim().toLowerCase();
  const list = libraryPickerState.items.filter(it =>
    !q || it.text.toLowerCase().includes(q) || (it.sub || '').toLowerCase().includes(q)
  );
  if (libraryPickerState.sort !== false) {
    list.sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base', numeric: true }));
  }
  return list;
}

function renderLibraryPickerList() {
  const st = libraryPickerState;
  if (!st) return;
  const list = document.getElementById('libraryPickerList');
  list.innerHTML = '';
  const query = document.getElementById('libraryPickerSearch').value.trim();

  if (st.onNone && !query) {
    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'library-picker-item library-picker-none';
    none.textContent = st.noneLabel || 'Ничего';
    none.onclick = () => { const cb = st.onNone; closeLibraryPicker(); cb(); };
    list.appendChild(none);
  }

  const matches = libraryPickerMatches();
  if (matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'library-picker-empty';
    empty.textContent = st.items.length ? 'Ничего не найдено' : (st.emptyText || 'Список пуст');
    list.appendChild(empty);
  }
  matches.forEach(it => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'library-picker-item';
    const body = document.createElement('span');
    body.className = 'library-picker-body';
    const name = document.createElement('span');
    name.className = 'library-picker-name';
    if (it.segments) renderRichText(it.segments, name);
    else name.textContent = it.text;
    body.appendChild(name);
    if (it.sub) {
      const sub = document.createElement('span');
      sub.className = 'library-picker-sub';
      sub.textContent = it.sub;
      body.appendChild(sub);
    }
    item.appendChild(body);
    if (st.currentId !== undefined && st.currentId !== null && it.id === st.currentId) {
      item.classList.add('current');
      const mark = document.createElement('span');
      mark.className = 'library-picker-current';
      mark.textContent = 'текущее';
      item.appendChild(mark);
    }
    item.onclick = () => pickLibraryItem(it.id);
    list.appendChild(item);
  });

  if (st.onCreate) {
    const exact = query && st.items.some(it => it.text.toLowerCase() === query.toLowerCase());
    const what = st.createLabel || 'элемент';
    document.getElementById('btnLibraryPickerNew').textContent =
      query && !exact ? `+ Создать «${query}»` : `+ Новый ${what}`;
  }
}

function pickLibraryItem(id) {
  const st = libraryPickerState;
  if (!st) return;
  closeLibraryPicker();
  st.onPick(id);
}

function libraryPickerCreate() {
  const st = libraryPickerState;
  if (!st || !st.onCreate) return;
  const text = document.getElementById('libraryPickerSearch').value.trim();
  // Модалка движения/препа лежит в DOM раньше и при одинаковом z-index
  // оказалась бы под окном выбора — поэтому сначала закрываем выбор.
  closeLibraryPicker();
  st.onCreate(text);
}

function onLibraryPickerKeydown(e) {
  if (e.isComposing) return;
  if (e.key === 'Escape') { e.preventDefault(); closeLibraryPicker(); }
  else if (e.key === 'Enter' && e.target.id === 'libraryPickerSearch') {
    e.preventDefault();
    const query = e.target.value.trim().toLowerCase();
    const matches = libraryPickerMatches();
    const exact = matches.find(it => it.text.toLowerCase() === query);
    if (exact) pickLibraryItem(exact.id);
    else if (matches.length === 1) pickLibraryItem(matches[0].id);
    else if (matches.length === 0 && query && libraryPickerState.onCreate) libraryPickerCreate();
  }
}
