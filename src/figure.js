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
  const shHalf = Math.max(3, Math.round(h * 0.16));
  // TRONCO: le spalle stanno 0.38h sopra il bacino. Le mani sono ~13px sopra il
  // bacino, quindi le spalle restano ben sotto le mani: le braccia salgono con i
  // gomiti CHIARAMENTE PIEGATI (posa da arrampicata leggibile).
  const shY = hipY - h * 0.38;
  const leanX = Math.sin(clamp(finiteOr(lean, 0), -0.6, 0.6)) * h * 0.14;
  const shX = hipX + leanX;
  const shLx = shX - shHalf, shRx = shX + shHalf;
  const headX = shX + leanX * 0.6, headY = shY - h * 0.14 + h * 0.06;
  const hr = Math.max(1, Math.round(h * 0.09));
  // BRACCIA: ~0.24h per segmento. Le spalle sono ~0.38h sotto le mani → le
  // braccia si PIEGANO di ~90° ai gomiti. Posa da scalata, non tentacoli.
  const up = h * 0.26, lo = h * 0.26;
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

  // GAMBE: proporzionate alle braccia (coscia+stinco 0.27h ciascuno: da umani le
  // gambe sono un filo più lunghe). I piedi stanno SULLA PARETE sotto il bacino,
  // ginocchia piegate verso l'esterno/avanti; una gamba sale (ginocchio alto,
  // piede su una presa più in alto) mentre l'altra spinge (più distesa), e si
  // ALTERNANO col ciclo di salita — così le gambe contribuiscono davvero.
  const thigh = h * 0.27, shin = h * 0.27;
  const cyc = Math.sin(finiteOr(phase, 0) * 2.4);
  for (const side of [-1, 1]) {
    // i piedi premono la parete VICINO al corpo; il ginocchio si piega verso
    // l'esterno. Una gamba sale (ginocchio alto, piede più in alto) e l'altra
    // spinge (più distesa in basso); si alternano col ciclo di salita.
    const step = side * cyc;                       // +1 = in salita, -1 = in spinta
    const footX = hipX + side * h * 0.10;
    // bias di base: la gamba "destra" sta più in alto (piegata in salita), la
    // sinistra più in basso (in spinta). Il ciclo le alterna sopra la bias, così
    // non c'è mai l'istante simmetrico (che leggeva come uno squat).
    const footY = hipY + h * 0.38 - side * h * 0.11 - step * h * 0.13;
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
// FIGURA — disegna il corpo intero a partire dalla posa.
// Opzioni extra: detail (ciuffo/chele/brandelli), stretch (squash&stretch
// -1..1, 0 = neutro), rim (luce di bordo).
// ---------------------------------------------------------------------------
export function drawFigure(ctx, x, y, opts = {}) {
  const {
    h = 16, color = C.red, state = 'idle', phase = 0, facing = 1,
    thickness = 1, alpha = 1, shadow = false,
    detail = false, stretch = 0, rim = false,
  } = opts;
  const P = pose(state, phase);
  const f = facing;
  // squash&stretch: fattore verticale limitato in [-1,1]; 0 = neutro (default)
  const st = clamp(finiteOr(stretch, 0), -1, 1);
  const sy = 1 + st * 0.30;   // 0.7 (schiacciato) … 1.3 (allungato)
  const hipY = y - h * 0.48 * sy + P.bob;
  const shY = y - h * 0.80 * sy + P.bob;
  const headY = y - h * 0.94 * sy + P.bob;
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
