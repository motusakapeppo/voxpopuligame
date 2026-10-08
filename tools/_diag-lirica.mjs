// AUDIT liriche: gap tra righe consecutive (troppo lunghi = testo "fermo").
import { readFileSync } from 'node:fs';
import { KARAOKE } from '../src/karaoke.js';
import { clipDur } from './clip-durations.mjs';
for (const id of Object.keys(KARAOKE)) {
  const e = KARAOKE[id];
  if (e.length < 2) { console.log(id.padEnd(18), 'voci=' + e.length, '(ISOLATA — testo fermo quasi tutta la clip)'); continue; }
  const gaps = [];
  for (let i = 1; i < e.length; i++) gaps.push(e[i][0] - e[i-1][0]);
  const max = Math.max(...gaps);
  const dur = clipDur(id);
  const tail = dur - e[e.length-1][0];
  const firstDelay = e[0][0];
  const flag = (max > 6 || firstDelay > 5 || tail > 6) ? '  <-- BUG: lungo fermo' : '';
  console.log(id.padEnd(18), 'voci=' + String(e.length).padStart(2), 'gapMax=' + max.toFixed(1) + 's', 'primaRiga@' + firstDelay.toFixed(1) + 's', 'coda=' + tail.toFixed(1) + 's', flag);
}
