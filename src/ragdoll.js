// ============================================================================
// RAGDOLL — fisica deterministica di collasso per la piramide di VOX POPULI.
// Position-Verlet (Jakobsen): ogni particella è {x,y,px,py}, le ossa sono
// vincoli di distanza risolti con 3–4 iterazioni di rilassamento, le collisioni
// sono semplici push-out da box assi-allineati. Nessun RNG di sistema: un LCG
// seminato (stesso pattern di fx.js, copia indipendente) guida ogni casualità.
// ============================================================================
import { rectsOverlap } from './physics.js';

// ---------------------------------------------------------------------------
// COSTANTI — soglie di sleep in stile Matter.js (motion = speed² + spin²).
// ---------------------------------------------------------------------------
export const RAG_SLEEP_MOTION = 0.08;   // sotto questa moto la figura si addormenta
export const RAG_WAKE_MOTION = 0.18;    // una vicina che si muove oltre questa sveglia
export const RAG_SLEEP_FRAMES = 60;     // frame consecutivi sotto soglia prima di dormire
export const RAG_DAMP = 0.999;          // damping gentile, un pelo sotto 1
export const RAG_ITER = 4;              // iterazioni di rilassamento dei vincoli
export const RAG_MAX_DT = 1 / 30;       // dt più grande è un freeze, non un salto fisico
export const RAG_PAIR_R = 3.0;          // raggio di contatto fra particelle di figure diverse
export const RAG_PAIR_IT = 2;           // iterazioni di push inter-figura (pila)
export const RAG_PAIR_MAX = 10;         // max vicini controllati per figura (costo)

function ragNum(v, d) { return Number.isFinite(v) ? v : d; }

// LCG deterministico: stesso seed → stessa sequenza su ogni macchina.
function ragLcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// MONDO — boxes: [{x,y,w,h}] assi-allineati (muri/ground), groundY: fondo mondo.
// ---------------------------------------------------------------------------
export function ragCreateWorld(opts = {}) {
  const w = {
    gravity: ragNum(opts.gravity, 80),
    groundY: ragNum(opts.groundY, 180),
    boxes: Array.isArray(opts.boxes) ? opts.boxes.slice() : [],
    seed: (opts.seed >>> 0) || 1,
    figures: [],
    hash: new Map(),          // broadphase: "cx,cy" → [indice figura]
    hashCell: ragNum(opts.hashCell, 28),   // ~2× la figura media (12–14px)
    frame: 0,
  };
  w.rng = ragLcg(w.seed);
  return w;
}

// ---------------------------------------------------------------------------
// FIGURA — stick figure di 4 particelle (bacino, testa, due piedi) su 3 ossa.
// scale scala le lunghezze delle ossa; la posa iniziale è verticale, i piedi
// leggermente divaricati per stabilità. La casualità (divaricazione, jitter)
// passa dal LCG del mondo: stesso seed → stessa figura.
// ---------------------------------------------------------------------------
export function ragAddFigure(world, opts = {}) {
  const s = Math.max(0.5, ragNum(opts.scale, 1));
  const x = ragNum(opts.x, 0), y = ragNum(opts.y, 0);
  const rng = world.rng;

  // lunghezze delle ossa: torso, collo, gamba (2–3 lunghezze distinte)
  const torso = 5 * s, neck = 2.5 * s, leg = 4 * s;
  // divaricazione dei piedi decisa dal LCG del mondo (deterministica)
  const spreadL = (rng() * 2 - 1) * leg * 0.4;
  const spreadR = (rng() * 2 - 1) * leg * 0.4;
  const parts = [
    { x: x, y: y, px: x, py: y },                       // 0 bacino
    { x: x, y: y - torso, px: x, py: y - torso },       // 1 spalle
    { x: x, y: y - torso - neck, px: x, py: y - torso - neck }, // 2 testa
    { x: x + spreadL, y: y + leg, px: x + spreadL, py: y + leg }, // 3 piede sx
    { x: x + spreadR, y: y + leg, px: x + spreadR, py: y + leg }, // 4 piede dx
  ];
  const bones = [
    { a: 0, b: 1, len: torso },       // torso
    { a: 1, b: 2, len: neck },        // collo
    { a: 0, b: 3, len: leg },         // gamba sx
    { a: 0, b: 4, len: leg },         // gamba dx
  ];
  const f = {
    parts, bones,
    sleeping: false,
    sleepT: 0,          // frame consecutivi sotto la soglia
    motion: 0,          // motion dell'ultimo frame (debug/stats)
    spin: 0,            // componente "angolare" della moto
  };
  world.figures.push(f);
  return f;
}

// ---------------------------------------------------------------------------
// INTEGRAZIONE — Position-Verlet: pos += (pos - prev) * damp + g*dt².
// ---------------------------------------------------------------------------
function ragIntegrate(world, dt) {
  const gx = 0, gy = world.gravity;
  const gdt = gy * dt * dt;
  for (const f of world.figures) {
    if (f.sleeping) continue;   // congelata: px=x,py=y già fatto allo sleep
    for (const p of f.parts) {
      const vx = p.x - p.px, vy = p.y - p.py;
      p.px = p.x; p.py = p.y;
      p.x += vx * RAG_DAMP;
      p.y += vy * RAG_DAMP + gdt;
    }
  }
}

// ---------------------------------------------------------------------------
// VINCOLI — Jakobsen: per ogni osa sposto entrambi gli estremi verso la
// lunghezza target di metà errore, RAG_ITER volte per frame.
// ---------------------------------------------------------------------------
function ragSolveBones(f) {
  for (let it = 0; it < RAG_ITER; it++) {
    for (const b of f.bones) {
      const a = f.parts[b.a], c = f.parts[b.b];
      let dx = c.x - a.x, dy = c.y - a.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-6) { dx = 0; dy = b.len; d = b.len; }   // degenere: stira verticale
      const diff = (d - b.len) / d * 0.5;
      const ox = dx * diff, oy = dy * diff;
      a.x += ox; a.y += oy;
      c.x -= ox; c.y -= oy;
    }
  }
}

// ---------------------------------------------------------------------------
// COLLISIONI — push-out lungo l'asse di minima penetrazione; il fondo del
// mondo è un piano: y <= groundY sempre. Al contatto smorzo la velocità
// tangenziale (attrito): senza, le figure scivolano come su ghiaccio.
// ---------------------------------------------------------------------------
const RAG_FRICTION = 0.6;   // frazione di velocità tangenziale che sopravvive

// riduce la velocità implicita di p lungo un asse (1 = nulla, 0 = ferma)
function ragDampVel(p, ax, ay, keep) {
  const vx = p.x - p.px, vy = p.y - p.py;
  p.px = p.x - vx * ax * keep;
  p.py = p.y - vy * ay * keep;
}

function ragCollide(world) {
  for (const f of world.figures) {
    if (f.sleeping) continue;
    for (const p of f.parts) {
      if (p.y > world.groundY) {
        p.y = world.groundY;
        ragDampVel(p, 1, 0, RAG_FRICTION);   // attrito orizzontale, uccide la caduta
        p.py = p.y;
      }
      for (const box of world.boxes) {
        // broadphase a punto: salta i box lontani
        if (p.x < box.x - 1 || p.x > box.x + box.w + 1 ||
            p.y < box.y - 1 || p.y > box.y + box.h + 1) continue;
        if (!rectsOverlap({ x: p.x - 0.5, y: p.y - 0.5, w: 1, h: 1 }, box)) continue;
        // penetrazioni sui 4 lati: spingo lungo la minima
        const left = p.x - (box.x - 0.5), right = (box.x + box.w + 0.5) - p.x;
        const top = p.y - (box.y - 0.5), bottom = (box.y + box.h + 0.5) - p.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) { p.x = box.x - 0.5; p.px = p.x; ragDampVel(p, 0, 1, RAG_FRICTION); }
        else if (m === right) { p.x = box.x + box.w + 0.5; p.px = p.x; ragDampVel(p, 0, 1, RAG_FRICTION); }
        else if (m === top) { p.y = box.y - 0.5; p.py = p.y; ragDampVel(p, 1, 0, RAG_FRICTION); }
        else { p.y = box.y + box.h + 0.5; p.py = p.y; ragDampVel(p, 1, 0, RAG_FRICTION); }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// BROADPHASE — hash spaziale uniforme: cella ~2× figura; ricostruito ogni
// frame. Mappa "cx,cy" → array di indici di figura. Serve a collapse.js per
// la pila: figure vicine si svegliano a vicenda e si accumulano.
// ---------------------------------------------------------------------------
function ragRebuildHash(world) {
  world.hash.clear();
  const cell = world.hashCell;
  for (let i = 0; i < world.figures.length; i++) {
    const f = world.figures[i];
    let mx = 0, my = 0;
    for (const p of f.parts) { mx += p.x; my += p.y; }
    mx /= f.parts.length; my /= f.parts.length;
    const cx = Math.floor(mx / cell), cy = Math.floor(my / cell);
    const key = cx + ',' + cy;
    let arr = world.hash.get(key);
    if (!arr) { arr = []; world.hash.set(key, arr); }
    arr.push(i);
  }
}

// Vicini di una figura (indici nel mondo) via hash: la cella propria e le 8
// adiacenti. Usato dal wake e da collapse.js per la pila.
export function ragNeighbors(world, figIndex) {
  const f = world.figures[figIndex];
  if (!f) return [];
  let mx = 0, my = 0;
  for (const p of f.parts) { mx += p.x; my += p.y; }
  mx /= f.parts.length; my /= f.parts.length;
  const cell = world.hashCell;
  const cx = Math.floor(mx / cell), cy = Math.floor(my / cell);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const arr = world.hash.get((cx + dx) + ',' + (cy + dy));
      if (!arr) continue;
      for (const i of arr) if (i !== figIndex) out.push(i);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// SLEEP — motion = speed² + spin² per figura; sotto soglia per RAG_SLEEP_FRAMES
// frame → sleeping=true e freeze (px=x,py=y). Una vicina che si muove oltre
// RAG_WAKE_MOTION sveglia. Deterministico: l'ordine di scansione è fisso.
// ---------------------------------------------------------------------------
function ragSleepWake(world) {
  const figs = world.figures;
  // 1) aggiorna motion e conta i frame quieti
  for (let i = 0; i < figs.length; i++) {
    const f = figs[i];
    if (f.sleeping) continue;
    let speed2 = 0, spin2 = 0;
    for (const p of f.parts) {
      const vx = p.x - p.px, vy = p.y - p.py;
      speed2 += vx * vx + vy * vy;
    }
    // spin: moto relativo dei piedi rispetto al bacino (proxy angolare)
    const hip = f.parts[0], foot = f.parts[3];
    const rvx = (foot.x - foot.px) - (hip.x - hip.px);
    const rvy = (foot.y - foot.py) - (hip.y - hip.py);
    spin2 = rvx * rvx + rvy * rvy;
    f.motion = speed2 + spin2;
    if (f.motion < RAG_SLEEP_MOTION) f.sleepT++;
    else f.sleepT = 0;
    if (f.sleepT >= RAG_SLEEP_FRAMES) {
      f.sleeping = true;
      for (const p of f.parts) { p.px = p.x; p.py = p.y; }
    }
  }
  // 2) wake per prossimità: una figura sveglia e veloce sveglia le vicine
  for (let i = 0; i < figs.length; i++) {
    const f = figs[i];
    if (f.sleeping || f.motion < RAG_WAKE_MOTION) continue;
    const near = ragNeighbors(world, i);
    for (const j of near) {
      const n = figs[j];
      if (n.sleeping) {
        n.sleeping = false;
        n.sleepT = 0;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// COLLISIONI FRA FIGURE (opzionale: world.pair) — ogni particella respinge le
// particelle vicine di ALTRE figure entro RAG_PAIR_R. Serve a far ACCUMULARE le
// figure in una pila densa invece di scivolare tutte sul fondo. Costo limitato:
// si controllano solo RAG_PAIR_MAX vicini per figura via spatial hash. Solo le
// figure sveglie spingono (le addormentate sono immobili): così la pila si
// assesta e dorme. Deterministico: ordine di scansione fisso.
// ---------------------------------------------------------------------------
function ragCollidePairs(world) {
  if (!world.pair) return;
  const R = RAG_PAIR_R, R2 = R * R;
  const n = world.figures.length;
  for (let i = 0; i < n; i++) {
    const a = world.figures[i];
    if (a.sleeping) continue;
    const near = ragNeighbors(world, i);
    let checked = 0;
    for (let k = 0; k < near.length && checked < RAG_PAIR_MAX; k++) {
      const b = world.figures[near[k]];
      if (!b) continue;
      checked++;
      for (const pa of a.parts) {
        for (const pb of b.parts) {
          let dx = pb.x - pa.x, dy = pb.y - pa.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= R2 || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const push = (R - d) / d * 0.5;   // metà per parte
          if (!b.sleeping) { dx *= push; dy *= push; }
          else { dx *= push * 2; dy *= push * 2; }   // quella ferma assorbe tutto
          pa.x -= dx; pa.y -= dy;
          if (!b.sleeping) { pb.x += dx; pb.y += dy; }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// STEP — ordine fisso: hash → integrate → bones → collide → pair → sleep/wake.
// ---------------------------------------------------------------------------
export function ragStep(world, dt) {
  if (!world || !Array.isArray(world.figures)) return;
  dt = Number.isFinite(dt) ? Math.max(0, Math.min(RAG_MAX_DT, dt)) : 0;
  ragRebuildHash(world);
  ragIntegrate(world, dt);
  for (let it = 0; it < RAG_ITER; it++) {
    for (const f of world.figures) {
      if (f.sleeping) continue;
      ragSolveBones(f);
    }
    if (world.pair && it < RAG_PAIR_IT) ragCollidePairs(world);
  }
  ragCollide(world);
  ragSleepWake(world);
  world.frame++;
}

// ---------------------------------------------------------------------------
// STATS — conteggi e quante figure dormono (0..1).
// ---------------------------------------------------------------------------
export function ragWorldStats(world) {
  let particles = 0, bones = 0, sleeping = 0;
  for (const f of world.figures) {
    particles += f.parts.length;
    bones += f.bones.length;
    if (f.sleeping) sleeping++;
  }
  return { figures: world.figures.length, particles, bones, sleeping };
}

export function ragSleepRatio(world) {
  const n = world.figures.length;
  if (!n) return 1;
  let sleeping = 0;
  for (const f of world.figures) if (f.sleeping) sleeping++;
  return sleeping / n;
}