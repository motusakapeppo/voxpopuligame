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
// PARETE — la superficie della piramide: roccia scura (i "mattoni") che sono
// anche corpi. Gli appigli sono teste di persone che emergono dalla parete.
// ---------------------------------------------------------------------------
export function drawWall(ctx, g, cameraY, time, W, H) {
  const bodies = g.bodies;
  for (const b of bodies) {
    const top = Math.round(b.y - cameraY);
    if (top < -30 || top > H + 30) continue;
    // fascia di pietra (la massa di corpi): corpo scuro + bordo rosso superiore
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = C.redDeep;
    ctx.fillRect(Math.round(b.x), top, Math.round(b.w), 4);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = C.redDark;
    ctx.fillRect(Math.round(b.x), top, Math.round(b.w), 1);      // bordo acceso
    ctx.globalAlpha = 1;

    // gli appigli: teste di persone che emergono, varietà e respiro
    const step = 18;
    for (let x = b.x + 5; x < b.x + b.w - 3; x += step) {
      const ph = time * 1.5 + (x + b.y) * 0.13;
      const bob = Math.round(Math.sin(ph) * 0.6);
      const s = Math.sin(ph * 1.7);
      const state = s > 0.6 ? 'reach' : s < -0.6 ? 'idle' : 'climb';
      const col = depthRed(0.25 + 0.3 * (0.5 + 0.5 * Math.sin(ph * 0.7)));
      drawFigure(ctx, x, top + 2 + bob, { h: 12, color: col, state, phase: ph, facing: 1 });
    }
  }
  // accenti: figure più grandi che emergono dalla parete (teste sporgenti).
  // Posa NON verticale: con il bloom un braccio dritto in su diventa una barra.
  const r = rng(91);
  for (let i = 0; i < 5; i++) {
    const x = r() * W;
    const y = ((r() * H * 3 - cameraY * 1.0) % (H * 3) + H * 3) % (H * 3) - H;
    if (y < -20 || y > H + 20) continue;
    const ph = time * 1.2 + i * 2.1;
    const st = r() > 0.5 ? 'idle' : 'climb';
    drawFigure(ctx, x, y, { h: 17, color: C.redDeep, state: st, phase: ph, alpha: 0.4, facing: r() > 0.5 ? 1 : -1 });
  }
}


// ---------------------------------------------------------------------------
// GIOCATORE — appeso alla parete (arrampicata).
// ---------------------------------------------------------------------------
export function drawPlayer(ctx, cl, cameraY, time, action) {
  const p = climbPos(cl);
  const ly = p.ly - cameraY, ry = p.ry - cameraY;
  const ph = time;
  // presa tesa mentre ci si tira su (reach), respiro a riposo
  const reachK = cl.reach > 0 && cl.reachDur ? Math.max(0, cl.reach / cl.reachDur) : 0;
  const breathe = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(time * 2));
  // alone caldo pulsante (ti fa trovare a colpo d'occhio)
  ctx.save();
  ctx.globalAlpha = 0.16 + 0.08 * Math.sin(time * 5);
  drawClimber(ctx, p.lx, ly, p.rx, ry, { color: C.redHot, phase: ph, thickness: 3, h: 19 });
  ctx.restore();
  // contorno scuro sottile + corpo acceso con dettagli (chele, ciuffo, rim)
  drawClimber(ctx, p.lx, ly, p.rx, ry, { color: C.black, phase: ph, thickness: 3, h: 19 });
  const col = (action === 'tendi' || action === 'spingi') ? C.redHot : C.redBright;
  drawClimber(ctx, p.lx, ly, p.rx, ry, { color: col, phase: ph, thickness: 1, h: 19,
    breathe, grip: reachK > 0 ? 1 : 0.7, detail: true, rim: true });
  // mani evidenziate: dove sei aggrappato
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = C.white;
  ctx.fillRect(Math.round(p.lx) - 1, Math.round(ly) - 1, 3, 3);
  ctx.fillRect(Math.round(p.rx) - 1, Math.round(ry) - 1, 3, 3);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// INCONTRI
// ---------------------------------------------------------------------------
const ENC_STATE = {
  hand: 'reach', rival: 'climb', falling: 'fall', sleeper: 'idle', siren: 'tendi',
  pusher: 'push', fake: 'idle', self: 'climb', chorus: 'scream',
};

export function drawEncounter(ctx, e, climb, cameraY, time, isActive) {
  const x = climb.xOf(e.c);
  const y = climb.yOf(e.row) - cameraY;
  if (y < -24 || y > ART_VIEW_H + 24) return;
  const st = ENC_STATE[e.kind] || 'idle';
  const feetY = y + 6;

  if (e.resolved) {
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
    // cornice lampeggiante sull'appiglio
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time * 8);
    ctx.fillStyle = C.redHot;
    ctx.fillRect(Math.round(x) - 7, Math.round(y) - 2, 14, 1);
    ctx.fillRect(Math.round(x) - 7, Math.round(y) + 8, 14, 1);
    ctx.restore();
  }
  // figura dettagliata (chele/ciuffo/rim) e con respiro
  drawFigure(ctx, x, feetY, { h: 18, color: col, state: st, phase: ph, detail: true, rim: true });
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

  const cx = W / 2, rows = 7, baseY = H - 8;
  for (let row = 0; row < rows; row++) {
    const y = baseY - row * 11;
    const span = 116 - row * 11;
    const count = Math.max(1, Math.round(span / 9));
    for (let i = 0; i < count; i++) {
      const x = cx - span / 2 + (i * span) / Math.max(1, count);
      const st = row === 0 ? 'climb' : (i % 4 === 0) ? 'reach' : (i % 5 === 0) ? 'climb' : 'idle';
      const ph = time * 1.8 + i * 1.3 + row * 0.7;
      const col = depthRed(0.4 + (row / rows) * 0.5);
      drawFigure(ctx, x, y, { h: 15 + row * 0.4, color: col, state: st, phase: ph, facing: i % 2 ? 1 : -1 });
    }
  }
  const grad = ctx.createLinearGradient(0, 0, 0, H * 0.5);
  grad.addColorStop(0, 'rgba(0,0,0,0.95)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H * 0.5);

  ctx.font = '20px monospace';
  ctx.fillStyle = C.black;  ctx.fillText('VOX POPULI', 93, 45);
  ctx.fillStyle = C.redHot; ctx.fillText('VOX POPULI', 92, 44);
  ctx.font = '7px monospace';
  ctx.fillStyle = C.red;    ctx.fillText('I  T R E D I C I  G I R O N I', 122, 58);
  ctx.fillRect(122, 62, 76, 1);
  if (Math.sin(time * 3) > -0.3) { ctx.fillStyle = C.white; ctx.fillText('premi SPAZIO  ·  tocca ▲  per iniziare', 44, 78); }
  ctx.fillStyle = C.redDark; ctx.fillText('MOTUS — concept album · 13 tracce', 68, 92);
}

