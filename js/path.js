function pathToNode(nodeId) {
  const path = [];
  let cur = state.nodes[nodeId];
  let guard = 0;
  while (cur && guard++ < 1000) {
    path.unshift(cur.id);
    if (cur.parentId === null) break;
    cur = state.nodes[cur.parentId];
  }
  return path;
}
function ensureActivePathValid() {
  const p = state.activePath || [];
  const valid = p.length > 0 && p.every(id => state.nodes[id]);
  if (!valid) {
    if (state.roots.length > 0) {
      const last = state.nodeOrder[state.nodeOrder.length - 1];
      if (last && state.nodes[last]) { state.activePath = pathToNode(last); return; }
      state.activePath = [state.roots[0]]; return;
    }
    state.activePath = []; return;
  }
  if (!state.roots.includes(p[0])) { state.activePath = []; ensureActivePathValid(); return; }
  for (let i = 1; i < p.length; i++) {
    const prev = state.nodes[p[i - 1]];
    const cur = state.nodes[p[i]];
    if (!cur || cur.parentId !== prev.id) { state.activePath = p.slice(0, i); return; }
  }
}
function setActiveNode(nodeId) {
  if (!state.nodes[nodeId]) return;
  state.activePath = pathToNode(nodeId);
  saveState(); render();
}
function getActiveRootId() {
  if (state.activePath && state.activePath.length > 0) {
    const first = state.activePath[0];
    if (state.roots.includes(first)) return first;
  }
  return state.roots[0] || null;
}