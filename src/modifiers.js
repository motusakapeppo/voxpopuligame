export const EVENTS = ['quake','blade','dim','push','slip','fake','gust','dust','wake','ivy','calm'];

// Campi numerici/booleani di ctx.effects. Additivo: i consumatori esistenti
// (main.js) leggono dim/flicker/water/elapsed/verlet; qui se ne aggiungono altri.
export function createEffects() {
  return {
    dim: 0, flicker: 0, water: 0, elapsed: 0, verlet: false,
    shake: 0, quakeT: 0, dust: 0, wake: 0, pressure: 0,
    fake: 0, slip: 0, hands: 0, calm: false,
    bladeRate: 0, verletPhase: 0, elapsedNorm: 0, ivy: 0,
  };
}

export function createModState(mod) {
  const st = { t: 0, last: -999, elapsed: 0, phase: 0 };
  if (mod.kind === 'rivals') st.rivals = Array.from({ length: mod.count },
    (_, i) => ({ x: 40 + i * 40, y: 200, base: 200 }));
  return st;
}

// Ritorna void. Aggiorna ctx.player / ctx.world / ctx.events. Deterministico.
// Aggiorna ANCHE ctx.effects: un oggetto osservabile che il rendering consuma.
// Ogni parametro autoriale dei modificatori produce un effetto osservabile.
export function applyModifier(mod, ctx, dt, st = createModState(mod)) {
  st.t += dt;
  const fx = ctx.effects || (ctx.effects = createEffects());
  switch (mod.kind) {
    case 'tutorial': break;

    case 'wind': {
      const force = Math.sin((st.t / mod.period) * Math.PI * 2) * mod.strength;
      ctx.player.x += force * dt;               // spinge orizzontalmente
      if (Math.abs(force) > mod.strength * 0.8) ctx.events.push('gust');
      if (mod.dust) {
        // cadenza deterministica legata alla forza: più vento -> più polvere.
        const rate = Math.max(0.05, 1 / (1 + Math.abs(force))); // secondi tra raffiche
        if (st.t - st.last >= rate) { st.last = st.t; ctx.events.push('dust'); }
        fx.dust = Math.min(1, Math.abs(force) / Math.max(0.001, mod.strength));
      } else {
        fx.dust = 0;
      }
      break;
    }

    case 'quake': {
      if (st.t - st.last >= mod.every) {
        st.last = st.t;
        ctx.events.push('quake');
        st.shakeT = mod.shakeT;                 // durata della scossa autoriale
      }
      // la scossa decade nel tempo; ampiezza e durata derivano dai valori autoriali
      st.shakeT = Math.max(0, (st.shakeT || 0) - dt);
      fx.shake = mod.shakeAmp * (st.shakeT / Math.max(0.001, mod.shakeT));
      fx.quakeT = st.shakeT;
      break;
    }

    case 'fallingBlades': {
      // speed controlla la cadenza: intervallo effettivo = every / speed.
      const interval = mod.every / Math.max(0.001, mod.speed);
      if (st.t - st.last >= interval) {
        st.last = st.t;
        ctx.events.push('blade');
      }
      fx.bladeRate = 1 / interval;
      break;
    }

    case 'decay':
    case 'sleep': {
      if (mod.dimTo !== undefined) {
        st.dim = Math.max(mod.dimTo, 1 - st.t * 0.05); // cala la luce col tempo
        fx.dim = 1 - st.dim;                            // esposizione osservabile
        ctx.events.push('dim');
      }
      if (mod.wakeTouchEvery !== undefined) {
        // sveglia deterministica: un 'wake' ogni wakeTouchEvery secondi.
        if (st.t - st.last >= mod.wakeTouchEvery) { st.last = st.t; ctx.events.push('wake'); }
        fx.wake = st.t - st.last;
      }
      break;
    }

    case 'rivals': {
      for (const r of st.rivals) {
        r.y = r.base - ((st.t * 20) % 200);         // risalgono in loop
        const near = Math.abs(r.x - ctx.player.x) < 16 && Math.abs(r.y - ctx.player.y) < 16;
        if (near) { ctx.player.x += mod.pushForce * dt * 10; ctx.events.push('push'); }
      }
      break;
    }

    case 'timer': {
      st.elapsed += dt;
      // pressure rampa verso 1 alla velocità collapseSpeed; oltre il totale -> 1.
      const rate = mod.collapseSpeed !== undefined ? mod.collapseSpeed : 0.5;
      st.pressure = Math.min(1, (st.pressure || 0) + rate * dt);
      if (st.elapsed > mod.total) {
        st.pressure = 1;
        ctx.events.push('flood');
      }
      fx.pressure = st.pressure;
      break;
    }

    case 'illusion': {
      // frequenza del flicker derivata da fakeRatio (deterministica).
      const ratio = mod.fakeRatio !== undefined ? mod.fakeRatio : 0.5;
      const freq = 4 + ratio * 12;
      st.flicker = Math.sin(st.t * freq) > 1 - ratio;
      fx.flicker = st.flicker ? 1 : 0;
      fx.fake = ratio;
      if (st.flicker) ctx.events.push('fake');
      if (mod.flames && st.flicker) ctx.events.push('fake'); // fiamme -> più fake
      break;
    }

    case 'descent': {
      // direzione invertita: il progresso va "verso l'ade" (giù)
      st.verletOn = mod.verlet ? st.t < mod.verletFor : false;
      fx.verlet = st.verletOn;
      fx.verletPhase = mod.verletFor > 0 ? Math.min(1, st.t / mod.verletFor) : 0;
      if (mod.ivy) {
        if (st.t - st.last >= 1) { st.last = st.t; ctx.events.push('ivy'); }
        fx.ivy = 1;
      } else {
        fx.ivy = 0;
      }
      break;
    }

    case 'rain': {
      if (mod.slip) {
        ctx.player.vx *= 0.9;                        // scivola: meno controllo
        ctx.player.vx += Math.sin(st.t * 13) * 0.5;  // jitter deterministico
        fx.slip = 1;
      } else {
        fx.slip = 0;
      }
      if (st.t % 1 < dt) ctx.events.push('slip');
      // pushers: esattamente N spinte distribuite sul livello.
      if (mod.pushers > 0) {
        const interval = 7 / mod.pushers;
        if (st.t - st.last >= interval) { st.last = st.t; ctx.events.push('push'); }
      }
      break;
    }

    case 'risingWater': {
      st.water = st.t * mod.riseSpeed;             // sale dal basso
      break;
    }

    case 'handhold': {
      fx.hands = mod.hands ? 1 : 0;
      fx.calm = !!mod.final;
      if (mod.final && st.t - st.last >= 2) { st.last = st.t; ctx.events.push('calm'); }
      break;
    }

    default: break;
  }
  fx.water = st.water || 0;
  fx.elapsed = st.elapsed || 0;
  fx.elapsedNorm = mod.total ? Math.min(1, (st.elapsed || 0) / mod.total) : 0;
}
