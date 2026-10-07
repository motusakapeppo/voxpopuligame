// Allinea i testi UFFICIALI ai tempi di whisper → karaoke.json
// Le clip sono ESTRATTI da meta canzone: prima si individua DOVE inizia la clip
// nel testo ufficiale (confrontando le prime frasi trascritte), poi si procede
// in modo monotono. Output: [inizio, fine, frase] per traccia.
import { readFileSync, writeFileSync } from 'node:fs';

const words = JSON.parse(readFileSync('tools/_words.json', 'utf8'));
const official = JSON.parse(readFileSync('tools/_official.json', 'utf8'));

const norm = s => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9àèéìòù\s]/gi, ' ').replace(/\s+/g, ' ').trim();
const toks = s => norm(s).split(' ').filter(t => t.length > 1);

function overlap(a, b) {
  const used = new Array(b.length).fill(false);
  let hit = 0;
  for (const t of a) {
    const j = b.findIndex((x, i) => !used[i] && x === t);
    if (j >= 0) { used[j] = true; hit++; }
  }
  return hit;
}

// Trova da quale riga ufficiale inizia la clip (le prime frasi trascritte).
function findStart(clipToks, lines) {
  let best = 0, bestScore = 0;
  for (let s = 0; s < lines.length; s++) {
    const win = [];
    for (let k = 0; k < 4 && s + k < lines.length; k++) win.push(...toks(lines[s + k]));
    const sc = overlap(clipToks, win) / Math.max(1, Math.min(clipToks.length, win.length));
    if (sc > bestScore) { bestScore = sc; best = s; }
  }
  return { start: best, score: bestScore };
}

const karaoke = {};
const debug = {};
for (const [id, w] of Object.entries(words)) {
  const segs = (w.segments || []).slice();
  const lines = official[id] || [];
  const head = segs.slice(0, 4).flatMap(s => toks(s[2]));
  const loc = findStart(head, lines);
  let li = loc.start;

  const out = [];
  for (const [start, end, text] of segs) {
    const st = toks(text);
    if (!st.length) continue;
    let best = -1, bestScore = 0;
    for (let k = li; k < Math.min(lines.length, li + 8); k++) {
      const lt = toks(lines[k]);
      const sc = overlap(st, lt) / Math.max(1, Math.min(st.length, lt.length));
      if (sc > bestScore) { bestScore = sc; best = k; }
    }
    if (best >= 0 && bestScore >= 0.30) { out.push([start, lines[best]]); li = best + 1; }
    else if (li < lines.length) { out.push([start, lines[li]]); li++; }
  }
  out.sort((a, b) => a[0] - b[0]);
  const clean = [];
  for (const e of out) if (!clean.length || clean[clean.length - 1][1] !== e[1]) clean.push(e);
  // solo se NON c'e nessun match reale (voce quasi assente nella clip), usa
  // le righe ufficiali dal punto d'inizio reale, a tempo fisso.
  if (clean.length === 0) {
    const dur = w.segments && w.segments.length ? w.segments[w.segments.length - 1][1] : 20;
    const pool = lines.slice(loc.start).filter(s => s && s.length > 4);
    if (pool.length) {
      const count = Math.min(8, pool.length);
      const step = Math.max(2.5, (dur - 1) / count);
      clean.length = 0;
      for (let i = 0; i < count; i++) clean.push([+(i * step).toFixed(2), pool[i]]);
    }
  }
  // estendi i risultati troppo radi (1-3 righe): aggiungi le righe ufficiali
  // successive all'ultimo match, a cadenza costante, così la lirica non resta ferma.
  if (clean.length > 0 && clean.length < 4 && li < lines.length) {
    const dur = w.segments && w.segments.length ? w.segments[w.segments.length - 1][1] : 20;
    let t = clean[clean.length - 1][0] + 2.8;
    while (clean.length < 6 && li < lines.length && t < dur) {
      const s = lines[li++];
      if (s && s.length > 4) clean.push([+t.toFixed(2), s]);
      t += 2.8;
    }
  }
  karaoke[id] = clean;
  debug[id] = { startLine: loc.start, score: +loc.score.toFixed(2), prima: clean[0] ? clean[0][1] : '' };
}

writeFileSync('tools/karaoke.json', JSON.stringify(karaoke, null, 1));
for (const [id, d] of Object.entries(debug)) {
  console.log(id, '| start riga', d.startLine, '| match', d.score, '| prima:', d.prima.slice(0, 60));
}
