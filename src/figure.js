// ============================================================================
// FIGURE — sistema di animazione scheletrico. Una figura umana è costruita da
// ossa (bacino, spalle, braccia a 2 segmenti, gambe a 2 segmenti, testa).
// Le pose sono angoli; il tempo li anima. Disegno a pixel (Bresenham) con
// spessore, così le membra restano leggibili e "pixel art".
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
// ARRAMPICATORE — figura appesa a due mani (lx,ly) e (rx,ry).
// Il tronco pende al centro, le gambe oscillano.
// ---------------------------------------------------------------------------
export function drawClimber(ctx, lx, ly, rx, ry, opts = {}) {
  const { h = 17, color = C.redBright, phase = 0, thickness = 1, alpha = 1, outline = false } = opts;
  const shHalf = Math.max(2, Math.round(h * 0.16));  // semilarghezza spalle
  const cx = (lx + rx) / 2, cy = (ly + ry) / 2;
  const shY = cy + h * 0.20;
  const hipY = cy + h * 0.62;
  const sway = Math.sin(phase * 2.4) * 0.8;
  const shX = cx;
  const hipX = cx + sway;
  const headX = cx + sway * 0.5;
  const headY = shY - h * 0.14;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const t = outline ? 3 : thickness;

  // braccia a DUE segmenti: spalla → gomito → mano (gomito verso l'esterno/alto)
  const arm = (hx, hy, side) => {
    const shx = shX + side * shHalf;
    const ex = (shx + hx) / 2 + side * 3;
    const ey = (shY + hy) / 2 - 2;
    line(ctx, shx, shY, ex, ey, t);
    line(ctx, ex, ey, hx, hy, t);
  };
  arm(lx, ly, -1);
  arm(rx, ry, 1);

  // tronco
  line(ctx, shX, shY, hipX, hipY, t + (outline ? 1 : 0));
  // collo + testa
  line(ctx, shX, shY, headX, headY + h * 0.04, t);
  disc(ctx, headX, headY, Math.max(1, Math.round(h * 0.085)));
  // gambe penzolanti, ginocchia piegate
  const k = Math.sin(phase * 2.4 + 1) * 1.2;
  for (const side of [-1, 1]) {
    const kx = hipX + side * 2 + k;
    const ky = hipY + h * 0.18;
    line(ctx, hipX, hipY, kx, ky, t);
    line(ctx, kx, ky, kx + side * 1, ky + h * 0.16, t);
  }
  // mani (presa) evidenziate
  ctx.fillRect(Math.round(lx) - 1, Math.round(ly) - 1, 2, 2);
  ctx.fillRect(Math.round(rx) - 1, Math.round(ry) - 1, 2, 2);
  ctx.restore();
}

export function drawFigure(ctx, x, y, opts = {}) {
  const {
    h = 16, color = C.red, state = 'idle', phase = 0, facing = 1,
    thickness = 1, alpha = 1, shadow = false,
  } = opts;
  const P = pose(state, phase);
  const f = facing;
  const hipY = y - h * 0.48 + P.bob;
  const shY = y - h * 0.80 + P.bob;
  const headY = y - h * 0.94 + P.bob;
  const lean = P.lean * f;

  const hipX = x + Math.sin(lean) * h * 0.4;
  const shX = x + Math.sin(lean) * h * 0.7;
  const headX = x + Math.sin(lean) * h * 0.8;

  const upper = h * 0.20, lower = h * 0.19;
  const thigh = h * 0.24, shin = h * 0.24;
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
  // braccia
  for (const ang of [P.aL, P.aR]) {
    let [ex, ey] = tip(shX, shY, ang[0] * f + lean, upper);
    let [hx, hy] = tip(ex, ey, (ang[0] + ang[1]) * f + lean, lower);
    line(ctx, shX, shY, ex, ey, t);
    line(ctx, ex, ey, hx, hy, t);
    // mano (punto acceso per "tendi")
    if (state === 'tendi' || state === 'reach' || state === 'scream') ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, t + 1, t + 1);
  }
  // testa
  disc(ctx, headX, headY, Math.max(1, Math.round(h * 0.09)));
  // collo
  line(ctx, shX, shY, headX, headY + h * 0.06, t);

  ctx.restore();
}
