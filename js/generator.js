const GEN_MAX_COMBOS = 1000;
let genSequences = [];
let genSelectedIdx = -1;

/* ===== Фильтры сгенерированных связок =====
   Как и результаты генерации, живут только в памяти модуля.
   diverse — «максимально разнообразные»: доля разных движений в связке
     (unique / шагов) равна наибольшей среди всех сгенерированных; обычно
     это связки без повторов, а если таких нет — с наименьшим числом повторов.
   novel — «новые сочетания»: генератор собирает связки из уже существующих
     переходов «движение → движение», поэтому новизну считаем по цепочкам из
     трёх движений подряд, которых нет ни в одной готовой комбинации.
   При включённом фильтре список сортируется: больше новых цепочек, затем
   больше разнообразие. Номер #N остаётся номером в полном списке. */
let genFilters = { diverse: false, novel: false };

function movementTriples(movementIds) {
  const out = [];
  for (let i = 0; i + 2 < movementIds.length; i++) {
    out.push(movementIds[i] + '>' + movementIds[i + 1] + '>' + movementIds[i + 2]);
  }
  return out;
}

function existingMovementTriples() {
  const set = new Set();
  collectCombos().forEach(combo => {
    movementTriples(combo.map(n => n.movementId)).forEach(t => set.add(t));
  });
  return set;
}

function genSequenceStats(seq, existingTriples) {
  const ids = seq.map(n => n.movementId);
  const unique = new Set(ids).size;
  const triples = Array.from(new Set(movementTriples(ids)));
  const newTriples = triples.filter(t => !existingTriples.has(t)).length;
  return { steps: ids.length, unique, ratio: ids.length ? unique / ids.length : 0, triples: triples.length, newTriples };
}

// Видимый список: [{ seq, idx, stats }] с учётом фильтров и сортировки
function genVisibleSequences() {
  const existingTriples = existingMovementTriples();
  let list = genSequences.map((seq, idx) => ({ seq, idx, stats: genSequenceStats(seq, existingTriples) }));
  if (genFilters.diverse && list.length) {
    const best = Math.max(...list.map(e => e.stats.ratio));
    list = list.filter(e => e.stats.ratio === best);
  }
  if (genFilters.novel) list = list.filter(e => e.stats.newTriples > 0);
  if (genFilters.diverse || genFilters.novel) {
    list.sort((a, b) => (b.stats.newTriples - a.stats.newTriples)
      || (b.stats.ratio - a.stats.ratio) || (a.idx - b.idx));
  }
  return list;
}

function setGenFilter(name, value) {
  genFilters[name] = !!value;
  renderGenerator();
}

function extractPatterns() {
  const patterns = {};

  function addPattern(movementId, beatPos, nextMovementId) {
    const key = movementId + ':' + beatPos;
    if (!patterns[key]) patterns[key] = [];
    if (!patterns[key].includes(nextMovementId)) {
      patterns[key].push(nextMovementId);
    }
  }

  Object.values(state.nodes).forEach(node => {
    const children = getChildren(node.id);
    if (children.length === 0) return;
    const beatPos = beatInEighth(node.beat);
    children.forEach(ch => {
      const nextBeatPos = beatInEighth(ch.beat);
      addPattern(node.movementId, beatPos, ch.movementId + ':' + nextBeatPos);
    });
  });

  return patterns;
}

function generateSequences() {
  const patterns = extractPatterns();
  const results = [];

  const existingCombos = collectCombos();
  const existingSet = new Set();
  existingCombos.forEach(combo => {
    const total = combo.reduce((s, n) => s + n.length, 0);
    if (total !== 32) return;
    let beat = 1;
    const parts = combo.map(n => {
      const s = n.movementId + ':' + beatInEighth(beat) + ':' + n.length;
      beat += n.length;
      return s;
    });
    existingSet.add(parts.join('|'));
  });

  function seqSignature(seq) {
    let beat = 1;
    return seq.map(n => {
      const s = n.movementId + ':' + beatInEighth(beat) + ':' + n.length;
      beat += n.length;
      return s;
    }).join('|');
  }
  const allMovIds = state.movements.map(m => m.id);

  function recurse(currentBeat, sequence) {
    if (results.length >= GEN_MAX_COMBOS) return;
    if (currentBeat > 32) {
      const totalBeats = sequence.reduce((s, n) => s + n.length, 0);
      if (totalBeats === 32) {
        const hasSquare = sequence.some(n => isSquareEnd(n.beat, n.length));
        if (hasSquare && !existingSet.has(seqSignature(sequence))) {
          results.push([...sequence]);
        }
      }
      return;
    }

    const beatPos = beatInEighth(currentBeat);
    const allowed = allowedLengths(currentBeat);
    if (allowed.length === 0) return;

    const prevNode = sequence.length > 0 ? sequence[sequence.length - 1] : null;
    let candidateMovements;

    if (!prevNode) {
      const rootMovIds = state.roots
        .map(rid => state.nodes[rid])
        .filter(n => n && n.beat === 1)
        .map(n => n.movementId);
      const unique = [];
      rootMovIds.forEach(id => { if (!unique.includes(id)) unique.push(id); });
      candidateMovements = unique;
    } else {
      const prevBeatPos = beatInEighth(prevNode.beat);
      const key = prevNode.movementId + ':' + prevBeatPos;
      const rawContinuations = patterns[key] || [];
      const seen = new Set();
      candidateMovements = [];
      rawContinuations.forEach(entry => {
        const parts = entry.split(':');
        const movId = parseInt(parts[0], 10);
        const contBeatPos = parseInt(parts[1], 10);
        if (contBeatPos === beatPos && !seen.has(movId)) {
          seen.add(movId);
          candidateMovements.push(movId);
        }
      });
    }

    for (let i = 0; i < candidateMovements.length && results.length < GEN_MAX_COMBOS; i++) {
      const movId = candidateMovements[i];
      for (let j = 0; j < allowed.length && results.length < GEN_MAX_COMBOS; j++) {
        const len = allowed[j];
        if (currentBeat + len - 1 > 32) continue;
        sequence.push({ movementId: movId, beat: currentBeat, length: len });
        recurse(currentBeat + len, sequence);
        sequence.pop();
      }
    }
  }

  recurse(1, []);
  genSequences = results;
  genSelectedIdx = -1;
  return results;
}

function renderGenerator() {
  renderGenTree();
  renderGenCombos();
}

function expandSequenceToTree(idx) {
  const seq = genSequences[idx];
  if (!seq || seq.length === 0) return;

  const first = seq[0];
  const id = state.nextNodeId++;
  state.nodes[id] = { id, movementId: first.movementId, parentId: null, beat: first.beat, length: first.length, prepId: null };
  state.nodeOrder.push(id);
  state.roots.push(id);

  let parentId = id;
  for (let i = 1; i < seq.length; i++) {
    const n = seq[i];
    const cid = state.nextNodeId++;
    state.nodes[cid] = { id: cid, movementId: n.movementId, parentId, beat: n.beat, length: n.length, prepId: null };
    state.nodeOrder.push(cid);
    parentId = cid;
  }

  state.activePath = pathToNode(parentId);
  saveState();
  render();
}

function renderGenTree() {
  const container = document.getElementById('genTreeContainer');
  container.innerHTML = '';
  document.getElementById('genCount').textContent =
    genSequences.length ? '(' + genSequences.length + ')' : '';

  if (genSequences.length === 0) {
    container.innerHTML = '<div class="gen-tree-empty">Нажмите «Сгенерировать» для создания связок.</div>';
    return;
  }

  const visible = genVisibleSequences();
  const summary = document.createElement('div');
  summary.className = 'gen-filter-summary';
  summary.textContent = (genFilters.diverse || genFilters.novel)
    ? `Показано ${visible.length} из ${genSequences.length}`
    : `Всего ${genSequences.length}`;
  container.appendChild(summary);
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'gen-tree-empty';
    empty.textContent = 'Под фильтры не подходит ни одна связка.';
    container.appendChild(empty);
    return;
  }

  const tree = document.createElement('div');
  tree.className = 'gen-tree';

  visible.forEach(({ seq, idx, stats }) => {
    const row = document.createElement('div');
    row.className = 'gen-seq';
    if (idx === genSelectedIdx) row.classList.add('active');

    const idxSpan = document.createElement('span');
    idxSpan.className = 'gen-seq-idx';
    idxSpan.textContent = '#' + (idx + 1);
    row.appendChild(idxSpan);

    const badges = document.createElement('span');
    badges.className = 'gen-seq-badges';
    const diversity = document.createElement('span');
    diversity.className = 'gen-badge' + (stats.unique === stats.steps ? ' good' : '');
    diversity.textContent = `разных ${stats.unique}/${stats.steps}`;
    diversity.title = 'Разных движений / всего шагов в связке';
    const novelty = document.createElement('span');
    novelty.className = 'gen-badge' + (stats.newTriples ? ' good' : '');
    novelty.textContent = `новых сочетаний ${stats.newTriples}`;
    novelty.title = 'Цепочек из трёх движений подряд, которых нет в готовых комбинациях';
    badges.append(diversity, novelty);
    row.appendChild(badges);

    seq.forEach((node, i) => {
      if (i > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'gen-seq-arrow';
        arrow.textContent = '→';
        row.appendChild(arrow);
      }
      const mov = getMovement(node.movementId);
      const movSpan = document.createElement('span');
      movSpan.className = 'gen-seq-mov';
      renderRichText(nameSegmentsOf(mov), movSpan);
      const beatSpan = document.createElement('span');
      beatSpan.className = 'gen-seq-beat';
      beatSpan.textContent = ' (' + formatBeatShort(node.beat, node.length) + ')';
      row.append(movSpan, beatSpan);
    });

    row.onclick = () => {
      genSelectedIdx = idx;
      renderGenTree();
      renderGenCombos();
    };

    const expandBtn = document.createElement('button');
    expandBtn.className = 'gen-seq-expand';
    expandBtn.title = 'Развернуть в дереве связок';
    expandBtn.textContent = '↗';
    expandBtn.onclick = (e) => {
      e.stopPropagation();
      expandSequenceToTree(idx);
    };
    row.appendChild(expandBtn);

    tree.appendChild(row);
  });

  container.appendChild(tree);
}

function renderGenCombos() {
  const container = document.getElementById('genCombosContainer');
  container.innerHTML = '';

  if (genSequences.length === 0) return;

  if (genSelectedIdx < 0 || genSelectedIdx >= genSequences.length) {
    container.innerHTML = '<div class="gen-combo-hint">Выберите связку слева для просмотра.</div>';
    return;
  }

  const seq = genSequences[genSelectedIdx];
  const totalBeats = seq.reduce((s, n) => s + n.length, 0);
  const squares = Math.floor(totalBeats / 32);

  const hint = document.createElement('div');
  hint.className = 'gen-combo-hint';
  hint.textContent = 'Связка #' + (genSelectedIdx + 1) + ' — ' + totalBeats + ' счётов, ' + squares + ' кв.';
  container.appendChild(hint);

  const ul = document.createElement('ul');
  ul.className = 'combo-list';

  const li = document.createElement('li');
  const idxSpan = document.createElement('span');
  idxSpan.className = 'combo-idx';
  idxSpan.textContent = '#' + (genSelectedIdx + 1) + ' (' + totalBeats + ' счётов • ' + squares + ' кв.)';
  li.appendChild(idxSpan);
  li.appendChild(document.createElement('br'));

  seq.forEach((node, i) => {
    if (i > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '→';
      li.appendChild(arrow);
    }
    const mov = getMovement(node.movementId);
    const movSpan = document.createElement('span');
    movSpan.className = 'mov';
    renderRichText(nameSegmentsOf(mov), movSpan);
    const beatSpan = document.createElement('span');
    beatSpan.className = 'beat';
    beatSpan.textContent = ' (' + formatBeatNode(node.beat, node.length) + ')';
    li.append(movSpan, beatSpan);
    if (isSquareEnd(node.beat, node.length)) {
      const sq = document.createElement('span');
      sq.className = 'square-mark';
      sq.textContent = '✓';
      li.appendChild(sq);
    }
  });

  ul.appendChild(li);
  container.appendChild(ul);
}
