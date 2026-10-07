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
