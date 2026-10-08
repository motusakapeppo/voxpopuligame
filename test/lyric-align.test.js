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
import { alignLines, alignLinesWithMeta, alignWithFill, calibrateOffset, tokenize } from '../tools/align-core.mjs';
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

function filledFor(id) {
  const lines = official[id] || [];
  const ws = (words[id] && words[id].words) || [];
  return alignWithFill(lines, ws, { duration: clipDuration(id) }).entries;
}

test('gap-fill: ogni traccia ha PIU voci degli anchor stretti', () => {
  const bad = [];
  for (const id of IDS) {
    const before = anchorsFor(id).entries.length;
    const after = filledFor(id).length;
    if (!(after > before)) bad.push(`${id}(${before}->${after})`);
  }
  assert.equal(bad.length, 0, 'tracce senza riempimento: ' + bad.join(', '));
});

test('gap-fill: start monotoni non decrescenti e dentro [0, durata]', () => {
  for (const id of IDS) {
    const dur = clipDuration(id);
    const out = filledFor(id);
    for (let i = 0; i < out.length; i++) {
      assert.ok(out[i][0] >= 0, `${id}: start negativo a ${i} (${out[i][0]})`);
      assert.ok(out[i][0] <= dur + 1e-9, `${id}: start ${out[i][0]} oltre durata ${dur}`);
      if (i > 0) assert.ok(out[i][0] >= out[i - 1][0], `${id}: start non monotono a ${i}`);
    }
  }
});

test('gap-fill: gli ANCHOR sono preservati esattamente (tempo e testo)', () => {
  for (const id of IDS) {
    const anchors = anchorsFor(id).entries;
    const out = filledFor(id);
    for (const [start, line] of anchors) {
      const hit = out.find(e => e[1] === line && Math.abs(e[0] - start) < 1e-9);
      assert.ok(hit, `${id}: anchor perso "${line}" @${start}`);
    }
  }
});

test('gap-fill: 03-tuoni "Quando ci sono i tuoni" resta a ~16.59', () => {
  const out = filledFor('03-tuoni');
  const line = out.find(e => /Quando ci sono i tuoni/.test(e[1]));
  assert.ok(line, 'riga "tuoni" non trovata');
  assert.ok(Math.abs(line[0] - 16.59) < 0.01, `start ${line[0]} != 16.59`);
});

test('gap-fill: 11-lafinedelmondo "È la fine del mondo" presente (montaggio: puo cadere prima di 8s)', () => {
  const out = filledFor('11-lafinedelmondo');
  const line = out.find(e => /fine del mondo/.test(e[1]));
  assert.ok(line, 'riga "fine del mondo" non trovata');
  assert.ok(line[0] >= 3.0, `start ${line[0]} < 3.0`);
});

test('gap-fill: nessuna riga consecutiva duplicata', () => {
  for (const id of IDS) {
    const out = filledFor(id);
    for (let i = 1; i < out.length; i++) {
      assert.notEqual(out[i][1], out[i - 1][1], `${id}: duplicato consecutivo a ${i}`);
    }
  }
});

test('gap-fill: la sotto-sequenza degli ANCHOR rispetta l ordine ufficiale', () => {
  // Le clip sono MONTAGGI: le righe interpolate possono deviare dall ordine
  // ufficiale. Gli ANCHOR (alta confidenza) invece devono essere coerenti.
  for (const id of IDS) {
    const lines = official[id] || [];
    const anchors = anchorsFor(id).entries;
    let last = -1;
    for (const [, line] of anchors) {
      const li = lines.indexOf(line);
      assert.ok(li >= last, `${id}: anchor fuori ordine ufficiale "${line}" (${li} < ${last})`);
      last = li;
    }
  }
});

// --- MISURA DEL SYNC (RED -> GREEN) -----------------------------------------
//
// La copertura si misura sugli ANCHOR (righe ad alta confidenza, tempi esatti):
// le righe interpolate sono per definizione "di riempimento" e non hanno un
// onset whisper proprio, quindi non si pretende copertura >= 0.5 da loro.

// voci di KARAOKE[id] che sono anchor (testo+tempo combaciano con anchorsFor).
function anchorRows(id) {
  const anchors = anchorsFor(id).entries;
  const key = new Set(anchors.map(e => e[0] + '\u0000' + e[1]));
  const rows = syncReport(id, KARAOKE[id] || []);
  return rows.filter(r => key.has(r.start + '\u0000' + r.line));
}

test('sync: nessun ANCHOR mostra versi sbagliati (copertura < 0.5)', () => {
  const bad = [];
  for (const id of IDS) {
    const wrong = anchorRows(id).filter(r => r.wrong);
    if (wrong.length) bad.push(`${id}(${wrong.length})`);
  }
  assert.equal(
    bad.length, 0,
    'anchor con versi sbagliati al momento giusto: ' + bad.join(', ') + '\n' + printTable()
  );
});

test('sync: la copertura mediana degli ANCHOR per traccia e >= 0.5', () => {
  const bad = [];
  for (const id of IDS) {
    const rows = anchorRows(id);
    if (!rows.length) continue;
    const med = median(rows.map(r => r.coverage));
    if (!(med >= 0.5)) bad.push(`${id}(med=${med.toFixed(2)})`);
  }
  assert.equal(bad.length, 0, 'copertura mediana anchor bassa: ' + bad.join(', ') + '\n' + printTable());
});

test('sync: errore mediano di onset sugli ANCHOR <= 0.6s', () => {
  const errs = [];
  for (const id of IDS) {
    for (const r of anchorRows(id)) errs.push(r.onsetErr);
  }
  const med = median(errs);
  assert.ok(Number.isFinite(med), 'nessun anchor');
  assert.ok(med <= 0.6, `errore mediano di onset anchor ${med.toFixed(3)}s > 0.6s\n` + printTable());
});

// --- T1 CONTRACT: la lirica copre TUTTA la clip (niente zone morte/salti) ----
// RED prima del fix: fillGaps scartava versi (sampleIndices) e la coda si fermava
// a lastWhisperOnset+1 -> 07-tictac morto a 9.3s su 20s, 05-hosonno con 2 voci.
const MAX_GAP = 2.5;      // la riga non resta mai "incollata" più di 2.5s
const MIN_LAST = 2.5;     // l'ultima voce deve arrivare entro 2.5s dalla fine clip

function fullFill(id) {
  const lines = official[id] || [];
  const ws = (words[id] && words[id].words) || [];
  return alignWithFill(lines, ws, { duration: clipDur(id), minSpacing: 1.2 }).entries;
}

test('T1: ogni traccia copre fino a [clipDur] con start monotoni, ultimo>=dur-2.5', () => {
  const bad = [];
  for (const id of IDS) {
    const dur = clipDur(id);
    const out = fullFill(id);
    if (!out.length) { bad.push(`${id}(vuoto)`); continue; }
    const last = out[out.length - 1][0];
    if (last < dur - MIN_LAST) bad.push(`${id}(ultimo ${last} < ${dur - MIN_LAST})`);
    for (let i = 1; i < out.length; i++) {
      if (out[i][0] < out[i - 1][0]) bad.push(`${id}(non monotono a ${i})`);
      if (out[i][0] - out[i - 1][0] > MAX_GAP + 1e-9) bad.push(`${id}(gap ${(out[i][0]-out[i-1][0]).toFixed(2)} a ${i})`);
    }
  }
  assert.equal(bad.length, 0, 'copertura incompleta: ' + bad.join(', '));
});

test('T1: nessuna riga consecutiva duplicata', () => {
  for (const id of IDS) {
    const out = fullFill(id);
    for (let i = 1; i < out.length; i++) {
      assert.notEqual(out[i][1], out[i - 1][1], `${id}: duplicato consecutivo a ${i}`);
    }
  }
});

test('T1: gli ANCHOR ad alta confidenza restano ESATTI (tempo+testo)', () => {
  for (const id of IDS) {
    for (const [start, line] of anchorsFor(id).entries) {
      const hit = fullFill(id).find(e => e[1] === line && Math.abs(e[0] - start) < 1e-9);
      assert.ok(hit, `${id}: anchor perso "${line}" @${start}`);
    }
  }
});

test('T1: 07-tictac (5 voci, ultimo @9.32/20s) ora copre tutta la clip (>=14 voci)', () => {
  const out = fullFill('07-tictac');
  assert.ok(out.length >= 14, `07-tictac ha ${out.length} voci, attese >=14`);
  const dur = clipDur('07-tictac');
  const pts = [0, ...out.map(e => e[0]), dur];
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i] - pts[i - 1] <= MAX_GAP + 1e-9, `buco ${(pts[i]-pts[i-1]).toFixed(2)}s @${pts[i-1]}`);
});

test('T1: 05-hosonno (2 sole voci whisper) ora >=8 voci su ~20s', () => {
  const out = fullFill('05-hosonno');
  assert.ok(out.length >= 8, `05-hosonno ha ${out.length} voci, attese >=8`);
});

test('T1: nessun buco cieco — l output copre la clip end-to-end (niente >2.5s fermi)', () => {
  // la lirica non deve MAI restare "incollata": anche nei montaggi (07) in cui
  // il whisper canta versi non in ordine ufficiale, la copertura temporale resta
  // continua fino alla fine della clip.
  const bad = [];
  for (const id of IDS) {
    const dur = clipDur(id);
    const out = fullFill(id);
    const pts = [0, ...out.map(e => e[0]), dur];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i] - pts[i - 1] > MAX_GAP + 1e-9) { bad.push(`${id}(${(pts[i]-pts[i-1]).toFixed(2)}s @${pts[i-1]})`); break; }
    }
  }
  assert.equal(bad.length, 0, 'buchi ciechi nella copertura: ' + bad.join(', '));
});
