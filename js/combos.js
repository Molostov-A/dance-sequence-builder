function collectCombos() {
  const combos = [];
  state.roots.forEach(rootId => {
    const root = state.nodes[rootId];
    if (!root) return;
    walk(root, [], combos, new Set());
  });
  return combos;
}
function walk(node, path, combos, visited) {
  path.push(node);
  const children = getChildren(node.id);
  const merge = state.merges.find(m => m.from === node.id);
  const mergeTarget = merge ? state.nodes[merge.to] : null;

  if (children.length === 0 && !mergeTarget) {
    combos.push([...path]);
  } else {
    children.forEach(c => walk(c, path, combos, visited));
    if (mergeTarget && !visited.has(mergeTarget.id)) {
      visited.add(mergeTarget.id);
      walk(mergeTarget, path, combos, visited);
      visited.delete(mergeTarget.id);
    }
  }
  path.pop();
}
function comboVideoKey(combo) {
  return combo.map(n => `${n.id}:${n.movementId}:${n.beat}:${n.length}`).join('|');
}
function getComboVideos(combo) {
  if (!state.comboVideos) return [];
  const v = state.comboVideos[comboVideoKey(combo)];
  if (Array.isArray(v)) return v.filter(x => typeof x === 'string');
  if (typeof v === 'string') return [v];
  return [];
}
function getComboDescription(combo) {
  if (!state.comboDescriptions) return '';
  const d = state.comboDescriptions[comboVideoKey(combo)];
  return typeof d === 'string' ? d : '';
}
function getComboDescriptionSegments(combo) {
  if (!state.comboDescriptionSegments) return null;
  return state.comboDescriptionSegments[comboVideoKey(combo)] || null;
}
function comboSizeLabel(totalBeats) {
  const squares = Math.floor(totalBeats / 32);
  const rem = totalBeats % 32;
  let label = `${totalBeats} счётов`;
  if (squares > 0) label += ` • ${squares} кв.`;
  if (rem) label += ` +${rem}`;
  return label;
}
let nodeVideoIndex = {};
function rebuildNodeVideoIndex() {
  nodeVideoIndex = {};
  collectCombos().forEach(combo => {
    const videos = getComboVideos(combo);
    if (videos.length === 0) return;
    const seen = new Set();
    combo.forEach(node => {
      if (seen.has(node.id)) return;
      seen.add(node.id);
      nodeVideoIndex[node.id] = (nodeVideoIndex[node.id] || 0) + videos.length;
    });
  });
}
function getNodeVideoCount(nodeId) {
  return nodeVideoIndex[nodeId] || 0;
}
function getNodeVideoEntries(nodeId) {
  const entries = [];
  collectCombos().forEach((combo, idx) => {
    if (!combo.some(n => n.id === nodeId)) return;
    getComboVideos(combo).forEach(url => {
      entries.push({ combo, index: idx + 1, url });
    });
  });
  return entries;
}
let movementVideoIndex = {};
function rebuildMovementVideoIndex() {
  movementVideoIndex = {};
  collectCombos().forEach((combo, comboIndex) => {
    const videos = getComboVideos(combo);
    if (videos.length === 0) return;
    const placesByMovement = {};
    combo.forEach(node => {
      if (!placesByMovement[node.movementId]) placesByMovement[node.movementId] = [];
      placesByMovement[node.movementId].push({ beat: node.beat, length: node.length });
    });
    videos.forEach(url => {
      Object.keys(placesByMovement).forEach(key => {
        const movementId = Number(key);
        if (!movementVideoIndex[movementId]) movementVideoIndex[movementId] = [];
        movementVideoIndex[movementId].push({
          combo,
          index: comboIndex + 1,
          url,
          places: placesByMovement[key]
        });
      });
    });
  });
}
function getMovementVideoEntries(movementId) {
  return movementVideoIndex[movementId] || [];
}
function pruneComboVideos() {
  if (!state.comboVideos) return;
  Object.keys(state.comboVideos).forEach(key => {
    let v = state.comboVideos[key];
    if (typeof v === 'string') v = [v];
    if (!Array.isArray(v)) {
      delete state.comboVideos[key];
      return;
    }
    v = v.filter(x => typeof x === 'string');
    if (v.length === 0) {
      delete state.comboVideos[key];
      return;
    }
    const valid = key.split('|').every(part => {
      const [nodeId, movementId, beat, length] = part.split(':').map(Number);
      const node = state.nodes[nodeId];
      return node
        && node.movementId === movementId
        && node.beat === beat
        && node.length === length;
    });
    if (!valid) delete state.comboVideos[key];
    else state.comboVideos[key] = v;
  });
}
function pruneComboDescriptions() {
  const pruneMap = (map) => {
    if (!map) return;
    Object.keys(map).forEach(key => {
      const valid = key.split('|').every(part => {
        const [nodeId, movementId, beat, length] = part.split(':').map(Number);
        const node = state.nodes[nodeId];
        return node
          && node.movementId === movementId
          && node.beat === beat
          && node.length === length;
      });
      if (!valid) delete map[key];
    });
  };
  pruneMap(state.comboDescriptions);
  pruneMap(state.comboDescriptionSegments);
}
function parseComboVideoUrl(raw) {
  let value = (raw || '').trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = 'https://' + value;

  let url;
  try { url = new URL(value); } catch (e) { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase();
  const isDriveHost = host === 'drive.google.com'
    || host === 'docs.google.com'
    || host === 'drive.usercontent.google.com';
  if (!isDriveHost) return null;

  const pathMatch = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
  let fileId = pathMatch ? pathMatch[1] : null;
  if (!fileId && (host === 'drive.google.com' || host === 'drive.usercontent.google.com')) {
    fileId = url.searchParams.get('id');
  }
  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) return null;

  const resourceKey = url.searchParams.get('resourcekey');
  const suffix = resourceKey ? `?resourcekey=${encodeURIComponent(resourceKey)}` : '';
  return {
    embedUrl: `https://drive.google.com/file/d/${fileId}/preview${suffix}`,
    openUrl: `https://drive.google.com/file/d/${fileId}/view${suffix}`
  };
}
function renderCombos() {
  const container = document.getElementById('combosContainer');
  container.innerHTML = '';
  const combos = collectCombos();
  document.getElementById('comboCount').textContent = combos.length ? `(${combos.length})` : '';
  if (combos.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = 'Комбинации появятся, когда в дереве будут завершённые пути.';
    container.appendChild(hint); return;
  }
  const ul = document.createElement('ul');
  ul.className = 'combo-list';
  combos.forEach((combo, idx) => {
    const li = document.createElement('li');
    const totalBeats = combo.reduce((s, n) => s + n.length, 0);
    const idxSpan = document.createElement('span');
    idxSpan.className = 'combo-idx';
    idxSpan.textContent = `#${idx + 1} (${comboSizeLabel(totalBeats)})`;

    const head = document.createElement('div');
    head.className = 'combo-head';
    const videos = getComboVideos(combo);
    const videoBtn = document.createElement('button');
    videoBtn.type = 'button';
    videoBtn.className = 'combo-video-btn' + (videos.length ? ' has-video' : '');
    videoBtn.textContent = videos.length ? (videos.length > 1 ? `▶ Видео (${videos.length})` : '▶ Видео') : '+ Видео';
    videoBtn.title = videos.length ? 'Открыть видео связки' : 'Прикрепить видео к связке';
    videoBtn.onclick = (e) => {
      e.stopPropagation();
      openComboVideoModal(combo, idx + 1);
    };
    const descText = getComboDescription(combo);
    const descBtn = document.createElement('button');
    descBtn.type = 'button';
    descBtn.className = 'combo-desc-btn' + (descText ? ' has-desc' : '');
    descBtn.textContent = descText ? '✎ Описание' : '+ Описание';
    descBtn.title = descText ? 'Редактировать описание связки' : 'Добавить описание связки';
    descBtn.onclick = (e) => {
      e.stopPropagation();
      openComboDescriptionModal(combo, idx + 1);
    };
    const actions = document.createElement('div');
    actions.className = 'combo-head-actions';
    actions.append(videoBtn, descBtn);
    head.append(idxSpan, actions);
    li.appendChild(head);
    li.appendChild(document.createElement('br'));
    combo.forEach((node, i) => {
      if (i > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'arrow'; arrow.textContent = '→';
        li.appendChild(arrow);
      }
      const mov = getMovement(node.movementId);
      const movSpan = document.createElement('span');
      movSpan.className = 'mov';
      renderRichText(nameSegmentsOf(mov), movSpan);
      const beatSpan = document.createElement('span');
      beatSpan.className = 'beat';
      beatSpan.textContent = ` (${formatBeatNode(node.beat, node.length)})`;
      li.append(movSpan, beatSpan);
      if (isSquareEnd(node.beat, node.length)) {
        const sq = document.createElement('span');
        sq.className = 'square-mark'; sq.textContent = '✓';
        li.appendChild(sq);
      }
    });
    if (descText) {
      const desc = document.createElement('div');
      desc.className = 'combo-desc';
      renderRichText(getComboDescriptionSegments(combo) || [{ text: descText }], desc);
      li.appendChild(desc);
    }
    ul.appendChild(li);
  });
  container.appendChild(ul);
}
let comboVideoModalState = null;
let comboVideoFocus = null;

function openComboVideoModal(combo, index) {
  const key = comboVideoKey(combo);
  comboVideoFocus = document.activeElement;
  const existing = state.comboVideos && Array.isArray(state.comboVideos[key]) ? state.comboVideos[key] : [];
  comboVideoModalState = { index, key, videos: existing.slice(), activeIndex: 0, openUrl: '' };
  document.getElementById('comboVideoTitle').textContent = `Видео связки #${index}`;
  document.getElementById('comboVideoError').textContent = '';
  renderComboVideoList();
  setComboVideoPlayer(comboVideoModalState.videos[0] || '');
  document.getElementById('comboVideoModal').classList.add('open');
  if (comboVideoModalState.videos.length === 0) addComboVideoRow();
}

function closeComboVideoModal() {
  document.getElementById('comboVideoModal').classList.remove('open');
  const frame = document.getElementById('comboVideoFrame');
  frame.src = 'about:blank';
  frame.hidden = true;
  const empty = document.getElementById('comboVideoEmpty');
  empty.hidden = false;
  empty.textContent = 'Видео пока не прикреплено';
  document.getElementById('comboVideoList').innerHTML = '';
  document.getElementById('comboVideoError').textContent = '';
  comboVideoModalState = null;
  if (comboVideoFocus && document.contains(comboVideoFocus)) comboVideoFocus.focus();
  comboVideoFocus = null;
}

function renderComboVideoList() {
  const list = document.getElementById('comboVideoList');
  list.innerHTML = '';
  comboVideoModalState.videos.forEach((url, i) => {
    const row = document.createElement('div');
    row.className = 'combo-video-row';
    const input = document.createElement('input');
    input.type = 'url';
    input.className = 'combo-video-row-input';
    input.placeholder = 'https://drive.google.com/file/d/.../view';
    input.value = url;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.oninput = () => {
      comboVideoModalState.videos[i] = input.value;
      if (i === comboVideoModalState.activeIndex) setComboVideoPlayer(input.value);
    };
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'icon-btn';
    preview.title = 'Показать';
    preview.textContent = '▶';
    preview.onclick = () => {
      comboVideoModalState.activeIndex = i;
      setComboVideoPlayer(comboVideoModalState.videos[i] || '');
      markComboVideoActiveRow();
    };
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn danger';
    del.title = 'Удалить';
    del.textContent = '✕';
    del.onclick = () => {
      comboVideoModalState.videos.splice(i, 1);
      if (comboVideoModalState.activeIndex >= comboVideoModalState.videos.length) {
        comboVideoModalState.activeIndex = Math.max(0, comboVideoModalState.videos.length - 1);
      }
      renderComboVideoList();
      setComboVideoPlayer(comboVideoModalState.videos[comboVideoModalState.activeIndex] || '');
    };
    row.append(input, preview, del);
    list.appendChild(row);
  });
  markComboVideoActiveRow();
}

function markComboVideoActiveRow() {
  document.querySelectorAll('#comboVideoList .combo-video-row').forEach((el, i) => {
    el.classList.toggle('active', i === comboVideoModalState.activeIndex);
  });
}

function addComboVideoRow() {
  comboVideoModalState.videos.push('');
  comboVideoModalState.activeIndex = comboVideoModalState.videos.length - 1;
  renderComboVideoList();
  const inputs = document.querySelectorAll('#comboVideoList .combo-video-row-input');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function setComboVideoPlayer(rawUrl) {
  const frame = document.getElementById('comboVideoFrame');
  const empty = document.getElementById('comboVideoEmpty');
  const openBtn = document.getElementById('btnOpenComboVideoLink');
  const parsed = rawUrl ? parseComboVideoUrl(rawUrl) : null;

  if (parsed) {
    if (frame.src !== parsed.embedUrl) frame.src = parsed.embedUrl;
    frame.hidden = false;
    empty.hidden = true;
    openBtn.disabled = false;
    if (comboVideoModalState) comboVideoModalState.openUrl = parsed.openUrl;
  } else {
    frame.src = 'about:blank';
    frame.hidden = true;
    empty.hidden = false;
    empty.textContent = rawUrl
      ? 'Ссылка не распознана. Нужна ссылка на видеофайл Google Диска.'
      : 'Видео пока не прикреплено';
    openBtn.disabled = true;
    if (comboVideoModalState) comboVideoModalState.openUrl = '';
  }
}

function saveComboVideo() {
  if (!comboVideoModalState) return;
  const errorEl = document.getElementById('comboVideoError');
  const videos = [];
  for (const raw of comboVideoModalState.videos) {
    const value = (raw || '').trim();
    if (!value) continue;
    const parsed = parseComboVideoUrl(value);
    if (!parsed) {
      errorEl.textContent = 'Все ссылки должны быть ссылками на видеофайлы Google Диска.';
      return;
    }
    videos.push(parsed.openUrl);
  }

  errorEl.textContent = '';
  if (!state.comboVideos) state.comboVideos = {};
  if (videos.length) {
    state.comboVideos[comboVideoModalState.key] = videos;
  } else {
    delete state.comboVideos[comboVideoModalState.key];
  }
  saveState(); render();
  closeComboVideoModal();
}

function openComboVideoLink() {
  if (!comboVideoModalState || !comboVideoModalState.openUrl) return;
  window.open(comboVideoModalState.openUrl, '_blank', 'noopener,noreferrer');
}

let comboDescModalState = null;
let comboDescFocus = null;

function openComboDescriptionModal(combo, index) {
  const key = comboVideoKey(combo);
  comboDescFocus = document.activeElement;
  comboDescModalState = { key };
  const input = document.getElementById('comboDescriptionInput');
  const segs = state.comboDescriptionSegments && state.comboDescriptionSegments[key];
  setMentionText(input, segs || (state.comboDescriptions && state.comboDescriptions[key]) || '');
  document.getElementById('comboDescriptionTitle').textContent = `Описание связки #${index}`;
  document.getElementById('comboDescriptionModal').classList.add('open');
  focusMentionEditor(input, false);
}

function closeComboDescriptionModal() {
  document.getElementById('comboDescriptionModal').classList.remove('open');
  comboDescModalState = null;
  if (comboDescFocus && document.contains(comboDescFocus)) comboDescFocus.focus();
  comboDescFocus = null;
}

function saveComboDescription() {
  if (!comboDescModalState) return;
  const input = document.getElementById('comboDescriptionInput');
  const text = mentionText(input).trim();
  const segments = mentionSegments(input);
  const key = comboDescModalState.key;
  if (!state.comboDescriptions) state.comboDescriptions = {};
  if (!state.comboDescriptionSegments) state.comboDescriptionSegments = {};
  if (text) {
    state.comboDescriptions[key] = text;
    state.comboDescriptionSegments[key] = segments;
  } else {
    delete state.comboDescriptions[key];
    delete state.comboDescriptionSegments[key];
  }
  saveState(); render();
  closeComboDescriptionModal();
}

let nodeVideosModalState = null;
let nodeVideosFocus = null;

function openNodeVideosModal(nodeId) {
  const node = state.nodes[nodeId];
  if (!node) return;
  const entries = getNodeVideoEntries(nodeId);
  if (entries.length === 0) return;

  nodeVideosFocus = document.activeElement;
  nodeVideosModalState = { nodeId, entries, activeIndex: 0, openUrl: '' };
  const mov = getMovement(node.movementId);
  document.getElementById('nodeVideosTitle').textContent = `Видео: ${mov ? mov.name : '???'}`;
  document.getElementById('nodeVideosHint').textContent =
    `${formatBeat(node.beat, node.length)} · видео: ${entries.length}`;
  renderNodeVideoList(nodeId);
  setNodeVideosEntry(0);
  document.getElementById('nodeVideosModal').classList.add('open');
  document.getElementById('btnCloseNodeVideos').focus();
}

function closeNodeVideosModal() {
  document.getElementById('nodeVideosModal').classList.remove('open');
  const frame = document.getElementById('nodeVideosFrame');
  frame.src = 'about:blank';
  frame.hidden = true;
  const empty = document.getElementById('nodeVideosEmpty');
  empty.hidden = false;
  empty.textContent = 'Видео пока не прикреплено';
  document.getElementById('nodeVideosList').innerHTML = '';
  document.getElementById('nodeVideosHint').textContent = '';
  nodeVideosModalState = null;
  if (nodeVideosFocus && document.contains(nodeVideosFocus)) nodeVideosFocus.focus();
  nodeVideosFocus = null;
}

function renderNodeVideoList(nodeId) {
  const node = state.nodes[nodeId];
  const list = document.getElementById('nodeVideosList');
  list.innerHTML = '';
  if (!node || !nodeVideosModalState) return;

  nodeVideosModalState.entries.forEach((entry, idx) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'node-video-item';

    const head = document.createElement('span');
    head.className = 'node-video-item-head';
    head.textContent = `Комбинация #${entry.index}`;

    const totalBeats = entry.combo.reduce((s, n) => s + n.length, 0);
    const meta = document.createElement('span');
    meta.className = 'node-video-item-meta';
    meta.textContent = `${comboSizeLabel(totalBeats)} · ${formatBeat(node.beat, node.length)}`;

    const seq = document.createElement('span');
    seq.className = 'node-video-item-seq';
    seq.textContent = entry.combo.map(n => {
      const mov = getMovement(n.movementId);
      return mov ? mov.name : '???';
    }).join(' → ');

    item.append(head, meta, seq);
    item.onclick = () => setNodeVideosEntry(idx);
    list.appendChild(item);
  });
}

function setNodeVideosEntry(index) {
  if (!nodeVideosModalState) return;
  const entry = nodeVideosModalState.entries[index];
  if (!entry) return;
  nodeVideosModalState.activeIndex = index;
  const parsed = parseComboVideoUrl(entry.url);
  const frame = document.getElementById('nodeVideosFrame');
  const empty = document.getElementById('nodeVideosEmpty');
  const openBtn = document.getElementById('btnOpenNodeVideoLink');

  if (parsed) {
    if (frame.src !== parsed.embedUrl) frame.src = parsed.embedUrl;
    frame.hidden = false;
    empty.hidden = true;
    openBtn.disabled = false;
    nodeVideosModalState.openUrl = parsed.openUrl;
  } else {
    frame.src = 'about:blank';
    frame.hidden = true;
    empty.hidden = false;
    empty.textContent = 'Ссылка на видео не распознана.';
    openBtn.disabled = true;
    nodeVideosModalState.openUrl = '';
  }

  document.querySelectorAll('#nodeVideosList .node-video-item').forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });
}

function openNodeVideoLink() {
  if (!nodeVideosModalState || !nodeVideosModalState.openUrl) return;
  window.open(nodeVideosModalState.openUrl, '_blank', 'noopener,noreferrer');
}
