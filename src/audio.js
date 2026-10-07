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
  let primed = false;
  const unlocked = readUnlocked(storage);

  return {
    isUnlocked: id => unlocked.has(id),
    markUnlocked(id) {
      unlocked.add(id);
      storage.setItem(KEY, JSON.stringify([...unlocked]));
    },
    toggle() { enabled = !enabled; return enabled; },
    isEnabled: () => enabled,
    // unlock: va chiamato DENTRO un gesto utente (touchstart/click/keydown).
    // Su iOS Safari `play()` è asincrono (carica la clip) e perde il gesto:
    // "riscaldiamo" la riproduzione con un audio silenzioso, così le successive
    // `play()` asincrone sono permesse. Guida §9.
    unlock() {
      if (primed) return;
      primed = true;
      try {
        const a = new Audio(SILENT);
        a.volume = 0;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
      } catch { /* niente */ }
    },
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
    // posizione corrente in secondi (per il karaoke). 0 se non in riproduzione.
    position() { return audioEl && Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0; },
    duration() { return audioEl && Number.isFinite(audioEl.duration) ? audioEl.duration : 0; },
  };
}

// WAV silenzioso di 1 campione (data URI): sblocca l'audio su iOS dentro un gesto.
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';
