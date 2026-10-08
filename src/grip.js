// ============================================================================
// GRIP — la PRESA. Modulo puro e deterministico: nessun DOM, nessuna
// sorgente di entropia. La presa `v` va da 1 (salda) a 0 (persa). I pericoli la
// erodono (gripHit), il tempo la rigenera (stepGrip). Quando tocca 0 si
// decide l'esito: 'fall' se si è saliti oltre la riga di partenza, altrimenti
// 'defeat' (sconfitta pura).
// ============================================================================

const DEFAULT_CFG = {
  hitWind: 0.10,
  hitQuake: 0.22,
  hitDebris: 0.18,
  hitIvy: 0.12,
  hitMash: 0.45,
  regen: 0.10,
};

// createGrip(g) — g.grip opzionale sovrascrive i default (merge parziale).
export function createGrip(g) {
  const cfg = { ...DEFAULT_CFG, ...((g && g.grip) || {}) };
  return { v: 1, cfg };
}

// gripHit — un colpo erode la presa; clamp a 0 (mai negativa).
export function gripHit(grip, amt) {
  grip.v = Math.max(0, grip.v - amt);
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
