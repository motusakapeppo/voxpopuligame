// ============================================================================
// OMINI — i piccoli che popolano la scala. Modulo PURO e DETERMINISTICO:
// nessun DOM, nessuna sorgente casuale. Lo spawn è guidato dalla fila del giocatore
// (come gli incontri: |dr| <= 1) e ruota le animazioni in modo deterministico
// dal seme del girone. Gli helper LCG hanno nomi UNICI (ominiSeed/ominiLcg) per
// non collidere con lcgNext di threats.js nel bundle.
// ============================================================================
import { centerCol } from './climb.js';

// Le animazioni possibili di un omino. Almeno 4, tutte uniche.
export const OMINI_ANIMS = ['wave', 'climbUp', 'shove', 'tumble', 'carry'];

// Vettori dei due verbi (coerenti col resto del gioco: tendi = connettersi,
// spingi = prevaricare). dy negativo = sale, positivo = scende.
const OMINI_VERBS = {
  tendi:  { dy: -24, loyal: +1, event: 'helped' },
  spingi: { dy: +48, loyal: -1, event: 'shoved' },
};

const OMINI_MAX = 12;      // cap della lista viva
const OMINI_REACT = 1.2;   // secondi di reazione prima che un risolto scada

// Seme deterministico dal g.id (FNV-1a a 32 bit). Nome unico: ominiSeed.
function ominiSeed(g) {
  const s = String(g?.id || '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// LCG (Numerical Recipes) a 32 bit: ritorna il NUOVO stato intero. Nome unico:
// ominiLcg. Lo stato intero è usato direttamente come indice di rotazione.
function ominiLcg(state) {
  return (Math.imul(1664525, state >>> 0) + 1013904223) >>> 0;
}

// Crea lo stato degli omini per un girone. `climb` serve solo per la geometria
// (nRows/centerCol) al momento dello spawn.
export function createOmini(g, _climb) {
  return {
    list: [],
    t: 0,
    rng: ominiSeed(g),
    nextRow: 2,
    spawnEvery: 3,   // più frequenti: gli omini sono protagonisti della scalata
    spawned: 0,
  };
}

// Avanza gli omini. Quando la fila del giocatore raggiunge `nextRow`, spawna un
// omino sulla colonna centrale di quella fila, con animazione ruotata in modo
// deterministico; poi avanza nextRow di spawnEvery. Aggiorna fasi/reazioni,
// applica il cap e rimuove gli omini risolti da tempo.
export function stepOmini(o, climb, dt) {
  const d = Number.isFinite(dt) ? dt : 0.016;
  o.t += d;

  const row = Math.max(climb.lh.r, climb.rh.r);
  const lastRow = climb.nRows - 2;
  while (row >= o.nextRow && o.nextRow <= lastRow) {
    const r = o.nextRow;
    const c = centerCol(climb, r);
    const anim = OMINI_ANIMS[(o.rng + o.spawned) % OMINI_ANIMS.length];
    o.rng = ominiLcg(o.rng);          // avanza l'LCG una volta per spawn
    o.list.push({
      id: `om${o.spawned}`,
      row: r,
      c,
      anim,
      phase: 0,
      resolved: false,
      verb: null,
      reactT: 0,
    });
    o.spawned++;
    o.nextRow += o.spawnEvery;
  }

  // fase di animazione + timer di reazione dei risolti
  for (const om of o.list) {
    om.phase += d;
    if (om.resolved) om.reactT += d;
  }

  // rimuovi gli scaduti (risolti da oltre OMINI_REACT), poi applica il cap
  for (let i = o.list.length - 1; i >= 0; i--) {
    const om = o.list[i];
    if (om.resolved && om.reactT > OMINI_REACT) o.list.splice(i, 1);
  }
  while (o.list.length > OMINI_MAX) o.list.shift();
}

// L'omino attivo: il più vicino non risolto entro |dr| <= 1 dalla fila corrente
// del giocatore (stessa regola degli incontri, climb.js encounterAt).
export function ominoAt(o, climb) {
  const r = Math.max(climb.lh.r, climb.rh.r);
  let best = null;
  let bestD = Infinity;
  for (const om of o.list) {
    if (om.resolved) continue;
    const dd = Math.abs(om.row - r);
    if (dd <= 1 && dd < bestD) { bestD = dd; best = om; }
  }
  return best;
}

// Applica un verbo a un omino. Ritorna il vettore { dy, loyal, event } e segna
// l'omino risolto. Verbo sconosciuto -> errore (come resolveEncounter).
export function resolveOmino(_o, omino, verb) {
  const eff = OMINI_VERBS[verb];
  if (!eff) throw new Error(`unknown verb: ${verb}`);
  omino.resolved = true;
  omino.verb = verb;
  return { ...eff };
}
