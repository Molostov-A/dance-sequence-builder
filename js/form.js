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
  const draftLead = formEl.querySelector('.new-mov-lead');
  const draftFollow = formEl.querySelector('.new-mov-follow');
  const lenSelect = formEl.querySelector('.length-select');
  const errorEl = formEl.querySelector('.error');
  let movementId = null;
  const newName = mentionText(newInput).trim();
  if (newName) {
    movementId = addMovement(
      newName,
      draftLead ? draftLead.value : '',
      draftFollow ? draftFollow.value : '',
      { name: mentionSegments(newInput) }
    );
  } else if (select.value) movementId = parseInt(select.value, 10);
  if (!movementId) { errorEl.textContent = 'Выберите движение или введите новое.'; return; }
  const length = parseInt(lenSelect.value, 10);
  if (openFormState.isRoot) addRootNode(movementId, length);
  else addChildNode(openFormState.parentId, movementId, openFormState.beat, length);
  if (openFormState.draftPreparation && openFormState.draftPreparation.movementId) {
    const newId = state.activePath[state.activePath.length - 1];
    const pmov = getMovement(openFormState.draftPreparation.movementId);
    if (newId && state.nodes[newId] && pmov) {
      state.nodes[newId].preparation = { movementId: pmov.id };
      saveState(); render();
    }
  }
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
  const selectRow = document.createElement('div');
  selectRow.className = 'mov-select-row';
  const editSelectedBtn = createFormEditButton('form-edit-selected', 'Редактировать выбранное движение');
  editSelectedBtn.onclick = () => {
    const currentSelect = formMovSelect();
    if (!currentSelect || !currentSelect.value) return;
    const movementId = parseInt(currentSelect.value, 10);
    openMovementModal({
      movementId,
      onSaved: (mov) => {
        const keepSelect = formMovSelect();
        if (keepSelect) keepSelect.value = String(mov.id);
        syncFormMovementOption(mov.id);
        updateFormEditButtons();
      }
    });
  };
  selectRow.append(select, editSelectedBtn);
  select.onchange = () => {
    if (select.value) resetFormDraft();
    updateFormEditButtons();
  };
  row1.append(label1, selectRow);
  frag.appendChild(row1);

  const or = document.createElement('div');
  or.className = 'or'; or.textContent = '— или —';
  frag.appendChild(or);

  const row2 = document.createElement('div');
  row2.className = 'row';
  const label2 = document.createElement('label');
  label2.textContent = 'Новое движение:';
  const newInput = document.createElement('div');
  newInput.className = 'new-mov-input mention-editor single';
  newInput.contentEditable = 'true';
  newInput.setAttribute('data-placeholder', 'название');
  const inputRow = document.createElement('div');
  inputRow.className = 'mov-select-row';
  const editNewBtn = createFormEditButton('form-edit-new', 'Открыть движение в модальном окне');
  editNewBtn.onclick = () => {
    const currentInput = formNewInput();
    if (!currentInput || !mentionText(currentInput).trim()) return;
    const draftLead = document.querySelector('#formLayer .new-mov-lead');
    const draftFollow = document.querySelector('#formLayer .new-mov-follow');
    openMovementModal({
      text: mentionText(currentInput).trim(),
      lead: draftLead ? draftLead.value : '',
      follow: draftFollow ? draftFollow.value : '',
      onSaved: (draft) => {
        const input = formNewInput();
        if (!input) return;
        setMentionText(input, draft.nameSegments || draft.name);
        const lead = document.querySelector('#formLayer .new-mov-lead');
        const follow = document.querySelector('#formLayer .new-mov-follow');
        if (lead) lead.value = draft.lead;
        if (follow) follow.value = draft.follow;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  };
  const draftLead = document.createElement('input');
  draftLead.type = 'hidden';
  draftLead.className = 'new-mov-lead';
  const draftFollow = document.createElement('input');
  draftFollow.type = 'hidden';
  draftFollow.className = 'new-mov-follow';
  inputRow.append(newInput, editNewBtn, draftLead, draftFollow);
  makeMentionEditor(newInput, {
    multiline: false,
    onInput: () => {
      if (mentionText(newInput).trim()) formMovSelect().value = '';
      updateFormEditButtons();
    }
  });
  row2.append(label2, inputRow);
  frag.appendChild(row2);

  const prepRow = document.createElement('div');
  prepRow.className = 'row prep-form-row';
  const prepLabel = document.createElement('label');
  prepLabel.textContent = 'Подготовка (из библиотеки):';
  const prepBox = document.createElement('div');
  prepBox.className = 'prep-form-box';
  const prepNameEl = document.createElement('span');
  prepNameEl.className = 'prep-form-name muted';
  prepNameEl.textContent = 'Не добавлена';
  const prepActions = document.createElement('div');
  prepActions.className = 'prep-form-actions';
  const prepPick = document.createElement('button');
  prepPick.type = 'button';
  prepPick.className = 'icon-btn';
  prepPick.title = 'Выбрать из библиотеки';
  prepPick.textContent = '…';
  const prepEdit = document.createElement('button');
  prepEdit.type = 'button';
  prepEdit.className = 'icon-btn';
  prepEdit.title = 'Редактировать подготовку';
  prepEdit.textContent = '✎';
  prepEdit.disabled = true;
  const prepClear = document.createElement('button');
  prepClear.type = 'button';
  prepClear.className = 'icon-btn danger';
  prepClear.title = 'Убрать подготовку';
  prepClear.textContent = '✕';
  prepClear.disabled = true;
  prepActions.append(prepPick, prepEdit, prepClear);
  prepBox.append(prepNameEl, prepActions);
  prepRow.append(prepLabel, prepBox);
  frag.appendChild(prepRow);

  prepPick.onclick = () => {
    if (!openFormState) return;
    openPrepPicker(openFormState.nodeId || null);
  };
  prepEdit.onclick = () => {
    if (!openFormState) return;
    if (openFormState.nodeId) {
      const node = state.nodes[openFormState.nodeId];
      if (node && node.preparation && node.preparation.movementId) {
        openMovementModal({ movementId: node.preparation.movementId });
      }
    } else if (openFormState.draftPreparation && openFormState.draftPreparation.movementId) {
      openMovementModal({ movementId: openFormState.draftPreparation.movementId });
    }
  };
  prepClear.onclick = () => {
    if (!openFormState) return;
    if (openFormState.nodeId) {
      const node = state.nodes[openFormState.nodeId];
      if (node) { node.preparation = null; saveState(); render(); buildForm(); positionForm(); }
    } else {
      delete openFormState.draftPreparation;
      buildForm(); positionForm();
    }
  };
  function updatePrepForm() {
    if (!openFormState) return;
    const node = openFormState.nodeId ? state.nodes[openFormState.nodeId] : null;
    const draftId = (!node && openFormState.draftPreparation) ? openFormState.draftPreparation.movementId : null;
    const prepId = (node && node.preparation && node.preparation.movementId)
      ? node.preparation.movementId
      : draftId;
    if (prepId) {
      const pm = getMovement(prepId);
      prepNameEl.textContent = pm ? pm.name : `Движение #${prepId}`;
      prepNameEl.classList.toggle('muted', !pm);
      prepEdit.disabled = !pm;
      prepClear.disabled = false;
    } else {
      prepNameEl.textContent = 'Не добавлена';
      prepNameEl.classList.add('muted');
      prepEdit.disabled = true;
      prepClear.disabled = true;
    }
  }
  updatePrepForm();
  prepRow.updatePrepForm = updatePrepForm;

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
function resetFormDraft() {
  const input = formNewInput();
  if (input) setMentionText(input, '');
  const lead = document.querySelector('#formLayer .new-mov-lead');
  const follow = document.querySelector('#formLayer .new-mov-follow');
  if (lead) lead.value = '';
  if (follow) follow.value = '';
}
function createFormEditButton(className, title) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn ' + className;
  btn.title = title;
  btn.textContent = '✎';
  btn.disabled = true;
  return btn;
}
function updateFormEditButtons() {
  const select = formMovSelect();
  const input = formNewInput();
  const selectBtn = document.querySelector('#formLayer .form-edit-selected');
  const inputBtn = document.querySelector('#formLayer .form-edit-new');
  if (selectBtn) selectBtn.disabled = !(select && select.value);
  if (inputBtn) inputBtn.disabled = !(input && mentionText(input).trim());
}
function openPrepPicker(nodeId) {
  if (!state.movements || state.movements.length === 0) {
    alert('В библиотеке нет движений. Сначала добавьте движение.');
    return;
  }
  const modal = document.createElement('div');
  modal.className = 'modal-bg open';
  modal.innerHTML = `
    <div class="modal prep-picker-modal">
      <h3>Выбрать подготовку из библиотеки</h3>
      <p class="hint">Можно выбрать только одно движение.</p>
      <div class="prep-picker-list"></div>
      <div class="actions">
        <button class="btn secondary prep-cancel">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const list = modal.querySelector('.prep-picker-list');
  state.movements.slice().sort((a,b) => a.name.localeCompare(b.name)).forEach(m => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'prep-picker-item';
    const name = document.createElement('span');
    name.className = 'prep-picker-name';
    renderRichText(nameSegmentsOf(m), name);
    item.appendChild(name);
    item.onclick = () => {
      if (nodeId && state.nodes[nodeId]) {
        state.nodes[nodeId].preparation = { movementId: m.id };
        saveState();
        render();
      } else if (openFormState) {
        openFormState.draftPreparation = { movementId: m.id };
      }
      document.body.removeChild(modal);
      buildForm();
      positionForm();
    };
    list.appendChild(item);
  });
  modal.querySelector('.prep-cancel').onclick = () => document.body.removeChild(modal);
  modal.onclick = (e) => { if (e.target === modal) document.body.removeChild(modal); };
}