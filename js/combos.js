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
    const squares = Math.floor(totalBeats / 32);
    const rem = totalBeats % 32;
    const idxSpan = document.createElement('span');
    idxSpan.className = 'combo-idx';
    let sizeLabel = `${totalBeats} счётов`;
    if (squares > 0) sizeLabel += ` • ${squares} кв.`;
    if (rem) sizeLabel += ` +${rem}`;
    idxSpan.textContent = `#${idx + 1} (${sizeLabel})`;
    li.appendChild(idxSpan);
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