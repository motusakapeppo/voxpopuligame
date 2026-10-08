// tools/align-karaoke.mjs
// Driver: legge tools/_words.json (parole whisper) + tools/_official.json (testi
// ufficiali), allinea con alignWithFill() e scrive SIA tools/karaoke.json
// SIA src/karaoke.js (export const KARAOKE = {...}).
//
// STRATEGIA (v3 — anchor + gap-fill):
//   1) PASS 1 "stretto": finestra 12, copertura >= 0.5, ultimo token obbligatorio.
//   2) PASS 2 "largo" (solo se il pass 1 produce < 2 righe): finestra 24,
//      copertura >= 0.4, ultimo token non obbligatorio. Serve per le clip molto
//      corte (es. 05-hosonno) dove whisper ha pochissime parole.
//   3) Gli anchor (righe ad alta confidenza) restano ai loro tempi ESATTI.
//   4) GAP-FILL: tra due anchor si distribuiscono le righe ufficiali intermedie
//      (in ordine), con spaziatura minima ~1.2s; testa e coda riempite solo se
//      c'e' audio/spazio reale. Niente Math.random: tutto deterministico.
import { readFileSync, writeFileSync } from 'node:fs';
import { alignWithFill } from './align-core.mjs';
import { clipDur } from './clip-durations.mjs';

const words = JSON.parse(readFileSync('tools/_words.json', 'utf8'));
const official = JSON.parse(readFileSync('tools/_official.json', 'utf8'));

const karaoke = {};
const summary = [];

for (const [id, w] of Object.entries(words)) {
  const lines = official[id] || [];
  const ws = (w && w.words) || [];
  // durata REALE della clip (single source of truth): la lirica copre fino in fondo.
  const duration = clipDur(id);

  const res = alignWithFill(lines, ws, { duration, minSpacing: 1.3, maxGap: 2.2 });

  karaoke[id] = res.entries;
  summary.push({
    id,
    pass: res.pass,
    lines: lines.length,
    words: ws.length,
    anchors: res.anchors.length,
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
    '| anchor', String(s.anchors).padStart(3),
    '| voci', String(s.matched).padStart(3),
    '| off', s.offset.toFixed(2).padStart(5),
    '| prima:', s.first.slice(0, 40)
  );
}
