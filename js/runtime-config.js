// Публичный адрес API. На VPS используется тот же origin, на GitHub Pages — VPS.
// Здесь нет OAuth secret, SSH-ключей или токенов пользователей.
if (typeof window.DANCE_API_BASE !== 'string') {
  window.DANCE_API_BASE = location.origin === 'https://molostov-a.github.io'
    ? 'https://dance-sequence-builder.duckdns.org' : '';
}
