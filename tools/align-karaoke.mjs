// tools/align-karaoke.mjs
// Driver: legge tools/_words.json (parole whisper) + tools/_official.json (testi
// ufficiali), allinea con alignLines() e scrive SIA tools/karaoke.json SIA
// src/karaoke.js (export const KARAOKE = {...}).
import { readFileSync, writeFileSync } from 'node:fs';
import { alignLines } from './align-core.mjs';

const onset = w => (Array.isArray(w) ? Number(w[0]) : (w && Number(w.start))) || 0;

const words = JSON.parse(readFileSync('tools/_words.json', 'utf8'));
const official = JSON.parse(readFileSync('tools/_official.json', 'utf8'));

const karaoke = {};
const summary = [];

for (const [id, w] of Object.entries(words)) {
  const lines = official[id] || [];
  const ws = (w && w.words) || [];
  // 1) match STRETTO (preciso).
  let entries = alignLines(lines, ws, { window: 12 });
  // 2) se troppo poche, ALLENTA (finestra ampia, niente vincolo sull'ultimo token).
  if (entries.length < 2) {
    const loose = alignLines(lines, ws, { window: 24, minRatio: 0.34, requireLast: false });
    if (loose.length > entries.length) entries = loose;
  }
  // 3) se ancora vuoto, DISTRIBUISCI le righe ufficiali sulla durata della clip
  //    (meglio un testo approssimato che una schermata muta).
  if (entries.length === 0 && lines.length) {
    const dur = ws.length ? onset(ws[ws.length - 1]) + 0.6 : 0;
    const n = Math.min(lines.length, 8);
    entries = [];
    for (let i = 0; i < n; i++) {
      const t = dur > 0 ? (i / n) * dur : i * 2.5;
      entries.push([Number(t.toFixed(2)), lines[i]]);
    }
  }
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
