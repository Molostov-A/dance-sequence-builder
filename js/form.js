let openFormState = null;
let formBuiltFor = null;

function openForm(opts) {
  openFormState = opts; formBuiltFor = null;
  buildForm(); showForm();
}
function closeForm() { openFormState = null; formBuiltFor = null; hideForm(); }
function formSignature() {
  if (!openFormState) return null;
  return `${openFormState.isRoot ? 'root' : 'child'}:${openFormState.parentId || ''}:${openFormState.beat}`;
}
function buildForm() {
  const sig = formSignature();
  if (sig === formBuiltFor) return;
  const formEl = document.getElementById('formLayer');
  formEl.innerHTML = '';
  formEl.appendChild(renderFormContent());
  formBuiltFor = sig;
}
function showForm() {
  const formEl = document.getElementById('formLayer');
  formEl.style.display = 'block';
  positionForm();
}
function hideForm() {
  const formEl = document.getElementById('formLayer');
  formEl.style.display = 'none';
  formEl.innerHTML = '';
}
function positionForm() {
  if (!openFormState) return;
  const formEl = document.getElementById('formLayer');
  if (window.matchMedia('(max-width: 900px)').matches) {
    formEl.style.left = ''; formEl.style.top = '';
    formEl.style.right = ''; formEl.style.bottom = '';
    return;
  }
  const inner = document.getElementById('treeInner');
  const innerRect = inner.getBoundingClientRect();
  let x, y;
  if (openFormState.isRoot) { x = PAD; y = PAD + CARD_H + 20; }
  else {
    const parentEl = document.querySelector(`[data-node-id="${openFormState.parentId}"]`);
    if (parentEl) {
      const r = parentEl.getBoundingClientRect();
      x = r.right - innerRect.left + 20;
      y = r.top - innerRect.top;
    } else { x = PAD; y = PAD; }
  }
  formEl.style.left = x + 'px';
  formEl.style.top = y + 'px';
  formEl.style.right = '';
  formEl.style.bottom = '';
  const fw = formEl.offsetWidth;
  const fh = formEl.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (x + fw > vw - 10) x = Math.max(10, vw - fw - 10);
  if (y + fh > vh - 10) y = Math.max(10, vh - fh - 10);
  if (x < 10) x = 10;
  if (y < 10) y = 10;
  formEl.style.left = x + 'px';
  formEl.style.top = y + 'px';
}
function submitForm() {
  if (!openFormState) return;
  const formEl = document.getElementById('formLayer');
  const select = formEl.querySelector('.mov-select');
  const newInput = formEl.querySelector('.new-mov-input');
  const lenSelect = formEl.querySelector('.length-select');
  const errorEl = formEl.querySelector('.error');
  let movementId = null;
  const newName = newInput.value.trim();
  if (newName) movementId = addMovement(newName);
  else if (select.value) movementId = parseInt(select.value, 10);
  if (!movementId) { errorEl.textContent = 'Выберите движение или введите новое.'; return; }
  const length = parseInt(lenSelect.value, 10);
  if (openFormState.isRoot) addRootNode(movementId, length);
  else addChildNode(openFormState.parentId, movementId, openFormState.beat, length);
  closeForm();
}
function renderFormContent() {
  const frag = document.createDocumentFragment();
  const beat = openFormState.beat;
  const allowed = allowedLengths(beat);

  const title = document.createElement('h3');
  title.textContent = openFormState.isRoot ? 'Новая связка' : 'Продолжение';
  frag.appendChild(title);

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = openFormState.isRoot
    ? 'Первое движение — с 1-го счёта (1-я восьмёрка, 1).'
    : `Счёт начала: ${formatBeat(beat, 1)}`;
  frag.appendChild(hint);

  const row1 = document.createElement('div');
  row1.className = 'row';
  const label1 = document.createElement('label');
  label1.textContent = 'Из библиотеки:';
  const select = document.createElement('select');
  select.className = 'mov-select';
  const emptyOpt = document.createElement('option');
  emptyOpt.value = ''; emptyOpt.textContent = '— выбрать —';
  select.appendChild(emptyOpt);
  state.movements.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id; opt.textContent = m.name;
    select.appendChild(opt);
  });
  select.onchange = () => { if (select.value) formNewInput().value = ''; };
  row1.append(label1, select);
  frag.appendChild(row1);

  const or = document.createElement('div');
  or.className = 'or'; or.textContent = '— или —';
  frag.appendChild(or);

  const row2 = document.createElement('div');
  row2.className = 'row';
  const label2 = document.createElement('label');
  label2.textContent = 'Новое движение:';
  const newInput = document.createElement('input');
  newInput.type = 'text';
  newInput.className = 'new-mov-input';
  newInput.placeholder = 'название';
  newInput.setAttribute('autocomplete', 'off');
  newInput.setAttribute('autocorrect', 'off');
  newInput.setAttribute('autocapitalize', 'off');
  newInput.setAttribute('spellcheck', 'false');
  newInput.oninput = () => { if (newInput.value.trim()) formMovSelect().value = ''; };
  row2.append(label2, newInput);
  frag.appendChild(row2);

  const row3 = document.createElement('div');
  row3.className = 'row';
  const label3 = document.createElement('label');
  label3.textContent = 'Длительность:';
  const lenSelect = document.createElement('select');
  lenSelect.className = 'length-select';
  allowed.forEach(len => {
    const opt = document.createElement('option');
    opt.value = len;
    opt.textContent = `${len} счёта (${formatBeat(beat, len)})`;
    lenSelect.appendChild(opt);
  });
  row3.append(label3, lenSelect);
  frag.appendChild(row3);

  const err = document.createElement('div');
  err.className = 'error'; frag.appendChild(err);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const okBtn = document.createElement('button');
  okBtn.className = 'btn'; okBtn.type = 'button'; okBtn.textContent = 'OK';
  okBtn.onclick = submitForm;
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn secondary'; cancelBtn.type = 'button'; cancelBtn.textContent = 'Отмена';
  cancelBtn.onclick = closeForm;
  actions.append(okBtn, cancelBtn);
  frag.appendChild(actions);

  return frag;
}
function formNewInput() { return document.querySelector('#formLayer .new-mov-input'); }
function formMovSelect() { return document.querySelector('#formLayer .mov-select'); }