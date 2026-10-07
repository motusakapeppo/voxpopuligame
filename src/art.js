// ============================================================================
// ART — VOX POPULI. Figure rosse animate su nero, come la copertina.
// Tutto il disegno delle persone passa da figure.js (scheletro animato).
// ============================================================================
import { C, depthRed } from './palette.js';
import { drawFigure, drawClimber } from './figure.js';
import { climbPos } from './climb.js';
import { LYRICS } from './lyrics.js';

// ---------------------------------------------------------------------------
// LIRICHE ANIMATE — i versi del brano scorrono sullo sfondo, stile dark.
// Ogni verso entra dissolvendo, resta al centro, poi svanisce mentre
// scorre verso l'alto; le lettere hanno un tremolio sottile.
// ---------------------------------------------------------------------------
export function drawLyrics(ctx, audioId, cameraY, time, W, H) {
  const versi = LYRICS[audioId] || [];
  if (!versi.length) return;
  const PER = 5.0;                        // secondi per verso
  const idx = Math.floor(time / PER) % versi.length;
  const prev = (idx - 1 + versi.length) % versi.length;
  const local = (time % PER) / PER;       // 0..1 dentro il verso
  const text = versi[idx];

  ctx.save();
  ctx.textAlign = 'center';

  // verso precedente: fantasma, scorre via verso l'alto
  drawVert(ctx, versi[prev], W / 2, H * 0.24 - local * 10, time, 0.12 * (1 - local), 8, 0);

  // verso corrente: entra in dissolvenza, battitura, poi esce
  let a = local < 0.12 ? local / 0.12 : local > 0.88 ? (1 - local) / 0.12 : 1;
  a *= 0.9;
  const y = H * 0.40 + (0.5 - local) * 6;
  const shown = Math.min(text.length, Math.ceil((local / 0.35) * text.length));
  const size = Math.max(7, Math.min(15, Math.floor((W * 0.88) / Math.max(1, text.length * 0.6))));
  drawVert(ctx, text.slice(0, shown), W / 2, y, time, a, size, 1);

  // linea rossa che cresce sotto
  const full = Math.min(1, local / 0.4);
  const half = (text.length * size * 0.6) * full / 2;
  ctx.globalAlpha = a * 0.5;
  ctx.fillStyle = C.red;
  ctx.fillRect(W / 2 - half, y + 6, half * 2, 1);
  ctx.globalAlpha = a * 0.18;
  ctx.fillRect(W / 2 - half - 4, y + 5, half * 2 + 8, 3);

  ctx.restore();
  ctx.textAlign = 'left';
}

// Disegna una riga di testo lettera per lettera con tremolio e glitch.
export function drawVert(ctx, text, cx, cy, time, alpha, size, glitch) {
  ctx.font = `${size}px monospace`;
  const total = text.length * size * 0.6;
  let x = cx - total / 2;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') { x += size * 0.6; continue; }
    const jitterY = Math.sin(time * 4 + i * 0.9) * 0.7;
    // glitch orizzontale occasionale
    const jump = glitch && Math.sin(time * 13 + i * 2.3) > 0.93 ? (i % 2 ? 2 : -2) : 0;
    const px = x + jump;
    const py = cy + jitterY;
    // ombra
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = C.black;
    ctx.fillText(ch, px + 1, py + 1);
    // corpo: alcune lettere più calde
    ctx.globalAlpha = alpha;
    ctx.fillStyle = (i % 5 === 0) ? C.redHot : C.red;
    ctx.fillText(ch, px, py);
    x += size * 0.6;
  }
  ctx.globalAlpha = 1;
}



const ART_VIEW_H = 180;

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// SFONDO
// ---------------------------------------------------------------------------
export function drawBackground(ctx, g, cameraY, time, W, H) {
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, W, H);

  // graffi rossi diagonali (texture cover)
  const r = rng(77);
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = C.redDark; ctx.lineWidth = 1;
  for (let i = 0; i < 22; i++) {
    const x = r() * W, y = (r() * H * 2 + cameraY * 0.2) % (H * 2) - H * 0.5;
    const len = 14 + r() * 40;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len * 0.35, y + len); ctx.stroke();
  }
  ctx.restore();

  // folla lontana, rosso profondo, che si arrampica in parallasse
  ctx.save();
  ctx.globalAlpha = 0.45;
  const r2 = rng(303);
  for (let i = 0; i < 14; i++) {
    const x = r2() * W;
    const base = (i * 141 + cameraY * 0.35) % (H + 80);
    const ph = time * 1.2 + i;
    drawFigure(ctx, x, H - base, { h: 14, color: C.redDeep, state: 'climb', phase: ph, facing: 1, alpha: 0.9 });
  }
  ctx.restore();
}

// Vignettatura dark: si disegna SOPRA tutto, alla fine della scena.
export function drawVignette(ctx, W, H) {
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------
// PARETE — la piramide di CORPI. Non mensole: una massa continua che si
// restringe salendo, con le teste/prese che emergono. Il giocatore la scala.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// PARETE — la piramide è fatta di PERSONE: una massa fitta di corpi che si
// arrampicano l'uno sull'altro. Per restare veloce, la parete si disegna UNA
// VOLTA in un canvas offscreen (coordinate mondo) e poi si blitta la fetta
// visibile. Gli appigli (mani/teste di chi ti porge la presa) brillano live.
// ---------------------------------------------------------------------------
function buildWallCanvas(ctx, g, climb, W, H) {
  const doc = (ctx && ctx.canvas && ctx.canvas.ownerDocument)
    || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.createElement !== 'function') return null;
  const rows = climb.rows, nRows = climb.nRows;
  const stepY = Math.abs(rows[1] - rows[0]) || 24;
  const topY = rows[nRows - 1] - 46;          // margine sopra la cima
  const botY = rows[0] + 30;
  const ch = Math.max(64, Math.round(botY - topY));
  let cv;
  try { cv = doc.createElement('canvas'); } catch { return null; }
  cv.width = W; cv.height = ch;
  const c = cv.getContext('2d');
  if (!c) return null;

  // massa organica di persone: non una griglia, ma corpi stipati con
  // variazione di taglia, quota e posa (come una folla che si arrampica).
  let seed = 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let r = 0; r < nRows; r++) {
    let lo = null, hi = null;
    for (let cc = 0; cc < climb.cols.length; cc++) if (climb.has(cc, r)) { if (lo === null) lo = cc; hi = cc; }
    if (lo === null) continue;
    const x0 = climb.xOf(lo) - 16, x1 = climb.xOf(hi) + 16;
    const span = x1 - x0;
    // densità variabile: a volte fitta, a volte rada (fessure di buio)
    const n = Math.max(2, Math.round(span / (10 + rnd() * 6)));
    for (let i = 0; i < n; i++) {
      const jitter = (rnd() - 0.5) * 5;
      const fx = x0 + (i + 0.5) * (span / n) + jitter;
      const layers = rnd() > 0.55 ? 2 : 1;      // a volte un corpo dietro
      for (let layer = 0; layer < layers; layer++) {
        const baseWorld = rows[r] - topY + stepY * (0.7 + rnd() * 0.25) + layer * 4;
        const depth = r / Math.max(1, nRows - 1);
        const hh = 11 + rnd() * 4;
        const colr = depthRed(0.08 + depth * 0.4 + (layer ? 0 : 0.14) + rnd() * 0.16);
        const ph = r * 1.5 + i * 1.2 + layer * 2.1;
        const roll = rnd();
        const st = roll < 0.4 ? 'climb' : roll < 0.7 ? 'reach' : roll < 0.9 ? 'idle' : 'push';
        drawFigure(c, fx, baseWorld, {
          h: hh, color: colr, state: st, phase: ph,
          facing: rnd() > 0.5 ? 1 : -1, alpha: layer ? 0.65 : 0.92,
        });
      }
    }
  }
  return { canvas: cv, topY };
}

export function drawWall(ctx, g, climb, cameraY, time, W, H, beat) {
  const bt = Number.isFinite(beat) ? beat : 0;
  // cache su climb (ricreato a ogni girone)
  if (!climb._wall) climb._wall = buildWallCanvas(ctx, g, climb, W, H);
  const wall = climb._wall;

  if (wall) {
    ctx.save();
    ctx.globalAlpha = 0.92 + 0.08 * bt;
    ctx.drawImage(wall.canvas, 0, Math.round(cameraY - wall.topY), W, H, 0, 0, W, H);
    ctx.restore();
  } else {
    // ripiego (senza DOM): massa scura + qualche figura, per non rompere nulla
    const rows = climb.rows, nRows = climb.nRows;
    const stepY = Math.abs(rows[1] - rows[0]) || 24;
    for (let r = 0; r < nRows; r++) {
      const y = rows[r] - cameraY;
      if (y < -stepY * 2 || y > H + stepY * 2) continue;
      let lo = null, hi = null;
      for (let cc = 0; cc < climb.cols.length; cc++) if (climb.has(cc, r)) { if (lo === null) lo = cc; hi = cc; }
      if (lo === null) continue;
      const x0 = climb.xOf(lo) - 14, x1 = climb.xOf(hi) + 14;
      ctx.globalAlpha = 0.5 + 0.1 * bt; ctx.fillStyle = C.redDeep;
      ctx.fillRect(Math.round(x0), Math.round(y + 2), Math.round(x1 - x0), Math.round(stepY + 4));
      ctx.globalAlpha = 1;
      for (let i = 0; i < 4; i++)
        drawFigure(ctx, x0 + (i + 0.5) * ((x1 - x0) / 4), y + stepY * 0.75,
          { h: 14, color: C.redDark, state: 'climb', phase: time + i, alpha: 0.7 });
    }
  }

  // APPIGLI live: piccole mani che si protendono verso di te (non quadrati).
  // Solo quelli vicino al giocatore si accendono; gli altri restano discreti.
  const gRow = Math.max(climb.lh.r, climb.rh.r);
  for (let r = 0; r < climb.nRows; r++) {
    const y = climb.rows[r] - cameraY;
    if (y < -30 || y > H + 30) continue;
    const near = Math.abs(r - gRow) <= 1;
    for (let c = 0; c < climb.cols.length; c++) {
      if (!climb.has(c, r)) continue;
      const hx = Math.round(climb.xOf(c));
      const hy = Math.round(y) + 1;
      const ph = time * 1.6 + (hx + r * 13) * 0.1;
      const bob = Math.round(Math.sin(ph) * 0.6);
      if (near) {
        // mano tesa: dita + palmo
        ctx.globalAlpha = 0.85 + 0.15 * bt;
        ctx.fillStyle = C.redHot;
        ctx.fillRect(hx - 1, hy - 1 + bob, 2, 2);
        ctx.fillRect(hx - 2, hy + 1 + bob, 1, 1);
        ctx.fillRect(hx + 1, hy + 1 + bob, 1, 1);
      } else {
        // accenno discreto di una testa tra la folla
        ctx.globalAlpha = 0.35 + 0.15 * bt;
        ctx.fillStyle = C.redDark;
        ctx.fillRect(hx, hy + bob, 1, 2);
      }
      ctx.globalAlpha = 1;
    }
  }
}


// ---------------------------------------------------------------------------
// GIOCATORE — appeso alla parete (arrampicata).
// ---------------------------------------------------------------------------
export function drawPlayer(ctx, cl, cameraY, time, action) {
  const p = climbPos(cl);
  const ly = p.ly - cameraY, ry = p.ry - cameraY;
  const byc = p.by - cameraY;
  const ph = time;
  const reachK = cl.reach > 0 && cl.reachDur ? Math.max(0, cl.reach / cl.reachDur) : 0;
  const breathe = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(time * 2));
  // pendolo: il corpo oscilla in base alla velocità del bacino (fisica)
  const swing = Math.max(-1, Math.min(1, (cl.vby || 0) * 0.03 + Math.sin(time * 2.2) * 0.12));

  // Animazioni di INTERAZIONE (Z = tendi, X = spingi): gesture multi-fase.
  // Ogni gesto ha ANTICIPAZIONE → COLPO → RITORNO, così si legge chiaramente.
  const dur = action === 'tendi' ? 0.72 : 0.62;
  const t = (action === 'tendi' || action === 'spingi') ? Math.max(0, actionT) : 0;
  const prog = t > 0 ? Math.min(1, (dur - t) / dur) : 0;       // 0→1 nello svolgersi
  // curva: 0 → 1 → 0 con un picco rapido a metà
  const bell = prog <= 0 ? 0 : prog < 0.5 ? Math.sin(prog * Math.PI) : Math.sin((1 - prog) * Math.PI);
  const actK = action === 'tendi' || action === 'spingi' ? Math.max(0, bell) : 0;

  let lx = p.lx, lyy = ly, rx = p.rx, ryy = ry;
  let hipX = p.bx, hipYOff = 0, lean = 0;
  // scie multiple del gesto (comete) + particelle d'impatto al colpo
  const trail = [];
  if (action === 'tendi') {
    // braccio destro teso in alto-avanti: offerta
    rx += 7 * actK; ryy -= 9 * actK; lx -= 1 * actK;
    hipYOff = -2 * actK; lean = -0.35 * actK;
    for (let i = 1; i <= 4; i++) trail.push([p.rx + 7 * actK * (1 - i * 0.18), ly - 9 * actK * (1 - i * 0.18) + i * 1.6, i]);
  } else if (action === 'spingi') {
    // spinta in basso-avanti: torso che si torce, gamba che spinge
    rx += 9 * actK; ryy += 6 * actK; lx -= 3 * actK;
    hipX += 3 * actK; hipYOff = 1 * actK; lean = 0.5 * actK;
    for (let i = 1; i <= 4; i++) trail.push([p.rx + 9 * actK * (1 - i * 0.15), ly + 6 * actK * (1 - i * 0.15) + i * 1.4, i]);
  }

  // corpo: 2 passate sole (contorno scuro netto + corpo acceso). Niente aloni
  // multipli: con il bloom diventavano un blob illeggibile.
  const col = actK > 0.1 ? C.redHot : C.redBright;
  drawClimber(ctx, lx, lyy, rx, ryy, { color: C.black, phase: ph, thickness: 3, h: 22, bx: hipX, by: byc + hipYOff, swing });
  drawClimber(ctx, lx, lyy, rx, ryy, { color: col, phase: ph, thickness: 2, h: 22,
    bx: hipX, by: byc + hipYOff, swing, breathe, detail: true, rim: true, lean });

  // scie del gesto
  if (trail.length) {
    ctx.save();
    ctx.fillStyle = action === 'spingi' ? C.redHot : C.red;
    for (const [tx0, ty0, i] of trail) {
      ctx.globalAlpha = 0.55 * actK * (1 - i / 5);
      ctx.fillRect(Math.round(tx0) - 1, Math.round(ty0) - 1, 2, 2);
    }
    ctx.restore();
  }

  // impatto al culmine del gesto: particelle di colpo (quadrati rossi dal centro)
  if (actK > 0.7) {
    const k = (actK - 0.7) / 0.3;
    ctx.save();
    ctx.globalAlpha = 0.7 * k;
    ctx.fillStyle = C.redHot;
    const ox = action === 'tendi' ? rx : rx, oy = action === 'tendi' ? ryy - 4 : ryy;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + time;
      ctx.fillRect(Math.round(ox + Math.cos(a) * (4 + 5 * k)), Math.round(oy + Math.sin(a) * (4 + 5 * k)), 1, 1);
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// INCONTRI — ogni tipo ha il suo GESTO, leggibile e diverso dagli altri.
// ---------------------------------------------------------------------------
const ENC_STATE = {
  hand: 'reach', rival: 'climb', falling: 'fall', sleeper: 'idle', siren: 'tendi',
  pusher: 'push', fake: 'idle', self: 'climb', chorus: 'scream',
  helper: 'tendi', grabber: 'spingi',
};

export function drawEncounter(ctx, e, climb, cameraY, time, isActive) {
  const x = climb.xOf(e.c);
  const y = climb.yOf(e.row) - cameraY;
  if (y < -24 || y > ART_VIEW_H + 24) return;
  const st = ENC_STATE[e.kind] || 'idle';
  const feetY = y + 6;

  if (e.resolved) {
    // REAZIONE: per ~0.8s dopo la scelta, la figura mostra chiaramente cosa è
    // successo (ti ha tirato su / è stata spinta giù).
    if (e.reactT && e.reactT > 0) {
      const rk = Math.min(1, (0.8 - e.reactT) / 0.3);   // 0→1 rapido
      if (e.reactVerb === 'tendi') {
        // ti tende la mano e ti tira: figura che si allunga verso l'alto
        ctx.save();
        ctx.globalAlpha = 0.9;
        drawFigure(ctx, x, feetY - rk * 6, { h: 18, color: C.redHot, state: 'tendi', phase: time * 4, detail: true, rim: true });
        // scia verso di te
        ctx.fillStyle = C.redHot;
        for (let i = 1; i <= 4; i++) { ctx.globalAlpha = 0.6 * (1 - i / 5); ctx.fillRect(Math.round(x - i * 4), Math.round(feetY - 12 - rk * 6), 2, 2); }
        ctx.restore();
      } else {
        // spinto giù: scivola verso il basso e svanisce
        const slide = rk * 26;
        ctx.save();
        ctx.globalAlpha = 0.9 * (1 - rk * 0.6);
        drawFigure(ctx, x, feetY + slide, { h: 18, color: C.redDark, state: 'fall', phase: time * 5, detail: false });
        ctx.restore();
      }
      return;
    }
    const pushed = e.verb === 'spingi';
    if (pushed) {
      const slide = Math.min(40, ((time * 30) % 60));
      drawFigure(ctx, x, feetY + slide, { h: 15, color: C.redDark, state: 'fall', phase: time * 4, alpha: 0.35 });
    } else {
      drawFigure(ctx, x, feetY, { h: 15, color: C.redDark, state: 'idle', phase: time * 1.5, alpha: 0.35 });
    }
    return;
  }

  const col = isActive ? C.redHot : C.redBright;
  const ph = time * (st === 'idle' ? 1.6 : 2.6);
  // alone quando è l'incontro attivo (sta per accadere qualcosa)
  if (isActive) {
    ctx.save();
    ctx.globalAlpha = 0.14 + 0.10 * Math.sin(time * 6);
    drawFigure(ctx, x, feetY, { h: 20, color: C.redHot, state: st, phase: ph, thickness: 4 });
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time * 8);
    ctx.fillStyle = C.redHot;
    ctx.fillRect(Math.round(x) - 7, Math.round(y) - 2, 14, 1);
    ctx.fillRect(Math.round(x) - 7, Math.round(y) + 8, 14, 1);
    ctx.restore();
  }
  // figura dettagliata + GESTO specifico del tipo
  drawFigure(ctx, x, feetY, { h: 18, color: col, state: st, phase: ph, detail: true, rim: true });
  drawEncounterFlourish(ctx, e.kind, x, feetY, time, isActive);
}

// Extra visivo per rendere ogni tipo di incontro immediatamente riconoscibile.
function drawEncounterFlourish(ctx, kind, x, y, time, isActive) {
  const k = isActive ? 1 : 0.55;
  ctx.save();
  ctx.globalAlpha = k;
  if (kind === 'hand' || kind === 'chorus') {
    // mano/mani tese verso di te (punto acceso)
    ctx.fillStyle = C.redHot;
    const ox = 6 + Math.sin(time * 3) * 1.5;
    ctx.fillRect(Math.round(x + ox), Math.round(y - 12), 2, 2);
    ctx.fillRect(Math.round(x + ox + 2), Math.round(y - 14), 1, 1);
  } else if (kind === 'rival') {
    // freccia di sorpasso che sale
    ctx.fillStyle = C.red;
    const oy = 8 * ((time * 0.8) % 1) - 4;
    ctx.fillRect(Math.round(x + 7), Math.round(y - 6 - oy), 3, 1);
    ctx.fillRect(Math.round(x + 9), Math.round(y - 7 - oy), 1, 3);
  } else if (kind === 'falling') {
    // scia di caduta verso il basso
    ctx.fillStyle = C.redDark;
    for (let i = 1; i <= 5; i++) ctx.fillRect(Math.round(x), Math.round(y + i * 3), 1, 1);
  } else if (kind === 'sleeper') {
    // "zZ" del sonno
    ctx.fillStyle = C.red;
    const off = (time * 6) % 10;
    ctx.fillRect(Math.round(x + 8), Math.round(y - 16 - off), 3, 1);
    ctx.fillRect(Math.round(x + 9), Math.round(y - 14 - off), 1, 1);
    ctx.fillRect(Math.round(x + 8), Math.round(y - 13 - off), 3, 1);
  } else if (kind === 'siren') {
    // onde concentriche (canto ammaliatore)
    ctx.fillStyle = C.redHot;
    for (let i = 1; i <= 3; i++) {
      const r = i * 3 + (time * 8) % 3;
      ctx.globalAlpha = k * (0.5 - i * 0.12);
      ctx.fillRect(Math.round(x - r), Math.round(y - 12), 1, 1);
      ctx.fillRect(Math.round(x + r), Math.round(y - 12), 1, 1);
    }
  } else if (kind === 'pusher') {
    // spinta verso il basso (impatto)
    ctx.fillStyle = C.redHot;
    const oy = (time * 10) % 6;
    ctx.fillRect(Math.round(x), Math.round(y - 18 + oy), 4, 1);
    ctx.fillRect(Math.round(x + 1), Math.round(y - 17 + oy), 2, 1);
  } else if (kind === 'fake') {
    // doppio contorno tremolante (illusione)
    if (Math.sin(time * 12) > 0) {
      ctx.globalAlpha = k * 0.5;
      drawFigure(ctx, x + 2, y, { h: 18, color: C.redDark, state: 'idle', phase: time * 2 });
    }
  } else if (kind === 'self') {
    // specchio: figura identica ribaltata
    ctx.globalAlpha = k * 0.5;
    drawFigure(ctx, x - 12, y, { h: 18, color: C.redDark, state: 'climb', phase: time * 2, facing: -1 });
  } else if (kind === 'helper') {
    // mano tesa verso di te, luminosa (ti tira su)
    ctx.globalAlpha = k;
    ctx.fillStyle = C.white;
    const oy = Math.sin(time * 4) * 2;
    ctx.fillRect(Math.round(x + 5), Math.round(y - 13 + oy), 3, 3);
    ctx.fillStyle = C.redHot;
    ctx.fillRect(Math.round(x + 8), Math.round(y - 14 + oy), 2, 2);
  } else if (kind === 'grabber') {
    // artiglio che ti afferra (dita chiuse, vibra)
    ctx.globalAlpha = k;
    ctx.fillStyle = C.redHot;
    const gx = Math.sin(time * 18) * 1;
    for (let i = -1; i <= 1; i++) ctx.fillRect(Math.round(x + gx), Math.round(y - 12 + i * 3), 3, 2);
    ctx.fillRect(Math.round(x - 2 + gx), Math.round(y - 14), 7, 2);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// POTENZIAMENTI — un appiglio speciale che brilla sulla parete (aiuto raccoglibile).
// ---------------------------------------------------------------------------
export function drawPickup(ctx, pk, climb, cameraY, time) {
  if (pk.taken) return;
  const x = climb.xOf(pk.c), y = climb.yOf(pk.r) - cameraY;
  if (y < -20 || y > ART_VIEW_H + 20) return;
  const pulse = 0.5 + 0.5 * Math.sin(time * 4 + pk.phase);
  ctx.save();
  // alone caldo
  ctx.globalAlpha = 0.10 + 0.14 * pulse;
  ctx.fillStyle = C.redHot;
  ctx.fillRect(Math.round(x - 9), Math.round(y - 9), 18, 18);
  // il "nodo" luminoso (una presa d'oro rosso)
  ctx.globalAlpha = 0.6 + 0.4 * pulse;
  const r = 2 + Math.round(pulse);
  for (let yy = -r; yy <= r; yy++)
    for (let xx = -r; xx <= r; xx++)
      if (xx * xx + yy * yy <= r * r + 1) ctx.fillRect(Math.round(x + xx), Math.round(y + yy), 1, 1);
  // scintille a croce
  ctx.globalAlpha = 0.8;
  ctx.fillRect(Math.round(x) - 6, Math.round(y), 12, 1);
  ctx.fillRect(Math.round(x), Math.round(y) - 6, 1, 12);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// MESSAGGIO EVENTO — cosa ti è successo (ostacolo/aiuto), in basso.
// ---------------------------------------------------------------------------
export function drawThreatMsg(ctx, msg, W, H) {
  if (!msg) return;
  ctx.save();
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = C.black; ctx.fillText(msg.toUpperCase(), W / 2 + 1, H - 20);
  ctx.fillStyle = C.redHot; ctx.fillText(msg.toUpperCase(), W / 2, H - 21);
  ctx.restore();
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// MASH — barra del minigioco di lotta: riempila martellando prima che scada.
// ---------------------------------------------------------------------------
export function drawMash(ctx, m, W, H) {
  if (!m || (!m.active && !m.won && !m.lost)) return;
  const bw = 120, bh = 8, bx = (W - bw) / 2, by = H - 34;
  ctx.save();
  // cornice
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = C.black; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
  ctx.fillStyle = C.redDeep; ctx.fillRect(bx, by, bw, bh);
  // barra che si riempie (pulsante)
  const r = Math.max(0, Math.min(1, m.progress));
  const pulse = 0.7 + 0.3 * Math.abs(Math.sin((m.hits || 0) * 1.1));
  ctx.globalAlpha = pulse;
  ctx.fillStyle = r > 0.66 ? C.redHot : C.redBright;
  ctx.fillRect(bx, by, Math.round(bw * r), bh);
  // tacca del traguardo
  ctx.globalAlpha = 0.9; ctx.fillStyle = C.white;
  ctx.fillRect(bx + bw - 2, by - 2, 2, bh + 4);
  // messaggio
  ctx.globalAlpha = 1;
  ctx.font = '7px monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = C.black; ctx.fillText('TI AFFERRA — MARTELLA!', W / 2 + 1, by - 6);
  ctx.fillStyle = m.won ? C.redHot : m.lost ? C.redDark : C.white;
  ctx.fillText('TI AFFERRA — MARTELLA!', W / 2, by - 7);
  ctx.restore();
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// SKYLINE — strati di silhouette in parallasse: danno profondità e scala alla
// salita. Un palazzo/pendio alla volta, dal più lontano al più vicino.
// ---------------------------------------------------------------------------
export function drawSkyline(ctx, audioId, camY, time, W, H, beat) {
  const bt = Number.isFinite(beat) ? beat : 0;
  const seed = String(audioId || '').split('').reduce((a, ch) => (a + ch.charCodeAt(0)) % 97, 7);
  const layers = [
    { f: 0.12, col: C.redDeep, base: 0.86, h: 22, step: 26, al: 0.5 + 0.08 * bt },
    { f: 0.25, col: C.redDeep, base: 0.95, h: 34, step: 34, al: 0.34 + 0.06 * bt },
    { f: 0.42, col: C.redDark, base: 1.05, h: 46, step: 44, al: 0.2 + 0.05 * bt },
  ];
  ctx.save();
  for (let li = 0; li < layers.length; li++) {
    const L = layers[li];
    const baseY = H * L.base - ((camY * L.f) % (H + 80)) + 40;
    ctx.globalAlpha = L.al;
    ctx.fillStyle = L.col;
    // profilo a denti di sega / tetti
    let i = 0;
    for (let x = -10; x < W + 10; x += L.step, i++) {
      const hh = L.h + ((seed + i * 7) % 5) * 3;
      const ww = L.step - 2;
      ctx.fillRect(Math.round(x), Math.round(baseY - hh), ww, Math.round(hh + 30));
      // antenna/cippo
      if ((seed + i) % 3 === 0) ctx.fillRect(Math.round(x + ww / 2), Math.round(baseY - hh - 5), 1, 6);
    }
    ctx.fillRect(0, Math.round(baseY), W, Math.round(H - baseY + 30));
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// LIRICHE KARAOKE — la frase appare quando viene CANTATA; le PAROLE si accendono
// una a una man mano che la canzone le dice (evidenza progressiva + glow).
// `karaoke` = [[inizio, fine, frase], ...]; `pos` = posizione audio in secondi.
// ---------------------------------------------------------------------------
export function drawKaraoke(ctx, karaoke, pos, time, W, H) {
  if (!karaoke || !karaoke.length) return;
  let idx = -1;
  for (let i = 0; i < karaoke.length; i++) if (pos >= karaoke[i][0]) idx = i;
  if (idx < 0) idx = 0;
  const [t0, t1, text] = karaoke[idx];
  const next = karaoke[idx + 1];
  const size = Math.max(7, Math.min(13, Math.floor((W * 0.92) / Math.max(1, text.length * 0.6))));
  const cw = size * 0.6;                 // larghezza carattere
  const totalW = text.length * cw;
  const x0 = W / 2 - totalW / 2;
  const y = H * 0.36;
  const k = t1 > t0 ? (pos - t0) / (t1 - t0) : 1;      // 0..1 nella frase
  const sung = Math.min(text.length, Math.max(0, Math.ceil(k * text.length)));
  const beat = 0.5 + 0.5 * Math.sin(time * 5);

  ctx.save();
  ctx.textAlign = 'left';
  // eco delle righe precedenti (fantasmi in alto)
  for (let i = Math.max(0, idx - 2); i < idx; i++) {
    ctx.globalAlpha = 0.10 * (i - idx + 3);
    drawCentered(ctx, karaoke[i][2], W / 2, y - (idx - i) * 12, time, 7);
  }
  // banda scura per leggibilità
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = C.black;
  ctx.fillRect(0, y - size, W, size + 10);
  // parola per parola: le cantate sono accese, la corrente pulsa, le future spente
  ctx.font = size + 'px monospace';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') continue;
    const px = x0 + i * cw;
    const isSung = i < sung;
    const isCur = i === sung - 1;
    const jitterY = isSung ? 0 : Math.sin(time * 4 + i * 0.9) * 0.5;
    // ombra
    ctx.globalAlpha = 0.9; ctx.fillStyle = C.black;
    ctx.fillText(ch, px + 1, y + jitterY + 1);
    if (isSung) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = isCur ? C.white : (i % 6 === 0 ? C.redHot : C.red);
      ctx.fillText(ch, px, y + jitterY);
    } else {
      ctx.globalAlpha = 0.35;                       // non ancora cantata: spenta
      ctx.fillStyle = C.redDark;
      ctx.fillText(ch, px, y + jitterY);
    }
  }
  // cursore luminoso sotto la sillaba corrente
  if (sung > 0 && sung <= text.length) {
    const cx = x0 + sung * cw;
    ctx.globalAlpha = 0.5 + 0.5 * beat;
    ctx.fillStyle = C.redHot;
    ctx.fillRect(Math.round(cx), y + 3, 1, 4);
  }
  // barra di avanzamento della frase
  ctx.globalAlpha = 0.35 + 0.35 * beat;
  ctx.fillStyle = C.red;
  ctx.fillRect(x0, y + 7, totalW * Math.min(1, k), 1);
  // prossima riga in eco
  if (next) { ctx.globalAlpha = 0.13; drawCentered(ctx, next[2], W / 2, y + 24, time, 7); }
  ctx.restore();
  ctx.textAlign = 'left';
}

// Testo centrato con tremolio (per le righe fantasma).
function drawCentered(ctx, text, cx, cy, time, size) {
  const cw = size * 0.6;
  let x = cx - (text.length * cw) / 2;
  ctx.font = size + 'px monospace';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== ' ') ctx.fillText(ch, x, cy + Math.sin(time * 4 + i * 0.9) * 0.5);
    x += cw;
  }
}

// ---------------------------------------------------------------------------
// CHAPTER CARD — titolo del brano che "sbatte" dentro all'inizio del girone.
// ---------------------------------------------------------------------------
export function drawChapterCard(ctx, title, k, W, H) {
  if (k <= 0) return;
  const ease = 1 - Math.pow(1 - Math.min(1, k * 2), 3);   // entra rapido
  const slide = (1 - ease) * 30;
  ctx.save();
  // banda scura diagonale
  ctx.globalAlpha = 0.7 * Math.min(1, k * 3);
  ctx.fillStyle = C.black;
  ctx.fillRect(0, H * 0.42, W, 30);
  ctx.globalAlpha = 0.5 * Math.min(1, k * 3);
  ctx.fillStyle = C.redDeep;
  ctx.fillRect(0, H * 0.42, W, 1);
  ctx.fillRect(0, H * 0.42 + 29, W, 1);
  // titolo
  const size = Math.max(11, Math.min(22, Math.floor((W * 0.9) / Math.max(1, title.length * 0.62))));
  ctx.font = size + 'px monospace';
  ctx.textAlign = 'center';
  const tw = title.length * size * 0.62;
  ctx.globalAlpha = Math.min(1, k * 2.5) * 0.8;
  ctx.fillStyle = C.black; ctx.fillText(title, W / 2 + 1 - slide, H * 0.42 + 21 + 1);
  ctx.globalAlpha = Math.min(1, k * 2.5);
  ctx.fillStyle = C.redHot; ctx.fillText(title, W / 2 - slide, H * 0.42 + 21);
  // freccia/dettaglio
  ctx.globalAlpha = Math.min(1, k * 2) * 0.6;
  ctx.fillStyle = C.red;
  ctx.fillRect(W / 2 - tw / 2 - slide, H * 0.42 + 25, tw, 1);
  ctx.restore();
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// FLOW METER — barra che sale scalando in ritmo (intensifica i visual).
// ---------------------------------------------------------------------------
export function drawFlow(ctx, ratio, beat, W, H) {
  if (ratio <= 0.01) return;
  const bw = 60, bh = 3, bx = W / 2 - bw / 2, by = H - 10;
  ctx.save();
  ctx.globalAlpha = 0.4 + 0.4 * beat;
  ctx.fillStyle = C.black; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
  ctx.fillStyle = ratio > 0.66 ? C.redHot : C.red;
  ctx.fillRect(bx, by, Math.round(bw * ratio), bh);
  if (ratio > 0.66) {
    ctx.globalAlpha = 0.6 * beat;
    ctx.fillStyle = C.white;
    ctx.fillRect(bx + Math.round(bw * ratio) - 1, by - 1, 1, bh + 2);
  }
  ctx.restore();
}

// ============================================================================
// OVERLAY UI — testo a RISOLUZIONE PIENA (nitido, non sgranato).
// Si disegna DOPO la scena pixel art, sul canvas visibile, scalando le
// coordinate logiche per S. I font sono veri (non pixel art), quindi leggibili.
// ============================================================================
function uiFont(ctx, size, S) { ctx.font = 'bold ' + Math.round(size * S) + 'px "Consolas","Courier New",monospace'; }
function uiText(ctx, txt, x, y, S, color, alpha) {
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.fillStyle = color;
  ctx.fillText(txt, Math.round(x * S), Math.round(y * S));
}
// Testo con ombra netta (1px logico): look pixel senza sgranare.
function uiTextShadow(ctx, txt, x, y, S, color, alpha) {
  ctx.globalAlpha = (alpha == null ? 1 : alpha) * 0.85;
  ctx.fillStyle = C.black;
  ctx.fillText(txt, Math.round(x * S) + S, Math.round(y * S) + S);
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.fillStyle = color;
  ctx.fillText(txt, Math.round(x * S), Math.round(y * S));
}
function uiRect(ctx, x, y, w, h, S, color, alpha) {
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x * S), Math.round(y * S), Math.round(w * S), Math.round(h * S));
}

// Lirica estetica di SFONDO: una riga grande, soffusa, che fluttua; si rinnova
// quando la canzone passa alla frase successiva. Non è karaoke: è atmosfera.
export function drawLyricBackdrop(ctx, lines, pos, time, W, H, S) {
  if (!lines || !lines.length) return;
  let idx = 0;
  for (let i = 0; i < lines.length; i++) if (pos >= lines[i][0]) idx = i;
  const text = lines[idx][2] != null ? lines[idx][2] : lines[idx][1];
  const prev = idx > 0 ? (lines[idx - 1][2] != null ? lines[idx - 1][2] : lines[idx - 1][1]) : null;
  uiFont(ctx, 20, S);
  ctx.save();
  ctx.textAlign = 'center';
  // riga precedente, fantasma in alto
  if (prev) uiText(ctx, prev, W / 2, H * 0.20 - 6, S, C.redDeep, 0.16);
  // riga attiva: ondeggia leggermente, lettera per lettera
  const y = H * 0.30 + Math.sin(time * 0.7) * 2;
  const total = ctx.measureText(text).width;
  let x = W / 2 * S - total / 2;
  uiFont(ctx, 20, S);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const wob = Math.sin(time * 1.1 + i * 0.35) * 1.5;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = C.red;
    ctx.fillText(ch, x, (y + wob) * S);
    x += ctx.measureText(ch).width;
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

// Disegna TUTTO il testo/HUD a risoluzione piena.
export function drawUIOverlay(ctx, S, W, H, o) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // lirica di sfondo (atmosfera) — PIXEL ART, non nitida
  if (o.lyricLines) { /* disegnata nella scena, non qui */ }

  // iscrizione in alto a sinistra (titolo brano)
  uiFont(ctx, 8, S);
  uiTextShadow(ctx, o.inscription || '', 12, 13, S, C.redHot, 1);
  uiRect(ctx, 12, 15, (o.inscription || '').length * 4.8, 0.6, S, C.red, 0.9);

  // messaggio evento (basso centro)
  if (o.threatMsg) {
    uiFont(ctx, 8, S);
    ctx.textAlign = 'center';
    uiTextShadow(ctx, o.threatMsg.toUpperCase(), W / 2, H - 30, S, C.redHot, 1);
    ctx.textAlign = 'left';
  }

  // chapter card (banda centrale)
  if (o.chapterT > 0) {
    const k = 1 - Math.min(1, o.chapterT / 1.4);
    const ease = 1 - Math.pow(1 - Math.min(1, k * 2.2), 3);
    const slide = (1 - ease) * 40;
    uiRect(ctx, 0, H * 0.40, W, 30, S, C.black, 0.72 * Math.min(1, k * 3));
    uiRect(ctx, 0, H * 0.40, W, 1, S, C.red, 0.6 * Math.min(1, k * 3));
    uiRect(ctx, 0, H * 0.40 + 29, W, 1, S, C.red, 0.6 * Math.min(1, k * 3));
    uiFont(ctx, 17, S);
    ctx.textAlign = 'center';
    uiTextShadow(ctx, o.chapterTitle, W / 2 - slide, H * 0.40 + 21, S, C.redHot, Math.min(1, k * 2.5));
    ctx.textAlign = 'left';
  }

  // prompt incontro (sopra la barra bassa)
  if (o.prompt) {
    uiFont(ctx, 8, S);
    ctx.textAlign = 'center';
    uiTextShadow(ctx, o.prompt, W / 2, H - 20, S, C.white, o.promptK || 1);
    ctx.textAlign = 'left';
  }

  // flow meter (barra in basso)
  if (o.flow > 0.01) {
    const bw = 80, bh = 3, bx = W / 2 - bw / 2, by = H - 16;
    uiRect(ctx, bx - 1, by - 1, bw + 2, bh + 2, S, C.black, 0.5);
    uiRect(ctx, bx, by, bw * o.flow, bh, S, o.flow > 0.66 ? C.redHot : C.red, 0.55 + 0.45 * (o.beat || 0));
  }

  // mash (barra della lotta)
  if (o.mash && (o.mash.active || o.mash.won || o.mash.lost)) {
    const bw = 120, bh = 8, bx = W / 2 - bw / 2, by = H - 40;
    uiRect(ctx, bx - 2, by - 2, bw + 4, bh + 4, S, C.black, 0.85);
    uiRect(ctx, bx, by, bw, bh, S, C.redDeep, 1);
    const r = Math.max(0, Math.min(1, o.mash.progress));
    uiRect(ctx, bx, by, bw * r, bh, S, r > 0.66 ? C.redHot : C.redBright, 0.7 + 0.3 * Math.abs(Math.sin((o.mash.hits || 0) * 1.1)));
    uiRect(ctx, bx + bw - 2, by - 2, 2, bh + 4, S, C.white, 0.9);
    uiFont(ctx, 9, S);
    ctx.textAlign = 'center';
    uiText(ctx, 'TI AFFERRA — MARTELLA!', W / 2 + 1, by - 7 + 1, S, C.black, 0.9);
    uiText(ctx, 'TI AFFERRA — MARTELLA!', W / 2, by - 7, S, C.white, 1);
    ctx.textAlign = 'left';
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

// Lirica di sfondo in PIXEL ART (coerente col mondo, non nitida): riga soffusa
// che fluttua e si rinnova quando la canzone passa alla frase successiva.
export function drawLyricsPixel(ctx, lines, pos, time, W, H) {
  if (!lines || !lines.length) return;
  let idx = 0;
  for (let i = 0; i < lines.length; i++) if (pos >= lines[i][0]) idx = i;
  const cur = lines[idx];
  const text = cur[2] != null ? cur[2] : cur[1];
  const prev = idx > 0 ? (lines[idx - 1][2] != null ? lines[idx - 1][2] : lines[idx - 1][1]) : null;
  const size = Math.max(8, Math.min(14, Math.floor((W * 0.92) / Math.max(1, text.length * 0.6))));
  const y = H * 0.30 + Math.sin(time * 0.7) * 2;
  ctx.save();
  ctx.textAlign = 'center';
  if (prev) drawVert(ctx, prev, W / 2, y - 14, time, 0.10, 8, 0);
  // banda scura soffusa per staccare
  ctx.globalAlpha = 0.20;
  ctx.fillStyle = C.black;
  ctx.fillRect(0, y - size, W, size + 8);
  // riga attiva, tremolio lettera per lettera, tenue (atmosfera)
  const cw = size * 0.6;
  let x = W / 2 - (text.length * cw) / 2;
  ctx.font = size + 'px monospace';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const wob = Math.sin(time * 1.1 + i * 0.35) * 0.8;
    if (ch !== ' ') {
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = C.black; ctx.fillText(ch, x + 1, y + wob + 1);
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = i % 7 === 0 ? C.redHot : C.red;
      ctx.fillText(ch, x, y + wob);
    }
    x += cw;
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// ISCRIZIONE
// ---------------------------------------------------------------------------
export function drawInscription(ctx, text, W) {
  ctx.font = '7px monospace';
  ctx.fillStyle = C.black; ctx.fillText(text, 9, 11);
  ctx.fillStyle = C.redHot; ctx.fillText(text, 8, 10);
  ctx.fillStyle = C.red; ctx.fillRect(8, 13, Math.round(ctx.measureText(text).width), 1);
}

// ---------------------------------------------------------------------------
// TITOLO — la cover animata: piramide di figure che si arrampicano.
// ---------------------------------------------------------------------------
export function drawTitle(ctx, W, H, time) {
  ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);

  // PIRAMIDE COMPLETA — dalla base larga alla PUNTA di un solo corpo.
  const cx = W / 2, rows = 11, baseY = H - 6, stepY = 10;
  const baseSpan = 150;
  for (let row = 0; row < rows; row++) {
    const y = baseY - row * stepY;
    const t = row / (rows - 1);                 // 0 base → 1 punta
    const span = baseSpan * (1 - t) + 7;        // si restringe fino a ~1 corpo
    const count = Math.max(1, Math.round(span / 8));
    for (let i = 0; i < count; i++) {
      const x = count === 1 ? cx : cx - span / 2 + (i * span) / (count - 1);
      // la punta è una figura che si arrampica/raggiunge in cima
      const st = row === 0 ? 'climb'
        : row >= rows - 2 ? 'reach'
        : (i % 4 === 0) ? 'reach' : (i % 5 === 0) ? 'climb' : 'idle';
      const ph = time * 1.8 + i * 1.3 + row * 0.7;
      const col = depthRed(0.45 + t * 0.55);
      drawFigure(ctx, x, y, { h: 14, color: col, state: st, phase: ph, facing: i % 2 ? 1 : -1 });
    }
  }
  const grad = ctx.createLinearGradient(0, 0, 0, H * 0.5);
  grad.addColorStop(0, 'rgba(0,0,0,0.95)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H * 0.5);
}

// Testo del titolo a RISOLUZIONE PIENA (nitido).
export function drawTitleText(ctx, W, H, time, S) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = 'center';
  // VOX POPULI con ombra e leggerissima pulsazione
  uiFont(ctx, 26, S);
  const pulse = 1 + Math.sin(time * 2) * 0.01;
  ctx.save();
  ctx.translate(W / 2 * S, 40 * S); ctx.scale(pulse, pulse); ctx.translate(-W / 2 * S, -40 * S);
  uiText(ctx, 'VOX POPULI', W / 2 + 1.5, 40 + 1.5, S, C.black, 0.95);
  uiText(ctx, 'VOX POPULI', W / 2, 40, S, C.redHot, 1);
  ctx.restore();
  uiFont(ctx, 9, S);
  uiText(ctx, 'I  T R E D I C I  G I R O N I', W / 2, 53, S, C.red, 0.9);
  uiRect(ctx, W / 2 - 40, 57, 80, 0.6, S, C.red, 0.8);
  if (Math.sin(time * 3) > -0.3) uiText(ctx, 'premi SPAZIO  ·  tocca ▲  per iniziare', W / 2, 74, S, C.white, 1);
  uiFont(ctx, 8, S);
  uiText(ctx, 'MOTUS — concept album · 13 tracce', W / 2, 88, S, C.redDark, 1);
  ctx.restore();
  ctx.textAlign = 'left';
}


