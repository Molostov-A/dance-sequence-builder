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
      Свёрнутый преп (isPrepLinkCollapsed) — круглая метка PREP_MARK; ей
      хватает промежутка PREP_MARK_COL. Блок/метка лежит поверх линии, но
      колонка детей всегда отодвинута ровно настолько, чтобы он не наезжал
      на карточки. У каждого блока есть subX — x короткой шины группы.
   6) Ручные закрепления (state.treePins, только полное дерево) применяются
      после автоматической раскладки — см. applyTreePins.
   ========================================================= */

function prepChipGeometry(parentId, prepId) {
  const collapsed = isPrepLinkCollapsed(parentId, prepId);
  return collapsed
    ? { collapsed, w: PREP_MARK, h: PREP_MARK, gap: PREP_MARK_GAP, col: PREP_MARK_COL }
    : { collapsed, w: PREP_W, h: PREP_H, gap: PREP_GAP, col: PREP_COL };
}

// На сколько отодвинуть колонку детей: под развёрнутый блок — PREP_COL,
// если все препы колонки свёрнуты — только под метку.
function prepColumnExtra(parentId, nodes) {
  let extra = 0;
  nodes.forEach(n => {
    if (n.prepId) extra = Math.max(extra, prepChipGeometry(parentId, n.prepId).col);
  });
  return extra;
}

// Блоки препов для одной колонки детей. items — дети в порядке колонки
// с итоговыми y/h; columnX — левый край колонки (крупной карточки).
// Блок препа по умолчанию стоит посередине своей линии: между шиной
// родителя (busX) и колонкой детей (columnX). colX запоминается, чтобы
// после закрепления шины блок можно было заново отцентрировать
// (centerPrepChip). subX — короткая шина группы между блоком и колонкой.
function centerPrepChip(chip, busX) {
  const free = chip.colX - busX;
  let x = busX + (free - chip.w) / 2;
  x = Math.max(busX + 4, Math.min(x, chip.colX - chip.w - 8));
  chip.x = x;
  chip.subX = (x + chip.w + chip.colX) / 2;
}

function prepChipsForColumn(parentId, items, columnX, kind, busX) {
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
    const g = prepChipGeometry(parentId, prepId);
    const chip = {
      kind, parentId, prepId, collapsed: g.collapsed,
      x: 0, y: cy - g.h / 2, w: g.w, h: g.h, subX: 0, colX: columnX,
      members: items.slice(i, j + 1).map(it => it.node.id)
    };
    centerPrepChip(chip, busX);
    chips.push(chip);
    i = j + 1;
  }
  return chips;
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
    // Преп на линии к этому узлу — промежуток перед ним шире на место под блок
    if (i > 0 && node.prepId) spineX += prepChipGeometry(spineNodes[i - 1], node.prepId).col;
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
    const g = prepChipGeometry(prev.node.id, cur.node.prepId);
    const x = gapLeft + (cur.x - gapLeft - g.w) / 2;
    preps.push({
      kind: 'spine', parentId: prev.node.id, prepId: cur.node.prepId, collapsed: g.collapsed,
      x, y: cy - g.h / 2, w: g.w, h: g.h, subX: x + g.w,
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
    ? lastSpineCard.x + CARD_W + H_GAP_MINI + prepColumnExtra(parentId, siblings)
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
    preps.push(...prepChipsForColumn(parentId, stackItems, stackX, 'sibling',
      lastSpineCard.x + lastSpineCard.w + H_GAP_MINI / 2));
  }

  cards.push(activeCardPos);
  minis.push(...stackMinis);

  // ===== 3) ПРОДОЛЖЕНИЯ активного (если он не свёрнут) =====
  const children = getVisibleChildren(activeId);
  const activeRight = activeCardPos.x + activeCardPos.w;
  const childX = activeRight + CHILD_H_GAP + prepColumnExtra(activeId, children);
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
  preps.push(...prepChipsForColumn(activeId, childItems, childX, 'child', activeRight + BUS_OFFSET));

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

    const childX = x + w + LEVEL_H_GAP + prepColumnExtra(nodeId, children);
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
    const subPreps = prepChipsForColumn(nodeId, childItems, childX, 'full', x + w + BUS_OFFSET);
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

  const buses = applyTreePins(cards, preps);

  let maxRight = 0, maxBottom = 0;
  cards.concat(preps).forEach(c => {
    maxRight = Math.max(maxRight, c.x + c.w);
    maxBottom = Math.max(maxBottom, c.y + c.h);
  });

  return {
    cards,
    minis: [],
    preps,
    buses,
    byId: new Map(cards.map(c => [c.node.id, c])),
    width: maxRight + PAD,
    height: Math.max(maxBottom + PAD, 220)
  };
}

/* Ручные закрепления поверх автоматической раскладки полного дерева.
   Обход сверху вниз: закреплённая карточка ставится в «родитель + смещение»
   (корень — в абсолютные координаты), незакреплённая сдвигается так же, как
   сдвинулся её родитель, — поэтому ветка едет вместе с перенесённым узлом.
   Блоки препов аналогично: закреплённый — от родителя, иначе со сдвигом
   родителя. Шина родителя — его правый край + закреплённый или BUS_OFFSET.
   Если что-то ушло левее/выше PAD, всё сдвигается обратно на холст. */
function applyTreePins(cards, preps) {
  const pins = state.treePins || {};
  const nodePins = pins.nodes || {};
  const byId = new Map(cards.map(c => [c.node.id, c]));
  const shift = new Map();

  const place = (id, parentId) => {
    const el = byId.get(id);
    if (!el) return;
    const autoX = el.x, autoY = el.y;
    const pin = nodePins[id];
    const parent = parentId !== null ? byId.get(parentId) : null;
    if (pin) {
      el.x = (parent ? parent.x : 0) + pin.dx;
      el.y = (parent ? parent.y : 0) + pin.dy;
      el.pinned = true;
    } else if (parent) {
      const s = shift.get(parentId);
      el.x += s.dx; el.y += s.dy;
    }
    shift.set(id, { dx: el.x - autoX, dy: el.y - autoY });
    getVisibleChildren(id).forEach(ch => place(ch.id, id));
  };
  state.roots.forEach(r => place(r, null));

  preps.forEach(chip => {
    const parent = byId.get(chip.parentId);
    if (!parent) return;
    const pin = (pins.preps || {})[prepLinkKey(chip.parentId, chip.prepId)];
    const autoX = chip.x;
    const s = shift.get(chip.parentId) || { dx: 0, dy: 0 };
    if (pin) {
      chip.x = parent.x + pin.dx;
      chip.y = parent.y + pin.dy;
      chip.pinned = true;
    } else {
      chip.x += s.dx; chip.y += s.dy;
    }
    chip.subX += chip.x - autoX;
    // Колонка детей по умолчанию едет вместе с родителем
    chip.colX += s.dx;
  });

  // Шина не уходит правее своих отводов: иначе линии к детям и препам
  // пошли бы назад. Ограничение — левый край ближайшего ребёнка/блока препа.
  const buses = {};
  cards.forEach(c => {
    const children = getVisibleChildren(c.node.id);
    if (children.length === 0) return;
    const pin = (pins.buses || {})[c.node.id];
    const inChip = new Set();
    const ends = [];
    preps.forEach(p => {
      if (p.parentId !== c.node.id) return;
      p.members.forEach(id => inChip.add(id));
      // Незакреплённому блоку нужно место между шиной и колонкой
      ends.push(p.pinned ? p.x : p.colX - p.w - 16);
    });
    children.forEach(ch => { if (!inChip.has(ch.id) && byId.get(ch.id)) ends.push(byId.get(ch.id).x); });
    const maxX = Math.min(...ends) - 8;
    let x = c.x + c.w + (pin ? pin.dx : BUS_OFFSET);
    if (pin && maxX > c.x + c.w) x = Math.min(x, maxX);
    buses[c.node.id] = { x, pinned: !!pin };
    // Незакреплённый преп снова встаёт посередине своей линии — от итоговой
    // общей шины или от собственного излома линии к препу (treePins.links)
    preps.forEach(p => {
      if (p.parentId !== c.node.id || p.pinned) return;
      const own = ((pins.links || {})['p:' + c.node.id + ':' + p.prepId]);
      centerPrepChip(p, own && own.shape === 'bus' ? c.x + c.w + own.ex : x);
    });
  });

  let minX = Infinity, minY = Infinity;
  cards.concat(preps).forEach(c => { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); });
  const fixX = minX < PAD ? PAD - minX : 0;
  const fixY = minY < PAD ? PAD - minY : 0;
  if (fixX || fixY) {
    cards.concat(preps).forEach(c => { c.x += fixX; c.y += fixY; });
    preps.forEach(c => { c.subX += fixX; c.colX += fixX; });
    Object.values(buses).forEach(b => { b.x += fixX; });
  }
  return buses;
}
