const KEY = 'voxpopuli.unlocked';

export function createMemoryStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
}

function readUnlocked(storage) {
  try { return new Set(JSON.parse(storage.getItem(KEY) || '[]')); }
  catch { return new Set(); }
}

export function createAudio({ storage, loadClip }) {
  let enabled = true;
  let current = null;
  let audioEl = null;
  const unlocked = readUnlocked(storage);

  return {
    isUnlocked: id => unlocked.has(id),
    markUnlocked(id) {
      unlocked.add(id);
      storage.setItem(KEY, JSON.stringify([...unlocked]));
    },
    toggle() { enabled = !enabled; return enabled; },
    isEnabled: () => enabled,
    // play riproduce la traccia del girone in corso (non richiede l'unlock:
    // l'unlock serve solo alla tracklist per riascoltare).
    async play(id) {
      if (!enabled) return;
      const clip = await loadClip(id);        // in dev: URL; in build: data URI
      if (!clip) return;
      this.stop();
      audioEl = new Audio(clip);
      audioEl.volume = 0.9;
      current = id;
      await audioEl.play().catch(() => {});   // autoplay può fallire: non lanciare
    },
    stop() { if (audioEl) { audioEl.pause(); audioEl = null; current = null; } },
    currentTrack: () => current,
  };
}
