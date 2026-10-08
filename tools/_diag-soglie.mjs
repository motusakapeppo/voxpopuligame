// Esperimento: quali soglie massimizzano le righe VERE (ancorate) senza fabbricare.
import { readFileSync } from 'node:fs';
import { alignLinesWithMeta } from './align-core.mjs';
import { clipDur } from './clip-durations.mjs';
const words = JSON.parse(readFileSync('tools/_words.json', 'utf8'));
const official = JSON.parse(readFileSync('tools/_official.json', 'utf8'));
const configs = [
  ['strict', { window: 12, minRatio: 0.5, requireLast: true }],
  ['medium', { window: 16, minRatio: 0.45, requireLast: true }],
  ['medium2', { window: 18, minRatio: 0.4, requireLast: true }],
  ['loose', { window: 24, minRatio: 0.4, requireLast: false }],
];
for (const [name, opt] of configs) {
  let tot = 0; const per = {};
  for (const id of Object.keys(words)) {
    const r = alignLinesWithMeta(official[id] || [], (words[id] && words[id].words) || [], { ...opt, duration: clipDur(id) });
    per[id] = r.entries.length; tot += r.entries.length;
  }
  console.log(name.padEnd(9), 'tot=' + String(tot).padStart(3), ' min=' + Math.min(...Object.values(per)), ' per:', Object.values(per).join(','));
}
