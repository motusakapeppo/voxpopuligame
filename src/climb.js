// ============================================================================
// CLIMB — arrampicata. Non si salta: ci si aggrappa alla parete di corpi.
// Il giocatore ha DUE mani; ogni mano tiene un appiglio (la testa/le spalle
// di un corpo). Input:
//   ← →  : sposta la mano sinistra/destra all'appiglio adiacente
//   ↑    : entrambe le mani salgono di una fila (ti tiri su)
//   ↓    : entrambe le mani scendono di una fila
// Il tronco pende al centro tra le mani. Tutto deterministico e testabile.
// ============================================================================
import { STEP_Y, TOP_Y } from './gironi.js';

export const REACH_TIME = 0.12;     // durata di un movimento di mano (s)
const HANG = 11;                    // quanto il corpo pende sotto le mani

// griglia di appigli derivata dal girone: più stretta salendo (piramide)
export function createClimb(g) {
  const cx = 160;
  const bottomY = Math.max(...g.bodies.map(b => b.y));
  const nRows = Math.max(2, Math.floor((bottomY - TOP_Y) / STEP_Y) + 1);
  const cols = [40, 80, 120, 160, 200, 240, 280];
  const rows = Array.from({ length: nRows }, (_, r) => bottomY - r * STEP_Y); // r=0 in basso

  const halfWidth = r => 120 - (r / Math.max(1, nRows - 1)) * 90;
  const holds = rows.map((_, r) => cols.map((x, c) => Math.abs(x - cx) <= halfWidth(r)));

  const has = (c, r) => c >= 0 && c < cols.length && r >= 0 && r < nRows && holds[r][c];
  // lookup ROBUSTA: gli indici possono essere float durante l'animazione;
  // arrotondiamo e clampiamo per non produrre mai `undefined` → NaN.
  const xOf = c => cols[Math.max(0, Math.min(cols.length - 1, Math.round(c)))];
  const yOf = r => rows[Math.max(0, Math.min(nRows - 1, Math.round(r)))];

  // partenza: in basso, mani al centro
  const c0 = 3;
  return {
    cols, rows, holds, has, xOf, yOf, nRows, cx,
    lh: { c: c0, r: 0 }, rh: { c: c0 + 1, r: 0 },
    lhA: { c: c0, r: 0 }, rhA: { c: c0 + 1, r: 0 },  // animati (float)
    reach: 0, reachDur: REACH_TIME,
    from: null, to: null, which: null,
    reached: false,
  };
}

// Le posizioni correnti (interpolate) di mani e tronco.
export function climbPos(cl) {
  const lx = cl.xOf(cl.lhA.c), ly = cl.yOf(cl.lhA.r);
  const rx = cl.xOf(cl.rhA.c), ry = cl.yOf(cl.rhA.r);
  const tx = (lx + rx) / 2;
  const ty = (ly + ry) / 2 + HANG;
  return { lx, ly, rx, ry, tx, ty };
}

// trova la colonna valida più vicina a `c` nella fila `r` (per restringersi salendo)
function nearestCol(cl, c, r) {
  if (cl.has(c, r)) return c;
  for (let d = 1; d < cl.cols.length; d++) {
    if (cl.has(c - d, r)) return c - d;
    if (cl.has(c + d, r)) return c + d;
  }
  return null;
}

// Le colonne valide (appigli) di una fila.
export function rowCols(cl, r) {
  const out = [];
  for (let c = 0; c < cl.cols.length; c++) if (cl.has(c, r)) out.push(c);
  return out;
}

// La colonna valida più centrale di una fila: è lì che sta il corpo del
// giocatore mentre sale, quindi è lì che vanno messi incontri e potenziamenti
// (altrimenti finiscono sui bordi, irraggiungibili).
export function centerCol(cl, r) {
  const cs = rowCols(cl, r);
  if (!cs.length) return 0;
  let best = cs[0];
  for (const c of cs) if (Math.abs(cl.xOf(c) - cl.cx) < Math.abs(cl.xOf(best) - cl.cx)) best = c;
  return best;
}

// Avvia un movimento di mano/i verso un bersaglio, se l'appiglio esiste.
function reachTo(cl, which, target) {
  if (cl.reach > 0) return false;
  if (which === 'both') {
    const lc = nearestCol(cl, cl.lh.c, target.r);
    const rc = nearestCol(cl, cl.rh.c, target.r);
    if (lc === null || rc === null) return false;
    cl.from = { l: { ...cl.lhA }, r: { ...cl.rhA } };
    cl.to = { l: { c: lc, r: target.r }, r: { c: rc, r: target.r } };
    cl.which = 'both';
  } else {
    // spostamento laterale: cerca il prossimo appiglio valido in quella direzione
    const dir = which === 'l' ? -1 : 1;
    const cur = which === 'l' ? cl.lh : cl.rh;
    let c = cur.c + dir;
    while (c >= 0 && c < cl.cols.length && !cl.has(c, cur.r)) c += dir;
    if (c < 0 || c >= cl.cols.length || !cl.has(c, cur.r)) return false;
    cl.from = { [which]: { ...(which === 'l' ? cl.lhA : cl.rhA) } };
    cl.to = { [which]: { c, r: cur.r } };
    cl.which = which;
  }
  cl.reach = cl.reachDur;
  return true;
}

export function stepClimb(cl, input, dt) {
  if (cl.reach > 0) {
    cl.reach -= dt;
    const k = 1 - Math.max(0, cl.reach) / cl.reachDur;
    // interpolazione (ease) delle mani verso il bersaglio
    const lerp = (a, b) => a + (b - a) * (k * k * (3 - 2 * k));
    if (cl.to.l) {
      cl.lhA.c = lerp(cl.from.l.c, cl.to.l.c); cl.lhA.r = lerp(cl.from.l.r, cl.to.l.r);
      if (k >= 1) { cl.lh = { ...cl.to.l }; }
    }
    if (cl.to.r) {
      cl.rhA.c = lerp(cl.from.r.c, cl.to.r.c); cl.rhA.r = lerp(cl.from.r.r, cl.to.r.r);
      if (k >= 1) { cl.rh = { ...cl.to.r }; }
    }
    if (cl.reach <= 0 && cl.to.l && cl.to.r) { cl.lh = { ...cl.to.l }; cl.rh = { ...cl.to.r }; }
    return;
  }
  // input discreti
  if (input.left) reachTo(cl, 'l', { c: cl.lh.c - 1, r: cl.lh.r });
  else if (input.right) reachTo(cl, 'r', { c: cl.rh.c + 1, r: cl.rh.r });
  else if (input.up) reachTo(cl, 'both', { r: Math.min(cl.nRows - 1, cl.lh.r + 1) });
  else if (input.down) reachTo(cl, 'both', { r: Math.max(0, cl.lh.r - 1) });

  if (cl.lh.r >= cl.nRows - 1 && cl.rh.r >= cl.nRows - 1) cl.reached = true;
}

// Quante file ha scalato (0 = base, 1 = cima) — per HUD e fine girone.
export function climbProgress(cl) {
  return Math.max(0, Math.min(1, Math.max(cl.lhA.r, cl.rhA.r) / (cl.nRows - 1)));
}

// L'incontro NON risolto che scatta sulla fila corrente del giocatore (e in quella
// sotto). Attivazione per FILA: impossibile mancarlo, gli incontri scandiscono
// l'ascesa invece di restare su un bordo irraggiungibile.
export function encounterAt(cl, encounters) {
  const r = Math.max(cl.lh.r, cl.rh.r);
  for (const e of encounters) {
    if (e.resolved) continue;
    if (Math.abs(e.row - r) <= 1) return e;
  }
  return null;
}
