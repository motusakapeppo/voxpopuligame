// ============================================================================
// ENCOUNTERS — le persone che incontri salendo. È qui che vive il gioco.
// Due verbi, coerenti ovunque:
//   TENDI  = ti connetti, aiuti, accetti (lealtà +1)
//   SPINGI = prevarichi, ignori, calpesti (lealtà -1)
// Lo stesso gesto ha esito diverso a seconda di CHI incontri.
// Tutto deterministico e testabile.
// ============================================================================

// Ogni tipo definisce cosa succede con ciascun verbo.
//   dy: spostamento verticale del giocatore (negativo = sale)
//   loyal: variazione di lealtà (silenziosa, influenza la piramide finale)
//   event: etichetta per l'animazione/effetto
//   fall: la figura cade (muore) — conta nella piramide finale
export const KINDS = {
  // Ti tende la mano: puoi accettare (sali aiutato) o rifiutarla e spingerlo.
  hand: {
    prompt: 'ti tende la mano',
    tendi:  { dy: -24, loyal: +1, event: 'taken',  fall: false },
    spingi: { dy: -24, loyal: -1, event: 'shoved', fall: true },
  },
  // Rivali che ti scavalcano per la "gara".
  rival: {
    prompt: 'ti scavalca',
    tendi:  { dy: 0,   loyal: +1, event: 'letpass', fall: false },
    spingi: { dy: -24, loyal: -1, event: 'shoved',  fall: true },
  },
  // Sta cadendo: puoi afferrarla (perdi quota) o lasciarla andare.
  falling: {
    prompt: 'sta cadendo',
    tendi:  { dy: +24, loyal: +2, event: 'caught', fall: false },
    spingi: { dy: 0,   loyal: -1, event: 'ignored', fall: true },
  },
  // Dorme (INTRO): svegliarla o calpestarla.
  sleeper: {
    prompt: 'dorme',
    tendi:  { dy: 0,   loyal: +1, event: 'woken', fall: false },
    spingi: { dy: -24, loyal: -1, event: 'shoved', fall: false },
  },
  // Ti culla per farti addormentare (HO SONNO / Sirene).
  siren: {
    prompt: 'ti culla',
    tendi:  { dy: 0,   loyal: +1, event: 'refused', fall: false },   // resisti restando con lei
    spingi: { dy: -24, loyal: -1, event: 'escaped', fall: false },   // la allontani e sali
  },
  // Ti spinge giù (SCENDI / i potenti). Tendi = reggi il colpo insieme a chi è sotto.
  pusher: {
    prompt: 'ti spinge giù',
    tendi:  { dy: -24, loyal: +1, event: 'resisted', fall: false },
    spingi: { dy: +48, loyal: -1, event: 'pushed',   fall: false },
  },
  // Figura finta (TUTTO FINTO): fidarsi è la trappola.
  fake: {
    prompt: 'sembra reale',
    tendi:  { dy: 0,   loyal: -1, event: 'deceived', fall: false },
    spingi: { dy: 0,   loyal: +1, event: 'sawThrough', fall: false },
  },
  // Il tuo doppio (EDERA): ti vuole controllare.
  self: {
    prompt: 'sei tu',
    tendi:  { dy: -24, loyal: -1, event: 'controlled', fall: false },
    spingi: { dy: -24, loyal: +1, event: 'refused',    fall: false },
  },
  // Una figura del coro (MARANATHA): tendersi le mani tutti insieme.
  chorus: {
    prompt: 'canta e tende le mani',
    tendi:  { dy: -24, loyal: +2, event: 'joined', fall: false },
    spingi: { dy: 0,   loyal: -1, event: 'ignored', fall: false },
  },
  // TI AIUTA: ti porge la mano e ti tira su. Non devi fare nulla.
  helper: {
    prompt: 'ti porge la mano e ti tira su',
    auto: true,
    tendi:  { dy: -24, loyal: +1, event: 'helped', fall: false },
    spingi: { dy: 0,   loyal: -1, event: 'ignored', fall: false },
  },
  // TI AFFERRA: cerca di buttarti giù. Parte il minigioco di lotta (mash).
  grabber: {
    prompt: 'ti afferra per buttarti giù — martella!',
    mash: true,
    tendi:  { dy: 0,   loyal: +1, event: 'resisted', fall: false },
    spingi: { dy: -24, loyal: -1, event: 'threwDown', fall: true },
  },
};

// Gli incontri "automatici" non chiedono una scelta Z/X: o ti aiutano da soli
// (helper) o avviano la lotta a martello (grabber).
export function isAutoKind(kind) {
  const d = KINDS[kind];
  return !!(d && (d.auto || d.mash));
}

// Quanti incontri per girone e di che tipo (in ordine di scalata).
// Ogni girone è monotono: non "spam" di tipi, ma una progressione tematica.
export const GIRONE_ENCOUNTERS = {
  '01': ['sleeper', 'helper', 'hand'],
  '02': ['hand', 'grabber', 'pusher'],
  '03': ['rival', 'helper', 'falling'],
  '04': ['falling', 'grabber', 'pusher'],
  '05': ['siren', 'helper', 'hand'],
  '06': ['rival', 'grabber', 'hand'],
  '07': ['rival', 'falling', 'grabber'],
  '08': ['fake', 'helper', 'hand'],
  '09': ['self', 'grabber', 'falling'],
  '10': ['pusher', 'grabber', 'hand'],
  '11': ['falling', 'grabber', 'helper'],
  '12': ['chorus', 'helper', 'hand'],
  '13': ['hand'],
};

// Crea gli incontri per un girone, distribuiti lungo la scala.
export function createEncounters(girone, bodies) {
  const kinds = GIRONE_ENCOUNTERS[girone.id] || ['hand'];
  const ys = [...new Set(bodies.map(b => b.y))].sort((a, b) => a - b);
  const out = [];
  const n = kinds.length;
  for (let i = 0; i < n; i++) {
    // distribuisci gli incontri su mensole via via più in alto
    const idx = Math.floor((ys.length - 1) * ((i + 1) / (n + 1)));
    const y = ys[idx];
    const onLedge = bodies.find(b => b.y === y) || bodies[0];
    // la figura sta sul bordo della mensola, a un lato
    const onLeft = i % 2 === 0;
    const x = onLeft ? onLedge.x + onLedge.w - 6 : onLedge.x + 2;
    out.push({
      id: `enc${i}`,
      kind: kinds[i],
      x, y: y - 11,        // la figura poggia sul bordo della mensola
      w: 9, h: 11,
      resolved: false,
      verb: null,
    });
  }
  return out;
}

// L'incontro attivo: il più vicino e non ancora risolto, entro il raggio.
export function activeEncounter(encs, p) {
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  for (const e of encs) {
    if (e.resolved) continue;
    const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
    if (Math.abs(ex - cx) < 20 && Math.abs(ey - cy) < 20) return e;
  }
  return null;
}

// Applica un verbo a un incontro. Ritorna l'effetto e segna l'incontro risolto.
export function resolveEncounter(enc, verb) {
  const def = KINDS[enc.kind];
  if (!def) throw new Error('unknown encounter kind: ' + enc.kind);
  const eff = def[verb];
  if (!eff) throw new Error('unknown verb: ' + verb);
  enc.resolved = true;
  enc.verb = verb;
  return { ...eff, kind: enc.kind };
}
