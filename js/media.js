function parseMediaUrl(raw, type) {
  let value = (raw || '').trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = 'https://' + value;

  let url;
  try { url = new URL(value); } catch (e) { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase();

  if (host === 'www.youtube.com' || host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    let id = null;
    if (host === 'youtu.be') id = (url.pathname.split('/').filter(Boolean)[0]) || null;
    else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2] || null;
    else if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2] || null;
    else if (url.pathname.startsWith('/live/')) id = url.pathname.split('/')[2] || null;
    else id = url.searchParams.get('v');
    if (id && /^[\w-]{6,}$/.test(id)) {
      return {
        kind: 'youtube', type: 'video',
        embedUrl: `https://www.youtube.com/embed/${id}`,
        openUrl: `https://www.youtube.com/watch?v=${id}`
      };
    }
    return null;
  }

  if (host === 'drive.google.com' || host === 'docs.google.com' || host === 'drive.usercontent.google.com') {
    const m = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
    let id = m ? m[1] : null;
    if (!id && (host === 'drive.google.com' || host === 'drive.usercontent.google.com')) {
      id = url.searchParams.get('id');
    }
    if (id && /^[A-Za-z0-9_-]+$/.test(id)) {
      return {
        kind: 'drive', type: type === 'image' ? 'image' : 'video',
        embedUrl: `https://drive.google.com/file/d/${id}/preview`,
        openUrl: `https://drive.google.com/file/d/${id}/view`
      };
    }
    return null;
  }

  return null;
}

let mediaModalState = null;

function openMediaModal(url, type, label) {
  const parsed = parseMediaUrl(url, type);
  const frame = document.getElementById('mediaFrame');
  const empty = document.getElementById('mediaEmpty');
  const openBtn = document.getElementById('btnOpenMediaLink');
  document.getElementById('mediaTitle').textContent = label ? `Медиа: ${label}` : 'Медиа';

  if (parsed) {
    if (frame.src !== parsed.embedUrl) frame.src = parsed.embedUrl;
    frame.hidden = false;
    empty.hidden = true;
    openBtn.disabled = false;
    mediaModalState = { openUrl: parsed.openUrl };
  } else {
    frame.src = 'about:blank';
    frame.hidden = true;
    empty.hidden = false;
    empty.textContent = 'Ссылка не распознана. Нужна ссылка на YouTube или Google Drive.';
    openBtn.disabled = true;
    mediaModalState = { openUrl: '' };
  }
  document.getElementById('mediaModal').classList.add('open');
}

function closeMediaModal() {
  document.getElementById('mediaModal').classList.remove('open');
  const frame = document.getElementById('mediaFrame');
  frame.src = 'about:blank';
  frame.hidden = true;
  document.getElementById('mediaEmpty').hidden = false;
  document.getElementById('btnOpenMediaLink').disabled = true;
  mediaModalState = null;
}

function openMediaLink() {
  if (!mediaModalState || !mediaModalState.openUrl) return;
  window.open(mediaModalState.openUrl, '_blank', 'noopener,noreferrer');
}
