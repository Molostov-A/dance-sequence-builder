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
        steps: combo.map(n => {
          const mov = getMovement(n.movementId);
          return {
            movement: mov ? mov.name : '???',
            movementId: n.movementId,
            beat: n.beat, length: n.length,
            beatInEighth: beatInEighth(n.beat),
            label: formatBeatShort(n.beat, n.length),
            eighth: eighthNumber(n.beat)
          };
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
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.movements || !data.nodes || !data.roots) {
        alert('Некорректный файл (ожидаются movements, nodes, roots).'); return;
      }
      if (!confirm('Заменить текущие данные импортом?')) return;
      state = data;
      if (!state.nodeOrder) state.nodeOrder = Object.keys(state.nodes).map(Number);
      if (!state.nextNodeId) state.nextNodeId = Math.max(0, ...Object.keys(state.nodes).map(Number)) + 1;
      if (!state.nextMovId) state.nextMovId = Math.max(0, ...state.movements.map(m => m.id)) + 1;
      if (!state.activePath) state.activePath = [];
      if (!state.merges) state.merges = [];
      if (!state.treeViewMode) state.treeViewMode = 'path';
      ensureActivePathValid();
      saveState(); render();
    } catch (err) { alert('Ошибка чтения JSON: ' + err.message); }
  };
  reader.readAsText(file);
  event.target.value = '';
}