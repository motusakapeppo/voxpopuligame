import { C } from './palette.js';

const DURATION = 1.2;

export function createTransition(fromIndex, toIndex) {
  return { fromIndex, toIndex, t: 0, done: false };
}

export function stepTransition(tr, dt) {
  tr.t += dt;
  if (tr.t >= DURATION) tr.done = true;
}

// Sipario rosso che scende e risale: chiusura del girone, apertura del successivo.
export function drawTransition(ctx, tr, VIEW_W, VIEW_H) {
  const half = Math.sin(Math.min(1, tr.t / DURATION) * Math.PI); // 0→1→0
  const h = half * VIEW_H;
  ctx.fillStyle = C.red;
  ctx.fillRect(0, 0, VIEW_W, h / 2);
  ctx.fillRect(0, VIEW_H - h / 2, VIEW_W, h / 2);
}
