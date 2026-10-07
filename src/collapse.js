// ============================================================================
// COLLAPSE — il finale È la copertina, animata. Si arriva in cima, la
// telecamera si allarga e la piramide si rivela fatta di persone che si
// arrampicano. Poi TREMA (crack), CROLLA con fisica ragdoll deterministica
// (ragdoll.js: Verlet + vincoli + collisioni) e si SETTLE in una maceria
// che resta come sfondo del CTA. Niente flip, niente cerchio.
// ============================================================================
import { C, depthRed } from './palette.js';
import { drawFigure, drawRagdoll } from './figure.js';
import {
  ragCreateWorld, ragAddFigure, ragStep, ragSleepRatio, RAG_MAX_DT,
} from './ragdoll.js';

export const PHASES = [
  ['zoomOut', 2.2],
  ['revealBodies', 2.6],
  ['crack', 1.4],
  ['collapse', 3.4],
  ['settle', 2.4],
];

const COLLAPSE_DT = 0.016;   // dt fisso della simulazione ragdoll
const COLLAPSE_STATES = ['climb', 'reach', 'idle', 'fall', 'scream', 'push'];

// LCG deterministico locale (stesso pattern di ragdoll.js/fx.js): nessun RNG
// di sistema, stesso seed → stessa piramide su ogni macchina.
function collapseLcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// GRIGLIA — piramide di ~56-64 figure: 11 file, span che si restringe.
// Ogni figura ha profondità (0.4..0.95), una posa DISTINTA da figure.js,
// fase di animazione propria e (per il crollo) spin/launch deterministici.
// ---------------------------------------------------------------------------
export function buildFigureGrid(W, H) {
  const rng = collapseLcg(913);
  const figs = [];
  const cx = W / 2, baseY = H - 14, rows = 14;
  for (let row = 0; row < rows; row++) {
    const y = baseY - row * 9;
    const span = 150 - row * 9.5;
    if (span < 6) break;
    const count = Math.max(1, Math.round(span / 10));
    for (let i = 0; i < count; i++) {
      const depth = Math.min(0.95, 0.4 + (row / rows) * 0.5 + rng() * 0.05);
      // posa distinta per figura: ciclo sui 6 stati con offset deterministico
      const state = COLLAPSE_STATES[(row * 3 + i * 5) % COLLAPSE_STATES.length];
      figs.push({
        x: cx - span / 2 + (i * span) / Math.max(1, count),
        y, row,
        depth,
        state,
        phase: i * 1.3 + row * 0.7,
        facing: (row + i) % 2 ? 1 : -1,
        // spin/launch deterministici per il crollo (usati da stepCollapse)
        spin: (rng() * 2 - 1) * 0.9,
        launch: 0.6 + rng() * 0.8,
        vy: 0,
      });
    }
  }
  return figs;
}

// ---------------------------------------------------------------------------
// CREATE — griglia pre-crollo + mondo ragdoll (un ragfigure per figura).
// I bodies del girone diventano box assi-allineati del mondo: le figure
// cadono, collidono con le mensole e si accumulano sul fondo.
// ---------------------------------------------------------------------------
export function createCollapse({ bodies, viewW, viewH, supported = 4, seed = 1 }) {
  const figs = buildFigureGrid(viewW, viewH);
  // keep = i "fedeli": figure che restano in piedi sul nucleo della piramide.
  // supported (consenso) allarga il nucleo → più superstiti eretti.
  const keep = Math.max(3, Math.min(figs.length, 6 + Math.round(supported) * 2));
  const boxes = (Array.isArray(bodies) ? bodies : []).map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  // muri laterali invisibili: contengono la pila dentro lo schermo
  boxes.push({ x: -60, y: -200, w: 62, h: viewH + 400 });
  boxes.push({ x: viewW - 2, y: -200, w: 62, h: viewH + 400 });
  const world = ragCreateWorld({
    gravity: 80,
    groundY: viewH,
    seed: (seed >>> 0) || 1,
    pair: true,   // collisioni fra figure: la pila si accumula invece di scivolare
    boxes,
  });
  for (let i = 0; i < figs.length; i++) {
    const f = figs[i];
    const rf = ragAddFigure(world, { x: f.x, y: f.y, scale: 0.55 + f.depth * 0.35 });
    rf.spin = f.spin;   // usato per la rotazione del tumble all'impulso
    // LOYALTY: i primi `keep` (ordine di scansione fisso → deterministico) sono
    // i fedeli. Ancorati alla posa eretta iniziale: non crollano, restano in
    // piedi. `keep` non è più un valore morto: guida il nucleo superstite.
    rf.loyal = i < keep;
    rf.home = rf.parts.map(p => ({ x: p.x, y: p.y }));
    rf.dustCd = 0;      // cooldown polvere per figura (costo limitato)
    f.rag = rf;   // aggancio figura ↔ ragfigure (disegno + impulsi)
  }
  return { bodies, viewW, viewH, supported, figs, keep, world,
    phase: 'zoomOut', t: 0, phaseIndex: 0, done: false, angle: 0,
    // supported modula anche la forza del trigger: più consenso → scossa più
    // ampia (deterministico, nessun RNG).
    triggerStrength: 1 + Math.max(0, supported) * 0.06,
    trigger: { x: viewW / 2, y: viewH - 16 }, dust: [], dustTick: 0 };
}

// ---------------------------------------------------------------------------
// IMPULSO — al passaggio crack→collapse: spinta radiale dal punto trigger
// verso le figure vicine (deterministica: ordine di scansione fisso).
// ---------------------------------------------------------------------------
function collapseImpulse(c) {
  const world = c.world;
  const cxAll = c.viewW / 2, baseY = c.viewH - 14;
  const strength = c.triggerStrength || 1;
  for (let i = 0; i < world.figures.length; i++) {
    const rf = world.figures[i];
    const g = c.figs[i];
    // LOYALTY: i fedeli non ricevono l'impulso → restano eretti (keep vivo).
    if (rf.loyal) continue;
    // 1) INSTABILITA' GLOBALE: ogni omino riceve un calcio verso l'esterno e
    //    in basso, scalato dall'altezza (le file alte partono con più spinta:
    //    il "crollo" è totale, non solo vicino al trigger). Deterministico.
    const hx = rf.parts[0].x - cxAll;
    const hd = Math.abs(hx) + 1;
    const outward = (hx / hd) * (0.8 + g.launch * 0.8) * strength;
    const down = (1.4 + g.launch * 1.0 + (g.depth * 0.8)) * strength;
    const spin = (g.spin || 0);
    // 2) SPINTA LOCALE dal trigger: chi è vicino al punto di rottura è sparato.
    const dx = rf.parts[0].x - c.trigger.x, dy = rf.parts[0].y - c.trigger.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const near = Math.max(0, 1 - d / 150) * g.launch * 2.4 * strength;
    const ix = outward + (dx / d) * near - (dy / d) * spin * 0.8;
    const iy = down + (dy / d) * near * 0.4;
    for (const p of rf.parts) {
      p.px -= ix;
      p.py -= iy;
    }
    // rotazione del tumble: i piedi divergono → la figura ruota cadendo
    rf.parts[3].px -= spin * 2.2;
    rf.parts[4].px += spin * 2.2;
    rf.parts[3].py += 0.8; rf.parts[4].py += 0.8;
  }
}

// ---------------------------------------------------------------------------
// POLVERE — burst breve, cap fisso (costo costante). Un solo punto d'ingresso
// così ogni sorgente (piede, corpo, box) resta limitata.
// ---------------------------------------------------------------------------
const DUST_MAX = 32;
function emitDust(c, x, y, life) {
  c.dust.push({ x, y, t: 0, life });
  if (c.dust.length > DUST_MAX) c.dust.shift();
}

// ---------------------------------------------------------------------------
// STEP — zoomOut/revealBodies come prima (griglia + sweep), crack: brivido
// deterministico, collapse/settle: ragStep a dt fisso, TORQUE all'atterraggio,
// polvere su ogni impatto (piedi + corpi/box), fedeli ancorati eretti.
// ---------------------------------------------------------------------------
export function stepCollapse(c, dt) {
  if (c.done) return;
  c.t += dt; c.angle += dt * 0.5;
  const [, dur] = PHASES[c.phaseIndex];
  if (c.t >= dur) {
    if (c.phaseIndex < PHASES.length - 1) {
      if (PHASES[c.phaseIndex][0] === 'crack') collapseImpulse(c);   // crack→collapse
      c.t = 0; c.phaseIndex++;
    } else c.done = true;
  }
  c.phase = PHASES[c.phaseIndex][0];

  if (c.phase === 'crack') {
    // brivido: jitter deterministico legato al tempo (nessun stato da mutare)
    c.shake = Math.sin(c.t * 47) * (1 + c.t * 3);
  } else if (c.phase === 'collapse' || c.phase === 'settle') {
    c.shake = 0;
    const step = Math.min(RAG_MAX_DT, Math.max(0, Math.min(dt, COLLAPSE_DT)));
    ragStep(c.world, step);

    // LOYALTY: i fedeli restano eretti. Li ri-ancoro alla posa iniziale (il
    // wake per prossimità di ragdoll.js potrebbe averli svegliati): così `keep`
    // è vivo e il nucleo superstite non crolla. Deterministico.
    for (const rf of c.world.figures) {
      if (!rf.loyal) continue;
      for (let k = 0; k < rf.parts.length; k++) {
        const p = rf.parts[k], h = rf.home[k];
        p.x = h.x; p.y = h.y; p.px = h.x; p.py = h.y;
      }
      rf.sleeping = true;
    }

    for (let i = 0; i < c.world.figures.length; i++) {
      const rf = c.world.figures[i];
      if (rf.loyal) continue;   // i fedeli non atterrano: restano in piedi
      if (!rf.landed) {
        const foot = rf.parts[3];
        if (foot.y >= c.viewH - 1) {
          rf.landed = true;
          // TORQUE: all'atterraggio la figura RUOTA a terra. Impulsi orizzontali
          // di SEGNO OPPOSTO su testa/spalle vs piedi (momento, non traslazione):
          // il bacino fa da perno, il corpo ruota invece di scivolare. Il verso
          // è deterministico (dir dallo spin memorizzato della figura).
          const g = c.figs[i];
          const dir = (g.spin || 0) >= 0 ? 1 : -1;
          const k = 2.2 + g.launch * 1.2;
          rf.parts[1].px += dir * k;   // spalle
          rf.parts[2].px += dir * k;   // testa
          rf.parts[3].px -= dir * k;   // piede sx
          rf.parts[4].px -= dir * k;   // piede dx
          emitDust(c, rf.parts[0].x, c.viewH - 1, 0.5 + (i % 3) * 0.1);
        }
      }
      // POLVERE su impatto con box/mensole (non solo il primo contatto del
      // piede): una particella che scende e tocca il top di un box. Cooldown
      // per figura → costo limitato e cap globale.
      if (rf.dustCd > 0) { rf.dustCd--; continue; }
      for (const p of rf.parts) {
        if (p.y - p.py <= 0.4) continue;   // non sta scendendo
        for (const box of c.world.boxes) {
          if (p.x < box.x || p.x > box.x + box.w) continue;
          if (p.y >= box.y - 1.5 && p.y <= box.y + 1.5) {
            emitDust(c, p.x, box.y, 0.4 + (i % 3) * 0.1);
            rf.dustCd = 6;
            break;
          }
        }
        if (rf.dustCd > 0) break;
      }
    }
    for (let i = c.dust.length - 1; i >= 0; i--) {
      c.dust[i].t += dt;
      if (c.dust[i].t >= c.dust[i].life) c.dust.splice(i, 1);
    }
    if (c.phase === 'settle' && (ragSleepRatio(c.world) > 0.85 || c.t >= dur)) {
      c.done = true;
    }
  }
}

export function collapseFinished(c) { return c.done === true; }

// ---------------------------------------------------------------------------
// UPRIGHT — quante figure sono ancora in piedi (testa sopra il bacino, quasi
// verticale). Espone l'effetto di keep/supported: più consenso → più eretti.
// ---------------------------------------------------------------------------
export function collapseUpright(c) {
  let n = 0;
  for (const rf of c.world.figures) {
    const hip = rf.parts[0], head = rf.parts[2];
    const dx = head.x - hip.x, dy = head.y - hip.y;
    if (dy < 0 && Math.abs(dx) < Math.abs(dy) * 0.6) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// DRAW — fasi statiche: griglia con drawFigure (tinta di profondità, sway).
// crack/collapse/settle: sagome ragdoll vive via drawRagdoll + polvere.
// NIENTE arc: la testa è un disco pixel (disc), mai un cerchio vettoriale.
// ---------------------------------------------------------------------------
export function drawCollapse(ctx, c, time = 0) {
  const { viewW: W, viewH: H } = c;
  ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);
  const cx = W / 2;

  if (c.phase === 'zoomOut' || c.phase === 'revealBodies') {
    const reveal = c.phase === 'revealBodies' ? Math.min(1, c.t / 2.6) : 0;
    const sway = Math.sin(time * 1.7) * 0.6;
    for (const f of c.figs) {
      const shown = reveal > (f.row / 11);
      if (!shown) {
        ctx.fillStyle = C.redDeep;
        ctx.fillRect(Math.round(f.x - 3), Math.round(f.y - 8), 7, 9);
      } else {
        drawFigure(ctx, f.x + sway * (f.row / 11), f.y, {
          h: 13 + f.depth * 2, color: depthRed(f.depth), state: f.state,
          phase: time * 2 + f.phase, facing: f.facing,
        });
      }
    }
  } else {
    // crack / collapse / settle: sagome ragdoll vive
    const shiver = c.phase === 'crack' ? c.shake : 0;
    for (let i = 0; i < c.world.figures.length; i++) {
      const rf = c.world.figures[i];
      const g = c.figs[i];
      const jx = shiver ? Math.sin(time * 53 + i * 1.7) * shiver * 0.4 : 0;
      const jy = shiver ? Math.cos(time * 61 + i * 2.3) * shiver * 0.25 : 0;
      drawRagdoll(ctx, rf, {
        h: 13 + g.depth * 2, color: depthRed(g.depth),
        thickness: g.depth > 0.7 ? 2 : 1,
      });
      if (jx || jy) {   // il brivido non tocca la fisica: solo il disegno
        ctx.save(); ctx.translate(jx, jy);
        drawRagdoll(ctx, rf, { h: 13 + g.depth * 2, color: depthRed(g.depth) });
        ctx.restore();
      }
    }
    // polvere d'impatto: trattini brevi che salgono e svaniscono
    for (const d of c.dust) {
      const k = d.t / d.life;
      ctx.fillStyle = C.redDark;
      const yy = d.y - k * 4;
      ctx.fillRect(Math.round(d.x - 3 - k * 2), Math.round(yy), 2, 1);
      ctx.fillRect(Math.round(d.x + 1 + k * 2), Math.round(yy), 2, 1);
      ctx.fillRect(Math.round(d.x), Math.round(yy - 2), 1, 1);
    }
  }
}