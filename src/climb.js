// ============================================================================
// CLIMB — arrampicata a due mani. Ogni mano ha una PRESA (hold): quando è a 1
// è ben piantata, a 0 è staccata e sta raggiungendo l'appiglio. Le mani si
// muovono ALTERNATE (sinistra, destra, sinistra…): è un vero ciclo di scalata.
// Il bacino pende sotto le mani e le segue con ritardo (dondolio), così il
// corpo "tira su" invece di teletrasportarsi. Tutto deterministico e testabile.
// ============================================================================
import { STEP_Y, TOP_Y } from './gironi.js';

export const REACH_TIME = 0.17;     // durata di un movimento di mano (s)
export const HOLD_TIME = 0.20;      // tempo di recupero della presa dopo lo spostamento
const HANG = 12;                    // quanto il bacino pende sotto le mani
const PLANT_PULL = 4;               // quanto il corpo "sale" quando una mano pianta

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
  const xOf = c => cols[Math.max(0, Math.min(cols.length - 1, Math.round(c)))];
  const yOf = r => rows[Math.max(0, Math.min(nRows - 1, Math.round(r)))];

  const c0 = 3;
  // posizione iniziale del bacino = centro presa + HANG
  const bx0 = (xOf(c0) + xOf(c0 + 1)) / 2;
  const by0 = yOf(0) + HANG;
  return {
    cols, rows, holds, has, xOf, yOf, nRows, cx,
    lh: { c: c0, r: 0 }, rh: { c: c0 + 1, r: 0 },
    lhA: { c: c0, r: 0 }, rhA: { c: c0 + 1, r: 0 },  // animati (float)
    lhHold: 1, rhHold: 1,                            // presa 0..1
    bx: bx0, by: by0, vby: 0,                        // bacino (animato)
    lead: 'l',                                      // quale mano sale per prossima
    reach: 0, reachDur: REACH_TIME,
    from: null, to: null, which: null,
    reached: false,
  };
}

// Le posizioni correnti di mani e corpo (usate da disegno, camera, effetti).
export function climbPos(cl) {
  const lx = cl.xOf(cl.lhA.c), ly = cl.yOf(cl.lhA.r);
  const rx = cl.xOf(cl.rhA.c), ry = cl.yOf(cl.rhA.r);
  const tx = (lx + rx) / 2;
  return {
    lx, ly, rx, ry, tx,
    bx: cl.bx, by: cl.by,                       // bacino (hip)
    ty: cl.by,                                  // compat: il corpo pende qui
    shx: cl.bx, shy: cl.by - 8,                 // spalle (approssimazione per effetti)
    reachL: cl.lhHold, reachR: cl.rhHold,        // 0 = mano staccata, 1 = piantata
  };
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

// Prossima colonna valida spostandosi di lato, con fallback alla più vicina.
function sideCol(cl, hold, dir) {
  let c = hold.c + dir;
  while (c >= 0 && c < cl.cols.length && !cl.has(c, hold.r)) c += dir;
  if (c >= 0 && c < cl.cols.length && cl.has(c, hold.r)) return c;
  return nearestCol(cl, hold.c, hold.r) ?? hold.c;
}

// Avvia il movimento di UNA mano verso un bersaglio (se l'appiglio esiste).
function reachOne(cl, which, target) {
  const cur = which === 'l' ? cl.lh : cl.rh;
  if (!cl.has(target.c, target.r)) return false;
  cl.from = { [which]: { ...(which === 'l' ? cl.lhA : cl.rhA) } };
  cl.to = { [which]: { c: target.c, r: target.r } };
  cl.which = which;
  cl.reach = cl.reachDur;
  if (which === 'l') cl.lhHold = 0; else cl.rhHold = 0;
  return true;
}

// Sceglie la prossima mossa: la mano "lead" prova a salire di una fila;
// se non c'è appiglio, l'altra mano; poi si alterna. Il bacino segue.
function autoStep(cl) {
  const order = cl.lead === 'l' ? ['l', 'r'] : ['r', 'l'];
  for (const which of order) {
    const cur = which === 'l' ? cl.lh : cl.rh;
    const r = Math.min(cl.nRows - 1, cur.r + 1);
    const c = nearestCol(cl, cur.c, r);
    if (c !== null) {
      reachOne(cl, which, { c, r });
      cl.lead = which === 'l' ? 'r' : 'l';   // alterna
      return true;
    }
  }
  return false;
}

export function stepClimb(cl, input, dt) {
  const d = Number.isFinite(dt) ? dt : 0.016;
  // presa: recupera verso 1 quando la mano è ferma
  if (cl.reach <= 0) {
    if (cl.which !== 'l') cl.lhHold = Math.min(1, cl.lhHold + d / HOLD_TIME);
    if (cl.which !== 'r') cl.rhHold = Math.min(1, cl.rhHold + d / HOLD_TIME);
  }

  if (cl.reach > 0) {
    cl.reach -= d;
    const k = 1 - Math.max(0, cl.reach) / cl.reachDur;
    const lerp = (a, b) => a + (b - a) * (k * k * (3 - 2 * k));
    const w = cl.which, to = cl.to && cl.to[w], from = cl.from && cl.from[w];
    if (to && from) {
      const cur = w === 'l' ? cl.lhA : cl.rhA;
      cur.c = lerp(from.c, to.c); cur.r = lerp(from.r, to.r);
      if (k >= 1) { if (w === 'l') cl.lh = { ...to }; else cl.rh = { ...to }; cl.which = null; }
    }
  } else {
    // input manuale. ↑ fa partire il ciclo di scalata (mani alternate);
    // ← → spostano una singola mano di lato; ↓ scende.
    if (input.left) reachOne(cl, 'l', { c: sideCol(cl, cl.lh, -1), r: cl.lh.r });
    else if (input.right) reachOne(cl, 'r', { c: sideCol(cl, cl.rh, 1), r: cl.rh.r });
    else if (input.up) autoStep(cl);
    else if (input.down) reachOne(cl, 'l', { c: cl.lh.c, r: Math.max(0, cl.lh.r - 1) });
  }

  // bacino: segue il centro delle mani con ritardo (dondolio) e non supera
  // mai la presa. Quando un corpo vicino cede (piantata), dà un "tirone" su.
  const mx = (cl.xOf(cl.lhA.c) + cl.xOf(cl.rhA.c)) / 2;
  const my = (cl.yOf(cl.lhA.r) + cl.yOf(cl.rhA.r)) / 2 + HANG;
  const k = 1 - Math.pow(0.001, d);         // smorzamento indipendente dal frame
  cl.vby += (my - cl.by) * 8 * d;           // molla verticale (il "tiro su")
  cl.vby *= Math.pow(0.02, d);              // attrito
  cl.by += cl.vby * d + (my - cl.by) * k;
  cl.bx += (mx - cl.bx) * k * 0.8;
  // non salire mai sopra le mani: il bacino resta appeso
  if (cl.by < my - 2) { cl.by = my - 2; cl.vby = Math.max(0, cl.vby); }

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
