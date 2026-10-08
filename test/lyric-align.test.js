// ============================================================================
// LYRIC ALIGN — test del nucleo puro alignLines() e dei dati reali.
// Verifica il bug risolto: lo start di una riga e l'onset della PAROLA cantata,
// non l'inizio del segmento whisper.
//
// Inoltre MISURA la qualita del sync per traccia: per ogni voce karaoke cerca
// l'onset whisper piu vicino allo start e misura (a) l'errore di onset e
// (b) la COPERTURA dei token della riga nella finestra ancorata allo start.
// La copertura e la metrica che smaschera i "versi sbagliati al momento
// giusto": uno start puo cadere esattamente su un onset (errore 0) ma la riga
// mostrata non e quella cantata (copertura bassa).
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alignLines, alignLinesWithMeta, calibrateOffset, tokenize } from '../tools/align-core.mjs';
import { clipDur } from '../tools/clip-durations.mjs';
import { KARAOKE } from '../src/karaoke.js';

const words = JSON.parse(readFileSync('tools/_words.json', 'utf8'));
const official = JSON.parse(readFileSync('tools/_official.json', 'utf8'));

const IDS = Object.keys(words);

// --- helper di misura -------------------------------------------------------

function wordOnset(w) {
  return Array.isArray(w) ? Number(w[0]) : Number(w && w.start);
}
function wordText(w) {
  return Array.isArray(w) ? w[2] : (w && w.text);
}

// copertura dei token della riga nella finestra [i, i+win) delle parole whisper
function coverageAt(toks, wToks, i, win) {
  const end = Math.min(wToks.length, i + win);
  const used = new Set();
  let m = 0;
  for (const t of toks) {
    for (let j = i; j < end; j++) {
      if (!used.has(j) && wToks[j].includes(t)) { used.add(j); m++; break; }
    }
  }
  return toks.length ? m / toks.length : 0;
}

// per ogni voce: onset piu vicino, errore di onset, copertura locale
export function syncReport(id, entries) {
  const ws = (words[id] && words[id].words) || [];
  const wToks = ws.map(w => tokenize(wordText(w)));
  const rows = [];
  for (const [start, line] of entries) {
    const toks = tokenize(line);
    let ai = 0, best = Infinity;
    for (let i = 0; i < ws.length; i++) {
      const d = Math.abs(wordOnset(ws[i]) - start);
      if (d < best) { best = d; ai = i; }
    }
    const win = Math.max(toks.length + 2, 6);
    const cov = coverageAt(toks, wToks, ai, win);
    rows.push({ start, line, onsetErr: best, coverage: cov, wrong: cov < 0.5 });
  }
  return rows;
}

function median(xs) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function printTable() {
  const lines = [];
  for (const id of IDS) {
    const rows = syncReport(id, KARAOKE[id] || []);
    const wrong = rows.filter(r => r.wrong).length;
    const medCov = median(rows.map(r => r.coverage));
    const medErr = median(rows.map(r => r.onsetErr));
    lines.push(
      id.padEnd(20),
      'n=' + String(rows.length).padStart(2),
      'wrong=' + wrong,
      'medCov=' + (Number.isFinite(medCov) ? medCov.toFixed(2) : '-'),
      'medOnsetErr=' + (Number.isFinite(medErr) ? medErr.toFixed(2) : '-')
    );
    for (const r of rows) {
      lines.push('    ' + String(r.start).padStart(6) +
        ' cov=' + r.coverage.toFixed(2) +
        ' onErr=' + r.onsetErr.toFixed(2) +
        (r.wrong ? ' <<WRONG' : '        ') + ' | ' + r.line.slice(0, 44));
    }
  }
  return lines.join('\n');
}

// --- dati reali -------------------------------------------------------------

test('03-tuoni: la riga "tuoni" parte all onset della parola (16.3..16.9), non 7.25', () => {
  const out = alignLines(official['03-tuoni'], words['03-tuoni'].words, { window: 12 });
  const line = out.find(e => /tuoni/.test(e[1]));
  assert.ok(line, 'riga con "tuoni" non trovata');
  assert.ok(line[0] >= 16.3 && line[0] <= 16.9, `start ${line[0]} fuori [16.3,16.9]`);
  assert.notEqual(line[0], 7.25, 'start ancora ancorato al segmento (bug)');
});

test('11-lafinedelmondo: "È la fine del mondo" parte >= 8.0', () => {
  const out = alignLines(official['11-lafinedelmondo'], words['11-lafinedelmondo'].words, { window: 12 });
  const line = out.find(e => /fine del mondo/.test(e[1]));
  assert.ok(line, 'riga "fine del mondo" non trovata');
  assert.ok(line[0] >= 8.0, `start ${line[0]} < 8.0`);
});

test('gli start sono monotoni crescenti su tutte le tracce', () => {
  for (const id of Object.keys(words)) {
    const out = alignLines(official[id] || [], (words[id] && words[id].words) || [], { window: 12 });
    for (let i = 1; i < out.length; i++) {
      assert.ok(out[i][0] >= out[i - 1][0], `${id}: start non monotono a ${i} (${out[i - 1][0]} -> ${out[i][0]})`);
    }
  }
});

// --- sintetico: la regola (c) respinge le righe non cantate -----------------

test('alignLines respinge "Non mi va" quando l ultimo token non e cantato', () => {
  const out = alignLines(
    ['Non mi va'],
    [[0, 0.3, 'non'], [0.3, 0.5, 'mi'], [0.5, 0.9, 'sento']],
  );
  assert.deepEqual(out, []);
});

test('alignLines accetta una riga con ultimo token cantato', () => {
  const out = alignLines(
    ['Quando ci sono i tuoni'],
    [[0, 0.2, 'quando'], [0.2, 0.4, 'ci'], [0.4, 0.6, 'sono'], [0.6, 0.8, 'i'], [0.8, 1.0, 'tuoni']],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0][0], 0);
  assert.equal(out[0][1], 'Quando ci sono i tuoni');
});

test('alignLines scarta le righe consecutive identiche', () => {
  const out = alignLines(
    ['Ciao mondo', 'Ciao mondo'],
    [[0, 0.3, 'ciao'], [0.3, 0.6, 'mondo'], [1.0, 1.3, 'ciao'], [1.3, 1.6, 'mondo']],
  );
  assert.equal(out.length, 1);
});

// --- calibrazione offset (drift guard) --------------------------------------

test('calibrateOffset stima il residuo mediano onset-start', () => {
  const words = [[0, 0.3, 'a'], [1, 1.3, 'b'], [2, 2.3, 'c']];
  const seq = [
    { first: 0, onset: -0.2, line: 'a' },
    { first: 1, onset: 0.8, line: 'b' },
    { first: 2, onset: 1.8, line: 'c' },
  ];
  const off = calibrateOffset(seq, words);
  assert.ok(Math.abs(off - 0.2) < 1e-9, `offset ${off} != 0.2`);
});

test('calibrateOffset e clampato in [-0.3, +0.3]', () => {
  const words = [[0, 0.3, 'a'], [1, 1.3, 'b']];
  const seq = [
    { first: 0, onset: -5, line: 'a' },
    { first: 1, onset: -4, line: 'b' },
  ];
  assert.equal(calibrateOffset(seq, words), 0.3);
  assert.equal(calibrateOffset(seq, words, { minOffset: -0.1, maxOffset: 0.1 }), 0.1);
});

test('calibrateOffset e 0 con meno di 2 righe', () => {
  assert.equal(calibrateOffset([], [[0, 0.3, 'a']]), 0);
  assert.equal(calibrateOffset([{ first: 0, onset: 0, line: 'a' }], [[0, 0.3, 'a']]), 0);
});

// --- GAP-FILL: riempimento tra gli anchor (RED -> GREEN) --------------------
//
// Il matcher stretto emette poche righe (solo alta confidenza): tra due anchor
// la riga mostrata resta "incollata" per molti secondi mentre l'audio canta
// altri versi. alignWithFill() tiene gli anchor ESATTI e distribuisce le righe
// ufficiali intermedie nei gap, senza inventare oltre il ragionevole.

// durata stimata della clip: onset dell'ultima parola whisper + ~1s.
function clipDuration(id) {
  const ws = (words[id] && words[id].words) || [];
  if (!ws.length) return 0;
  return wordOnset(ws[ws.length - 1]) + 1;
}

// anchor "stretti" come li produce il driver (strict, fallback loose).
function anchorsFor(id) {
  const lines = official[id] || [];
  const ws = (words[id] && words[id].words) || [];
  let res = alignLinesWithMeta(lines, ws, { window: 12, minRatio: 0.5, requireLast: true });
  if (res.entries.length < 2) {
    const loose = alignLinesWithMeta(lines, ws, { window: 24, minRatio: 0.4, requireLast: false });
    if (loose.entries.length > res.entries.length) res = loose;
  }
  return res;
}

// NUOVO INVARIANTE (2026-10-08): la karaoke usa SOLO righe ANCORATE. Nessun tempo
// inventato dal gap-fill. Meglio poche righe corrette che molte sbagliate.
//   - ogni voce è un anchor reale (testo+tempo presenti in anchorsFor[id]);
//   - start monotoni e dentro [0, durata];
//   - nessun duplicato consecutivo;
//   - copertura >= 0.5 e errore di onset <= 0.6s per OGNI voce (non solo "anchor
//     tra gli interpolati": ora TUTTE le voci sono anchor).
function anchoredFor(id) {
  const lines = official[id] || [];
  const ws = (words[id] && words[id].words) || [];
  let res = alignLinesWithMeta(lines, ws, { window: 12, minRatio: 0.5, requireLast: true, duration: clipDuration(id) });
  if (res.entries.length < 2) {
    res = alignLinesWithMeta(lines, ws, { window: 24, minRatio: 0.4, requireLast: false, duration: clipDuration(id) });
  }
  return res.entries;
}

test('karaoke: ogni voce di KARAOKE[id] è un ANCHOR reale (nessun tempo inventato)', () => {
  const bad = [];
  for (const id of IDS) {
    const key = new Set(anchoredFor(id).map(e => e[0] + '\u0000' + e[1]));
    for (const [start, line] of (KARAOKE[id] || [])) {
      if (!key.has(start + '\u0000' + line)) bad.push(`${id}: "${line}" @${start} NON è anchor`);
    }
  }
  assert.equal(bad.length, 0, 'voci senza ancoraggio reale (tempi inventati): ' + bad.join('; '));
});

test('karaoke: KARAOKE coincide ESATTAMENTE con gli anchor (nessuna riga aggiunta)', () => {
  for (const id of IDS) {
    const anchors = anchoredFor(id);
    assert.equal((KARAOKE[id] || []).length, anchors.length,
      `${id}: ${(KARAOKE[id] || []).length} voci vs ${anchors.length} anchor`);
  }
});

test('karaoke: start monotoni non decrescenti e dentro [0, durata]', () => {
  for (const id of IDS) {
    const dur = clipDuration(id);
    const out = KARAOKE[id] || [];
    for (let i = 0; i < out.length; i++) {
      assert.ok(out[i][0] >= 0, `${id}: start negativo a ${i} (${out[i][0]})`);
      assert.ok(out[i][0] <= dur + 1e-9, `${id}: start ${out[i][0]} oltre durata ${dur}`);
      if (i > 0) assert.ok(out[i][0] >= out[i - 1][0], `${id}: start non monotono a ${i}`);
    }
  }
});

test('karaoke: 03-tuoni "Quando ci sono i tuoni" resta a ~16.59', () => {
  const out = KARAOKE['03-tuoni'] || [];
  const line = out.find(e => /Quando ci sono i tuoni/.test(e[1]));
  assert.ok(line, 'riga "tuoni" non trovata');
  assert.ok(Math.abs(line[0] - 16.59) < 0.01, `start ${line[0]} != 16.59`);
});

test('karaoke: nessuna riga consecutiva duplicata', () => {
  for (const id of IDS) {
    const out = KARAOKE[id] || [];
    for (let i = 1; i < out.length; i++) {
      assert.notEqual(out[i][1], out[i - 1][1], `${id}: duplicato consecutivo a ${i}`);
    }
  }
});

test('karaoke: gli anchor rispettano l ordine ufficiale', () => {
  for (const id of IDS) {
    const lines = official[id] || [];
    let last = -1;
    for (const [, line] of (KARAOKE[id] || [])) {
      const li = lines.indexOf(line);
      assert.ok(li >= last, `${id}: voce fuori ordine ufficiale "${line}" (${li} < ${last})`);
      last = li;
    }
  }
});

// --- MISURA DEL SYNC: ogni voce è un anchor, quindi TUTTE devono essere corrette.

function anchorRows(id) {
  const key = new Set(anchoredFor(id).map(e => e[0] + '\u0000' + e[1]));
  const rows = syncReport(id, KARAOKE[id] || []);
  return rows.filter(r => key.has(r.start + '\u0000' + r.line));
}

test('sync: nessuna voce mostra versi sbagliati (copertura < 0.5)', () => {
  const bad = [];
  for (const id of IDS) {
    const wrong = anchorRows(id).filter(r => r.wrong);
    if (wrong.length) bad.push(`${id}(${wrong.length})`);
  }
  assert.equal(bad.length, 0, 'voci con versi sbagliati al momento giusto: ' + bad.join(', ') + '\n' + printTable());
});

test('sync: la copertura mediana per traccia e >= 0.5', () => {
  const bad = [];
  for (const id of IDS) {
    const rows = anchorRows(id);
    if (!rows.length) continue;
    const med = median(rows.map(r => r.coverage));
    if (!(med >= 0.5)) bad.push(`${id}(med=${med.toFixed(2)})`);
  }
  assert.equal(bad.length, 0, 'copertura mediana bassa: ' + bad.join(', ') + '\n' + printTable());
});

test('sync: errore mediano di onset <= 0.6s', () => {
  const errs = [];
  for (const id of IDS) for (const r of anchorRows(id)) errs.push(r.onsetErr);
  const med = median(errs);
  assert.ok(Number.isFinite(med), 'nessuna voce');
  assert.ok(med <= 0.6, `errore mediano di onset ${med.toFixed(3)}s > 0.6s\n` + printTable());
});
