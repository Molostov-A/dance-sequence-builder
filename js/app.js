function render() {
  ensureActivePathValid();
  renderMovements();
  renderRootsBar();
  renderBreadcrumb();
  renderTree();
  renderCombos();
  renderGenerator();
  setView(state.currentView);
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
document.getElementById('btnCopyExport').addEventListener('click', copyExportText);
document.getElementById('btnCloseExport').addEventListener('click', closeExportModal);
document.getElementById('btnSaveMovement').addEventListener('click', saveMovementModal);
document.getElementById('btnCancelMovement').addEventListener('click', closeMovementModal);
document.getElementById('movementNameInput').addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (e.key === 'Enter') { e.preventDefault(); saveMovementModal(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeMovementModal(); }
});
document.getElementById('movementModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeMovementModal();
});
document.getElementById('btnViewPath').addEventListener('click', (e) => { e.stopPropagation(); toggleTreeView('path'); });
document.getElementById('btnViewAll').addEventListener('click', (e) => { e.stopPropagation(); toggleTreeView('all'); });
document.getElementById('btnGenerate').addEventListener('click', () => { generateSequences(); renderGenerator(); });

// Navigation dropdown
document.getElementById('navToggle').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('navMenu').classList.toggle('open');
});
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => setView(item.dataset.view));
});
document.addEventListener('click', () => {
  document.getElementById('navMenu').classList.remove('open');
});

ensureActivePathValid();
document.getElementById('btnViewPath').classList.toggle('active', state.treeViewMode === 'path');
document.getElementById('btnViewAll').classList.toggle('active', state.treeViewMode === 'all');
render();

window.addEventListener('resize', () => {
  if (openFormState) positionForm();
  else if (state.currentView === 'tree') renderTree();
});