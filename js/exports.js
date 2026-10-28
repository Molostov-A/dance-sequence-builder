function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
function downloadJson(obj, filename) {
  let dataStr;
  try { dataStr = JSON.stringify(obj, null, 2); }
  catch (e) { alert('Ошибка сериализации: ' + e.message); return; }
  let blob;
  try { blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' }); }
  catch (e) { blob = new Blob([dataStr], { type: 'application/json' }); }
  if (window.navigator && window.navigator.msSaveOrOpenBlob) {
    window.navigator.msSaveOrOpenBlob(blob, filename); return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a);
  try {
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 5000);
  } catch (e) {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showExportModal(dataStr);
  }
}
function showExportModal(text) {
  const modal = document.getElementById('exportModal');
  const ta = document.getElementById('exportText');
  ta.value = text; modal.classList.add('open');
}
function closeExportModal() { document.getElementById('exportModal').classList.remove('open'); }
function copyExportText() {
  const ta = document.getElementById('exportText'); ta.select();
  try { document.execCommand('copy'); alert('Скопировано'); }
  catch (e) { alert('Не удалось скопировать. Выделите текст вручную.'); }
}
function exportAll() {
  const data = { ...state }; delete data.activePath;
  downloadJson(data, `${APP_NAME}_${timestamp()}.json`);
}
function exportCombos() {
  const combos = collectCombos();
  const out = {
    app: APP_NAME,
    exportedAt: new Date().toISOString(),
    combos: combos.map((combo, idx) => {
      const totalBeats = combo.reduce((s, n) => s + n.length, 0);
      return {
        index: idx + 1, totalBeats, squares: totalBeats / 32,
        videos: getComboVideos(combo),
        description: getComboDescription(combo),
        steps: combo.map(n => {
          const mov = getMovement(n.movementId);
          const step = {
            movement: mov ? mov.name : '???',
            movementId: n.movementId,
            lead: mov ? (mov.lead || '') : '',
            follow: mov ? (mov.follow || '') : '',
            beat: n.beat, length: n.length,
            beatInEighth: beatInEighth(n.beat),
            label: formatBeatShort(n.beat, n.length),
            eighth: eighthNumber(n.beat)
          };
          if (n.preparation && n.preparation.movementId) {
            const pm = getMovement(n.preparation.movementId);
            step.preparation = {
              movementId: pm ? pm.id : n.preparation.movementId,
              movement: pm ? pm.name : null,
              lead: pm ? pm.lead : '',
              follow: pm ? pm.follow : ''
            };
          }
          return step;
        })
      };
    })
  };
  downloadJson(out, `${APP_NAME}_combos_${timestamp()}.json`);
}
function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => { applyImportedJson(e.target.result); };
  reader.readAsText(file);
  event.target.value = '';
}
function applyImportedJson(text) {
  try {
    const data = JSON.parse(text);
    if (!data.movements || !data.nodes || !data.roots) {
      alert('Некорректный файл (ожидаются movements, nodes, roots).'); return false;
    }
    if (!confirm('Заменить текущие данные импортом?')) return false;
    state = data;
    if (!state.nodeOrder) state.nodeOrder = Object.keys(state.nodes).map(Number);
    if (!state.nextNodeId) state.nextNodeId = Math.max(0, ...Object.keys(state.nodes).map(Number)) + 1;
    if (!state.nextMovId) state.nextMovId = Math.max(0, ...state.movements.map(m => m.id)) + 1;
    if (!state.activePath) state.activePath = [];
    if (!state.merges) state.merges = [];
    normalizeComboVideos(state);
    if (!Array.isArray(state.concepts)) state.concepts = [];
    if (!state.nextConceptId) state.nextConceptId = 1;
    if (!state.comboDescriptions || typeof state.comboDescriptions !== 'object') state.comboDescriptions = {};
    if (!state.comboDescriptionSegments || typeof state.comboDescriptionSegments !== 'object') state.comboDescriptionSegments = {};
    if (!state.treeViewMode) state.treeViewMode = 'path';
    if (typeof state.navPinned !== 'boolean') state.navPinned = true;
    normalizePreparations(state);
    normalizeCollapsedNodes(state);
    pruneComboVideos();
    pruneComboDescriptions();
    pruneMentions();
    ensureActivePathValid();
    saveState();
    render();
    return true;
  } catch (err) { alert('Ошибка чтения JSON: ' + err.message); return false; }
}
function normalizeImportUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === 'drive.google.com' || host === 'docs.google.com') {
      const m = u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
      let id = m ? m[1] : null;
      if (!id) id = u.searchParams.get('id');
      if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
    }
  } catch (e) {}
  return url;
}
function openImportModal() {
  document.getElementById('importUrlError').textContent = '';
  document.getElementById('importUrlInput').value = '';
  showImportOptionsStep();
  document.getElementById('importModal').classList.add('open');
}
function closeImportModal() {
  document.getElementById('importModal').classList.remove('open');
}
function showImportOptionsStep() {
  document.getElementById('importStep1').classList.remove('hidden');
  document.getElementById('importStep2').classList.add('hidden');
}
function showImportUrlStep() {
  document.getElementById('importStep1').classList.add('hidden');
  document.getElementById('importStep2').classList.remove('hidden');
  document.getElementById('importUrlInput').focus();
}
function importFromUrl() {
  const input = document.getElementById('importUrlInput');
  const errorEl = document.getElementById('importUrlError');
  const url = (input.value || '').trim();
  if (!url) {
    errorEl.textContent = 'Вставьте ссылку на JSON-файл.';
    input.focus();
    return;
  }
  errorEl.textContent = '';
  fetch(normalizeImportUrl(url))
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(text => {
      if (applyImportedJson(text)) closeImportModal();
    })
    .catch(err => {
      errorEl.textContent = 'Не удалось загрузить JSON: ' + err.message;
    });
}