// ============================================================================
// MASH — minigioco di lotta. Quando qualcuno ti afferra per buttarti giù,
// devi MARTELLARE il tasto (Z/X/Spazio/↑) per vincere: se riempi la barra
// prima che scada il tempo, lo butti giù tu e sali; altrimenti scendi.
// Logica pura e deterministica: nessun DOM, nessun Math.random.
// ============================================================================

export const MASH_DUR = 4.0;      // secondi per vincere
const DECAY = 0.11;               // la barra cala da sola (l'avversario spinge)
const GAIN = 0.14;                // quanto riempie ogni "colpo"

export function createMash() {
  return { active: false, progress: 0, timeLeft: 0, won: false, lost: false, rival: null, hits: 0 };
}

// Inizia una lotta contro `rival` (una descrizione, es. { kind, row }).
export function startMash(m, rival, dur = MASH_DUR) {
  m.active = true; m.progress = 0.35; m.timeLeft = dur;
  m.won = false; m.lost = false; m.rival = rival || null; m.hits = 0;
  return m;
}

// Un colpo del giocatore.
export function mashHit(m) {
  if (!m.active) return m;
  m.hits++;
  m.progress = Math.min(1, m.progress + GAIN);
  if (m.progress >= 1) { m.won = true; m.active = false; }
  return m;
}

// Avanza: il tempo scorre, la barra cala. Ritorna true se la lotta è finita.
export function stepMash(m, dt) {
  if (!m.active) return false;
  const d = Number.isFinite(dt) ? dt : 0.016;
  m.timeLeft -= d;
  m.progress -= d * DECAY;
  if (m.progress >= 1) { m.won = true; m.active = false; }
  else if (m.timeLeft <= 0 || m.progress <= 0) { m.lost = true; m.timeLeft = 0; m.progress = 0; m.active = false; }
  return !m.active;
}

export function mashRatio(m) {
  const p = Number.isFinite(m && m.progress) ? m.progress : 0;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
export function mashDone(m) { return m.won || m.lost; }

// True finché la lotta non è stata RISOLTA dal chiamante (vinta/persa ma non
// ancora consumata). Serve a main.js per continuare a gestire il ramo won/lost
// anche quando `active` è già false, evitando che l'overlay resti bloccato.
export function mashPending(m) { return !!(m && (m.active || m.won || m.lost)); }
