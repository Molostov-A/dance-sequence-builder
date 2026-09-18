let panelState = loadPanelState();

function loadPanelState() {
  try {
    const raw = localStorage.getItem(PANEL_STATE_KEY);
    const defaults = { libPanel: true, treePanel: true, comboPanel: true, genPanel: true };
    return raw ? Object.assign(defaults, JSON.parse(raw)) : defaults;
  } catch (e) {
    return { libPanel: true, treePanel: true, comboPanel: true, genPanel: true };
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
  ['libPanel', 'treePanel', 'comboPanel', 'genPanel'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (panelState[id]) el.classList.remove('collapsed');
    else el.classList.add('collapsed');
  });
  setTimeout(() => { if (panelState.treePanel) renderTree(); }, 50);
}