function render() {
  ensureActivePathValid();
  renderMovements();
  renderRootsBar();
  renderBreadcrumb();
  renderTree();
  renderCombos();
  renderGenerator();
  renderDictionary();
  setView(state.currentView);
}

document.getElementById('btnAddRoot').addEventListener('click', addRoot);
document.getElementById('btnExportCombos').addEventListener('click', exportCombos);
document.getElementById('btnExportAll').addEventListener('click', exportAll);
document.getElementById('btnImport').addEventListener('click', () => {
  openImportModal();
});
document.getElementById('importFile').addEventListener('change', importJson);
document.getElementById('btnImportLocal').addEventListener('click', () => {
  closeImportModal();
  document.getElementById('importFile').click();
});
document.getElementById('btnImportUrl').addEventListener('click', showImportUrlStep);
document.getElementById('btnImportBack').addEventListener('click', showImportOptionsStep);
document.getElementById('btnImportFetch').addEventListener('click', importFromUrl);
document.getElementById('btnCloseImport').addEventListener('click', closeImportModal);
document.getElementById('importUrlInput').addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (e.key === 'Enter') { e.preventDefault(); importFromUrl(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeImportModal(); }
});
document.getElementById('importModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeImportModal();
});
document.getElementById('importModal').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeImportModal(); }
});
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
document.getElementById('btnSaveComboVideo').addEventListener('click', saveComboVideo);
document.getElementById('btnAddComboVideo').addEventListener('click', addComboVideoRow);
document.getElementById('btnOpenComboVideoLink').addEventListener('click', openComboVideoLink);
document.getElementById('btnCloseComboVideo').addEventListener('click', closeComboVideoModal);
document.getElementById('comboVideoModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeComboVideoModal();
});
document.getElementById('btnSaveComboDescription').addEventListener('click', saveComboDescription);
document.getElementById('btnCloseComboDescription').addEventListener('click', closeComboDescriptionModal);
document.getElementById('comboDescriptionModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeComboDescriptionModal();
});
document.getElementById('comboDescriptionModal').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeComboDescriptionModal(); }
});
document.getElementById('btnOpenNodeVideoLink').addEventListener('click', openNodeVideoLink);
document.getElementById('btnCloseNodeVideos').addEventListener('click', closeNodeVideosModal);
document.getElementById('nodeVideosModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeNodeVideosModal();
});
document.getElementById('nodeVideosModal').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeNodeVideosModal(); }
});
document.getElementById('btnOpenMovementVideoLink').addEventListener('click', openMovementVideoLink);
document.getElementById('btnCloseMovementVideos').addEventListener('click', closeMovementVideosModal);
document.getElementById('movementVideosModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeMovementVideosModal();
});
document.getElementById('movementVideosModal').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeMovementVideosModal(); }
});
document.getElementById('btnAddConcept').addEventListener('click', () => openConceptModal({}));
document.getElementById('btnSaveConcept').addEventListener('click', saveConceptModal);
document.getElementById('btnCancelConcept').addEventListener('click', closeConceptModal);
document.getElementById('btnAddConceptName').addEventListener('click', addConceptName);
document.getElementById('btnAddConceptMedia').addEventListener('click', addConceptMedia);
document.getElementById('conceptShortInput').addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (e.key === 'Enter') { e.preventDefault(); saveConceptModal(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeConceptModal(); }
});
document.getElementById('conceptModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeConceptModal();
});
document.getElementById('conceptModal').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeConceptModal(); }
});
document.getElementById('btnCancelConceptDelete').addEventListener('click', closeConceptDeleteModal);
document.getElementById('btnConfirmConceptDelete').addEventListener('click', confirmConceptDelete);
document.getElementById('btnReplaceAndDelete').addEventListener('click', replaceAndDeleteConcept);
document.getElementById('conceptReplaceKind').addEventListener('change', updateConceptReplaceKind);
document.getElementById('conceptDeleteModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeConceptDeleteModal();
});
document.getElementById('conceptDeleteModal').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeConceptDeleteModal(); }
});
document.getElementById('btnOpenMediaLink').addEventListener('click', openMediaLink);
document.getElementById('btnCloseMedia').addEventListener('click', closeMediaModal);
document.getElementById('mediaModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeMediaModal();
});
document.getElementById('mediaModal').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeMediaModal(); }
});
document.getElementById('mentionSearch').addEventListener('input', (e) => renderMentionList(e.target.value));
document.getElementById('mentionSearch').addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (e.key === 'Escape') { e.preventDefault(); closeMentionPicker(); }
  else if (e.key === 'ArrowDown') {
    e.preventDefault();
    const n = mentionListCount();
    if (n) {
      const a = mentionPickerState ? mentionPickerState.active : -1;
      setMentionListActive(Math.min(a + 1, n - 1));
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const a = mentionPickerState ? mentionPickerState.active : -1;
    if (a > 0) setMentionListActive(a - 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const items = document.querySelectorAll('#mentionList .mention-item');
    if (items.length) {
      const a = mentionPickerState ? mentionPickerState.active : -1;
      const idx = a >= 0 ? a : 0;
      selectMention(items[idx].getAttribute('data-concept-id'));
    }
  }
});
document.getElementById('mentionModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeMentionPicker();
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
initMentions();
pruneMentions();
render();

window.addEventListener('resize', () => {
  if (openFormState) positionForm();
  else if (state.currentView === 'tree') renderTree();
});