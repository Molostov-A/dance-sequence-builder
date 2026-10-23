function readSegments(el) {
  const segs = [];
  const push = (seg) => {
    if (!seg) return;
    if (seg.text !== undefined) {
      if (seg.text === '') return;
      const last = segs[segs.length - 1];
      if (last && last.text !== undefined) last.text += seg.text;
      else segs.push(seg);
    } else {
      segs.push(seg);
    }
  };
  const walk = (node) => {
    node.childNodes.forEach(child => {
      if (child.nodeType === 3) {
        const t = child.data.replace(/\u200B/g, '');
        if (t) push({ text: t });
        return;
      }
      if (child.nodeType !== 1) return;
      if (child.classList && child.classList.contains('mention')) {
        push({ conceptId: child.getAttribute('data-concept-id') });
        return;
      }
      if (child.tagName === 'BR') { push({ text: '\n' }); return; }
      if (child.tagName === 'DIV' || child.tagName === 'P') { push({ text: '\n' }); walk(child); return; }
      walk(child);
    });
  };
  walk(el);
  return segs;
}

function writeSegments(el, segments) {
  el.innerHTML = '';
  (segments || []).forEach(s => {
    if (s.conceptId) {
      const c = getConcept(s.conceptId);
      const span = document.createElement('span');
      span.className = 'mention';
      span.setAttribute('data-concept-id', s.conceptId);
      span.textContent = c ? c.short : (s.text || '');
      el.appendChild(span);
      el.appendChild(document.createTextNode('\u200B'));
    } else if (s.text) {
      const parts = String(s.text).split('\n');
      parts.forEach((part, i) => {
        if (i > 0) el.appendChild(document.createElement('br'));
        if (part) el.appendChild(document.createTextNode(part));
      });
    }
  });
}

function mentionText(el) {
  return readSegments(el).map(s => {
    if (s.conceptId) return (getConcept(s.conceptId) || {}).short || '';
    return s.text || '';
  }).join('');
}

function mentionSegments(el) {
  normalizeMentions(el);
  return readSegments(el);
}

function normalizeMentions(el) {
  el.querySelectorAll('.mention').forEach(span => {
    const cid = span.getAttribute('data-concept-id');
    const c = getConcept(cid);
    if (!c || span.textContent !== c.short) {
      const text = span.textContent;
      span.replaceWith(document.createTextNode(text));
    }
  });
}

function setMentionText(el, value) {
  if (Array.isArray(value)) writeSegments(el, value);
  else writeSegments(el, [{ text: value || '' }]);
}

function focusMentionEditor(el, selectAll) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  if (!selectAll) range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function makeMentionEditor(el, opts) {
  opts = opts || {};
  el.contentEditable = 'true';
  el.classList.add('mention-editor');
  if (opts.multiline) el.classList.add('multiline');
  else el.classList.add('single');
  el.setAttribute('role', 'textbox');

  el.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === '@') {
      e.preventDefault();
      const sel = window.getSelection();
      if (sel.rangeCount) {
        const range = sel.getRangeAt(0).cloneRange();
        openMentionPicker(el, range);
      }
      return;
    }
    if (!opts.multiline && e.key === 'Enter') {
      e.preventDefault();
      return;
    }
  });

  el.addEventListener('input', () => {
    normalizeMentions(el);
    if (opts.onInput) opts.onInput();
  });

  return el;
}

function nameSegmentsOf(mov) {
  if (!mov) return [];
  return mov.nameSegments || (mov.name ? [{ text: mov.name }] : []);
}

function renderRichText(segments, container) {
  container.innerHTML = '';
  (segments || []).forEach(s => {
    if (s.conceptId) {
      const c = getConcept(s.conceptId);
      const span = document.createElement('span');
      span.className = 'mention';
      span.setAttribute('data-concept-id', s.conceptId);
      span.setAttribute('title', '');
      span.textContent = c ? c.short : (s.text || '');
      container.appendChild(span);
    } else if (s.text) {
      const parts = String(s.text).split('\n');
      parts.forEach((part, i) => {
        if (i > 0) container.appendChild(document.createElement('br'));
        if (part) container.appendChild(document.createTextNode(part));
      });
    }
  });
}

/* ===== @-picker ===== */

let mentionPickerState = null;

function openMentionPicker(editor, range) {
  mentionPickerState = { editor, range, active: -1 };
  const search = document.getElementById('mentionSearch');
  search.value = '';
  renderMentionList('');
  document.getElementById('mentionModal').classList.add('open');
  search.focus();
}

function closeMentionPicker() {
  document.getElementById('mentionModal').classList.remove('open');
  mentionPickerState = null;
}

function renderMentionList(query) {
  const list = document.getElementById('mentionList');
  list.innerHTML = '';
  const q = (query || '').trim().toLowerCase();
  const matches = state.concepts.filter(c => {
    if (!q) return true;
    if ((c.short || '').toLowerCase().includes(q)) return true;
    return (c.names || []).some(n => n.toLowerCase().includes(q));
  });
  if (matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'mention-empty';
    empty.textContent = 'Ничего не найдено';
    list.appendChild(empty);
    return;
  }
  matches.forEach((c, idx) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'mention-item';
    item.setAttribute('data-concept-id', c.id);
    const short = document.createElement('span');
    short.className = 'mention-item-short';
    short.textContent = c.short;
    const names = document.createElement('span');
    names.className = 'mention-item-names';
    names.textContent = (c.names || []).join(' · ');
    item.append(short, names);
    item.addEventListener('mouseenter', () => {
      setMentionListActive(idx);
      showMentionTooltipForConcept(c.id, item);
    });
    item.addEventListener('mouseleave', scheduleHideMentionTooltip);
    item.onclick = () => selectMention(c.id);
    list.appendChild(item);
  });
}

function setMentionListActive(idx) {
  if (!mentionPickerState) return;
  mentionPickerState.active = idx;
  document.querySelectorAll('#mentionList .mention-item').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
}

function mentionListCount() {
  return document.querySelectorAll('#mentionList .mention-item').length;
}

function selectMention(conceptId) {
  if (!mentionPickerState) return;
  const { editor, range } = mentionPickerState;
  const c = getConcept(conceptId);
  if (!c) return;
  const span = document.createElement('span');
  span.className = 'mention';
  span.setAttribute('data-concept-id', conceptId);
  span.textContent = c.short;
  range.deleteContents();
  range.insertNode(span);
  const zws = document.createTextNode('\u200B');
  span.after(zws);
  const sel = window.getSelection();
  sel.removeAllRanges();
  const after = document.createRange();
  after.setStartAfter(zws);
  after.collapse(true);
  sel.addRange(after);
  closeMentionPicker();
  editor.focus();
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ===== Тултип ===== */

let tooltipHideTimer = null;

function buildMentionTooltip(conceptId) {
  const c = getConcept(conceptId);
  const box = document.getElementById('mentionTooltip');
  box.innerHTML = '';
  if (!c) return;

  const short = document.createElement('div');
  short.className = 'mention-tooltip-short';
  short.textContent = c.short;
  box.appendChild(short);

  if ((c.names || []).length) {
    const names = document.createElement('div');
    names.className = 'mention-tooltip-names';
    names.textContent = (c.names || []).join(', ');
    box.appendChild(names);
  }

  const defSegments = c.definitionSegments || (c.definition ? [{ text: c.definition }] : []);
  if (defSegments.length) {
    const def = document.createElement('div');
    def.className = 'mention-tooltip-definition';
    renderRichText(defSegments, def);
    box.appendChild(def);
  }

  (c.media || []).forEach(m => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mention-tooltip-media';
    btn.textContent = (m.type === 'image' ? '🖼 ' : '▶ ') + (m.label || (m.type === 'image' ? 'Картинка' : 'Видео'));
    btn.onclick = () => openMediaModal(m.url, m.type, m.label);
    box.appendChild(btn);
  });
}

function positionMentionTooltip(anchor) {
  const box = document.getElementById('mentionTooltip');
  const r = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const boxW = box.offsetWidth;
  const boxH = box.offsetHeight;
  let left = r.left;
  let top = r.bottom + 8;
  if (left + boxW > vw - 8) left = Math.max(8, vw - boxW - 8);
  if (top + boxH > vh - 8) top = Math.max(8, r.top - boxH - 8);
  box.style.left = left + 'px';
  box.style.top = top + 'px';
}

function showMentionTooltipForConcept(conceptId, anchor) {
  clearTimeout(tooltipHideTimer);
  buildMentionTooltip(conceptId);
  const box = document.getElementById('mentionTooltip');
  box.classList.remove('hidden');
  positionMentionTooltip(anchor);
}

function scheduleHideMentionTooltip() {
  tooltipHideTimer = setTimeout(() => {
    document.getElementById('mentionTooltip').classList.add('hidden');
  }, 150);
}

function initMentionTooltip() {
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest && e.target.closest('.mention[data-concept-id]');
    if (!target) return;
    showMentionTooltipForConcept(target.getAttribute('data-concept-id'), target);
  });
  document.addEventListener('mouseout', (e) => {
    const target = e.target.closest && e.target.closest('.mention[data-concept-id]');
    if (target && !target.contains(e.relatedTarget)) scheduleHideMentionTooltip();
  });
  const box = document.getElementById('mentionTooltip');
  box.addEventListener('mouseenter', () => clearTimeout(tooltipHideTimer));
  box.addEventListener('mouseleave', () => box.classList.add('hidden'));
}

function initMentions() {
  document.querySelectorAll('.mention-editor').forEach(el => {
    if (el.dataset.mentionReady) return;
    el.dataset.mentionReady = '1';
    makeMentionEditor(el, { multiline: el.classList.contains('multiline') });
  });
  initMentionTooltip();
}
