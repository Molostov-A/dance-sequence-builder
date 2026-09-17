let panelState = loadPanelState();

function loadPanelState() {
  try {
    const raw = localStorage.getItem(PANEL_STATE_KEY);
    return raw ? JSON.parse(raw) : { libPanel: true, treePanel: true, comboPanel: true };
  } catch (e) {
    return { libPanel: true, treePanel: true, comboPanel: true };
  }
}
function savePanelState() {
  try { localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(panelState)); } catch (e) {}
}
function togglePanel(id) {
  panelState[id] = !panelState[id];
  savePanelState(); applyPanelState();
}
function applyPanelState() {
  ['libPanel', 'treePanel', 'comboPanel'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (panelState[id]) el.classList.remove('collapsed');
    else el.classList.add('collapsed');
  });
  setTimeout(() => { if (panelState.treePanel) renderTree(); }, 50);
}