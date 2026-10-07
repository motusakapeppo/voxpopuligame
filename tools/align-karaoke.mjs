// tools/align-karaoke.mjs
// Driver: legge tools/_words.json (parole whisper) + tools/_official.json (testi
// ufficiali), allinea con alignLinesWithMeta() e scrive SIA tools/karaoke.json
// SIA src/karaoke.js (export const KARAOKE = {...}).
//
// STRATEGIA (v2):
//   1) PASS 1 "stretto": finestra 12, copertura >= 0.5, ultimo token obbligatorio.
//   2) PASS 2 "largo" (solo se il pass 1 produce < 2 righe): finestra 24,
//      copertura >= 0.4, ultimo token non obbligatorio. Serve per le clip molto
//      corte (es. 05-hosonno) dove whisper ha pochissime parole.
//   3) NESSUN fallback a distribuzione uniforme: se una riga non ha un match
//      reale viene OMESSA. Meglio poche righe corrette che molte sbagliate.
//   4) Offset globale per clip (lead) calcolato da alignLinesWithMeta e gia'
//      applicato agli start emessi.
import { readFileSync, writeFileSync } from 'node:fs';
import { alignLinesWithMeta } from './align-core.mjs';

const words = JSON.parse(readFileSync('tools/_words.json', 'utf8'));
const official = JSON.parse(readFileSync('tools/_official.json', 'utf8'));

const karaoke = {};
const summary = [];

for (const [id, w] of Object.entries(words)) {
  const lines = official[id] || [];
  const ws = (w && w.words) || [];

  // 1) match STRETTO (preciso).
  let res = alignLinesWithMeta(lines, ws, { window: 12, minRatio: 0.5, requireLast: true });
  let pass = 'strict';

  // 2) se troppo poche, ALLENTA (finestra ampia, ultimo token non obbligatorio).
  if (res.entries.length < 2) {
    const loose = alignLinesWithMeta(lines, ws, { window: 24, minRatio: 0.4, requireLast: false });
    if (loose.entries.length > res.entries.length) { res = loose; pass = 'loose'; }
  }

  // 3) nessuna distribuzione uniforme: si emettono SOLO le righe matchate.
  karaoke[id] = res.entries;
  summary.push({
    id,
    pass,
    lines: lines.length,
    words: ws.length,
    matched: res.entries.length,
    offset: res.offset,
    first: res.entries[0] ? res.entries[0][1] : '',
  });
}

writeFileSync('tools/karaoke.json', JSON.stringify(karaoke, null, 1));

const js = '// Karaoke: [inizio, frase]. Le clip sono estratti da meta canzone: l inizio\n' +
  '// e ancorato all onset della PAROLA cantata (tools/align-karaoke.mjs).\n\n' +
  'export const KARAOKE = ' + JSON.stringify(karaoke) + ';\n';
writeFileSync('src/karaoke.js', js);

for (const s of summary) {
  console.log(
    s.id.padEnd(20),
    '| ' + s.pass.padEnd(6),
    '| righe', String(s.lines).padStart(3),
    '| parole', String(s.words).padStart(4),
    '| match', String(s.matched).padStart(3),
    '| off', s.offset.toFixed(2).padStart(5),
    '| prima:', s.first.slice(0, 45)
  );
}
