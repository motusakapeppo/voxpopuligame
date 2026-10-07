// ============================================================================
// THEMES — identità visiva animata per ognuna delle 13 tracce.
// Ogni tema disegna uno sfondo (dietro parete/liriche/giocatore) e un primo
// piano (davanti al giocatore). Tutto deterministico (LCG seminato dall'id),
// clampato al viewport, solo palette nero+rosso.
//
// NOTA BUNDLE: il build concatena tutti i moduli in una sola IIFE → i nomi
// top-level devono essere UNICI. Tutti gli helper interni hanno prefisso `thm`.
// `drawFigure` e `emitFx` arrivano da import (rimossi dal bundler e già
// presenti una sola volta nel bundle).
// ============================================================================
import { C, depthRed } from './palette.js';
import { drawFigure } from './figure.js';
import { emitFx } from './fx.js';

export const THEME_IDS = [
  '01-intro', '02-vento', '03-tuoni', '04-baghdad', '05-hosonno', '06-primoposto',
  '07-tictac', '08-tuttofinto', '09-edera', '10-scendi', '11-lafinedelmondo',
  '12-maranatha', '13-outro',
];
export const THEME_FALLBACK = 'default';

const THM_SET = new Set(THEME_IDS);

// S-REND: contatori di debug (solo lettura) per verificare il riuso delle
// allocazioni per-frame. Non influenzano il disegno.
export const __thmDebug = { paintersCreated: 0, lcgCreated: 0 };

// Pura: audioId noto → se stesso; altrimenti il tema di ripiego (braci).
export function themeFor(audioId) {
  return THM_SET.has(audioId) ? audioId : THEME_FALLBACK;
}

// Pura: solo LA FINE DEL MONDO ha l'acqua che sale.
export function themeHasWater(audioId) {
  return audioId === '11-lafinedelmondo';
}

// Piano di particelle ambientali per tema (tipi validi di fx.js).
const THM_PLANS = {
  '01-intro': { types: ['ember', 'dust'], rate: 9 },
  '02-vento': { types: ['dust', 'ash'], rate: 16 },
  '03-tuoni': { types: ['spark', 'dust'], rate: 6 },
  '04-baghdad': { types: ['smoke', 'ember', 'ash'], rate: 14 },
  '05-hosonno': { types: ['dust', 'smoke'], rate: 7 },
  '06-primoposto': { types: ['dust', 'spark'], rate: 10 },
  '07-tictac': { types: ['dust', 'spark'], rate: 7 },
  '08-tuttofinto': { types: ['spark', 'ember'], rate: 11 },
  '09-edera': { types: ['dust', 'ash'], rate: 9 },
  '10-scendi': { types: ['drop', 'dust'], rate: 18 },
  '11-lafinedelmondo': { types: ['drop', 'ash'], rate: 15 },
  '12-maranatha': { types: ['ember', 'dust'], rate: 8 },
  '13-outro': { types: ['ember', 'dust'], rate: 7 },
  'default': { types: ['ember'], rate: 8 },
};

// Pura: copia del piano di particelle.
export function themeParticlePlan(audioId) {
  const p = THM_PLANS[themeFor(audioId)] || THM_PLANS[THEME_FALLBACK];
  return { types: p.types.slice(), rate: p.rate };
}

// --- helper interni (prefisso thm per non collidere nel bundle) ---------------
function thmNum(v, d) { return Number.isFinite(v) ? v : d; }

function thmHash(str) {
  const s = typeof str === 'string' ? str : '';
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

function thmLcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// S-REND: LCG per strato riusato. Il seed è finito (hash tema ^ indice strato),
// quindi la cache è limitata. Ad ogni uso lo stato è riportato al seed: la
// sequenza di valori è IDENTICA a thmLcg(seed) appena creato.
const THM_LCG_CACHE = new Map();
function thmLayerLcg(seed) {
  const key = seed >>> 0;
  let e = THM_LCG_CACHE.get(key);
  if (!e) {
    e = { s: key, next() { return (e.s = (e.s * 1664525 + 1013904223) >>> 0) / 4294967296; } };
    THM_LCG_CACHE.set(key, e);
    __thmDebug.lcgCreated++;
  }
  e.s = key;
  return e.next;
}

// Coordinata "a fisarmonica": ripete un elemento lungo la salita.
function thmTile(y, camY, f, period) {
  const v = y - camY * f;
  return ((v % period) + period) % period;
}

// Impulso periodico (lampo): 1 all'inizio, 0 alla fine della durata.
function thmPulse(time, period, dur) {
  const ph = ((time % period) + period) % period;
  return ph < dur ? 1 - ph / dur : 0;
}

// Painter: ogni primitiva è clampata al viewport. Mai un pixel fuori.
// S-REND: il painter è creato UNA volta per ctx (WeakMap) e riusato ad ogni
// frame; W/H sono aggiornati sul posto. Output identico, zero alloc per frame.
const THM_PAINTERS = new WeakMap();
function thmMakePainter(ctx, W, H) {
  let P = THM_PAINTERS.get(ctx);
  if (P) { P.W = W; P.H = H; return P; }
  P = {
    ctx, W, H,
    rect(x, y, w, h, color, alpha) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return;
      let x0 = Math.round(x), y0 = Math.round(y);
      let x1 = Math.round(x + w), y1 = Math.round(y + h);
      if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
      if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
      x0 = Math.max(0, x0); y0 = Math.max(0, y0);
      x1 = Math.min(P.W, x1); y1 = Math.min(P.H, y1);
      if (x1 <= x0 || y1 <= y0) return;
      ctx.globalAlpha = Number.isFinite(alpha) ? (alpha < 0 ? 0 : alpha > 1 ? 1 : alpha) : 1;
      ctx.fillStyle = color;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    },
    dot(x, y, color, alpha) { P.rect(x, y, 1, 1, color, alpha); },
    line(x0, y0, x1, y1, color, alpha) {
      if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) return;
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx - dy, guard = dx + dy + 4;
      for (;;) {
        P.dot(x0, y0, color, alpha);
        if ((x0 === x1 && y0 === y1) || guard-- <= 0) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
      }
    },
    ring(cx, cy, r, color, alpha, n) {
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) return;
      const N = Math.max(4, Math.min(24, Math.round(n || 12)));
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        P.dot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, color, alpha);
      }
    },
  };
  THM_PAINTERS.set(ctx, P);
  __thmDebug.paintersCreated++;
  return P;
}

// Partecelle ambientali: emette al più un granello quando il "bucket" cambia.
const THM_RISING = { ember: 1, smoke: 1, spark: 1, blood: 1 };
function thmAmbient(fx, plan, time, camY, W, H, seed) {
  if (!fx || !Array.isArray(fx.parts)) return;
  if (!plan || !Number.isFinite(time)) return;
  const rate = plan.rate;
  if (!Number.isFinite(rate) || rate <= 0) return;
  const a = Math.floor(time * rate);
  const b = Math.floor((time - 1 / 60) * rate);
  if (a === b) return;
  const types = plan.types;
  if (!types || !types.length) return;
  const r = thmLcg((seed ^ Math.imul(a, 2654435761)) >>> 0);
  const type = types[Math.floor(r() * types.length) % types.length];
  const x = r() * W;
  const y = THM_RISING[type] ? camY + H + 6 : camY - 6;
  emitFx(fx, type, x, y, { count: 1 });
}

// ---------------------------------------------------------------------------
// PARALLASSE + NEBBIA — strati di creste silhouette dietro il motivo del tema.
// Ogni strato scorre con la camera a velocità diversa (più lontano = più lento)
// e usa un rosso più freddo (depthRed). Forma da LCG seminato: mai Math.random.
// ---------------------------------------------------------------------------

// Costruttore di strato: colore SEMPRE coerente con depthRed(depth).
function thmLayer(depth, speed) {
  return { depth, speed, color: depthRed(depth) };
}

// Strati per tema: >=2, profondità e colori distinti. Il fallback copre gli ignoti.
const THM_LAYERS = {
  '01-intro': [thmLayer(0.0, 0.12), thmLayer(0.4, 0.30), thmLayer(0.8, 0.55)],
  '02-vento': [thmLayer(0.0, 0.18), thmLayer(0.4, 0.40), thmLayer(0.8, 0.70)],
  '03-tuoni': [thmLayer(0.2, 0.15), thmLayer(0.6, 0.35), thmLayer(1.0, 0.60)],
  '04-baghdad': [thmLayer(0.0, 0.20), thmLayer(0.4, 0.45), thmLayer(0.8, 0.75)],
  '05-hosonno': [thmLayer(0.0, 0.10), thmLayer(0.4, 0.28), thmLayer(0.8, 0.50)],
  '06-primoposto': [thmLayer(0.2, 0.25), thmLayer(0.6, 0.50), thmLayer(1.0, 0.80)],
  '07-tictac': [thmLayer(0.0, 0.12), thmLayer(0.4, 0.32), thmLayer(0.8, 0.58)],
  '08-tuttofinto': [thmLayer(0.2, 0.15), thmLayer(0.6, 0.38), thmLayer(1.0, 0.65)],
  '09-edera': [thmLayer(0.0, 0.14), thmLayer(0.4, 0.34), thmLayer(0.8, 0.60)],
  '10-scendi': [thmLayer(0.0, 0.22), thmLayer(0.4, 0.48), thmLayer(0.8, 0.78)],
  '11-lafinedelmondo': [thmLayer(0.0, 0.10), thmLayer(0.4, 0.30), thmLayer(0.8, 0.55)],
  '12-maranatha': [thmLayer(0.2, 0.16), thmLayer(0.6, 0.40), thmLayer(1.0, 0.68)],
  '13-outro': [thmLayer(0.0, 0.08), thmLayer(0.4, 0.25), thmLayer(0.8, 0.45)],
  'default': [thmLayer(0.0, 0.15), thmLayer(0.4, 0.35), thmLayer(0.8, 0.60)],
};

// Pura: copia degli strati del tema (ignoti → fallback). Mai il riferimento interno.
export function themeLayers(audioId) {
  const src = THM_LAYERS[themeFor(audioId)] || THM_LAYERS[THEME_FALLBACK];
  return src.map((l) => ({ depth: l.depth, speed: l.speed, color: l.color }));
}

// Disegna gli strati come creste silhouette. Ogni strato: posizione verticale
// scorsa dalla camera alla sua velocità, forma da LCG(seed ^ indice), coordinate
// intere. Lo strato vicino copre i lontani (occlusione naturale).
function thmParallax(P, camY, time, W, H, layers, seed) {
  if (!Array.isArray(layers) || !layers.length) return;
  const cy = thmNum(camY, 0), t = thmNum(time, 0);
  const sd = thmNum(seed, 1) >>> 0;
  for (let i = 0; i < layers.length; i++) {
    const L = layers[i];
    if (!L) continue;
    const depth = thmNum(L.depth, 0);
    const speed = thmNum(L.speed, 0.3);
    const color = typeof L.color === 'string' ? L.color : depthRed(depth);
    const period = 200 + i * 24;
    const raw = thmTile(20 + i * 50, cy, speed, period);
    const base = Math.round((raw / period) * (H * 0.55) + H * 0.15) + i * 12;
    const r = thmLayerLcg((sd ^ Math.imul(i + 1, 2654435761)) >>> 0);
    const step = 10;
    for (let x = 0; x < W; x += step) {
      const hh = Math.round(6 + r() * 26);
      const y = Math.round(base - hh + Math.sin(t * 0.5 + x * 0.05 + i) * 1.5);
      P.rect(x, y, step, H - y, color, 0.26 + 0.13 * i);
    }
  }
}

// Nebbia atmosferica: bande orizzontali rosso-scuro/nero a bassa alpha che
// unificano gli strati. Scorre lentamente con la camera.
function thmFog(P, camY, time, W, H, opts) {
  const o = opts || {};
  const bands = Math.max(2, Math.min(10, Math.round(thmNum(o.bands, 5))));
  const t = thmNum(time, 0), cy = thmNum(camY, 0);
  const bh = H / bands;
  const off = (((cy * 0.05) % bh) + bh) % bh;
  for (let i = -1; i < bands; i++) {
    const y = Math.round(i * bh + off + Math.sin(t * 0.35 + i * 1.9) * 3);
    const a = thmNum(o.alpha, 0.06) + 0.04 * ((i + 1) / bands);
    P.rect(0, y, W, Math.ceil(bh) + 1, i % 2 ? C.redDeep : C.black, a);
  }
}

// ===========================================================================
// I 13 TEMI (+ default). Firma: (P, camY, time, W, H, fx)
// ===========================================================================

// 01 INTRO — braci che salgono, dormienti, mare lontano.
function thmIntroBack(P, camY, time, W, H) {
  thmParallax(P, camY, time, W, H, THM_LAYERS['01-intro'], thmHash('01-intro'));
  const sy = thmTile(0, camY, 0.2, 420) - 70;
  // mare con onde animate (più vivo)
  P.rect(0, sy, W, 30, C.redDeep, 0.5);
  for (let i = 0; i < 12; i++)
    P.rect(i * 28, sy + Math.round(Math.sin(time * 1.2 + i * 0.7) * 2), 28, 2, C.redDark, 0.5);
  for (let i = 0; i < 5; i++) P.rect(24 + i * 70, sy + 5, 1, 22, C.black, 0.4);
  const gy = thmTile(140, camY, 0.5, 300) - 40;
  // dormienti (corpi a terra) + un albero spoglio
  for (let i = 0; i < 3; i++)
    drawFigure(P.ctx, i === 0 ? 60 : i === 1 ? 160 : 250, gy + 12, { h: 11, color: C.redDark, state: 'idle', phase: time * 0.5 + i * 2, alpha: 0.55 });
  for (let i = 0; i < 4; i++) P.line(300, gy + 14, 300 - 6 + i * 4, gy + 14 - 12 - i * 3, C.redDeep, 0.5);
  thmFog(P, camY, time, W, H);
}
function thmIntroFront(P, camY, time, W, H) {
  for (let i = 0; i < 7; i++) {
    const yy = H - ((time * (14 + i * 3) + i * 40) % (H + 20));
    P.dot(20 + i * 42 + Math.sin(time * 1.5 + i) * 6, yy, i % 2 ? C.redHot : C.red, 0.6);
  }
}

// 02 IL VENTO DAL SUD — case a cupola sbilenche + pioggia obliqua.
function thmVentoBack(P, camY, time, W, H) {
  thmParallax(P, camY, time, W, H, THM_LAYERS['02-vento'], thmHash('02-vento'));
  for (let layer = 0; layer < 2; layer++) {
    const f = layer === 0 ? 0.2 : 0.5;
    const col = layer === 0 ? C.redDeep : C.redDark;
    const al = layer === 0 ? 0.5 : 0.65;
    const base = thmTile(60 + layer * 80, camY, f, 300) - 40;
    for (let i = 0; i < 3; i++) {
      const dx = 20 + i * 100 + layer * 30;
      const tilt = Math.round(Math.sin(time * 1.5 + i) * 2) + layer;
      P.rect(dx, base + 14, 30, 10, col, al);
      P.rect(dx + 3 + tilt, base + 8, 24, 6, col, al);
      P.rect(dx + 8 + tilt * 2, base + 3, 14, 5, col, al);
      P.rect(dx + 12 + tilt * 3, base, 6, 3, col, al);
      P.dot(dx + 15 + tilt * 3, base - 2, C.redMid, 0.5);
    }
    for (let i = 0; i < 3; i++)
      P.rect(((time * 40 + i * 90) % (W + 40)) - 20, base + 6 + i * 9, 30, 1, C.redMid, 0.35);
  }
  for (let i = 0; i < 14; i++) {
    const yy = (time * 90 + i * 37) % (H + 20);
    const xx = (i * 34 + time * 20) % (W + 10);
    P.rect(xx, yy, 1, 3, C.redMid, 0.5);
    P.rect(xx - 1, yy + 3, 1, 3, C.redMid, 0.4);
  }
  thmFog(P, camY, time, W, H);
}
function thmVentoFront(P, camY, time, W, H) {
  drawFigure(P.ctx, W * 0.28, H * 0.82, { h: 15, color: C.redBright, state: 'push', phase: time * 2.4, alpha: 0.85, detail: true });
  // foglie spazzate dal vento
  for (let i = 0; i < 5; i++)
    P.rect(((i * 90 + time * 50) % W), (time * 60 + i * 40) % (H + 10), 2, 1, C.redDark, 0.6);
}

// 03 COME I TUONI — lampi, crepe, madri separate.
function thmTuoniBack(P, camY, time, W, H) {
  P.rect(0, 0, W, H, C.black, 1);
  thmParallax(P, camY, time, W, H, THM_LAYERS['03-tuoni'], thmHash('03-tuoni'));
  const f = thmPulse(time, 3.4, 0.16);
  if (f > 0) {
    P.rect(0, 0, W, H, C.redHot, 0.12 * f);
    let bx = W * 0.5 + Math.sin(time * 0.7) * 60, by = 0;
    for (let i = 0; i < 8; i++) {
      by += 10; bx += Math.round(Math.sin(i * 2.3 + time) * 6);
      P.rect(bx, by, 1, 5, i < 2 ? C.white : C.redHot, 0.95 * f);
      if (i > 1) P.dot(bx - 1, by + 3, C.redHot, 0.5 * f);
    }
  }
  const gy = thmTile(120, camY, 0.5, 280) - 30;
  // crepe nel terreno
  for (let i = 0; i < 4; i++) {
    const cx0 = 20 + i * 90;
    for (let j = 0; j < 5; j++) P.rect(cx0 + j * 3 + (i % 2) * 2, gy + j * 3, 1, 2, C.redDark, 0.7);
  }
  drawFigure(P.ctx, 110, gy + 20, { h: 14, color: C.red, state: 'tendi', phase: time * 1.6, facing: 1, alpha: 0.75, detail: true });
  drawFigure(P.ctx, 205, gy + 20, { h: 14, color: C.red, state: 'tendi', phase: time * 1.6, facing: -1, alpha: 0.75, detail: true });
  thmFog(P, camY, time, W, H);
}
function thmTuoniFront(P, camY, time, W, H) {
  const f = thmPulse(time, 3.4, 0.16);
  if (f > 0) P.rect(0, 0, W, H, C.black, 0.3 * (1 - f));
}

// 04 BAGHDAD — fuoco, fumo, detriti, protesta repressa.
function thmBaghdadBack(P, camY, time, W, H) {
  P.rect(0, 0, W, H, C.black, 1);
  thmParallax(P, camY, time, W, H, THM_LAYERS['04-baghdad'], thmHash('04-baghdad'));
  const glow = thmTile(140, camY, 0.5, 320) - 20;
  P.rect(0, glow, W, Math.max(0, H - glow), C.redMid, 0.18 + 0.08 * Math.sin(time * 6));
  // bagliori di fuoco alla base
  for (let i = 0; i < 6; i++) {
    const fx = 16 + i * 54, fl = 8 + Math.round(Math.abs(Math.sin(time * 7 + i)) * 10);
    P.rect(fx, glow - fl, 5, fl, C.redHot, 0.55);
    P.rect(fx + 1, glow - fl - 3, 3, 3, C.red, 0.5);
  }
  for (let i = 0; i < 3; i++) {
    const sx = 50 + i * 100;
    for (let j = 0; j < 5; j++) {
      const yy = glow - j * 14 - ((time * 8) % 14);
      P.rect(sx + Math.sin(time + j + i) * 4, yy, 12 + j * 3, 4, C.redDeep, Math.max(0, 0.45 - j * 0.06));
    }
  }
  for (let i = 0; i < 7; i++)
    P.rect((i * 53 + 20) % W, (time * 50 + i * 40) % (H + 20), 2, 2, C.redDark, 0.7);
  drawFigure(P.ctx, 90, glow + 24, { h: 12, color: C.redDark, state: 'scream', phase: time * 2.2, alpha: 0.75, detail: true });
  drawFigure(P.ctx, 130, glow + 24, { h: 12, color: C.red, state: 'push', phase: time * 2.6, facing: -1, alpha: 0.85, detail: true });
  thmFog(P, camY, time, W, H, { bands: 7, alpha: 0.07 });
}
function thmBaghdadFront(P, camY, time, W, H) {
  for (let i = 0; i < 6; i++)
    P.rect((i * 80 + 40) % W, H - ((time * 30 + i * 30) % (H + 10)), 1, 1, C.redHot, 0.7);
}

// 05 HO SONNO — buio che scende, sirene, ciclo di lavoro, specchio.
function thmHosonnoBack(P, camY, time, W, H) {
  P.rect(0, 0, W, H, C.black, 1);
  thmParallax(P, camY, time, W, H, THM_LAYERS['05-hosonno'], thmHash('05-hosonno'));
  const darkH = (time * 10) % (H + 60);
  P.rect(0, 0, W, darkH, C.black, 0.45);
  P.rect(0, darkH, W, 2, C.redDeep, 0.5);
  for (let s = 0; s < 2; s++) {
    const dir = s === 0 ? 1 : -1;
    const ang = dir * (((time * 0.9 + s * 0.5) % 1) * 1.6 - 0.8);
    for (let i = 0; i < 6; i++) P.rect(W / 2 + Math.sin(ang) * i * 13, 18 + i * 9, 7, 2, C.red, 0.15);
  }
  const gy = thmTile(150, camY, 0.5, 320) - 30;
  // ciclo di lavoro: figure su un nastro che si muovono in loop
  for (let i = 0; i < 3; i++) {
    const xx = ((i * 120 + time * 18) % (W + 20)) - 10;
    drawFigure(P.ctx, xx, gy + 14, { h: 12, color: C.redDark, state: 'walk', phase: time * 3 + i, alpha: 0.6, detail: true });
  }
  // specchio incrinato
  for (let i = 0; i < 4; i++) P.rect(W - 54 + i * 5, 30 + i * 8, 1, 24, C.redMid, 0.6);
  thmFog(P, camY, time, W, H, { bands: 6, alpha: 0.08 });
}
function thmHosonnoFront(P, camY, time, W, H) {
  P.rect(0, 0, W, H, C.black, 0.16 + 0.08 * Math.sin(time * 1.5));
}

// 06 PRIMO POSTO — rivali che si scavalcano, serpenti, corsa.
function thmPrimopostoBack(P, camY, time, W, H) {
  P.rect(0, 0, W, H, C.black, 1);
  thmParallax(P, camY, time, W, H, THM_LAYERS['06-primoposto'], thmHash('06-primoposto'));
  const ty = thmTile(120, camY, 0.4, 300) - 30;
  P.rect(0, ty, W, 1, C.redDark, 0.5);
  P.rect(0, ty + 60, W, 1, C.redDark, 0.3);
  // serpenti (sinusoidi)
  for (let s = 0; s < 2; s++) {
    const sy = ty + 30 + s * 40;
    for (let i = 0; i < 12; i++) {
      const yy = sy + Math.sin(time * 2 + i * 0.6 + s) * 7;
      P.dot(i * 26, yy, C.redMid, 0.6);
      if (i % 3 === 0) P.dot(i * 26 + 1, yy - 1, C.red, 0.5);
    }
  }
  // rivali che si scavalcano
  drawFigure(P.ctx, 120, ty + 20, { h: 13, color: C.red, state: 'climb', phase: time * 2.4, alpha: 0.8, detail: true });
  drawFigure(P.ctx, 138, ty + 27, { h: 13, color: C.redDark, state: 'push', phase: time * 3, alpha: 0.85, detail: true });
  thmFog(P, camY, time, W, H);
}
function thmPrimopostoFront(P, camY, time, W, H) {
  const xx = ((time * 60) % (W + 40)) - 20;
  drawFigure(P.ctx, xx, H * 0.86, { h: 15, color: C.redBright, state: 'run', phase: time * 4, alpha: 0.9, detail: true });
  for (let i = 0; i < 3; i++) P.rect(xx - 10 - i * 5, H * 0.8 + i * 2, 5, 1, C.redDark, 0.5);
}

// 07 TIC-TAC — orologio, ingranaggi, conto alla rovescia.
function thmTictacBack(P, camY, time, W, H) {
  P.rect(0, 0, W, H, C.black, 1);
  thmParallax(P, camY, time, W, H, THM_LAYERS['07-tictac'], thmHash('07-tictac'));
  const ccx = W * 0.5, ccy = H * 0.4, R = 34;
  P.ring(ccx, ccy, R, C.redDark, 0.75, 20);
  P.ring(ccx, ccy, R - 4, C.redDeep, 0.4, 16);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    P.dot(ccx + Math.cos(a) * (R - 2), ccy + Math.sin(a) * (R - 2), C.redMid, 0.8);
  }
  P.line(ccx, ccy, ccx + Math.sin(time * 0.6) * (R - 6), ccy - Math.cos(time * 0.6) * (R - 6), C.redHot, 0.9);
  P.line(ccx, ccy, ccx + Math.sin(time * 0.05) * (R - 14), ccy - Math.cos(time * 0.05) * (R - 14), C.redBright, 0.9);
  P.dot(ccx, ccy, C.white, 0.9);
  // ingranaggi agli angoli
  const gears = [[60, H * 0.72, 12], [250, H * 0.28, 10]];
  for (const [gx, gy, gr] of gears) {
    P.ring(gx, gy, gr, C.redDark, 0.6, 10);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + time * 1.2;
      P.dot(gx + Math.cos(a) * (gr + 2), gy + Math.sin(a) * (gr + 2), C.redMid, 0.7);
    }
  }
  const frac = 1 - ((time % 12) / 12);
  P.rect(W - 8, 12, 3, Math.max(1, Math.round(H * 0.5 * frac)), C.redHot, 0.7);
  thmFog(P, camY, time, W, H);
}
function thmTictacFront(P, camY, time, W, H) {
  drawFigure(P.ctx, W * 0.75, H * 0.85, { h: 14, color: C.redBright, state: 'run', phase: time * 4.5, alpha: 0.85, detail: true });
}

// 08 TUTTO FINTO — sipario, orchestra mascherata, fiamme finte, specchi.
function thmTuttofintoBack(P, camY, time, W, H) {
  P.rect(0, 0, W, H, C.black, 1);
  thmParallax(P, camY, time, W, H, THM_LAYERS['08-tuttofinto'], thmHash('08-tuttofinto'));
  P.rect(0, 0, W, 44, C.redDeep, 0.6);
  for (let i = 0; i < 8; i++)
    P.rect(i * (W / 8) + Math.sin(time * 1.5 + i) * 2, 0, 2, 48, C.redDark, 0.6);
  const oy = H * 0.72;
  for (let i = 0; i < 3; i++) {
    drawFigure(P.ctx, 70 + i * 90, oy, { h: 11, color: C.redDark, state: 'idle', phase: time * 2 + i, alpha: 0.6, detail: true });
    P.rect(66 + i * 90, oy - 10, 8, 3, C.black, 0.85);   // maschera
  }
  for (let i = 0; i < 4; i++) {
    const fx = 20 + i * 90, fl = 7 + Math.round(Math.abs(Math.sin(time * 7 + i)) * 6);
    P.rect(fx, oy + 8 - fl, 3, fl, C.red, 0.55);
    P.rect(fx + 1, oy + 8 - fl - 2, 1, 2, C.redHot, 0.5);
  }
  for (let i = 0; i < 3; i++) P.rect(W - 34 - i * 6, 54 + i * 10, 8, 2, C.redMid, 0.45);
  thmFog(P, camY, time, W, H);
}
function thmTuttofintoFront(P, camY, time, W, H) {
  drawFigure(P.ctx, W * 0.5, H * 0.88, { h: 15, color: C.redDark, state: 'idle', phase: time * 1.4, alpha: 0.5, detail: true });
  P.rect(0, H - 4, W, 4, C.black, 0.5);
}

// 09 EDERA — edera che cresce, serpenti, il doppio.
function thmEderaBack(P, camY, time, W, H) {
  P.rect(0, 0, W, H, C.black, 1);
  thmParallax(P, camY, time, W, H, THM_LAYERS['09-edera'], thmHash('09-edera'));
  const grow = Math.min(1, (time % 16) / 10);
  let vy = H + 10;
  for (let i = 0; i < 18; i++) {
    vy -= 15 * grow;
    const vx = 46 + Math.sin(i * 0.8 + time) * 30;
    P.dot(vx, vy, C.redDark, 0.7);
    if (i % 2 === 0) { P.dot(vx + 2, vy + 1, C.redMid, 0.5); P.dot(vx - 2, vy - 1, C.red, 0.4); }
  }
  for (let s = 0; s < 2; s++) {
    const sy = H * 0.6 + s * 30;
    for (let i = 0; i < 10; i++) P.dot(40 + i * 20, sy + Math.sin(time * 2 + i * 0.7) * 6, C.redMid, 0.5);
  }
  drawFigure(P.ctx, 130, H * 0.8, { h: 13, color: C.red, state: 'climb', phase: time * 2, alpha: 0.75, detail: true });
  drawFigure(P.ctx, 170, H * 0.8, { h: 13, color: C.redDark, state: 'climb', phase: time * 2, facing: -1, alpha: 0.75, detail: true });
  thmFog(P, camY, time, W, H);
}
function thmEderaFront(P, camY, time, W, H) {
  for (let i = 0; i < 10; i++) {
    P.dot(258 + Math.sin(i * 0.9 + time * 0.5) * 14, i * 20, C.redDark, 0.5);
    if (i % 2 === 0) P.dot(260 + Math.sin(i * 0.9 + time * 0.5) * 14, i * 20 + 2, C.redMid, 0.4);
  }
}

// 10 SCENDI — pioggia, folla bagnata, pugni alzati.
function thmScendiBack(P, camY, time, W, H) {
  P.rect(0, 0, W, H, C.black, 1);
  thmParallax(P, camY, time, W, H, THM_LAYERS['10-scendi'], thmHash('10-scendi'));
  for (let i = 0; i < 20; i++) {
    const yy = (time * 120 + i * 31) % (H + 20);
    P.rect((i * 21 + time * 10) % W, yy, 1, 3, C.redMid, 0.45);
  }
  const cy = thmTile(150, camY, 0.5, 320) - 30;
  for (let i = 0; i < 3; i++)
    drawFigure(P.ctx, 60 + i * 80, cy + 16, { h: 12, color: C.redDark, state: i ? 'walk' : 'idle', phase: time * 2.6 + i, alpha: 0.65, detail: true });
  // pugni alzati tra la folla
  for (let i = 0; i < 3; i++) {
    const px = 80 + i * 70, py = cy + 2 + Math.sin(time * 2 + i) * 2;
    P.line(px, py, px, py - 8, C.redBright, 0.6);
    P.rect(px - 2, py - 11, 4, 4, C.redHot, 0.8);
  }
  thmFog(P, camY, time, W, H);
}
function thmScendiFront(P, camY, time, W, H) {
  for (let i = 0; i < 3; i++) {
    const xx = 40 + i * 110;
    const yy = H * 0.8 + Math.sin(time * 3 + i) * 2;
    P.line(xx, yy, xx, yy - 10, C.redBright, 0.7);
    P.rect(xx - 2, yy - 13, 4, 4, C.redHot, 0.9);
  }
  for (let i = 0; i < 6; i++)
    P.rect((i * 70 + time * 6) % W, (time * 100 + i * 40) % (H + 10), 1, 3, C.redMid, 0.4);
}

// 11 LA FINE DEL MONDO — acqua che sale, fiori appassiti, lenzuolo nero.
function thmLfineBack(P, camY, time, W, H) {
  P.rect(0, 0, W, H, C.black, 1);
  thmParallax(P, camY, time, W, H, THM_LAYERS['11-lafinedelmondo'], thmHash('11-lafinedelmondo'));
  const wl = H - ((time * 6) % (H + 60));
  P.rect(0, wl, W, Math.max(0, H - wl), C.redDeep, 0.4);
  for (let i = 0; i < 8; i++) P.dot(i * 42, wl + Math.sin(time * 3 + i) * 2, C.redMid, 0.6);
  for (let i = 0; i < 5; i++) P.rect(16 + i * 70, wl + 8, 1, 12, C.redDark, 0.4);
  const sh = ((time * 4) % (H + 80)) - 40;
  P.rect(0, 0, W, Math.max(0, sh), C.black, 0.5);
  P.rect(0, sh, W, 1, C.redDark, 0.5);
  for (let i = 0; i < 4; i++) {
    const fx = 50 + i * 70;
    const droop = Math.round(Math.sin(time * 1.5 + i) * 2) + 2;
    P.line(fx, wl - 6, fx + droop, wl - 15, C.redDark, 0.7);
    P.dot(fx + droop, wl - 16, C.red, 0.7);
    P.dot(fx + droop + 1, wl - 14, C.redMid, 0.4);
  }
  thmFog(P, camY, time, W, H, { bands: 6, alpha: 0.06 });
}
function thmLfineFront(P, camY, time, W, H) {
  const wl = H - ((time * 6) % (H + 60));
  for (let i = 0; i < 10; i++) P.dot(i * 33, wl + Math.sin(time * 2 + i * 0.7) * 2, C.red, 0.4);
}

// 12 MARANATHA — coro, mani tese, popoli in cammino.
function thmMaranathaBack(P, camY, time, W, H) {
  P.rect(0, 0, W, H, C.black, 1);
  thmParallax(P, camY, time, W, H, THM_LAYERS['12-maranatha'], thmHash('12-maranatha'));
  P.rect(0, H * 0.4, W, 3, C.redDeep, 0.5);
  P.rect(0, H * 0.4 + 3, W, 24, C.redDeep, 0.22);
  const gy = thmTile(130, camY, 0.4, 320) - 20;
  for (let i = 0; i < 2; i++)
    drawFigure(P.ctx, 70 + i * 130, gy + 18, { h: 12, color: C.red, state: 'walk', phase: time * 2 + i, alpha: 0.7 });
  for (let i = 0; i < 5; i++) {
    const hx = 34 + i * 60, hy = gy + 6 + Math.sin(time * 2 + i) * 1.5;
    P.line(hx, hy, hx, hy - 9, C.redBright, 0.6);
    P.dot(hx, hy - 11, C.redHot, 0.7);
  }
  thmFog(P, camY, time, W, H);
}
function thmMaranathaFront(P, camY, time, W, H) {
  drawFigure(P.ctx, W * 0.5, H * 0.9, { h: 15, color: C.redBright, state: 'tendi', phase: time * 1.8, alpha: 0.9 });
  for (let i = 0; i < 4; i++) P.dot(70 + i * 55, H * 0.5 + Math.sin(time + i) * 5, C.redHot, 0.5);
}

// 13 OUTRO — alba sulla cima, figura sola, lento dissolversi.
function thmOutroBack(P, camY, time, W, H) {
  P.rect(0, 0, W, H, C.black, 1);
  thmParallax(P, camY, time, W, H, THM_LAYERS['13-outro'], thmHash('13-outro'));
  const gy = thmTile(90, camY, 0.3, 300) - 30;
  P.rect(0, gy, W, 30, C.redDeep, 0.4);
  // cima montuosa
  for (let i = 0; i < 8; i++) {
    const mx = i * 46, mh = 10 + i % 3 * 6;
    for (let j = 0; j < mh; j++) P.rect(mx + j, gy - j, mh * 2 - j * 2, 1, C.redDeep, 0.5);
  }
  if (camY < 220) {
    const sx = W * 0.5, sy = gy - 14, R = 18;
    for (let i = 0; i < 3; i++) P.ring(sx, sy, R - i * 3, C.red, 0.35 - i * 0.08, 18);
    P.dot(sx, sy, C.white, 0.9);
    // raggi
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + time * 0.2;
      P.dot(sx + Math.cos(a) * 24, sy + Math.sin(a) * 24, C.redHot, 0.4);
    }
  }
  drawFigure(P.ctx, W * 0.5, gy + 16, { h: 15, color: C.redBright, state: 'idle', phase: time * 1.2, alpha: 0.85, detail: true });
  thmFog(P, camY, time, W, H);
}
function thmOutroFront(P, camY, time, W, H) {
  P.rect(0, 0, W, H, C.black, 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(time * 0.6)));
}

// default — braci su nero (ripiego).
function thmDefaultBack(P, camY, time, W, H) {
  P.rect(0, 0, W, H, C.black, 1);
  thmParallax(P, camY, time, W, H, THM_LAYERS['default'], thmHash('default'));
  P.rect(0, H - 10, W, 10, C.redDeep, 0.3);
  thmFog(P, camY, time, W, H);
}
function thmDefaultFront(P, camY, time, W, H) {
  for (let i = 0; i < 4; i++) P.dot(40 + i * 70, H - ((time * 16 + i * 40) % (H + 10)), C.red, 0.4);
}

const THM_BACK = {
  '01-intro': thmIntroBack, '02-vento': thmVentoBack, '03-tuoni': thmTuoniBack,
  '04-baghdad': thmBaghdadBack, '05-hosonno': thmHosonnoBack, '06-primoposto': thmPrimopostoBack,
  '07-tictac': thmTictacBack, '08-tuttofinto': thmTuttofintoBack, '09-edera': thmEderaBack,
  '10-scendi': thmScendiBack, '11-lafinedelmondo': thmLfineBack, '12-maranatha': thmMaranathaBack,
  '13-outro': thmOutroBack, 'default': thmDefaultBack,
};
const THM_FRONT = {
  '01-intro': thmIntroFront, '02-vento': thmVentoFront, '03-tuoni': thmTuoniFront,
  '04-baghdad': thmBaghdadFront, '05-hosonno': thmHosonnoFront, '06-primoposto': thmPrimopostoFront,
  '07-tictac': thmTictacFront, '08-tuttofinto': thmTuttofintoFront, '09-edera': thmEderaFront,
  '10-scendi': thmScendiFront, '11-lafinedelmondo': thmLfineFront, '12-maranatha': thmMaranathaFront,
  '13-outro': thmOutroFront, 'default': thmDefaultFront,
};

// Sfondo tema. Mai lancia: un tema rotto non deve fermare il gioco.
export function drawThemeBack(ctx, audioId, camY, time, W, H, fx) {
  try {
    if (!ctx || typeof ctx.fillRect !== 'function') return;
    const id = themeFor(audioId);
    const fn = THM_BACK[id] || THM_BACK[THEME_FALLBACK];
    const P = thmMakePainter(ctx, thmNum(W, 320), thmNum(H, 180));
    const t = thmNum(time, 0), cy = thmNum(camY, 0);
    P.rect(0, 0, P.W, P.H, C.black, 1);
    fn(P, cy, t, P.W, P.H, fx);
    thmAmbient(fx, THM_PLANS[id] || THM_PLANS[THEME_FALLBACK], t, cy, P.W, P.H, thmHash(id));
    ctx.globalAlpha = 1;
  } catch { /* mai bloccare il frame */ }
}

// Primo piano tema (davanti al giocatore).
export function drawThemeFront(ctx, audioId, camY, time, W, H, fx) {
  try {
    if (!ctx || typeof ctx.fillRect !== 'function') return;
    const id = themeFor(audioId);
    const fn = THM_FRONT[id] || THM_FRONT[THEME_FALLBACK];
    const P = thmMakePainter(ctx, thmNum(W, 320), thmNum(H, 180));
    fn(P, thmNum(camY, 0), thmNum(time, 0), P.W, P.H, fx);
    ctx.globalAlpha = 1;
  } catch { /* idem */ }
}
