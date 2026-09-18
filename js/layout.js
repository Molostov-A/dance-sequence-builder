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
   ========================================================= */
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
  if (activePath.length === 0) return { cards: [], minis: [], width: 0, height: 0 };

  const cards = [];  // крупные: {node, x, y, w, h, isActive}
  const minis = [];  // компактные: {node, x, y, w, h, kind, childCount}

  const activeId = activePath[activePath.length - 1];
  const activeNode = state.nodes[activeId];
  const parentId = activeNode.parentId;

  // ===== 1) ХРЕБЕТ: все узлы активного пути, кроме активного =====
  const spineNodes = activePath.slice(0, -1); // без активного

  // Горизонтальное расположение, верхняя граница на Y = PAD
  const spineY = PAD;

  spineNodes.forEach((nodeId, i) => {
    const node = state.nodes[nodeId];
    const x = PAD + i * (CARD_W + H_GAP);
    cards.push({ node, x, y: spineY, w: CARD_W, h: hFor(nodeId), isActive: false });
  });

  // ===== 2) СТЕК БРАТЬЕВ =====
  // Стек идёт правее родителя (последней карточки хребта) и выровнен по верху
  // хребта, чтобы дочерние блоки не наезжали на родительский.
  // Если активный — корень, родителя нет, показываем только активный.
  const lastSpineCard = cards[cards.length - 1];
  const stackX = lastSpineCard
    ? lastSpineCard.x + CARD_W + H_GAP_MINI
    : PAD;
  const stackTopY = spineY;

  let stackMinis = [];    // компактные братья (выше и ниже активного)
  let activeCardPos = null;

  if (parentId === null) {
    // Активный — корень. Стек = только он, крупный.
    activeCardPos = { x: stackX, y: stackTopY, w: CARD_W, h: activeCardH, isActive: true, node: activeNode };
  } else {
    // Все дети родителя, отсортированные по имени
    const siblings = getChildrenSorted(parentId);
    let curY = stackTopY;
    siblings.forEach(sib => {
      if (sib.id === activeId) {
        // Активный — крупная карточка
        activeCardPos = { x: stackX, y: curY, w: CARD_W, h: activeCardH, isActive: true, node: activeNode };
        curY += activeCardH + MINI_GAP;
      } else {
        // Компактная карточка
        const childCount = countAllDescendants(sib.id);
        stackMinis.push({
          node: sib,
          x: stackX + (CARD_W - MINI_W) / 2, // центрируем по горизонтали относительно крупной карточки
          y: curY,
          w: MINI_W, h: miniHFor(sib.id),   // реальная высота (название переносится)
          kind: 'sibling',
          childCount
        });
        curY += miniHFor(sib.id) + MINI_GAP;
      }
    });
  }

  cards.push(activeCardPos);
  minis.push(...stackMinis);

  // ===== 3) ПРОДОЛЖЕНИЯ активного =====
  const children = getChildrenSorted(activeId);
  const activeRight = activeCardPos.x + activeCardPos.w;
  const childX = activeRight + CHILD_H_GAP;
  let childTopY = activeCardPos.y;

  children.forEach(ch => {
    const childCount = countAllDescendants(ch.id);
    const childH = miniHFor(ch.id);
    minis.push({
      node: ch,
      x: childX,
      y: childTopY,
      w: MINI_W, h: childH,
      kind: 'child',
      childCount
    });
    childTopY += childH + MINI_GAP;
  });

  // ===== Размеры =====
  let maxRight = 0, maxBottom = 0;
  cards.forEach(c => {
    maxRight = Math.max(maxRight, c.x + c.w);
    maxBottom = Math.max(maxBottom, c.y + c.h);
  });
  minis.forEach(m => {
    maxRight = Math.max(maxRight, m.x + m.w);
    maxBottom = Math.max(maxBottom, m.y + m.h);
  });

  const width = maxRight + PAD;
  const height = Math.max(maxBottom + PAD, 220);

  return {
    cards,
    minis,
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
  const minis = [];
  const onPath = new Set(state.activePath || []);

  function isOnPath(id) { return onPath.has(id); }

  function nodeH(id) { return isOnPath(id) ? hFor(id) : miniHFor(id); }

  // Рекурсивно вычисляет layout поддерева.
  // Возвращает { elements, width, height }
  // elements — массив {node, x, y, w, h, isRoot, isOnPath}
  function layoutSubtree(nodeId, x, y) {
    const node = state.nodes[nodeId];
    if (!node) return { elements: [], width: 0, height: 0 };

    const children = getChildrenSorted(nodeId);
    const h = nodeH(nodeId);
    const w = isOnPath(nodeId) ? CARD_W : MINI_W;

    if (children.length === 0) {
      return {
        elements: [{ node, x, y, w, h, isRoot: false, isOnPath: isOnPath(nodeId) }],
        width: w,
        height: h
      };
    }

    const childX = x + w + LEVEL_H_GAP;
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
      maxChildRight = Math.max(maxChildRight, r.x + r.width);
    });
    const subtreeW = Math.max(w, (maxChildRight - x));

    const elements = [{ node, x, y: parentY, w, h, isRoot: false, isOnPath: isOnPath(nodeId) }];
    childResults.forEach(r => elements.push(...r.elements));

    return { elements, width: subtreeW, height: Math.max(h, childrenBlockH) };
  }

  let curY = PAD;
  state.roots.forEach((rootId, i) => {
    const res = layoutSubtree(rootId, PAD, curY);
    // Помечаем корень
    res.elements.forEach(el => {
      if (el.node.id === rootId) el.isRoot = true;
    });
    cards.push(...res.elements);
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
    width: maxRight + PAD,
    height: Math.max(maxBottom + PAD, 220)
  };
}