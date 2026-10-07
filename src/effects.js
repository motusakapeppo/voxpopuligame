export function createEffects() {
  return { blades: [], rain: [], shake: 0, dim: 0, flicker: 0, _seed: 0 };
}

export function spawnFromEvents(fx, events, cameraY, playerX = 0) {
  for (const e of events) {
    if (e === 'blade') {
      fx._seed = (fx._seed * 1103515245 + 12345) & 0x7fffffff; // deterministico
      const x = 20 + (fx._seed % 260);
      fx.blades.push({ x, y: cameraY - 10, vy: 3 });
    } else if (e === 'quake') { fx.shake = 6; }
    else if (e === 'slip') { fx.rain.push({ x: (playerX + 40) % 320, y: cameraY + 10, vy: 5 }); }
    else if (e === 'dim') { fx.dim = Math.min(0.65, fx.dim + 0.01); }
    else if (e === 'fake') { fx.flicker = 0.2; }
  }
}

export function stepEffects(fx, dt, cameraY, VIEW_H) {
  for (const b of fx.blades) b.y += b.vy;
  fx.blades = fx.blades.filter(b => b.y - cameraY < VIEW_H + 20);
  for (const r of fx.rain) r.y += r.vy;
  fx.rain = fx.rain.filter(r => r.y - cameraY < VIEW_H + 20);
  if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - dt * 12);
  if (fx.flicker > 0) fx.flicker = Math.max(0, fx.flicker - dt);
}

export function shakeOffset(fx, time) {
  if (fx.shake <= 0) return { x: 0, y: 0 };
  return { x: Math.sin(time * 60) * fx.shake, y: Math.cos(time * 47) * fx.shake };
}
