// tools/align-core.mjs
// NUCLEO PURO di allineamento: mappa le righe ufficiali del testo ai tempi
// delle PAROLE di whisper. Nessun I/O: vedi tools/align-karaoke.mjs per il driver.
//
// REGOLA DI ACCETTAZIONE (per ogni riga ufficiale, con puntatore forward-only):
//   - normalizza i token (minuscolo, via accenti/punteggiatura)
//   - finestra = prossime `opts.window` parole (default 12) dal puntatore
//   - una riga e ACCETTATA se TUTTE:
//       (a) matched >= 2
//       (b) matched / tokens_in_line >= 0.5
//       (c) l'ULTIMO token di contenuto della riga e matchato nella finestra
//   - `start` = onset della PRIMA parola matchata della riga
//   - il puntatore avanza oltre le parole matchate (start monotoni)
//   - righe consecutive identiche vengono scartate

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

/**
 * @param {string[]} officialLines righe ufficiali (in ordine)
 * @param {Array<[number,number,string]>} words parole whisper [start,end,text]
 * @param {{window?:number}} [opts]
 * @returns {Array<[number,string]>} [[start, riga], ...]
 */
export function alignLines(officialLines, words, opts = {}) {
  const win = Number.isFinite(opts.window) && opts.window > 0 ? opts.window : 12;
  const lines = Array.isArray(officialLines) ? officialLines : [];
  const ws = Array.isArray(words) ? words : [];
  const wToks = ws.map(w => tokenize(wordText(w)));

  const out = [];
  let ptr = 0;

  for (const raw of lines) {
    const line = String(raw == null ? '' : raw);
    const toks = tokenize(line);
    if (!toks.length) continue;
    if (ptr >= ws.length) break;

    const end = Math.min(ws.length, ptr + win);
    const used = new Array(end - ptr).fill(false);
    let matched = 0;
    let firstIdx = -1;
    let maxIdx = -1;
    let lastTokMatched = false;

    for (let ti = 0; ti < toks.length; ti++) {
      const t = toks[ti];
      let found = -1;
      for (let wi = ptr; wi < end; wi++) {
        if (!used[wi - ptr] && wToks[wi].includes(t)) { found = wi; break; }
      }
      if (found >= 0) {
        used[found - ptr] = true;
        matched++;
        if (firstIdx < 0) firstIdx = found;
        if (found > maxIdx) maxIdx = found;
        if (ti === toks.length - 1) lastTokMatched = true;
      }
    }

    const ratio = matched / toks.length;
    const accepted = matched >= 2 && ratio >= 0.5 && lastTokMatched;

    if (accepted) {
      const start = wordOnset(ws[firstIdx]);
      if (Number.isFinite(start)) {
        const prev = out[out.length - 1];
        if (!prev || prev[1] !== line) out.push([start, line]);
      }
    }
    // Avanza il puntatore oltre la parola matchata PIU AVANTI (maxIdx), non
    // l'ultima: un token successivo puo matchare un indice precedente, e usare
    // lastIdx farebbe tornare indietro il puntatore (start non monotoni).
    // Avanza quando c'e un match forte (matched >= 2): la clip e un ESTRATTO a
    // meta canzone, quindi le righe iniziali non combaciano e senza avanzare sui
    // match parziali il puntatore resterebbe bloccato a 0.
    if (matched >= 2 && maxIdx >= 0) ptr = maxIdx + 1;
  }

  return out;
}
