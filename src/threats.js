// ============================================================================
// THREATS — ostacoli e aiuti specifici di ogni canzone.
// Ogni brano ha un pericolo ricorrente (che colpisce la tua presa) e, spesso,
// un aiuto che puoi raccogliere. Tutto legato ai versi del brano.
// Determininistico e testabile: nessun Math.random.
//
// T5 — ogni pericolo ha una FIRMA MECCANICA DIVERSA (non tutti lo stesso
// shiftHands(0,-1)): quake scuote, debris fa cadere un masso, rival duella,
// ivy tira con una corda, time accelera, fake inganna, drowsy rallenta,
// wind spinge, rain scivola, water sale. `slow` rallenta davvero la cadenza.
// ============================================================================

// LCG deterministico (Numerical Recipes): nessun Math.random, seme in state.rng.
function lcgNext(state) {
  state.rng = (Math.imul(1664525, state.rng >>> 0) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}

// effetti applicati all'arrampicata (mutano le mani del climb)
function shiftHands(cl, dc, dr) {
  const nc = (c, r) => Math.max(0, Math.min(cl.cols.length - 1, c));
  const nr = (r) => Math.max(0, Math.min(cl.nRows - 1, r));
  // solo se esiste l'appiglio, altrimenti prova la colonna vicina
  const moveTo = (h, c, r) => {
    for (let d = 0; d < 3; d++) {
      if (cl.has(nc(c - d), r)) { h.c = nc(c - d); h.r = r; return; }
      if (cl.has(nc(c + d), r)) { h.c = nc(c + d); h.r = r; return; }
    }
  };
  moveTo(cl.lh, cl.lh.c + dc, nr(cl.lh.r + dr));
  moveTo(cl.rh, cl.rh.c + dc, nr(cl.rh.r + dr));
  cl.lhA = { ...cl.lh }; cl.rhA = { ...cl.rh };
}

// Per ogni brano: pericolo periodico + aiuti.
export const THREATS = {
  '01-intro':     { auto: [], pickups: [] },
  '02-vento':     { auto: [{ kind: 'wind', every: 3.2 }], pickups: [{ kind: 'gust', at: 0.45 }] },
  '03-tuoni':     { auto: [{ kind: 'quake', every: 4.0 }], pickups: [{ kind: 'grip', at: 0.6 }] },
  '04-baghdad':   { auto: [{ kind: 'debris', every: 2.6 }], pickups: [{ kind: 'shield', at: 0.5 }] },
  '05-hosonno':   { auto: [{ kind: 'drowsy', every: 5.0 }], pickups: [{ kind: 'coffee', at: 0.4 }] },
  '06-primoposto':{ auto: [{ kind: 'rival', every: 3.6 }], pickups: [] },
  '07-tictac':    { auto: [{ kind: 'time', every: 5.5 }], pickups: [{ kind: 'clock', at: 0.55 }] },
  '08-tuttofinto':{ auto: [{ kind: 'fake', every: 3.0 }], pickups: [{ kind: 'real', at: 0.5 }] },
  '09-edera':     { auto: [{ kind: 'ivy', every: 3.4 }], pickups: [{ kind: 'break', at: 0.6 }] },
  '10-scendi':    { auto: [{ kind: 'rain', every: 3.0 }], pickups: [{ kind: 'crowd', at: 0.5 }] },
  '11-lafinedelmondo': { auto: [{ kind: 'water', every: 0 }], pickups: [] },
  '12-maranatha': { auto: [], pickups: [{ kind: 'chorus', at: 0.35 }, { kind: 'chorus', at: 0.7 }] },
  '13-outro':     { auto: [], pickups: [] },
};

// Effetto di un pericolo sull'arrampicata. Ogni pericolo tocca un campo DIVERSO
// di `state`, così i 13 gironi hanno una firma meccanica distinta (non tutti lo
// stesso shiftHands(0,-1)). Ritorna il messaggio mostrato a schermo.
export function applyThreat(kind, cl, state) {
  switch (kind) {
    case 'wind': {
      // spinta costante: ti sposta di lato, sempre nella stessa direzione finché dura
      const d = state.windDir || 1;
      shiftHands(cl, d, 0);
      state.windDir = -d;
      return 'vento ti sposta';
    }
    case 'quake': {
      // stordimento pesante + scivolata GIÙ di 1 + scossa laterale deterministica
      state.stun = 0.6;
      state.shake = 0.5;
      const dir = lcgNext(state) < 0.5 ? -1 : 1;
      const amt = 1 + Math.floor(lcgNext(state) * 2);   // 1..2 colonne
      shiftHands(cl, dir * amt, -1);
      return 'il tuono ti stordisce';
    }
    case 'debris': {
      if (state.shield > 0) { state.shield--; return 'il detrito si infrange sul tuo scudo'; }
      // un masso cade: crea un collider e atterra una fila sotto di te
      state.colliders = (state.colliders || 0) + 1;
      state.debrisRow = Math.max(0, climbRowOf(cl) - 1);
      shiftHands(cl, 0, -1);
      return 'un detrito ti colpisce';
    }
    case 'drowsy': {
      state.lag = 0.8;                          // input in ritardo
      state.grip = (state.grip || 1) - 0.3;     // presa più debole
      return 'il sonno ti fa scivolare';
    }
    case 'rival': {
      // duello: un rivale sale accanto e ti spinge GIÙ di 1 e di lato, via da lui
      state.duel = 1.2;
      const dir = lcgNext(state) < 0.5 ? -1 : 1;
      state.rivalDir = dir;
      shiftHands(cl, dir, -1);
      return 'un rivale ti spinge giù';
    }
    case 'time': {
      // il tempo stringe: countdown + cadenza dei pericoli accelerata
      state.countdown = (state.countdown || 0) + 1;
      state.cadence = Math.max(0.4, (state.cadence == null ? 1 : state.cadence) - 0.15);
      return 'il tempo ti sfugge';
    }
    case 'fake': {
      // appiglio finto: il prossimo passo automatico va a vuoto (decoy)
      state.decoy = 1.0;
      return 'un appiglio era finto';
    }
    case 'ivy': {
      // corda: ti tira verso un punto fisso (clamp laterale), non ti fa cadere
      const anchor = { c: cl.lh.c, r: Math.max(0, climbRowOf(cl) - 2) };
      state.tether = anchor;
      const dc = Math.sign(anchor.c - cl.lh.c);
      shiftHands(cl, dc, 0);
      return 'l edera ti tira';
    }
    case 'rain': {
      // scivoloso: presa debole + ogni tanto una raffica più forte
      state.grip = Math.max(0, (state.grip == null ? 1 : state.grip) - 0.4);
      const gust = lcgNext(state) < 0.35;
      const d = state.rainDir || 1;
      shiftHands(cl, gust ? d * 2 : d, 0);
      state.rainDir = -d;
      return gust ? 'una raffica di pioggia ti travolge' : 'la pioggia ti fa scivolare';
    }
    default: return null;
  }
}

// Firma meccanica di ogni pericolo: tipo + campo di stato che muta. Serve a
// garantire che i gironi non condividano lo stesso effetto. Ogni valore è UNICO.
export const THREAT_SIGNATURES = {
  wind:   'shift-x:windDir',
  quake:  'stun:0.6+shake:lcg',
  debris: 'collider:+1+debrisRow',
  drowsy: 'lag:0.8+grip-0.3',
  rival:  'duel:1.2+rivalDir:lcg',
  time:   'countdown:+1+cadence-0.15',
  fake:   'decoy:1.0',
  ivy:    'tether:lateral-clamp',
  rain:   'grip-0.4+rainDir:gust',
  water:  'waterRow:rise',
};

// Effetto di un aiuto raccolto.
export function applyPickup(kind, cl, state) {
  switch (kind) {
    case 'gust':   shiftHands(cl, 0, +1); return 'una raffica ti spinge su';
    case 'grip':   shiftHands(cl, 0, +1); return 'stringi la presa e sali';
    case 'shield': state.shield = (state.shield || 0) + 1; return 'scudo: cranio duro';
    case 'coffee': state.speed = 6; return 'caffe: sali piu veloce';
    case 'clock':  state.slow = 6; return 'il tempo rallenta';
    case 'real':   state.real = 6; return 'vedi gli appigli veri';
    case 'break':  state.breakFree = 6; return 'ti liberi dall edera';
    case 'crowd':  shiftHands(cl, 0, +1); return 'la folla ti sostiene';
    case 'chorus': shiftHands(cl, 0, +2); return 'il coro ti solleva';
    default: return null;
  }
}

export function createThreatState() {
  return { t: 0, last: {}, shield: 0, speed: 0, slow: 0, real: 0, breakFree: 0,
    windDir: 1, rainDir: 1, waterRow: -1, lastMsg: '', msgT: 0,
    // campi distinti per i pericoli (T5): ognuno muta il proprio
    stun: 0, lag: 0, grip: 1, duel: 0, countdown: 0, decoy: 0, colliders: 0, tether: null,
    shake: 0, debrisRow: -1, rivalDir: 0, cadence: 1,
    rng: 0x9e3779b9 };   // seme LCG deterministico
}

// Avanza: applica pericoli periodici e acqua che sale. Ritorna il messaggio attivo.
export function stepThreats(girone, cl, state, dt, waterLevel) {
  state.t += dt;
  if (state.speed > 0) state.speed -= dt;
  if (state.slow > 0) state.slow -= dt;
  if (state.real > 0) state.real -= dt;
  if (state.breakFree > 0) state.breakFree -= dt;
  if (state.msgT > 0) state.msgT -= dt;
  // decadimento dei campi dei pericoli (ognuno col proprio ritmo)
  if (state.stun > 0) state.stun -= dt;
  if (state.lag > 0) state.lag -= dt;
  if (state.duel > 0) state.duel -= dt;
  if (state.decoy > 0) state.decoy -= dt;
  if (state.shake > 0) state.shake -= dt;
  if (state.cadence < 1) state.cadence = Math.min(1, state.cadence + dt * 0.05);  // recupera
  if (state.grip < 1) state.grip = Math.min(1, state.grip + dt * 0.15);   // recupera la presa

  // DECOY: l'appiglio finto inghiotte il prossimo passo automatico (va a vuoto).
  if (state.decoy > 0 && cl.reach > 0) {
    cl.reach = 0; cl.which = null; cl.from = null; cl.to = null;
    cl.lhA = { ...cl.lh }; cl.rhA = { ...cl.rh };
    cl.lhHold = 1; cl.rhHold = 1;
    state.decoy = 0;
  }

  const def = THREATS[girone.audioId] || { auto: [] };
  // SLOW: mentre è attivo i pericoli scattano meno spesso (fattore 2x).
  const slowFactor = state.slow > 0 ? 2 : 1;
  const cadence = state.cadence == null ? 1 : state.cadence;   // <1 = più veloce
  for (const a of def.auto) {
    if (a.kind === 'water') {
      // l'acqua sale: se il corpo è sotto il livello, vieni sospinto su
      const wr = state.waterRow >= 0 ? state.waterRow : 0;
      state.waterRow = wr + dt * 0.6;
      const r = climbRowOf(cl);
      if (r < state.waterRow) { shiftHands(cl, 0, +1); }
      continue;
    }
    const interval = a.every * slowFactor * cadence;
    if (a.every > 0 && state.t - (state.last[a.kind] || 0) >= interval) {
      state.last[a.kind] = state.t;
      if (a.kind === 'ivy' && (state.breakFree > 0 || state.real > 0)) continue;   // l'aiuto ti protegge
      const msg = applyThreat(a.kind, cl, state);
      if (msg) { state.lastMsg = msg; state.msgT = 2; }
    }
  }
  return state.msgT > 0 ? state.lastMsg : '';
}

// Effetti osservabili per il rendering (T5): il main legge questi per dim/water/glitch.
export function threatEffects(state) {
  return {
    dim: state.grip < 0.6 ? 0.25 : 0,      // presa debole = buio leggero
    lag: Math.max(0, state.lag),            // input in ritardo (dormiente)
    stun: Math.max(0, state.stun),          // input congelato (terremoto)
    decoy: Math.max(0, state.decoy),        // appiglio finto
    colliders: state.colliders || 0,        // massi caduti (baghdad)
    duel: Math.max(0, state.duel),          // rivale accanto
    tether: state.tether,                   // edera
    water: state.waterRow >= 0 ? state.waterRow : 0,
    countdown: state.countdown || 0,
    // T5: nuovi campi osservabili
    shake: Math.max(0, state.shake),        // scossa del terremoto
    debrisRow: state.debrisRow == null ? -1 : state.debrisRow,
    rivalDir: state.rivalDir || 0,
    cadence: state.cadence == null ? 1 : state.cadence,
    slow: Math.max(0, state.slow),
  };
}

function climbRowOf(cl) { return Math.max(cl.lh.r, cl.rh.r); }

// Gli appigli "aiuto" da raccogliere sono posizionati dal main come oggetti;
// qui stabiliamo solo quali e dove (frazione dell'altezza).
export function pickupPositions(girone) {
  const def = THREATS[girone.audioId] || { pickups: [] };
  return def.pickups || [];
}
