// tools/align-core.mjs
// NUCLEO PURO di allineamento: mappa le righe ufficiali del testo ai tempi
// delle PAROLE di whisper. Nessun I/O: vedi tools/align-karaoke.mjs per il driver.
//
// ALGORITMO (v2 — monotono globale, non piu' puntatore forward-only):
//   1. Per ogni riga ufficiale si cerca la MIGLIORE finestra di parole whisper
//      (finestra ancorata alla PRIMA parola matchata) che soddisfi:
//        (a) matched >= opts.minMatched (default 2)
//        (b) matched / tokens_in_line >= opts.minRatio (default 0.5)
//        (c) l'ULTIMO token di contenuto della riga e' matchato (se requireLast)
//      `start` = onset della PRIMA parola matchata della riga.
//   2. Si sceglie la SOTTO-SEQUENZA MONOTONA (LIS) di righe con onset crescente
//      e finestre NON sovrapposte, massimizzando prima il numero di righe e poi
//      la somma delle coperture. Questo elimina il bug del puntatore: una riga
//      respinta NON fa piu' avanzare il cursore oltre le parole che le
//      appartenevano, quindi le righe successive non vengono piu' "saltate"
//      (era la causa dei versi sbagliati in 06-primoposto / 10-scendi).
//   3. Calibrazione GLOBALE per clip: si stima il lead (numero di token iniziali
//      non matchati * durata mediana di parola) e si applica un offset costante
//      (clamp [-0.3, +0.3]s) a tutti gli start, cosi' la riga appare appena
//      PRIMA della parola cantata (come nel karaoke di produzione).
//
// REGOLA: meglio poche righe CORRETTE che molte righe sbagliate. Se una riga
// non ha un match forte viene semplicemente omessa (nessuna distribuzione
// uniforme inventata).

export function normalizeToken(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(s) {
  const n = normalizeToken(s);
  return n ? n.split(' ').filter(t => t.length > 1) : [];
}

function wordOnset(w) {
  if (Array.isArray(w)) return Number(w[0]);
  if (w && typeof w === 'object') return Number(w.start);
  return NaN;
}

function wordText(w) {
  if (Array.isArray(w)) return w[2];
  if (w && typeof w === 'object') return w.text;
  return '';
}

// Copertura dei token della riga nella finestra [i, i+win) delle parole whisper.
// Ritorna: matched, indice della prima parola matchata, indice dell'ultima,
// se l'ultimo token della riga e' stato matchato, e il rapporto di copertura.
function cover(toks, wToks, i, win) {
  const end = Math.min(wToks.length, i + win);
  const used = new Set();
  let matched = 0, first = -1, lastIdx = -1, last = false;
  for (let ti = 0; ti < toks.length; ti++) {
    const t = toks[ti];
    for (let j = i; j < end; j++) {
      if (!used.has(j) && wToks[j].includes(t)) {
        used.add(j);
        matched++;
        if (first < 0) first = j;
        if (j > lastIdx) lastIdx = j;
        if (ti === toks.length - 1) last = true;
        break;
      }
    }
  }
  return { matched, first, lastIdx, last, ratio: toks.length ? matched / toks.length : 0 };
}

function median(xs) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Calibrazione GLOBALE per clip (drift guard).
 * L'offset che minimizza l'errore assoluto tra gli start emessi e gli onset
 * delle parole matchate e' la MEDIANA dei residui (onset - start) — stimatore
 * robusto del minimo L1. Poiche' gli start sono gia' ancorati all'onset della
 * prima parola matchata, per dati consistenti l'offset vale 0; se le clip
 * fossero ri-tagliate senza ri-trascrivere (drift), questo termine lo corregge.
 * Clampato in [minOffset, maxOffset] (default [-0.3, +0.3]s).
 * @returns {number} offset in secondi
 */
export function calibrateOffset(seq, words, opts = {}) {
  if (!Array.isArray(seq) || seq.length < 2) return 0;
  const residuals = [];
  for (const c of seq) {
    const onset = wordOnset(words[c.first]);
    if (Number.isFinite(onset) && Number.isFinite(c.onset)) residuals.push(onset - c.onset);
  }
  if (!residuals.length) return 0;
  const med = median(residuals);
  const lo = Number.isFinite(opts.minOffset) ? opts.minOffset : -0.3;
  const hi = Number.isFinite(opts.maxOffset) ? opts.maxOffset : 0.3;
  return Math.max(lo, Math.min(hi, med));
}

/**
 * Allineamento con metadati (usato dal driver e dai test di misura).
 * @param {string[]} officialLines righe ufficiali (in ordine)
 * @param {Array<[number,number,string]>} words parole whisper [start,end,text]
 * @param {{window?:number,minRatio?:number,requireLast?:boolean,minMatched?:number,offset?:number|'auto'|'none'}} [opts]
 * @returns {{entries:Array<[number,string]>, offset:number, candidates:Array}}
 */
export function alignLinesWithMeta(officialLines, words, opts = {}) {
  const ws = Array.isArray(words) ? words : [];
  const wToks = ws.map(w => tokenize(wordText(w)));
  const minRatio = Number.isFinite(opts.minRatio) ? opts.minRatio : 0.5;
  const requireLast = opts.requireLast !== false;
  const minMatched = Number.isFinite(opts.minMatched) ? opts.minMatched : 2;
  const win = Number.isFinite(opts.window) && opts.window > 0 ? opts.window : 12;
  const lines = Array.isArray(officialLines) ? officialLines : [];

  // 1) candidati: migliore finestra per riga
  const cand = [];
  for (let li = 0; li < lines.length; li++) {
    const line = String(lines[li] == null ? '' : lines[li]);
    const toks = tokenize(line);
    if (!toks.length) continue;
    const w = Math.max(win, toks.length + 2);
    let best = null;
    for (let i = 0; i < wToks.length; i++) {
      const c0 = cover(toks, wToks, i, w);
      if (c0.first < 0) continue;
      const c = cover(toks, wToks, c0.first, w);
      if (requireLast && !c.last) continue;
      if (c.matched < minMatched) continue;
      if (!best || c.ratio > best.ratio || (c.ratio === best.ratio && c.matched > best.matched)) {
        best = {
          ratio: c.ratio,
          matched: c.matched,
          first: c.first,
          lastIdx: c.lastIdx,
          onset: wordOnset(ws[c.first]),
        };
      }
    }
    if (best && best.ratio >= minRatio && Number.isFinite(best.onset)) {
      cand.push({ li, line, ...best });
    }
  }

  // 2) LIS: onset crescente + finestre non sovrapposte, max righe poi copertura
  const n = cand.length;
  const dp = cand.map(() => ({ len: 1, score: 0, prev: -1 }));
  for (let i = 0; i < n; i++) {
    dp[i].score = cand[i].ratio;
    for (let j = 0; j < i; j++) {
      if (cand[j].onset < cand[i].onset && cand[j].lastIdx < cand[i].first) {
        const l = dp[j].len + 1;
        if (l > dp[i].len || (l === dp[i].len && dp[j].score + cand[i].ratio > dp[i].score)) {
          dp[i].len = l;
          dp[i].score = dp[j].score + cand[i].ratio;
          dp[i].prev = j;
        }
      }
    }
  }
  let bi = -1;
  for (let i = 0; i < n; i++) {
    if (bi < 0 || dp[i].len > dp[bi].len || (dp[i].len === dp[bi].len && dp[i].score > dp[bi].score)) bi = i;
  }
  const seq = [];
  for (let i = bi; i >= 0; i = dp[i].prev) {
    seq.push(cand[i]);
    if (dp[i].prev < 0) break;
  }
  seq.reverse();

  // 3) offset globale (lead) e bake negli start
  let offset = 0;
  if (opts.offset === 'none') offset = 0;
  else if (Number.isFinite(opts.offset)) offset = opts.offset;
  else offset = calibrateOffset(seq, ws, opts);

  const entries = [];
  for (const c of seq) {
    const start = Number((c.onset + offset).toFixed(2));
    const prev = entries[entries.length - 1];
    if (!prev || prev[1] !== c.line) entries.push([start, c.line]);
  }
  return { entries, offset, candidates: seq };
}

/**
 * API storica: ritorna solo [[start, riga], ...].
 * @returns {Array<[number,string]>}
 */
export function alignLines(officialLines, words, opts = {}) {
  return alignLinesWithMeta(officialLines, words, opts).entries;
}

// ---------------------------------------------------------------------------
// GAP-FILL (v3): gli anchor del matcher stretto restano ESATTI; le righe
// ufficiali intermedie vengono distribuite nei buchi per non lasciare la
// lirica "incollata" per molti secondi mentre l'audio canta altri versi.
//
// Regole:
//   - tra due anchor (tA, liA) e (tB, liB): le righe ufficiali con indice in
//     (liA, liB) vengono piazzate uniformemente in (tA, tB], in ordine.
//   - testa (prima del primo anchor): si riempie SOLO se l'audio inizia presto
//     (prima parola whisper <= headMaxStart) e le righe precedenti ci stanno
//     con spaziatura >= minSpacing; altrimenti si lascia stare (niente invenzioni).
//   - coda (dopo l'ultimo anchor): si riempie fino alla durata stimata, con lo
//     stesso vincolo di spaziatura.
//   - guardrail: start monotoni non decrescenti, mai < 0, mai oltre la durata,
//     mai duplicati consecutivi, spaziatura minima minSpacing tra interpolate.
// ---------------------------------------------------------------------------

function estimateDuration(words, opts) {
  if (Number.isFinite(opts.duration) && opts.duration > 0) return opts.duration;
  const ws = Array.isArray(words) ? words : [];
  if (!ws.length) return 0;
  const last = wordOnset(ws[ws.length - 1]);
  return Number.isFinite(last) ? last + 1 : 0;
}

// n indici equispaziati in [0, count): deterministico, senza Math.random.
function sampleIndices(count, n) {
  const out = [];
  if (n <= 0 || count <= 0) return out;
  if (n >= count) { for (let i = 0; i < count; i++) out.push(i); return out; }
  const seen = new Set();
  for (let k = 0; k < n; k++) {
    let i = Math.round(((k + 1) * count) / (n + 1)) - 1;
    if (i < 0) i = 0;
    if (i > count - 1) i = count - 1;
    while (seen.has(i) && i < count - 1) i++;
    while (seen.has(i) && i > 0) i--;
    seen.add(i);
    out.push(i);
  }
  out.sort((a, b) => a - b);
  return out;
}

/**
 * Riempie i buchi tra gli anchor con le righe ufficiali intermedie.
 * @param {string[]} officialLines righe ufficiali (in ordine)
 * @param {Array<[number,string]>} anchors voci ad alta confidenza (tempi esatti)
 * @param {Array<[number,number,string]>} words parole whisper [start,end,text]
 * @param {{duration?:number,minSpacing?:number,headMaxStart?:number}} [opts]
 * @returns {Array<[number,string]>} voci con anchor preservati + interpolate
 */
export function fillGaps(officialLines, anchors, words, opts = {}) {
  const lines = Array.isArray(officialLines) ? officialLines : [];
  const anch = Array.isArray(anchors) ? anchors : [];
  const minSpacing = Number.isFinite(opts.minSpacing) && opts.minSpacing > 0 ? opts.minSpacing : 1.2;
  const dur = estimateDuration(words, opts);
  if (!anch.length) return [];

  // indici ufficiali degli anchor (prima occorrenza non ancora consumata, cosi'
  // i ritornelli ripetuti restano coerenti).
  const used = new Set();
  const anchorIdx = [];
  for (const [start, line] of anch) {
    let li = -1;
    for (let k = 0; k < lines.length; k++) {
      if (lines[k] === line && !used.has(k)) { li = k; break; }
    }
    if (li < 0) li = lines.indexOf(line);
    if (li >= 0) used.add(li);
    anchorIdx.push({ start, line, li });
  }

  const out = [];
  const push = (start, line) => {
    const s = Number(Math.max(0, start).toFixed(2));
    const prev = out[out.length - 1];
    if (prev && prev[1] === line) return;          // niente duplicati consecutivi
    if (prev && s < prev[0]) return;               // monotonia garantita
    out.push([s, line]);
  };

  // --- testa: righe ufficiali prima del primo anchor -------------------------
  // Si riempie solo se c'e' audio cantato PRIMA dell'anchor (firstOnset < tA) e
  // c'e' spazio; si distribuisce in [firstOnset, tA) prendendo le righe PIU'
  // VICINE all'anchor (le ultime prima di esso). Niente liriche sul silenzio.
  {
    const a0 = anchorIdx[0];
    const pre = a0.li;
    const firstOnset = words && words.length ? wordOnset(words[0]) : 0;
    const headStart = Number.isFinite(firstOnset) ? Math.max(0, firstOnset) : 0;
    const room = a0.start - headStart;
    const maxFit = Math.floor(room / minSpacing) - 1;
    if (pre > 0 && maxFit >= 1 && room > 0) {
      const n = Math.min(pre, maxFit);
      const from = a0.li - n;                       // ultime n righe prima dell'anchor
      const step = room / (n + 1);
      for (let k = 0; k < n; k++) push(headStart + (k + 1) * step, lines[from + k]);
    }
  }

  // --- gap tra anchor consecutivi --------------------------------------------
  for (let i = 1; i < anchorIdx.length; i++) {
    const a = anchorIdx[i - 1], b = anchorIdx[i];
    push(a.start, a.line);                          // anchor ESATTO
    const between = b.li - a.li - 1;
    const win = b.start - a.start;
    const maxFit = Math.floor(win / minSpacing) - 1;
    if (between > 0 && maxFit >= 1 && win > 0) {
      const n = Math.min(between, maxFit);
      const picks = sampleIndices(between, n);      // sottoinsieme equispaziato
      const step = win / (n + 1);
      for (let k = 0; k < n; k++) push(a.start + (k + 1) * step, lines[a.li + 1 + picks[k]]);
    }
  }
  push(anchorIdx[anchorIdx.length - 1].start, anchorIdx[anchorIdx.length - 1].line);

  // --- coda: righe ufficiali dopo l'ultimo anchor ----------------------------
  if (dur > 0) {
    const al = anchorIdx[anchorIdx.length - 1];
    const after = lines.length - al.li - 1;
    const room = dur - al.start;
    const maxFit = Math.floor(room / minSpacing);
    if (after > 0 && maxFit >= 1) {
      const n = Math.min(after, maxFit);
      const step = room / (n + 1);
      for (let k = 0; k < n; k++) push(al.start + (k + 1) * step, lines[al.li + 1 + k]);
    }
  }

  return out;
}

/**
 * Allineamento completo: anchor stretti (tempi esatti) + riempimento dei buchi.
 * Replica la strategia del driver: PASS 1 stretto; se produce < 2 righe, PASS 2
 * largo (finestra ampia, ultimo token non obbligatorio) per le clip molto corte.
 * @param {string[]} officialLines
 * @param {Array<[number,number,string]>} words
 * @param {{window?:number,minRatio?:number,requireLast?:boolean,minMatched?:number,offset?:number|'auto'|'none',duration?:number,minSpacing?:number}} [opts]
 * @returns {{entries:Array<[number,string]>, anchors:Array<[number,string]>, offset:number, candidates:Array, pass:string}}
 */
export function alignWithFill(officialLines, words, opts = {}) {
  let res = alignLinesWithMeta(officialLines, words, { window: 12, minRatio: 0.5, requireLast: true, ...opts });
  let pass = 'strict';
  if (res.entries.length < 2) {
    const loose = alignLinesWithMeta(officialLines, words, { window: 24, minRatio: 0.4, requireLast: false, ...opts });
    if (loose.entries.length > res.entries.length) { res = loose; pass = 'loose'; }
  }
  const entries = fillGaps(officialLines, res.entries, words, opts);
  return { entries, anchors: res.entries, offset: res.offset, candidates: res.candidates, pass };
}
