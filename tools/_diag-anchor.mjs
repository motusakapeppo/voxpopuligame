// Confronto: righe attuali (con gap-fill fabbricato) vs solo-anchor reali.
import { readFileSync } from 'node:fs';
import { alignLinesWithMeta } from './align-core.mjs';
import { clipDur } from './clip-durations.mjs';

const words = JSON.parse(readFileSync('tools/_words.json', 'utf8'));
const official = JSON.parse(readFileSync('tools/_official.json', 'utf8'));
const karaoke = JSON.parse(readFileSync('src/karaoke.js', 'utf8').replace(/^[\s\S]*?=\s*/, '').replace(/;\s*$/, ''));

let totNow = 0, totAnchor = 0;
console.log('id'.padEnd(20), 'attuali', 'anchor', 'prima riga anchor');
for (const id of Object.keys(words)) {
  const lines = official[id] || [];
  const ws = (words[id] && words[id].words) || [];
  const strict = alignLinesWithMeta(lines, ws, { window: 12, minRatio: 0.5, requireLast: true, duration: clipDur(id) });
  let anchors = strict.entries;
  if (anchors.length < 2) {
    anchors = alignLinesWithMeta(lines, ws, { window: 24, minRatio: 0.4, requireLast: false, duration: clipDur(id) }).entries;
  }
  const now = karaoke[id] || [];
  totNow += now.length; totAnchor += anchors.length;
  console.log(String(id).padEnd(20), String(now.length).padStart(6), String(anchors.length).padStart(6),
    '  ', (anchors[0] ? anchors[0][0].toFixed(2) + 's "' + anchors[0][1].slice(0, 30) + '"' : '—'));
}
console.log('\nTOTALE voci: attuali=' + totNow + '  solo-anchor=' + totAnchor);
