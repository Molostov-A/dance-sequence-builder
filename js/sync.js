function serializeSyncData(data) {
  const copy = { ...data };
  delete copy.activePath; delete copy.currentView; delete copy.navPinned;
  const sorted = value => {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).sort().forEach(key => { out[key] = sorted(value[key]); });
      return out;
    }
    return value;
  };
  return JSON.stringify(sorted(copy));
}
async function hashSyncData(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
