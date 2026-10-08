// ============================================================================
// GRIP — la PRESA. Modulo puro e deterministico: nessun DOM, nessuna
// sorgente di entropia. La presa `v` va da 1 (salda) a 0 (persa). I pericoli la
// erodono (gripHit), il tempo la rigenera (stepGrip). Quando tocca 0 si
// decide l'esito: 'fall' se si è saliti oltre la riga di partenza, altrimenti
// 'defeat' (sconfitta pura).
// ============================================================================

const DEFAULT_CFG = {
  hitWind: 0.12,
  hitQuake: 0.26,
  hitDebris: 0.22,
  hitIvy: 0.14,
  hitMash: 0.5,
  regen: 0.055,   // rigenerazione PIÙ LENTA = più tensione (competitivo)
};

// createGrip(g) — g.grip opzionale sovrascrive i default (merge parziale).
// Moltiplica l'erosione per `g.difficulty` (default 1): tracce più avanzate
// possono essere più dure (più rapido a svuotare la presa).
export function createGrip(g) {
  const cfg = { ...DEFAULT_CFG, ...((g && g.grip) || {}) };
  const diff = Number.isFinite(g && g.difficulty) ? g.difficulty : 1;
  // scala SOLO i colpi (non la rigenerazione): più difficile = presa più fragile.
  cfg.scale = diff > 0 ? diff : 1;
  return { v: 1, cfg };
}

// gripHit — un colpo erode la presa (scalata per difficulty); clamp a 0.
export function gripHit(grip, amt) {
  const s = grip.cfg && Number.isFinite(grip.cfg.scale) ? grip.cfg.scale : 1;
  grip.v = Math.max(0, grip.v - amt * s);
  return grip.v;
}

// stepGrip — rigenerazione nel tempo; clamp a 1.
export function stepGrip(grip, dt) {
  grip.v = Math.min(1, grip.v + dt * grip.cfg.regen);
  return grip.v;
}

// gripRatio — v normalizzato in [0,1].
export function gripRatio(grip) {
  return Math.max(0, Math.min(1, grip.v));
}

// gripOutcome — null finché la presa tiene; a v==0 decide fall vs defeat.
export function gripOutcome(grip, curRow, startRow) {
  if (grip.v > 0) return null;
  if (curRow > startRow) return 'fall';
  return 'defeat';
}
