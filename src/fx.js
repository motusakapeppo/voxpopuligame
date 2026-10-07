// ============================================================================
// FX — particelle ed effetti cinematografici di VOX POPULI.
// Deterministico (LCG seminato, mai Math.random), pooled (cap fisso: le
// particelle più vecchie vengono riciclate) e puro: emit/step non toccano
// mai il canvas. Solo nero + rampa di rosso, come la copertina.
// ============================================================================
import { C, depthRed } from './palette.js';

// Cap assoluto di particelle vive. Oltre questo limite si riciclano le più vecchie.
export const FX_CAP = 420;

// Limiti di sicurezza: il mondo logico è 320×180 ma la camera scorre in verticale.
const X_MIN = -512, X_MAX = 832;
const CULL = 512;   // margine oltre il bordo prima di uccidere una particella
const MAX_DT = 1;   // un dt più grande è un freeze, non un salto fisico

// ---------------------------------------------------------------------------
// UTILITÀ
// ---------------------------------------------------------------------------
export function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function num(v, d) { return Number.isFinite(v) ? v : d; }

// LCG deterministico: stesso seed → stessa sequenza su ogni macchina.
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// COMPORTAMENTI — un profilo per tipo. Tutte le velocità sono in px/s.
// ---------------------------------------------------------------------------
const TYPES = {
  // brace: sale lenta, ondeggia, tremola tra i rossi
  ember: { count: 6, life: [1.2, 2.6], size: 1, color: C.red, alpha: 0.9,
           vx: [-6, 6], vy: [-22, -8], grav: -4, drag: 0.5, sway: 8, swayFreq: 3, flicker: true },
  // scintilla: rapida e breve, gravità positiva, rosso acceso
  spark: { count: 8, life: [0.2, 0.5], size: 1, color: C.redHot, alpha: 1,
           vx: [-40, 40], vy: [-70, -20], grav: 160, drag: 1.2, sway: 0, swayFreq: 2, flicker: false },
  // polvere: quasi ferma, alpha basso
  dust: { count: 4, life: [2, 4.5], size: 1, color: C.redDark, alpha: 0.28,
          vx: [-3, 3], vy: [-2, 2], grav: 0, drag: 0.2, sway: 2, swayFreq: 1.2, flicker: false },
  // sangue: schizza e ricade
  blood: { count: 6, life: [0.4, 0.9], size: 1, color: C.red, alpha: 1,
           vx: [-30, 30], vy: [-50, -10], grav: 220, drag: 0.4, sway: 0, swayFreq: 2, flicker: false },
  // cenere: cade piano, deriva, svanisce
  ash: { count: 5, life: [2, 4], size: 1, color: C.redDeep, alpha: 0.6,
         vx: [-6, 6], vy: [4, 14], grav: 2, drag: 0.3, sway: 5, swayFreq: 1.6, flicker: false },
  // onda d'urto: anello che si espande, vita breve
  shock: { count: 1, life: [0.25, 0.45], size: 1, color: C.redHot, alpha: 0.9,
           vx: [0, 0], vy: [0, 0], grav: 0, drag: 0, sway: 0, swayFreq: 2, flicker: false,
           grow: [30, 90], r0: 2 },
  // goccia: cade sottile
  drop: { count: 3, life: [0.5, 1.1], size: 1, color: C.redMid, alpha: 0.9,
          vx: [-4, 4], vy: [40, 90], grav: 90, drag: 0, sway: 0, swayFreq: 2, flicker: false },
  // fumo: sale, si allarga, alpha basso
  smoke: { count: 4, life: [1.2, 2.6], size: 1, color: C.redDeep, alpha: 0.22,
           vx: [-5, 5], vy: [-14, -5], grav: -2, drag: 0.5, sway: 4, swayFreq: 1.1, flicker: false,
           grow: [0.5, 1.5] },
  // fulmine: polilinea verticale frastagliata, 2–4 frame di vita
  bolt: { count: 1, life: [0.05, 0.12], size: 1, color: C.redHot, alpha: 1,
          vx: [0, 0], vy: [0, 0], grav: 0, drag: 0, sway: 0, swayFreq: 2, flicker: false,
          len: [30, 90] },
};

// ---------------------------------------------------------------------------
// STATO — pool di oggetti riusabili, mai array che crescono senza limite.
// ---------------------------------------------------------------------------
export function createFx(seed = 1) {
  const fx = {
    parts: [],      // particelle vive
    pool: [],       // particelle morte pronte al riuso
    seed: seed >>> 0,
    rng: null,
    emitters: [],   // emettitori registrati (addEmitter)
    _ambT: 0,       // accumulatore dell'ambiente
  };
  fx.rng = lcg(fx.seed);
  return fx;
}

function newPart() {
  return {
    type: 'dust', dead: true, age: 0, life: 0, maxLife: 1,
    x: 0, y: 0, vx: 0, vy: 0, grav: 0, drag: 0,
    sway: 0, swayFreq: 2, phase: 0, seed: 0,
    size: 1, size0: 1, grow: 0, r0: 0,
    color: C.redDark, alpha: 1, flicker: false,
    pts: [],        // solo per i fulmini: offset della polilinea
  };
}

// Prende un oggetto dal pool; se il cap è pieno ricicla la particella più vecchia.
function takePart(fx) {
  if (fx.parts.length >= FX_CAP) return fx.parts.shift();
  if (fx.pool.length) return fx.pool.pop();
  return newPart();
}

function initPart(p, type, def, x, y, opts, spread, rng) {
  const r = (a, b) => a + rng() * (b - a);
  p.type = type;
  p.dead = false;
  p.age = 0;
  p.x = x + (rng() * 2 - 1) * 2 * spread;
  p.y = y + (rng() * 2 - 1) * 2 * spread;
  p.vx = num(opts.vx, 0) + r(def.vx[0], def.vx[1]) * spread;
  p.vy = num(opts.vy, 0) + r(def.vy[0], def.vy[1]) * spread;
  p.maxLife = Math.max(0.02, num(opts.life, r(def.life[0], def.life[1])));
  p.life = p.maxLife;
  p.size0 = Math.max(1, Math.min(2, Math.round(num(opts.size, def.size))));
  p.size = p.size0;
  p.color = typeof opts.color === 'string' ? opts.color : def.color;
  p.alpha = clamp01(num(opts.alpha, def.alpha));
  p.grav = num(def.grav, 0);
  p.drag = num(def.drag, 0);
  p.sway = num(def.sway, 0);
  p.swayFreq = num(def.swayFreq, 2);
  p.phase = rng() * Math.PI * 2;
  p.seed = rng();
  p.flicker = !!def.flicker && typeof opts.color !== 'string';
  p.grow = def.grow ? r(def.grow[0], def.grow[1]) : 0;
  p.r0 = num(def.r0, 0);
  if (type === 'bolt') {
    const segs = 5 + Math.floor(rng() * 4);          // 5..8 segmenti
    const len = num(opts.len, r(def.len[0], def.len[1]));
    p.pts.length = 0;
    for (let i = 0; i <= segs; i++) {
      p.pts.push({ dx: (rng() * 2 - 1) * 4, dy: (i / segs) * len });
    }
  }
}

// ---------------------------------------------------------------------------
// EMIT — genera un grappolo di particelle. Non disegna nulla.
// opts: { count, vx, vy, life, color, size, spread, alpha, len }
// ---------------------------------------------------------------------------
export function emitFx(fx, type, x, y, opts = {}) {
  if (!fx || !Array.isArray(fx.parts)) return 0;
  if (typeof fx.rng !== 'function') fx.rng = lcg(num(fx.seed, 1));
  const def = TYPES[type] || TYPES.dust;
  const n = Math.max(0, Math.min(FX_CAP, Math.floor(num(opts.count, def.count))));
  const spread = Math.max(0, num(opts.spread, 1));
  const bx = num(x, 0), by = num(y, 0);
  for (let i = 0; i < n; i++) {
    const p = takePart(fx);
    initPart(p, type, def, bx, by, opts, spread, fx.rng);
    fx.parts.push(p);
  }
  return n;
}

// Registra un emettitore continuo: { type, x, y, rate, opts }.
export function addEmitter(fx, type, x, y, opts = {}) {
  if (!fx || !Array.isArray(fx.emitters)) return null;
  const em = { type, x: num(x, 0), y: num(y, 0), rate: Math.max(0, num(opts.rate, 2)), t: 0, opts };
  fx.emitters.push(em);
  return em;
}

// ---------------------------------------------------------------------------
// STEP — fisica per particella. Nessun disegno, nessun Math.random.
// ---------------------------------------------------------------------------
function stepPart(p, dt, camY, H) {
  p.age += dt;
  p.life -= dt;
  if (p.life <= 0) { p.dead = true; return; }

  if (p.type !== 'bolt') {                 // il fulmine è un lampo statico
    p.vy += p.grav * dt;
    const d = Math.max(0, 1 - p.drag * dt);
    p.vx *= d; p.vy *= d;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.sway > 0) p.x += Math.sin(p.age * p.swayFreq + p.phase) * p.sway * dt;
    if (p.grow > 0) p.size = p.size0 + (1 - clamp01(p.life / p.maxLife)) * p.grow;
  }

  // sicurezza: nessun campo può diventare NaN/Infinity
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) ||
      !Number.isFinite(p.vx) || !Number.isFinite(p.vy)) { p.dead = true; return; }

  // limiti di mondo + culling fuori camera
  p.x = p.x < X_MIN ? X_MIN : p.x > X_MAX ? X_MAX : p.x;
  const yMin = camY - CULL * 2, yMax = camY + H + CULL * 2;
  p.y = p.y < yMin ? yMin : p.y > yMax ? yMax : p.y;
  const sy = p.y - camY;
  if (sy < -CULL || sy > H + CULL) p.dead = true;
}

// Avanza tutto. opts: { H, ambient: { types, rate, xRange, y, opts } }.
export function stepFx(fx, dt, camY, opts = {}) {
  if (!fx || !Array.isArray(fx.parts)) return;
  dt = Number.isFinite(dt) ? Math.max(0, Math.min(MAX_DT, dt)) : 0;
  camY = Number.isFinite(camY) ? camY : 0;
  const H = num(opts.H, 180);
  if (typeof fx.rng !== 'function') fx.rng = lcg(num(fx.seed, 1));

  // emettitori registrati
  if (Array.isArray(fx.emitters)) {
    for (const em of fx.emitters) {
      if (!em || !em.type) continue;
      em.t = num(em.t, 0) + Math.max(0, num(em.rate, 0)) * dt;
      let guard = 0;
      while (em.t >= 1 && guard < 16) { em.t -= 1; guard++; emitFx(fx, em.type, em.x, em.y, em.opts || {}); }
      if (em.t > 4) em.t = 4;
    }
  }

  // ambiente: spawn continuo dal bordo (es. braci che salgono dal fondo)
  const amb = opts.ambient;
  if (amb) {
    const types = Array.isArray(amb.types) ? amb.types
      : (typeof amb.types === 'string' ? [amb.types] : []);
    const rate = Math.max(0, num(amb.rate, 0));
    if (types.length && rate > 0) {
      fx._ambT = num(fx._ambT, 0) + rate * dt;
      let guard = 0;
      while (fx._ambT >= 1 && guard < 32) {
        fx._ambT -= 1; guard++;
        const t = types[Math.floor(fx.rng() * types.length) % types.length];
        const xr = Array.isArray(amb.xRange) ? amb.xRange : [0, 320];
        const x0 = num(xr[0], 0), x1 = num(xr[1], 320);
        const ax = x0 + fx.rng() * (x1 - x0);
        const ay = num(amb.y, H);
        // l'ambiente spawma UNA particella per unità di rate (non un grappolo)
        emitFx(fx, t, ax, ay, { count: 1, ...(amb.opts || {}) });
      }
      if (fx._ambT > 4) fx._ambT = 4;   // niente debito infinito
    }
  }

  // avanza e compatta in place: l'array non cresce mai
  let w = 0;
  for (let i = 0; i < fx.parts.length; i++) {
    const p = fx.parts[i];
    stepPart(p, dt, camY, H);
    if (p.dead) { if (fx.pool.length < FX_CAP) fx.pool.push(p); }
    else fx.parts[w++] = p;
  }
  fx.parts.length = w;
}

// ---------------------------------------------------------------------------
// DRAW — pixel 1–2px, anelli per le onde, polilinee per i fulmini.
// Ogni coordinata è protetta da Number.isFinite: un NaN corromperebbe il frame.
// ---------------------------------------------------------------------------
function flickerColor(p, time) {
  const h = Math.sin(time * 26 + p.seed * 12.9898) * 43758.5453;
  const k = h - Math.floor(h);
  return k > 0.72 ? depthRed(1) : k > 0.3 ? depthRed(0.6) : depthRed(0);
}

function drawShock(ctx, sx, sy, p) {
  const r = Math.max(1, p.r0 + (1 - clamp01(p.life / p.maxLife)) * p.grow);
  if (!Number.isFinite(r)) return;
  ctx.fillStyle = p.color;
  const N = 20;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const px = Math.round(sx + Math.cos(a) * r);
    const py = Math.round(sy + Math.sin(a) * r);
    if (Number.isFinite(px) && Number.isFinite(py)) ctx.fillRect(px, py, 1, 1);
  }
}

function drawBolt(ctx, sx, sy, p) {
  if (!p.pts || !p.pts.length) return;
  const canPath = typeof ctx.beginPath === 'function' && typeof ctx.moveTo === 'function'
    && typeof ctx.lineTo === 'function' && typeof ctx.stroke === 'function';
  if (!canPath) {
    // fallback: colonna di pixel
    ctx.fillStyle = p.color;
    for (const q of p.pts) {
      const py = Math.round(sy + q.dy);
      if (Number.isFinite(py)) ctx.fillRect(sx, py, 1, 1);
    }
    return;
  }
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const x0 = Math.round(sx + p.pts[0].dx), y0 = Math.round(sy + p.pts[0].dy);
  ctx.moveTo(x0, y0);
  for (let i = 1; i < p.pts.length; i++) {
    const px = Math.round(sx + p.pts[i].dx), py = Math.round(sy + p.pts[i].dy);
    if (Number.isFinite(px) && Number.isFinite(py)) ctx.lineTo(px, py);
  }
  ctx.stroke();
}

export function drawFx(ctx, fx, camY, time) {
  if (!ctx || !fx || !Array.isArray(fx.parts)) return;
  camY = Number.isFinite(camY) ? camY : 0;
  time = Number.isFinite(time) ? time : 0;
  const canSave = typeof ctx.save === 'function';
  if (canSave) ctx.save();

  for (const p of fx.parts) {
    if (!p || p.dead) continue;
    const sx = Math.round(p.x);
    const sy = Math.round(p.y - camY);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
    const a = clamp01(p.alpha * clamp01(p.life / p.maxLife));
    if (a <= 0.01) continue;
    ctx.globalAlpha = a;

    if (p.type === 'shock') { drawShock(ctx, sx, sy, p); continue; }
    if (p.type === 'bolt') { drawBolt(ctx, sx, sy, p); continue; }

    ctx.fillStyle = p.flicker ? flickerColor(p, time) : p.color;
    const s = Math.max(1, Math.min(2, Math.round(p.size)));
    if (p.type === 'drop') ctx.fillRect(sx, sy, 1, 2);   // goccia: sottile e allungata
    else ctx.fillRect(sx, sy, s, s);
  }

  ctx.globalAlpha = 1;
  if (canSave && typeof ctx.restore === 'function') ctx.restore();
}
