// ============================================================================
// COLLAPSE — il finale È la copertina, animata. Si arriva in cima, la
// telecamera si allarga e la piramide si rivela fatta di persone che si
// arrampicano. Poi si capovolge: chi era sopra finisce sotto.
// ============================================================================
import { C, depthRed } from './palette.js';
import { drawFigure } from './figure.js';

const PHASES = [
  ['zoomOut', 2.2],
  ['revealBodies', 2.6],
  ['flip', 2.2],
  ['fall', 2.6],
  ['circle', 2.4],
];

function buildFigureGrid(W, H) {
  const figs = [];
  const cx = W / 2, baseY = H - 16, rows = 11;
  for (let row = 0; row < rows; row++) {
    const y = baseY - row * 11;
    const span = 140 - row * 11;
    const count = Math.max(1, Math.round(span / 9));
    for (let i = 0; i < count; i++) {
      figs.push({
        x: cx - span / 2 + (i * span) / Math.max(1, count),
        y, row,
        depth: 0.4 + (row / rows) * 0.5,
        state: row === 0 ? 'climb' : (i % 4 === 0) ? 'reach' : (i % 5 === 0) ? 'climb' : 'idle',
        phase: i * 1.3 + row * 0.7,
        vy: 0,
      });
    }
  }
  return figs;
}

export function createCollapse({ bodies, viewW, viewH, supported = 4 }) {
  const figs = buildFigureGrid(viewW, viewH);
  const keep = Math.max(3, Math.min(figs.length, 6 + Math.round(supported) * 2));
  return { bodies, viewW, viewH, supported, figs, keep,
    phase: 'zoomOut', t: 0, phaseIndex: 0, done: false, angle: 0 };
}

export function stepCollapse(c, dt) {
  if (c.done) return;
  c.t += dt; c.angle += dt * 0.5;
  const [, dur] = PHASES[c.phaseIndex];
  if (c.t >= dur) {
    if (c.phaseIndex < PHASES.length - 1) { c.t = 0; c.phaseIndex++; }
    else c.done = true;
  }
  c.phase = PHASES[c.phaseIndex][0];
  if (c.phase === 'fall') {
    const k = Math.min(1, c.t / 2.6);
    for (const f of c.figs) { f.vy += 0.5; f.y += f.vy * k; }
  }
}

export function collapseFinished(c) { return c.done === true; }

export function drawCollapse(ctx, c, time = 0) {
  const { viewW: W, viewH: H } = c;
  ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2;

  if (c.phase === 'zoomOut' || c.phase === 'revealBodies') {
    const reveal = c.phase === 'revealBodies' ? Math.min(1, c.t / 2.6) : 0;
    for (const f of c.figs) {
      const shown = reveal > (f.row / 11);
      if (!shown) {
        ctx.fillStyle = C.redDeep;
        ctx.fillRect(Math.round(f.x - 3), Math.round(f.y - 8), 7, 9);
      } else {
        drawFigure(ctx, f.x, f.y, {
          h: 15, color: depthRed(f.depth + 0.1), state: f.state,
          phase: time * 2 + f.phase, facing: f.row % 2 ? 1 : -1,
        });
      }
    }
  } else if (c.phase === 'flip') {
    const k = Math.min(1, c.t / 2.2);
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, 1 - 2 * k); ctx.translate(-cx, -cy);
    for (const f of c.figs) drawFigure(ctx, f.x, f.y, { h: 15, color: depthRed(f.depth), state: f.state, phase: time * 2 + f.phase });
    ctx.restore();
  } else if (c.phase === 'fall') {
    for (const f of c.figs) drawFigure(ctx, f.x, f.y, { h: 15, color: depthRed(f.depth), state: 'fall', phase: time * 5 + f.phase });
  } else if (c.phase === 'circle') {
    const r = 44;
    const figs = c.figs.slice(0, c.keep);
    for (let i = 0; i < figs.length; i++) {
      const a = (i / figs.length) * Math.PI * 2 + c.angle * 0.04;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r + 6;
      drawFigure(ctx, x, y, { h: 15, color: C.redBright, state: i % 2 ? 'reach' : 'idle', phase: time * 1.6 + i });
    }
    ctx.strokeStyle = C.redDark; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.stroke();
  }
}
