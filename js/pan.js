(function initPan() {
  const wrap = document.getElementById('treeWrap');
  let panning = false;
  let startX, startY, startSL, startST;

  function isInteractive(el) {
    return el.closest('.node-card, .mini-card, .card-actions, .icon-btn, button, a, input');
  }

  function onPointerDown(x, y, e) {
    if (isInteractive(e.target)) return;
    panning = true;
    startX = x; startY = y;
    startSL = wrap.scrollLeft;
    startST = wrap.scrollTop;
    wrap.classList.add('panning');
    e.preventDefault();
  }

  function onPointerMove(x, y) {
    if (!panning) return;
    wrap.scrollLeft = startSL - (x - startX);
    wrap.scrollTop = startST - (y - startY);
  }

  function onPointerUp() {
    if (!panning) return;
    panning = false;
    wrap.classList.remove('panning');
  }

  // Mouse
  wrap.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    onPointerDown(e.clientX, e.clientY, e);
  });
  document.addEventListener('mousemove', (e) => {
    onPointerMove(e.clientX, e.clientY);
  });
  document.addEventListener('mouseup', onPointerUp);

  // Touch
  wrap.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    onPointerDown(t.clientX, t.clientY, e);
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (!panning) return;
    const t = e.touches[0];
    onPointerMove(t.clientX, t.clientY);
  }, { passive: true });
  document.addEventListener('touchend', onPointerUp);
  document.addEventListener('touchcancel', onPointerUp);
})();
