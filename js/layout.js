/* =========================================================
   LAYOUT (v10)
   1) Хребет — все узлы активного пути, кроме последнего (активного).
      Идут горизонтально, крупные карточки, прижаты верхним краем к одной Y.
   2) Стек братьев — под родителем активного (последний узел хребта).
      Все дети родителя, отсортированные по имени. Активный — крупный,
      остальные — компактные. X стека = родитель.x + STACK_OFFSET.
   3) Линия пути — от родителя к активному изломом СБОКУ (огибая братьев):
      от правого края родителя вправо → вниз → влево в правый край активного.
   4) Продолжения активного — справа от активного столбиком.
   5) Препы — блоки на линиях. Преп хранится в ребёнке (node.prepId) и
      стоит на линии родитель → ребёнок. Если у кого-то из детей колонки
      есть преп, колонка детей отодвигается на PREP_COL, и в освободившемся
      промежутке встаёт блок препа — по одному на группу детей с общим
      препом (getChildrenSorted держит такие группы подряд). Блок
      центрируется по вертикали на своей группе. На хребте преп встаёт
      в промежуток между двумя крупными карточками, который тоже
      расширяется на PREP_COL.
   ========================================================= */

// Блоки препов для одной колонки детей. items — дети в порядке колонки
// с итоговыми y/h; columnX — левый край колонки (крупной карточки).
function prepChipsForColumn(parentId, items, columnX, kind) {
  const chips = [];
  let i = 0;
  while (i < items.length) {
    const prepId = items[i].node.prepId;
    if (!prepId) { i++; continue; }
    let j = i;
    while (j + 1 < items.length && items[j + 1].node.prepId === prepId) j++;
    const top = items[i].y + items[i].h / 2;
    const bottom = items[j].y + items[j].h / 2;
    const cy = (top + bottom) / 2;
    chips.push({
      kind, parentId, prepId,
      x: columnX - PREP_GAP - PREP_W, y: cy - PREP_H / 2, w: PREP_W, h: PREP_H,
      members: items.slice(i, j + 1).map(it => it.node.id)
    });
    i = j + 1;
  }
  return chips;
}

function hasPrepAmong(nodes) {
  return nodes.some(n => n.prepId);
}

function computeLayout(overrides) {
  // overrides.activeCardH — реальная высота активной карточки (может быть
  // больше CARD_H из-за бейджа «квадрат» и кнопок).
  // overrides.heightFor(id) — реальная высота ЛЮБОЙ карточки/мини (названия
  // больше не обрезаются и переносятся, поэтому высота замеряется
  // у каждого элемента и учитывается в отступах стека и продолжений).
  // overrides.miniHFor(id) — реальная высота компактной карточки.
  const O = overrides || {};
  const hFor = O.heightFor || (() => CARD_H);
  const miniHFor = O.miniHFor || (() => MINI_H);
  const activeCardH = O.activeCardH || CARD_H;
  const activePath = (state.activePath || []).filter(id => state.nodes[id]);
  if (activePath.length === 0) return { cards: [], minis: [], preps: [], width: 0, height: 0 };

  const cards = [];  // крупные: {node, x, y, w, h, isActive}
  const minis = [];  // компактные: {node, x, y, w, h, kind, childCount}
  const preps = [];  // блоки препов: {kind, parentId, prepId, x, y, w, h, members}

  const activeId = activePath[activePath.length - 1];
  const activeNode = state.nodes[activeId];
  const parentId = activeNode.parentId;

  // ===== 1) ХРЕБЕТ: все узлы активного пути, кроме активного =====
  const spineNodes = activePath.slice(0, -1); // без активного

  // Горизонтальное расположение, верхняя граница на Y = PAD
  const spineY = PAD;

  let spineX = PAD;
  spineNodes.forEach((nodeId, i) => {
    const node = state.nodes[nodeId];
    // Преп на линии к этому узлу — промежуток перед ним шире на PREP_COL
    if (i > 0 && node.prepId) spineX += PREP_COL;
    cards.push({ node, x: spineX, y: spineY, w: CARD_W, h: hFor(nodeId), isActive: false });
    spineX += CARD_W + H_GAP;
  });
  for (let i = 1; i < cards.length; i++) {
    const cur = cards[i];
    if (!cur.node.prepId) continue;
    const prev = cards[i - 1];
    const gapLeft = prev.x + prev.w;
    // Линия хребта идёт от середины prev к середине cur — блок сидит на её середине
    const cy = (prev.y + prev.h / 2 + cur.y + cur.h / 2) / 2;
    preps.push({
      kind: 'spine', parentId: prev.node.id, prepId: cur.node.prepId,
      x: gapLeft + (cur.x - gapLeft - PREP_W) / 2, y: cy - PREP_H / 2, w: PREP_W, h: PREP_H,
      members: [cur.node.id]
    });
  }

  // ===== 2) СТЕК БРАТЬЕВ =====
  // Стек идёт правее родителя (последней карточки хребта) и выровнен по верху
  // хребта, чтобы дочерние блоки не наезжали на родительский.
  // Если активный — корень, родителя нет, показываем только активный.
  const lastSpineCard = cards[cards.length - 1];
  const siblings = parentId === null ? [activeNode] : getChildrenSorted(parentId);
  const stackX = lastSpineCard
    ? lastSpineCard.x + CARD_W + H_GAP_MINI + (hasPrepAmong(siblings) ? PREP_COL : 0)
    : PAD;
  const stackTopY = spineY;

  let stackMinis = [];    // компактные братья (выше и ниже активного)
  let activeCardPos = null;
  const stackItems = [];  // все элементы стека по порядку — для блоков препов

  if (parentId === null) {
    // Активный — корень. Стек = только он, крупный.
    activeCardPos = { x: stackX, y: stackTopY, w: CARD_W, h: activeCardH, isActive: true, node: activeNode };
  } else {
    let curY = stackTopY;
    siblings.forEach(sib => {
      if (sib.id === activeId) {
        // Активный — крупная карточка
        activeCardPos = { x: stackX, y: curY, w: CARD_W, h: activeCardH, isActive: true, node: activeNode };
        stackItems.push(activeCardPos);
        curY += activeCardH + MINI_GAP;
      } else {
        // Компактная карточка
        const childCount = countAllDescendants(sib.id);
        const mini = {
          node: sib,
          x: stackX + (CARD_W - MINI_W) / 2, // центрируем по горизонтали относительно крупной карточки
          y: curY,
          w: MINI_W, h: miniHFor(sib.id),   // реальная высота (название переносится)
          kind: 'sibling',
          childCount
        };
        stackMinis.push(mini);
        stackItems.push(mini);
        curY += miniHFor(sib.id) + MINI_GAP;
      }
    });
    preps.push(...prepChipsForColumn(parentId, stackItems, stackX, 'sibling'));
  }

  cards.push(activeCardPos);
  minis.push(...stackMinis);

  // ===== 3) ПРОДОЛЖЕНИЯ активного (если он не свёрнут) =====
  const children = getVisibleChildren(activeId);
  const activeRight = activeCardPos.x + activeCardPos.w;
  const childX = activeRight + CHILD_H_GAP + (hasPrepAmong(children) ? PREP_COL : 0);
  let childTopY = activeCardPos.y;
  const childItems = [];

  children.forEach(ch => {
    const childCount = countAllDescendants(ch.id);
    const childH = miniHFor(ch.id);
    const mini = {
      node: ch,
      x: childX,
      y: childTopY,
      w: MINI_W, h: childH,
      kind: 'child',
      childCount
    };
    minis.push(mini);
    childItems.push(mini);
    childTopY += childH + MINI_GAP;
  });
  preps.push(...prepChipsForColumn(activeId, childItems, childX, 'child'));

  // ===== Размеры =====
  let maxRight = 0, maxBottom = 0;
  cards.concat(minis, preps).forEach(c => {
    maxRight = Math.max(maxRight, c.x + c.w);
    maxBottom = Math.max(maxBottom, c.y + c.h);
  });

  const width = maxRight + PAD;
  const height = Math.max(maxBottom + PAD, 220);

  return {
    cards,
    minis,
    preps,
    spineNodes,
    stackX,
    activeCardPos,
    lastSpineCard,
    width,
    height
  };
}

function countAllDescendants(nodeId) {
  let count = 0;
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop();
    getChildren(id).forEach(c => { count++; stack.push(c.id); });
  }
  return count;
}

/* =========================================================
   FULL TREE LAYOUT — рекурсивная компоновка всех корней.
   Каждый корень — горизонтальная цепочка узлов, ветви идут
   вправо столбиком. Корни расположены вертикально.
   ========================================================= */
const ROOT_V_GAP = 40;
const LEVEL_H_GAP = 80;

function computeFullTreeLayout(overrides) {
  const O = overrides || {};
  const hFor = O.heightFor || (() => CARD_H);
  const miniHFor = O.miniHFor || (() => MINI_H);

  const cards = [];
  const preps = [];
  const onPath = new Set(state.activePath || []);

  function isOnPath(id) { return onPath.has(id); }

  function nodeH(id) { return isOnPath(id) ? hFor(id) : miniHFor(id); }

  // Рекурсивно вычисляет layout поддерева.
  // Возвращает { elements, preps, width, height }
  // elements — массив {node, x, y, w, h, isRoot, isOnPath}; elements[0] — сам узел
  function layoutSubtree(nodeId, x, y) {
    const node = state.nodes[nodeId];
    if (!node) return { elements: [], preps: [], width: 0, height: 0 };

    // Свёрнутый узел раскладывается как лист: поддерево не занимает места.
    const children = getVisibleChildren(nodeId);
    const h = nodeH(nodeId);
    const w = isOnPath(nodeId) ? CARD_W : MINI_W;

    if (children.length === 0) {
      return {
        elements: [{ node, x, y, w, h, isRoot: false, isOnPath: isOnPath(nodeId) }],
        preps: [],
        width: w,
        height: h
      };
    }

    const childX = x + w + LEVEL_H_GAP + (hasPrepAmong(children) ? PREP_COL : 0);
    let childResults = [];
    let totalChildH = 0;
    children.forEach((ch, i) => {
      const res = layoutSubtree(ch.id, childX, y + totalChildH);
      childResults.push(res);
      totalChildH += res.height;
      if (i < children.length - 1) totalChildH += MINI_GAP;
    });

    const childrenBlockH = totalChildH;
    const parentY = y + Math.max(0, (childrenBlockH - h) / 2);

    let maxChildRight = 0;
    childResults.forEach(r => {
      maxChildRight = Math.max(maxChildRight, childX + r.width);
    });
    const subtreeW = Math.max(w, (maxChildRight - x));

    const elements = [{ node, x, y: parentY, w, h, isRoot: false, isOnPath: isOnPath(nodeId) }];
    childResults.forEach(r => elements.push(...r.elements));

    const childItems = childResults.map(r => r.elements[0]);
    const subPreps = prepChipsForColumn(nodeId, childItems, childX, 'full');
    childResults.forEach(r => subPreps.push(...r.preps));

    return { elements, preps: subPreps, width: subtreeW, height: Math.max(h, childrenBlockH) };
  }

  let curY = PAD;
  state.roots.forEach((rootId, i) => {
    const res = layoutSubtree(rootId, PAD, curY);
    // Помечаем корень
    res.elements.forEach(el => {
      if (el.node.id === rootId) el.isRoot = true;
    });
    cards.push(...res.elements);
    preps.push(...res.preps);
    curY += res.height;
    if (i < state.roots.length - 1) curY += ROOT_V_GAP;
  });

  let maxRight = 0, maxBottom = 0;
  cards.forEach(c => {
    maxRight = Math.max(maxRight, c.x + c.w);
    maxBottom = Math.max(maxBottom, c.y + c.h);
  });

  return {
    cards,
    minis: [],
    preps,
    width: maxRight + PAD,
    height: Math.max(maxBottom + PAD, 220)
  };
}
