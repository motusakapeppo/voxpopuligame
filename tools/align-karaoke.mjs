// Allinea i testi UFFICIALI ai tempi di whisper → karaoke.json
// Karaoke: array di [start, testo] per traccia (la frase appare quando è cantata).
import { readFileSync, writeFileSync } from 'node:fs';

const words = JSON.parse(readFileSync('tools/_words.json', 'utf8'));
const official = JSON.parse(readFileSync('tools/_official.json', 'utf8'));

const norm = s => s.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9àèéìòù\s]/gi, ' ').replace(/\s+/g, ' ').trim();
const toks = s => norm(s).split(' ').filter(t => t.length > 1);

// quante parole in comune (multiset)
function overlap(a, b) {
  const A = [...a], used = new Array(b.length).fill(false);
  let hit = 0;
  for (const t of A) {
    const j = b.findIndex((x, i) => !used[i] && x === t);
    if (j >= 0) { used[j] = true; hit++; }
  }
  return hit;
}

const karaoke = {};
for (const [id, w] of Object.entries(words)) {
  const segs = (w.segments || []).slice();
  const lines = official[id] || [];
  const out = [];
  let li = 0;
  for (const [start, end, text] of segs) {
    const st = toks(text);
    if (!st.length) continue;
    // cerca la riga ufficiale migliore tra le prossime (monotono)
    let best = -1, bestScore = 0;
    for (let k = li; k < Math.min(lines.length, li + 12); k++) {
      const lt = toks(lines[k]);
      const sc = overlap(st, lt) / Math.max(1, Math.min(st.length, lt.length));
      if (sc > bestScore) { bestScore = sc; best = k; }
    }
    if (best >= 0 && bestScore >= 0.30) {
      out.push([start, lines[best]]);
      li = best + 1;
    } else if (li < lines.length) {
      // nessun match forte: riga ufficiale successiva col tempo di whisper
      // (mai il testo di whisper: è inaffidabile sul rap)
      out.push([start, lines[li]]);
      li++;
    }
  }
  // dedup consecutivi + ordina
  out.sort((a, b) => a[0] - b[0]);
  const clean = [];
  for (const e of out) if (!clean.length || clean[clean.length - 1][1] !== e[1]) clean.push(e);
  karaoke[id] = clean;
}

writeFileSync('tools/karaoke.json', JSON.stringify(karaoke, null, 1));
const stats = Object.fromEntries(Object.entries(karaoke).map(([k, v]) => [k, v.length]));
console.log('karaoke righe:', stats);
console.log('\nEsempio 07-tictac:');
for (const [t, s] of karaoke['07-tictac'].slice(0, 8)) console.log('  ' + t.toFixed(2) + 's  ' + s);
