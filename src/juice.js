// ============================================================================
// JUICE — il "game feel". Puro e deterministico, nessun DOM.
// Raccoglie i sistemi che fanno sembrare un gioco "costoso":
//   - HIT-STOP: micro-congelamento all'impatto (i colpi pesano)
//   - PUNCH:  la camera "spinge" dentro e torna con una molla
//   - SHAKE:  scossa direzionale con decadimento
//   - FLASH:  lampo breve
//   - BEAT:   pulsazione a tempo (BPM) per sincronizzare i visual alla musica
//   - FLOW:   barra che sale salendo in ritmo e intensifica tutto
// ============================================================================

const FLOW_MAX = 1;
const FLOW_UP = 0.45;      // di quanto sale il flow al secondo salendo
const FLOW_DOWN = 0.9;     // di quanto cala quando sei fermo/colpito

export function createJuice() {
  return {
    hitstop: 0,                       // secondi di congelamento residui
    punch: 0, punchVel: 0,            // zoom della camera
    shake: 0, dirX: 0, dirY: 0,       // scossa
    flash: 0,                         // lampo
    bpm: 100, beatPhase: 0, beat: 0,  // pulsazione a tempo
    flow: 0,                          // 0..1
    combo: 0,                         // scalata continua
  };
}

// Un impatto: congela, spinge la camera, scuote, lampeggia.
// Valori allineati alla ricerca (guida §6): hit-stop base ~20ms all'impatto
// (Nijman: "20 milliseconds or something"); shake 2–4px a 320×180 (era 10px).
export function impact(j, power = 1, dx = 0, dy = 0) {
  const p = Number.isFinite(power) ? power : 1;
  j.hitstop = Math.max(j.hitstop, Math.min(0.05, 0.020 * p));
  punch(j, Math.min(0.14, 0.06 * p));
  j.shake = Math.max(j.shake, Math.min(6, 2.2 * p));
  j.dirX = Number.isFinite(dx) ? dx : 0;
  j.dirY = Number.isFinite(dy) ? dy : 0;
  j.flash = Math.max(j.flash, Math.min(0.7, 0.3 * p));
}

export function punch(j, amt) {
  const a = Number.isFinite(amt) ? amt : 0;
  j.punch = Math.min(0.16, j.punch + a);
}

export function addFlow(j, amt) {
  const a = Number.isFinite(amt) ? amt : 0;
  j.flow = Math.max(0, Math.min(FLOW_MAX, j.flow + a));
}

export function breakFlow(j) { j.flow = 0; j.combo = 0; }

export function setBpm(j, bpm) { j.bpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 100; }

// Avanza tutti i sistemi. Ritorna l'ampiezza del "battito" corrente (0..1).
export function stepJuice(j, dt) {
  const d = Number.isFinite(dt) ? dt : 0.016;
  // hit-stop
  j.hitstop = Math.max(0, j.hitstop - d);
  // punch: molla critica smorzata verso 0
  j.punchVel += (-j.punch) * 140 * d;
  j.punchVel *= Math.pow(0.015, d);
  j.punch += j.punchVel * d;
  if (Math.abs(j.punch) < 0.0005 && Math.abs(j.punchVel) < 0.0005) { j.punch = 0; j.punchVel = 0; }
  // shake e flash decadono
  j.shake = Math.max(0, j.shake - d * 22);
  j.flash = Math.max(0, j.flash - d * 5.5);
  // battito: fase da BPM; l'ampiezza è un impulso che decade dentro il battito
  j.beatPhase += d * (j.bpm / 60);
  const frac = j.beatPhase - Math.floor(j.beatPhase);
  j.beat = Math.pow(1 - frac, 3);   // 1 all'inizio del battito, 0 alla fine
  return j.beat;
}

// Offset di scossa direzionale (per la camera). Deterministico sul tempo.
export function shakeOffsetJ(j, time) {
  if (j.shake <= 0.01) return { x: 0, y: 0 };
  const t = Number.isFinite(time) ? time : 0;
  const amp = j.shake;
  const dx = j.dirX || 1, dy = j.dirY || 0;
  const n = Math.sin(t * 63) * Math.cos(t * 41);
  const n2 = Math.sin(t * 47 + 2) * Math.cos(t * 57);
  return { x: (dx * 0.6 + n * 0.4) * amp, y: (dy * 0.6 + n2 * 0.4) * amp };
}

// Fattore di zoom della camera (1 = neutro).
export function punchZoom(j) { return 1 + Math.max(0, j.punch) * 0.6; }

export function flowRatio(j) {
  const f = Number.isFinite(j.flow) ? j.flow : 0;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

// BPM per traccia: guida la pulsazione dei visual.
export const BPM_BY_TRACK = {
  '01-intro': 90, '02-vento': 100, '03-tuoni': 96, '04-baghdad': 112,
  '05-hosonno': 84, '06-primoposto': 122, '07-tictac': 132, '08-tuttofinto': 106,
  '09-edera': 100, '10-scendi': 116, '11-lafinedelmondo': 80,
  '12-maranatha': 92, '13-outro': 70,
};

export function bpmFor(audioId) {
  const b = BPM_BY_TRACK[audioId];
  return Number.isFinite(b) ? b : 100;
}

export { FLOW_MAX, FLOW_UP, FLOW_DOWN };
