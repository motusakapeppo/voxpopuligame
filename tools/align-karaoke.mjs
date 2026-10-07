// tools/align-karaoke.mjs
// Driver: legge tools/_words.json (parole whisper) + tools/_official.json (testi
// ufficiali), allinea con alignLines() e scrive SIA tools/karaoke.json SIA
// src/karaoke.js (export const KARAOKE = {...}).
import { readFileSync, writeFileSync } from 'node:fs';
import { alignLines } from './align-core.mjs';

const words = JSON.parse(readFileSync('tools/_words.json', 'utf8'));
const official = JSON.parse(readFileSync('tools/_official.json', 'utf8'));

const karaoke = {};
const summary = [];

for (const [id, w] of Object.entries(words)) {
  const lines = official[id] || [];
  const ws = (w && w.words) || [];
  const entries = alignLines(lines, ws, { window: 12 });
  karaoke[id] = entries;
  summary.push({ id, lines: lines.length, words: ws.length, matched: entries.length, first: entries[0] ? entries[0][1] : '' });
}

writeFileSync('tools/karaoke.json', JSON.stringify(karaoke, null, 1));

const js = '// Karaoke: [inizio, frase]. Le clip sono estratti da meta canzone: l inizio\n' +
  '// e ancorato all onset della PAROLA cantata (tools/align-karaoke.mjs).\n\n' +
  'export const KARAOKE = ' + JSON.stringify(karaoke) + ';\n';
writeFileSync('src/karaoke.js', js);

for (const s of summary) {
  console.log(
    s.id.padEnd(20),
    '| righe', String(s.lines).padStart(3),
    '| parole', String(s.words).padStart(4),
    '| match', String(s.matched).padStart(3),
    '| prima:', s.first.slice(0, 55)
  );
}
