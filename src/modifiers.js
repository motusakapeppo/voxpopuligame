export const EVENTS = ['quake','blade','dim','push','slip','fake'];

export function createModState(mod) {
  const st = { t: 0, last: -999, elapsed: 0, phase: 0 };
  if (mod.kind === 'rivals') st.rivals = Array.from({ length: mod.count },
    (_, i) => ({ x: 40 + i * 40, y: 200, base: 200 }));
  return st;
}

// Ritorna void. Aggiorna ctx.player / ctx.world / ctx.events. Deterministico.
export function applyModifier(mod, ctx, dt, st = createModState(mod)) {
  st.t += dt;
  switch (mod.kind) {
    case 'tutorial': break;

    case 'wind': {
      const force = Math.sin((st.t / mod.period) * Math.PI * 2) * mod.strength;
      ctx.player.x += force * dt;               // spinge orizzontalmente
      if (Math.abs(force) > mod.strength * 0.8) ctx.events.push('gust');
      break;
    }

    case 'quake': {
      if (st.t - st.last >= mod.every) {
        st.last = st.t;
        ctx.events.push('quake');
      }
      break;
    }

    case 'fallingBlades': {
      if (st.t - st.last >= mod.every) {
        st.last = st.t;
        ctx.events.push('blade');
      }
      break;
    }

    case 'decay':
    case 'sleep': {
      if (mod.dimTo !== undefined) {
        st.dim = Math.max(mod.dimTo, 1 - st.t * 0.05); // cala la luce col tempo
        ctx.events.push('dim');
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
      if (st.elapsed > mod.total) ctx.events.push('flood');
      break;
    }

    case 'illusion': {
      st.flicker = Math.sin(st.t * 6) > 0.9;
      if (st.flicker) ctx.events.push('fake');
      break;
    }

    case 'descent': {
      // direzione invertita: il progresso va "verso l'ade" (giù)
      st.verletOn = st.t < mod.verletFor;
      break;
    }

    case 'rain': {
      ctx.player.vx *= 0.9;                        // scivola: meno controllo
      if (st.t % 1 < dt) ctx.events.push('slip');
      break;
    }

    case 'risingWater': {
      st.water = st.t * mod.riseSpeed;             // sale dal basso
      break;
    }

    case 'handhold': break;                        // corpi più stabili: nessuna penalità

    default: break;
  }
}
