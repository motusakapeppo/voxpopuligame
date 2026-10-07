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
export function drawWall(ctx, g, climb, cameraY, time, W, H) {
  const cx = climb.cx, rows = climb.rows, nRows = climb.nRows;
  const stepY = rows.length > 1 ? Math.abs(rows[1] - rows[0]) : 24;
  // 1) massa della piramide: fascia per fascia, si restringe salendo
  for (let r = 0; r < nRows; r++) {
    const y = rows[r] - cameraY;
    if (y < -stepY * 2 || y > H + stepY * 2) continue;
    let lo = null, hi = null;
    for (let c = 0; c < climb.cols.length; c++) if (climb.has(c, r)) { if (lo === null) lo = c; hi = c; }
    if (lo === null) continue;
    const x0 = climb.xOf(lo) - 18, x1 = climb.xOf(hi) + 18;
    // corpo della massa (scuro), con bordo superiore acceso
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = C.redDeep;
    ctx.fillRect(Math.round(x0), Math.round(y + 2), Math.round(x1 - x0), Math.round(stepY + 4));
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = C.redDark;
    ctx.fillRect(Math.round(x0), Math.round(y + 2), Math.round(x1 - x0), 1);
    ctx.globalAlpha = 1;
    // nervature: piccoli corpi incastrati (texture "muro di persone")
    const span = x1 - x0;
    const n = Math.max(3, Math.round(span / 16));
    // reazione fisica: i corpi nella zona delle mani si comprimono
    const gRow = Math.max(climb.lh.r, climb.rh.r);
    const rowDist = Math.abs(r - gRow);
    const press = rowDist <= 1 ? (1 - rowDist) : 0;
    for (let i = 0; i < n; i++) {
      const fx = x0 + (i + 0.5) * (span / n);
      const ph = time * 1.2 + (fx + r * 7) * 0.2;
      const st = Math.sin(ph * 1.3) > 0.5 ? 'idle' : 'climb';
      // schiacciamento verso il basso sotto la presa (squash)
      const stretch = -press * 0.4;
      drawFigure(ctx, fx, y + stepY * 0.7 + press * 2, { h: 11, color: C.redDeep, state: st, phase: ph, alpha: 0.5, stretch, detail: press > 0.5 });
    }
    // 2) GLI APPIGLI: teste che emergono dove il giocatore può aggrapparsi
    for (let c = 0; c < climb.cols.length; c++) {
      if (!climb.has(c, r)) continue;
      const hx = climb.xOf(c), hy = y + 1;
      const ph = time * 1.6 + (hx + r * 13) * 0.1;
      const bob = Math.round(Math.sin(ph) * 0.6);
      // testa/nodo luminoso della presa
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = C.redDark;
      ctx.fillRect(Math.round(hx) - 1, hy + bob, 3, 3);
      ctx.fillStyle = depthRed(0.35 + 0.3 * (0.5 + 0.5 * Math.sin(ph * 0.8)));
      ctx.fillRect(Math.round(hx), hy + 1 + bob, 1, 1);
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

  // alone caldo pulsante (ti fa trovare a colpo d'occhio); più acceso sull'azione
  ctx.save();
  ctx.globalAlpha = (0.22 + 0.10 * Math.sin(time * 5)) + 0.3 * actK;
  const auraCol = action === 'spingi' ? C.redHot : C.redHot;
  drawClimber(ctx, lx, lyy, rx, ryy, { color: auraCol, phase: ph, thickness: 5 + Math.round(2 * actK), h: 20, bx: hipX, by: byc + hipYOff, swing });
  ctx.restore();

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

  // corpo acceso con dettagli (chele, ciuffo, rim) + contorno scuro netto
  const col = actK > 0.1 ? C.redHot : C.redBright;
  drawClimber(ctx, lx, lyy, rx, ryy, { color: col, phase: ph, thickness: 3, h: 20,
    bx: hipX, by: byc + hipYOff, swing, breathe, detail: true });
  drawClimber(ctx, lx, lyy, rx, ryy, { color: C.black, phase: ph, thickness: 5, h: 20, bx: hipX, by: byc + hipYOff, swing });
  drawClimber(ctx, lx, lyy, rx, ryy, { color: col, phase: ph, thickness: 2, h: 20,
    bx: hipX, by: byc + hipYOff, swing, breathe, detail: true, rim: true, lean });

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

  ctx.font = '20px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.black;  ctx.fillText('VOX POPULI', 93, 45);
  ctx.fillStyle = C.redHot; ctx.fillText('VOX POPULI', 92, 44);
  ctx.font = '7px monospace';
  ctx.fillStyle = C.red;    ctx.fillText('I  T R E D I C I  G I R O N I', 122, 58);
  ctx.fillRect(122, 62, 76, 1);
  if (Math.sin(time * 3) > -0.3) { ctx.fillStyle = C.white; ctx.fillText('premi SPAZIO  ·  tocca ▲  per iniziare', 44, 78); }
  ctx.fillStyle = C.redDark; ctx.fillText('MOTUS — concept album · 13 tracce', 68, 92);
}

