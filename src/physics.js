const MAX_FALL  = 6;

export function createBody({ x, y, w, h, stable = 4 }) {
  return { x, y, w, h, stress: 0, stable, state: 'stable', yieldT: 0 };
}
export function bodyPhase(b) {
  if (b.stress <= 0) return 'stable';
  if (b.stress <= b.stable) return 'strain';
  return 'yield';
}
export function applyWeight(b, dt) { b.stress += dt; b.state = bodyPhase(b); }
export function decayBody(b, dt) {
  if (b.stress >= b.stable) { b.y += 2; b.stress = 0; b.state = 'stable'; return true; }
  b.stress = Math.max(0, b.stress - dt * 0.25); // recupera piano
  b.state = bodyPhase(b);
  return false;
}
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function stepPlayer(p, world, input, dt) {
  // orizzontale
  p.vx = input.axis() * 1.7;
  p.x += p.vx * dt;

  // salto
  if (p.onGround && input.consumeJump()) { p.vy = -6.4; p.onGround = false; }
  else input.consumeJump();

  // gravità
  p.vy = Math.min(MAX_FALL, p.vy + world.gravity * dt);
  const prevBottom = p.y + p.h;
  p.y += p.vy * dt;

  // collisione dall'alto con i corpi
  p.onGround = false;
  for (const b of world.bodies) {
    if (p.vx >= 0 && p.x + p.w < b.x) continue;
    if (p.vx < 0 && p.x > b.x + b.w) continue;
    const bottom = p.y + p.h;
    if (p.vy >= 0 && prevBottom <= b.y + 2 && bottom >= b.y &&
        p.x + p.w > b.x && p.x < b.x + b.w) {
      p.y = b.y - p.h; p.vy = 0; p.onGround = true;
      applyWeight(b, dt);
    }
  }
  // degrado dei corpi
  for (const b of world.bodies) decayBody(b, dt);
  if (world.solidAt) world.solidAt(p, dt);
}
