// ============================================================================
// FIGURE — sistema di animazione scheletrico. Una figura umana è costruita da
// ossa (bacino, spalle, braccia a 2 segmenti, gambe a 2 segmenti, testa).
// Le pose sono angoli; il tempo li anima. Disegno a pixel (Bresenham) con
// spessore, così le membra restano leggibili e "pixel art".
//
// Opzioni extra (tutte OFF di default: il look storico non cambia):
//   drawFigure  : detail, stretch (-1..1), rim
//   drawClimber : detail, breathe (0..1), grip (0..1), rim
// ============================================================================
import { C } from './palette.js';

const PI = Math.PI;

// linea a pixel (Bresenham) con spessore `t`. Guardia anti-NaN: un solo input
// non finito bloccherebbe il ciclo (il main thread si congelerebbe).
function line(ctx, x0, y0, x1, y1, t = 1) {
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) return;
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let guard = dx + dy + 4;   // limite di sicurezza: mai più passi del necessario
  for (;;) {
    ctx.fillRect(x0 - ((t - 1) >> 1), y0 - ((t - 1) >> 1), t, t);
    if ((x0 === x1 && y0 === y1) || guard-- <= 0) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}
function disc(ctx, cx, cy, r) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
  cx = Math.round(cx); cy = Math.round(cy);
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r + 1) ctx.fillRect(cx + x, cy + y, 1, 1);
}

// valore finito oppure default: protegge i nuovi parametri opzionali
function finiteOr(v, d) { return Number.isFinite(v) ? v : d; }
// limita un valore nell'intervallo [lo, hi]
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
// chela: 3 pixel (palmo + due dita) — usata solo con detail:true
function claw(ctx, hx, hy, f = 1) {
  if (!Number.isFinite(hx) || !Number.isFinite(hy) || !Number.isFinite(f)) return;
  const px = Math.round(hx), py = Math.round(hy);
  ctx.fillRect(px, py, 1, 1);
  ctx.fillRect(px + f, py + 1, 1, 1);
  ctx.fillRect(px - f, py + 1, 1, 1);
}

// posizione lungo un angolo (0 = giù, +x verso destra): y cresce verso il basso
function tip(x, y, ang, len) { return [x + Math.sin(ang) * len, y + Math.cos(ang) * len]; }

// ---------------------------------------------------------------------------
// POSE — restituisce i parametri articolari per uno stato e una fase.
//   aL,aR : angoli spalla→mano (braccio), a 2 segmenti [upper, lower]
//   lL,lR : angoli anca→piede (gamba)
//   lean  : inclinazione del tronco
//   bob   : oscillazione verticale
// ---------------------------------------------------------------------------
export function pose(state, phase) {
  const s = Math.sin(phase), c = Math.cos(phase), s2 = Math.sin(phase + PI);
  switch (state) {
    case 'walk': {
      const swing = 0.55;
      return {
        lean: 0.06 + 0.03 * s,
        bob: -Math.abs(s) * 1.2,
        aL: [s2 * swing * 0.8, 0.35], aR: [s * swing * 0.8, 0.35],
        lL: [s * swing, 0.12 + 0.5 * Math.max(0, s)], lR: [s2 * swing, 0.12 + 0.5 * Math.max(0, s2)],
      };
    }
    case 'run': {
      const swing = 0.9;
      return {
        lean: 0.22,
        bob: -Math.abs(s) * 1.8,
        aL: [s2 * swing, 0.9], aR: [s * swing, 0.9],
        lL: [s * swing, 0.6 + 0.9 * Math.max(0, s)], lR: [s2 * swing, 0.6 + 0.9 * Math.max(0, s2)],
      };
    }
    case 'climb': {
      return {
        lean: -0.12,
        bob: -0.6 + 0.6 * s,
        aL: [-2.5 + s * 0.35, -0.35], aR: [-2.5 + s2 * 0.35, -0.35],
        lL: [s2 * 0.5, 0.7], lR: [s * 0.5, 0.7],
      };
    }
    case 'jump': {
      return { lean: 0.08, bob: 0, aL: [-2.4, -0.5], aR: [-2.4, -0.5], lL: [-0.5, 1.0], lR: [0.5, 1.0] };
    }
    case 'fall': {
      return { lean: 0.25, bob: 0, aL: [-1.9 + 0.3 * s, -0.4], aR: [-2.1 + 0.3 * s2, -0.4],
        lL: [-0.6, 0.5], lR: [0.7, 0.4] };
    }
    case 'push': {
      return { lean: 0.3, bob: 0, aL: [1.4, -0.5], aR: [1.4, -0.5], lL: [-0.25, 0.15], lR: [0.3, 0.15] };
    }
    case 'reach': {
      return { lean: -0.05, bob: -0.5, aL: [-2.7, -0.2], aR: [0.4, 0.5], lL: [-0.15, 0.1], lR: [0.2, 0.1] };
    }
    case 'tendi': {
      return { lean: -0.1, bob: -0.5, aL: [-2.6, -0.3], aR: [-2.2, -0.3], lL: [-0.2, 0.15], lR: [0.25, 0.15] };
    }
    case 'spingi': {
      return { lean: 0.35, bob: 0, aL: [1.7, -0.6], aR: [1.7, -0.6], lL: [-0.35, 0.2], lR: [0.4, 0.2] };
    }
    case 'scream': {
      return { lean: -0.15, bob: 0, aL: [-2.9, -0.1], aR: [-2.9, -0.1], lL: [-0.2, 0.1], lR: [0.2, 0.1] };
    }
    default: { // idle
      return {
        lean: 0.03, bob: -0.4 + 0.4 * s,
        aL: [0.12 + 0.05 * s, 0.2], aR: [-0.12 + 0.05 * s2, 0.2],
        lL: [0.06, 0.08], lR: [-0.06, 0.08],
      };
    }
  }
}

// ---------------------------------------------------------------------------
// POSE INTERP — fonde due pose (stateA,phaseA) e (stateB,phaseB) con peso k.
// k=0 → A esatta, k=1 → B esatta (ritorno diretto: nessun drift in virgola
// mobile), k∈(0,1) → interpolazione lineare di ogni giunto. k non finito o
// fuori [0,1] viene limitato: mai NaN in uscita. Stessa forma di pose().
// ---------------------------------------------------------------------------
export function poseInterp(stateA, phaseA, stateB, phaseB, k) {
  const A = pose(stateA, phaseA);
  const B = pose(stateB, phaseB);
  const kk = clamp(finiteOr(k, 0), 0, 1);
  if (kk === 0) return A;
  if (kk === 1) return B;
  const mix = (a, b) => a + (b - a) * kk;
  const mixPair = (a, b) => [mix(a[0], b[0]), mix(a[1], b[1])];
  return {
    lean: mix(A.lean, B.lean),
    bob: mix(A.bob, B.bob),
    aL: mixPair(A.aL, B.aL),
    aR: mixPair(A.aR, B.aR),
    lL: mixPair(A.lL, B.lL),
    lR: mixPair(A.lR, B.lR),
  };
}

// ---------------------------------------------------------------------------
// POSTURE SPRING — forza dell'"active ragdoll": 1 a t=0, decade linearmente a 0
// per t>=decay. Usata per far IRRIGIDIRE le membra di una figura appena
// lanciata (brace) invece di farla crollare subito floscia. Sempre finita:
// t o decay degeneri ricadono su valori sicuri.
// ---------------------------------------------------------------------------
export function postureSpring(t, decay = 0.4) {
  const d = (Number.isFinite(decay) && decay > 0) ? decay : 0.4;
  const tt = finiteOr(t, 0);
  if (tt <= 0) return 1;
  if (tt >= d) return 0;
  return 1 - tt / d;
}

// ---------------------------------------------------------------------------
// W3-ANIM — GESTURE PHASE — curva a 4 tempi per i gesti (Z=tendi / X=spingi):
//   anticipazione (carica, moto opposto) → strike (veloce) → tenuta all'impatto
//   (~150-200ms) → recover. Tutti gli output sono limitati in [0,1] e finiti.
//   opts: { hold = 0.18 (s), strikeAt = 0.45, rise = 0.15 } (frazioni di dur).
//   `actK` = intensità complessiva: picco allo strike, tenuta durante l'impatto.
// ---------------------------------------------------------------------------
export function gesturePhase(t, dur, opts = {}) {
  const d = (Number.isFinite(dur) && dur > 0) ? dur : 1;
  const u = clamp(finiteOr(t, 0) / d, 0, 1);
  const strikeAt = clamp(finiteOr(opts.strikeAt, 0.45), 0.05, 0.95);
  const rise = clamp(finiteOr(opts.rise, 0.15), 0.01, strikeAt);
  const holdN = clamp(finiteOr(opts.hold, 0.18) / d, 0, 1 - strikeAt);
  const holdEnd = strikeAt + holdN;
  const recoverN = Math.max(1e-6, 1 - holdEnd);

  // anticipazione: campana sul wind-up, si spegne allo strike
  const anticipation = u < strikeAt ? Math.sin(PI * (u / strikeAt)) : 0;
  // strike: sale rapido verso l'impatto, resta 1 durante la tenuta, poi cala
  let strike;
  if (u < strikeAt) strike = clamp((u - (strikeAt - rise)) / rise, 0, 1);
  else if (u <= holdEnd) strike = 1;
  else strike = 1 - clamp((u - holdEnd) / recoverN, 0, 1);
  // recover: parte solo dopo la tenuta
  const recover = u <= holdEnd ? 0 : clamp((u - holdEnd) / recoverN, 0, 1);
  // actK: intensità complessiva, picco allo strike e tenuta durante l'impatto
  let actK;
  if (u < strikeAt) actK = clamp(u / strikeAt, 0, 1);
  else if (u <= holdEnd) actK = 1;
  else actK = 1 - recover;

  return { phase: u, anticipation, strike, recover, actK };
}

// distanza fra due pose (somma delle differenze assolute dei giunti), finita
function poseDist(A, B) {
  if (!A || !B) return 0;
  const num = (v) => (Number.isFinite(v) ? v : 0);
  let d = Math.abs(num(A.lean) - num(B.lean)) + Math.abs(num(A.bob) - num(B.bob));
  for (const k of ['aL', 'aR', 'lL', 'lR']) {
    const a = A[k], b = B[k];
    if (Array.isArray(a) && Array.isArray(b)) {
      d += Math.abs(num(a[0]) - num(b[0])) + Math.abs(num(a[1]) - num(b[1]));
    }
  }
  return d;
}

// ---------------------------------------------------------------------------
// W3-ANIM — SMEAR — quanto "strisciare" fra due pose al blend k. 0 agli estremi
// (k=0, k=1), massimo a metà transizione (bump 4k(1-k)) scalato dalla distanza
// fra le pose. Ritorna uno scalare in [0,1], sempre finito e deterministico.
// ---------------------------------------------------------------------------
export function smearAmount(prevPose, nextPose, k) {
  const kk = clamp(finiteOr(k, 0), 0, 1);
  const bump = 4 * kk * (1 - kk);          // 0 agli estremi, 1 al centro
  const d = poseDist(prevPose, nextPose);
  const sat = d / (d + 3);                // saturazione 0..1
  return clamp(bump * sat, 0, 1);
}

// ---------------------------------------------------------------------------
// W3-ANIM — SQUASH & STRETCH — fattore verticale per atterraggi/impatto.
// 1 a velocità 0, limitato in [0.8, 1.2] (tanh: mai oltre, mai NaN).
// ---------------------------------------------------------------------------
export function squashStretch(vel) {
  const v = finiteOr(vel, 0);
  return clamp(1 + 0.2 * Math.tanh(v), 0.8, 1.2);
}

// ---------------------------------------------------------------------------
// IK A 2 SEGMENTI — dato l'attacco (sx,sy) e il bersaglio (tx,ty) con lunghezze
// FISSE l1,l2, restituisce gomito e mano. La mano non supera MAI la portata:
// così le braccia si PIEGANO invece di allungarsi come tentacoli.
// `bend` (+1/-1) sceglie da che lato piega il gomito/ginocchio.
// ---------------------------------------------------------------------------
export function ik2(sx, sy, tx, ty, l1, l2, bend) {
  sx = finiteOr(sx, 0); sy = finiteOr(sy, 0);
  tx = finiteOr(tx, sx); ty = finiteOr(ty, sy);
  l1 = finiteOr(l1, 10); l2 = finiteOr(l2, 10);
  bend = finiteOr(bend, 1) < 0 ? -1 : 1;
  const dx = tx - sx, dy = ty - sy;
  let d = Math.hypot(dx, dy);
  if (!Number.isFinite(d) || d < 0.001) d = 0.001;
  const maxD = l1 + l2 - 0.02;
  const minD = Math.abs(l1 - l2) + 0.02;
  const dc = Math.max(minD, Math.min(maxD, d));
  const ux = dx / d, uy = dy / d;
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ex = sx + ux * a - uy * hgt * bend;
  const ey = sy + uy * a + ux * hgt * bend;
  const hx = sx + ux * dc, hy = sy + uy * dc;
  return { ex, ey, hx, hy };
}

// ---------------------------------------------------------------------------
// ARRAMPICATORE — figura APPESA a due mani (lx,ly) e (rx,ry), con il bacino
// (bx,by) che pende sotto. Braccia e gambe usano IK: si piegano, non si
// allungano. La posa cambia con `phase` per dare il ciclo di arrampicata.
// Opzioni: detail, breathe (0..1 respiro), grip (0..1 tensione presa), rim.
// ---------------------------------------------------------------------------
export function drawClimber(ctx, lx, ly, rx, ry, opts = {}) {
  const {
    h = 18, color = C.redBright, phase = 0, thickness = 1, alpha = 1,
    detail = false, breathe = 0, grip = 1, rim = false,
    bx = null, by = null, lean = 0,
  } = opts;
  const br = clamp(finiteOr(breathe, 0), 0, 1);
  const breatheOff = br > 0 ? Math.sin(phase * 2.4) * br : 0;
  const handMidX = (lx + rx) / 2, handMidY = (ly + ry) / 2;
  const swing = clamp(finiteOr(opts.swing, 0), -1, 1) * 3.2;
  const hipX = finiteOr(bx, handMidX) + swing;
  const hipY = finiteOr(by, handMidY + h * 0.55) + breatheOff;
  const shHalf = Math.max(2, Math.round(h * 0.14));
  // TORSO: spalle 0.20h sopra il bacino (foto reali: bacino 0.50h, spalle 0.70h
  // sull'altezza totale). Testa a ~0.13h sopra le spalle.
  const shY = hipY - h * 0.20;
  const leanX = Math.sin(clamp(finiteOr(lean, 0), -0.6, 0.6)) * h * 0.10;
  const shX = hipX + leanX;
  const shLx = shX - shHalf, shRx = shX + shHalf;
  const headX = shX + leanX * 0.6, headY = shY - h * 0.13;
  const hr = Math.max(1, Math.round(h * 0.07));
  // BRACCIA: ~0.16h per segmento (0.32h totali). Il bacino pende ~0.45h sotto le
  // mani (HANG in climb.js), quindi le braccia arrivano QUASI DISTESE in alto:
  // è la posa "X" reale ("straight arms are happy arms"), col gomito comunque
  // visibile. NIENTE gomiti a 90° sparati di lato.
  const up = h * 0.17, lo = h * 0.17;
  // leggera alternanza delle anche (dondolio) per il ritmo di salita
  const sway = Math.sin(finiteOr(phase, 0) * 2.4) * 0.9;
  // presa: 0 = gomiti molto piegati, 1 = distesi. `grip` la modula.
  void grip;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const t = thickness;
  const t0 = thickness;

  // BRACCIA: IK spalla→mano, gomiti verso l'esterno (mai dritte a caso)
  const aL = ik2(shLx, shY, lx, ly, up, lo, -1);
  const aR = ik2(shRx, shY, rx, ry, up, lo, 1);
  line(ctx, shLx, shY, aL.ex, aL.ey, t0);
  line(ctx, aL.ex, aL.ey, aL.hx, aL.hy, t0);
  line(ctx, shRx, shY, aR.ex, aR.ey, t0);
  line(ctx, aR.ex, aR.ey, aR.hx, aR.hy, t0);
  // mani sulle prese
  if (detail) { claw(ctx, aL.hx, aL.hy, -1); claw(ctx, aR.hx, aR.hy, 1); }
  else {
    ctx.fillRect(Math.round(aL.hx) - 1, Math.round(aL.hy) - 1, 2, 2);
    ctx.fillRect(Math.round(aR.hx) - 1, Math.round(aR.hy) - 1, 2, 2);
  }

  // TRONCO dal bacino alle spalle (leggermente ricurvo verso la parete)
  line(ctx, hipX + sway * 0.2, hipY, shX, shY, t + 1);
  // COLLO + TESTA
  line(ctx, shX, shY, headX, headY + h * 0.05, t);
  disc(ctx, headX, headY, hr);

  // GAMBE: coscia e stinco ~0.24h ciascuno (gambe ~1.5× le braccia, come da
  // anatomia). I piedi stanno SULLA PARETE sotto il bacino. Una gamba SPINGE
  // (quasi distesa in basso) e l'altra SALE (ginocchio piegato in alto, piede più
  // su) — pattern contro-laterale: si alterna col ciclo. Il ginocchio piega verso
  // l'esterno/avanti, mai simmetrico "a rana".
  const thigh = h * 0.24, shin = h * 0.24;
  const cyc = Math.sin(finiteOr(phase, 0) * 2.4);
  for (const side of [-1, 1]) {
    const step = side * cyc;                        // +1 = in salita, -1 = in spinta
    const footX = hipX + side * h * 0.12;
    // base: il piede destro più alto (in salita), il sinistro più basso (spinge);
    // il ciclo li alterna sopra la base → mai l'istante simmetrico.
    const footY = hipY + h * 0.42 - side * h * 0.07 - step * h * 0.15;
    const lg = ik2(hipX, hipY, footX, footY, thigh, shin, -side);
    line(ctx, hipX, hipY, lg.ex, lg.ey, t);
    line(ctx, lg.ex, lg.ey, lg.hx, lg.hy, t);
    // piede: tacca piantata sulla parete (la punta preme la roccia)
    ctx.fillRect(Math.round(lg.hx) - 1, Math.round(lg.hy), 3, 1);
  }

  if (detail) {
    // ciuffo di capelli
    ctx.fillRect(Math.round(headX) - 1, Math.round(headY) - hr - 1, 2, 1);
    ctx.fillRect(Math.round(headX) + 1, Math.round(headY) - hr - 2, 1, 1);
    // brandello di stoffa sul tronco
    const mx = hipX + (shX - hipX) * 0.5, my = hipY + (shY - hipY) * 0.5;
    line(ctx, mx - 2, my, mx - 1, my, 1);
  }
  if (rim) {
    ctx.fillStyle = C.redHot;
    line(ctx, hipX + 1, hipY, shX + 1, shY, 1);
    ctx.fillStyle = C.white;
    ctx.fillRect(Math.round(headX) + hr, Math.round(headY), 1, 1);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// RAGDOLL — disegna una figura del motore ragdoll (ragdoll.js) come sagoma
// umana leggibile: le 5 particelle (bacino, spalle, testa, 2 piedi) diventano
// testa + tronco + 2 gambe; le braccia sono un gesto deterministico legato
// alla moto (pendolano se la figura vola, si abbandonano se dorme).
// Solo fillRect/line pixel: niente arc, coordinate intere, spessore 1-2.
// ---------------------------------------------------------------------------
export function drawRagdoll(ctx, fig, opts = {}) {
  const {
    h = 14, color = C.red, thickness = 1, alpha = 1,
    dust = null,   // opzionale: {x,y} punto d'impatto per un lampo di polvere
    posture = 0,   // S-ANAT: età (s) della figura → molla di postura "active ragdoll"
  } = opts;
  const parts = fig && fig.parts;
  if (!parts || parts.length < 5) return;
  const [hip, sh, head, footL, footR] = parts;
  if (!Number.isFinite(hip.x) || !Number.isFinite(head.y)) return;
  const t = Math.max(1, Math.min(2, thickness));
  // forza del brace: 0 = disattivato (default storico), >0 = irrigidisce le membra
  const brace = posture > 0 ? postureSpring(posture) : 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;

  // gambe: bacino → piedi (una linea ciascuna, spessore pieno).
  // Con brace>0 i piedi vengono RACCOLTI sotto il bacino (posa di appoggio),
  // invece di restare divaricati: la figura "si prepara" prima di cedere.
  let fLx = footL.x, fLy = footL.y, fRx = footR.x, fRy = footR.y;
  if (brace > 0) {
    fLx = footL.x + (hip.x + (footL.x - hip.x) * 0.55 - footL.x) * brace;
    fLy = footL.y + (hip.y + (footL.y - hip.y) * 0.75 - footL.y) * brace;
    fRx = footR.x + (hip.x + (footR.x - hip.x) * 0.55 - footR.x) * brace;
    fRy = footR.y + (hip.y + (footR.y - hip.y) * 0.75 - footR.y) * brace;
  }
  line(ctx, hip.x, hip.y, fLx, fLy, t);
  line(ctx, hip.x, hip.y, fRx, fRy, t);
  // piedi: tacca di 2px sotto ogni caviglia
  ctx.fillRect(Math.round(fLx) - 1, Math.round(fLy), 2, 1);
  ctx.fillRect(Math.round(fRx) - 1, Math.round(fRy), 2, 1);

  // tronco bacino → spalle (spessore +1: il corpo)
  line(ctx, hip.x, hip.y, sh.x, sh.y, t + 1);
  // collo + testa (disco pixel, mai arc)
  const hr = Math.max(1, Math.round(h * 0.09));
  disc(ctx, head.x, head.y, hr);

  // braccia: se la figura ha le 4 particelle braccio (>= 9), disegno i segmenti
  // REALI spalla→gomito→mano; altrimenti fallback storico (gesto legato alla moto).
  if (parts.length >= 9) {
    const elL = parts[5], haL = parts[6], elR = parts[7], haR = parts[8];
    for (const [el, ha] of [[elL, haL], [elR, haR]]) {
      line(ctx, sh.x, sh.y, el.x, el.y, t);
      line(ctx, el.x, el.y, ha.x, ha.y, t);
      // mano: tacca di 1px (pixel art, niente arc)
      ctx.fillRect(Math.round(ha.x) - 1, Math.round(ha.y) - 1, 1, 1);
    }
  } else {
    // braccia: dal punto spalle, due segmenti che pendono secondo la moto.
    // Direzione = perpendicolare al torso, oscillante con la velocità del
    // bacino: in volo sventolano in alto, a riposo pendono giù.
    const vx = hip.x - hip.px, vy = hip.y - hip.py;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const swing = Math.min(1, speed / 2.5);          // 0 = fermo, 1 = volo
    const tx = sh.x - hip.x, ty = sh.y - hip.y;
    const tl = Math.sqrt(tx * tx + ty * ty) || 1;
    const ux = tx / tl, uy = ty / tl;                // asse torso (hip→sh)
    const armLen = h * 0.30;
    // angolo base: braccia lungo il torso verso il basso, aperte da `swing`
    const baseA = Math.atan2(uy, ux) + PI / 2;       // "giù" rispetto al torso
    for (const side of [-1, 1]) {
      const wob = Math.sin((hip.x + hip.y) * 1.7 + side) * 0.35 * (1 - swing);
      const a = baseA + side * (0.5 + swing * 1.1) + wob;
      let hx = sh.x + Math.cos(a) * armLen;
      let hy = sh.y + Math.sin(a) * armLen;
      if (brace > 0) {
        // brace: braccia raccolte verso l'alto/avanti (guardia), meno aperte
        const ba = baseA + side * 0.4 - 1.0;
        const bl = armLen * 0.85;
        const bhx = sh.x + Math.cos(ba) * bl;
        const bhy = sh.y + Math.sin(ba) * bl;
        hx += (bhx - hx) * brace;
        hy += (bhy - hy) * brace;
      }
      line(ctx, sh.x, sh.y, hx, hy, t);
      ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 1, 1);
    }
  }

  // lampo d'impatto: 1 frame di polvere al punto passato (deterministico)
  if (dust && Number.isFinite(dust.x) && Number.isFinite(dust.y)) {
    ctx.fillStyle = C.redHot;
    ctx.fillRect(Math.round(dust.x) - 2, Math.round(dust.y) - 1, 5, 1);
    ctx.fillRect(Math.round(dust.x) - 1, Math.round(dust.y) - 2, 3, 3);
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// FIGURA — disegna il corpo intero a partire dalla posa.
// Opzioni extra: detail (ciuffo/chele/brandelli), stretch (squash&stretch
// -1..1, 0 = neutro), rim (luce di bordo).
// ---------------------------------------------------------------------------
export function drawFigure(ctx, x, y, opts = {}) {
  const {
    h = 16, color = C.red, state = 'idle', phase = 0, facing = 1,
    thickness = 1, alpha = 1, shadow = false,
    detail = false, stretch = 0, rim = false,
    breathe = 0,   // S-ANAT: 0..1 respiro sottile (testa/petto), 0 = storico
    impact = undefined,   // W3-ANIM: secondi dall'impatto (>=0) → squash; default OFF
  } = opts;
  const P = pose(state, phase);
  const f = facing;
  // squash&stretch: fattore verticale limitato in [-1,1]; 0 = neutro (default)
  const st = clamp(finiteOr(stretch, 0), -1, 1);
  let sy = 1 + st * 0.30;   // 0.7 (schiacciato) … 1.3 (allungato)
  // W3-ANIM: impatto — solo se `impact` è un numero finito >= 0 (default OFF).
  // Squash che decade in ~0.2s: la figura "si siede" per un attimo sull'urto.
  if (Number.isFinite(impact) && impact >= 0) {
    const ik = 1 - clamp(impact / 0.2, 0, 1);   // 1 subito dopo l'urto → 0 a 0.2s
    sy *= squashStretch(-ik * 3);              // tanh(-3) ≈ -0.995 → ~0.8 schiacciato
  }
  // respiro: offset verticale sottile su petto/testa, sfasato dal bob della posa
  const br = clamp(finiteOr(breathe, 0), 0, 1);
  const breatheOff = br > 0 ? Math.sin(phase * 2.4) * br * 0.6 : 0;
  const hipY = y - h * 0.48 * sy + P.bob;
  const shY = y - h * 0.80 * sy + P.bob + breatheOff;
  const headY = y - h * 0.94 * sy + P.bob + breatheOff * 1.4;
  const lean = P.lean * f;

  const hipX = x + Math.sin(lean) * h * 0.4;
  const shX = x + Math.sin(lean) * h * 0.7;
  const headX = x + Math.sin(lean) * h * 0.8;

  const upper = h * 0.20 * sy, lower = h * 0.19 * sy;
  const thigh = h * 0.24 * sy, shin = h * 0.24 * sy;
  const t = thickness;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (shadow) { // ombra a terra
    ctx.fillStyle = C.black;
    ctx.globalAlpha = 0.35 * alpha;
    ctx.fillRect(Math.round(x - 4), Math.round(y - 1), 8, 1);
    ctx.globalAlpha = alpha;
  }

  ctx.fillStyle = color;
  // gambe
  for (const [ang, seg] of [[P.lL, 'L'], [P.lR, 'R']]) {
    let [kx, ky] = tip(hipX, hipY, ang[0] * f + lean, thigh);
    let [fx, fy] = tip(kx, ky, (ang[0] + ang[1]) * f + lean, shin);
    line(ctx, hipX, hipY, kx, ky, t);
    line(ctx, kx, ky, fx, fy, t);
  }
  // tronco
  line(ctx, hipX, hipY, shX, shY, t + 1);
  // brandelli di stoffa sul tronco (solo con detail)
  if (detail) {
    const mx = hipX + (shX - hipX) * 0.45, my = hipY + (shY - hipY) * 0.45;
    line(ctx, mx - 2, my, mx - 1, my, 1);
    line(ctx, mx + 1, my + 2, mx + 2, my + 2, 1);
  }
  // braccia
  for (const ang of [P.aL, P.aR]) {
    let [ex, ey] = tip(shX, shY, ang[0] * f + lean, upper);
    let [hx, hy] = tip(ex, ey, (ang[0] + ang[1]) * f + lean, lower);
    line(ctx, shX, shY, ex, ey, t);
    line(ctx, ex, ey, hx, hy, t);
    if (detail) {
      // mano: piccola chela a 3 pixel
      claw(ctx, hx, hy, f);
    } else if (state === 'tendi' || state === 'reach' || state === 'scream') {
      // mano (punto acceso per "tendi")
      ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, t + 1, t + 1);
    }
  }
  // testa
  const hr = Math.max(1, Math.round(h * 0.09));
  disc(ctx, headX, headY, hr);
  // collo
  line(ctx, shX, shY, headX, headY + h * 0.06, t);
  // ciuffo di capelli (solo con detail)
  if (detail) {
    ctx.fillRect(Math.round(headX) - 1, Math.round(headY) - hr - 1, 2, 1);
    ctx.fillRect(Math.round(headX) + f, Math.round(headY) - hr - 2, 1, 1);
  }
  // luce di bordo: 1px sul lato frontale, bianco solo per un pixel (testa)
  if (rim) {
    ctx.fillStyle = C.redHot;
    line(ctx, hipX + f, hipY, shX + f, shY, 1);
    ctx.fillStyle = C.white;
    ctx.fillRect(Math.round(headX + f * hr), Math.round(headY), 1, 1);
  }

  ctx.restore();
}
