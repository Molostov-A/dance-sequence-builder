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
function getComboVideo(combo) {
  if (!state.comboVideos) return '';
  const url = state.comboVideos[comboVideoKey(combo)];
  return typeof url === 'string' ? url : '';
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
    if (!getComboVideo(combo)) return;
    const seen = new Set();
    combo.forEach(node => {
      if (seen.has(node.id)) return;
      seen.add(node.id);
      nodeVideoIndex[node.id] = (nodeVideoIndex[node.id] || 0) + 1;
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
    const url = getComboVideo(combo);
    if (!url) return;
    entries.push({ combo, index: idx + 1, url });
  });
  return entries;
}
let movementVideoIndex = {};
function rebuildMovementVideoIndex() {
  movementVideoIndex = {};
  collectCombos().forEach((combo, comboIndex) => {
    const url = getComboVideo(combo);
    if (!url) return;
    const placesByMovement = {};
    combo.forEach(node => {
      if (!placesByMovement[node.movementId]) placesByMovement[node.movementId] = [];
      placesByMovement[node.movementId].push({ beat: node.beat, length: node.length });
    });
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
}
function getMovementVideoEntries(movementId) {
  return movementVideoIndex[movementId] || [];
}
function pruneComboVideos() {
  if (!state.comboVideos) return;
  Object.keys(state.comboVideos).forEach(key => {
    if (typeof state.comboVideos[key] !== 'string') {
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
  });
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
    const videoUrl = getComboVideo(combo);
    const videoBtn = document.createElement('button');
    videoBtn.type = 'button';
    videoBtn.className = 'combo-video-btn' + (videoUrl ? ' has-video' : '');
    videoBtn.textContent = videoUrl ? '▶ Видео' : '+ Видео';
    videoBtn.title = videoUrl ? 'Открыть видео связки' : 'Прикрепить видео к связке';
    videoBtn.onclick = (e) => {
      e.stopPropagation();
      openComboVideoModal(combo, idx + 1);
    };
    head.append(idxSpan, videoBtn);
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
      movSpan.textContent = mov ? mov.name : '???';
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
    ul.appendChild(li);
  });
  container.appendChild(ul);
}
let comboVideoModalState = null;
let comboVideoFocus = null;

function openComboVideoModal(combo, index) {
  const key = comboVideoKey(combo);
  comboVideoFocus = document.activeElement;
  comboVideoModalState = { index, key };

  const input = document.getElementById('comboVideoInput');
  input.value = (state.comboVideos && state.comboVideos[key]) || '';
  document.getElementById('comboVideoTitle').textContent = `Видео связки #${index}`;
  document.getElementById('comboVideoError').textContent = '';
  setComboVideoPlayer(input.value);
  updateComboVideoButtons();
  document.getElementById('comboVideoModal').classList.add('open');
  input.focus();
  input.select();
}

function closeComboVideoModal() {
  document.getElementById('comboVideoModal').classList.remove('open');
  const frame = document.getElementById('comboVideoFrame');
  frame.src = 'about:blank';
  frame.hidden = true;
  document.getElementById('comboVideoEmpty').hidden = false;
  document.getElementById('comboVideoInput').value = '';
  document.getElementById('comboVideoError').textContent = '';
  comboVideoModalState = null;
  if (comboVideoFocus && document.contains(comboVideoFocus)) comboVideoFocus.focus();
  comboVideoFocus = null;
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

function updateComboVideoButtons() {
  const removeBtn = document.getElementById('btnRemoveComboVideo');
  const hasStored = !!(comboVideoModalState
    && state.comboVideos
    && state.comboVideos[comboVideoModalState.key]);
  removeBtn.disabled = !hasStored;
}

function saveComboVideo() {
  if (!comboVideoModalState) return;
  const input = document.getElementById('comboVideoInput');
  const errorEl = document.getElementById('comboVideoError');
  const parsed = parseComboVideoUrl(input.value);
  if (!parsed) {
    errorEl.textContent = 'Вставьте ссылку на видеофайл из Google Диска.';
    input.focus();
    input.select();
    return;
  }

  errorEl.textContent = '';
  input.value = parsed.openUrl;
  if (!state.comboVideos) state.comboVideos = {};
  const changed = state.comboVideos[comboVideoModalState.key] !== parsed.openUrl;
  state.comboVideos[comboVideoModalState.key] = parsed.openUrl;
  if (changed) { saveState(); render(); }
  setComboVideoPlayer(parsed.openUrl);
  updateComboVideoButtons();
}

function removeComboVideo() {
  if (!comboVideoModalState) return;
  const key = comboVideoModalState.key;
  if (state.comboVideos && state.comboVideos[key]) {
    delete state.comboVideos[key];
    saveState();
    render();
  }
  document.getElementById('comboVideoInput').value = '';
  document.getElementById('comboVideoError').textContent = '';
  setComboVideoPlayer('');
  updateComboVideoButtons();
  document.getElementById('comboVideoInput').focus();
}

function openComboVideoLink() {
  if (!comboVideoModalState || !comboVideoModalState.openUrl) return;
  window.open(comboVideoModalState.openUrl, '_blank', 'noopener,noreferrer');
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
