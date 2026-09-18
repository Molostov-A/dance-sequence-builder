function render() {
  ensureActivePathValid();
  renderMovements();
  renderRootsBar();
  renderBreadcrumb();
  renderTree();
  renderCombos();
  applyPanelState();
}

document.getElementById('btnAddRoot').addEventListener('click', addRoot);
document.getElementById('btnExportCombos').addEventListener('click', exportCombos);
document.getElementById('btnExportAll').addEventListener('click', exportAll);
document.getElementById('btnImport').addEventListener('click', () => {
  document.getElementById('importFile').click();
});
document.getElementById('importFile').addEventListener('change', importJson);
document.getElementById('btnAddMovement').addEventListener('click', addMovementFromInput);
document.getElementById('newMovInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addMovementFromInput();
});
document.querySelectorAll('[data-toggle-panel]').forEach(el => {
  el.addEventListener('click', () => togglePanel(el.dataset.togglePanel));
});
document.getElementById('btnCopyExport').addEventListener('click', copyExportText);
document.getElementById('btnCloseExport').addEventListener('click', closeExportModal);
document.getElementById('btnViewPath').addEventListener('click', (e) => { e.stopPropagation(); toggleTreeView('path'); });
document.getElementById('btnViewAll').addEventListener('click', (e) => { e.stopPropagation(); toggleTreeView('all'); });

ensureActivePathValid();
applyPanelState();
document.getElementById('btnViewPath').classList.toggle('active', state.treeViewMode === 'path');
document.getElementById('btnViewAll').classList.toggle('active', state.treeViewMode === 'all');
render();

window.addEventListener('resize', () => {
  if (openFormState) positionForm();
  else if (panelState.treePanel) renderTree();
});