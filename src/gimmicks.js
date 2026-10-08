// ============================================================================
// GIMMICKS — la MECCANICA D'INTERAZIONE di una traccia. Oltre agli incontri
// (Z/X), ogni brano può avere una "regola" temporale che cambia COME giochi:
//   rhythmic  — devi agire a tempo col battito (finestra di tolleranza)
//   hold      — devi TENERE premuto per completare l'azione (non un tap)
//   shove      — una spinta periodica ti obbliga a reagire (timing)
//   sync      — la figura del coro si apre solo sul beat (sincronizza)
// PURO e DETERMINISTICO: nessun DOM, nessun RNG. Il main legge lo stato per
// modulare input/prompt/HUD.
// ============================================================================

export const GIMMICK_KINDS = ['none', 'rhythmic', 'hold', 'shove', 'sync'];

// Preset per girone (g.gimmick = 'rhythmic' | {kind, ...} | undefined).
export const GIMMICKS = {
  none:     { kind: 'none' },
  rhythmic: { kind: 'rhythmic', period: 0.5, window: 0.16 },   // 120 BPM, ±160ms
  hold:     { kind: 'hold', needed: 0.6 },                      // tieni premuto 0.6s
  shove:    { kind: 'shove', every: 2.4, push: 1 },            // spinta ogni 2.4s
  sync:     { kind: 'sync', period: 0.5, window: 0.2 },
};

export function createGimmick(g) {
  const cfg = g && g.gimmick;
  const preset = (typeof cfg === 'string') ? (GIMMICKS[cfg] || GIMMICKS.none) : (cfg || GIMMICKS.none);
  const base = GIMMICKS[preset.kind] || GIMMICKS.none;
  return {
    kind: base.kind,
    period: Number.isFinite(preset.period) ? preset.period : base.period,
    window: Number.isFinite(preset.window) ? preset.window : base.window,
    needed: Number.isFinite(preset.needed) ? preset.needed : base.needed,
    every: Number.isFinite(preset.every) ? preset.every : base.every,
    push: Number.isFinite(preset.push) ? preset.push : base.push,
    t: 0,            // tempo interno
    phase: 0,        // 0..1 nella battuta
    held: 0,         // secondi di pressione accumulati (hold)
    ready: false,    // finestra aperta? (rhythmic/sync)
    fired: false,    // evento shove scattato questo ciclo
    lastShove: -999,
  };
}

// Avanza il gimmick. `held` = true se il tasto-verbo è TENUTO premuto ADESSO.
// Ritorna { ready, shove, holdProgress, phase }.
export function stepGimmick(gm, dt, held) {
  const d = Number.isFinite(dt) ? dt : 0;
  gm.t += d;
  const period = gm.period > 0 ? gm.period : 0.5;
  gm.phase = (gm.t % period) / period;

  if (gm.kind === 'hold') {
    // "tieni premuto": accumula TEMPO mentre il tasto è giù; rilascio = reset.
    const h = !!held && gm.held > 0 ? true : !!held;
    if (h) gm.held = Math.min(gm.needed, gm.held + d);
    else gm.held = 0;
    gm.ready = gm.held >= gm.needed;
  } else if (gm.kind === 'rhythmic' || gm.kind === 'sync') {
    // finestra FINESTRA STRETTA attorno al battito (non 60% del tempo).
    const w = gm.window > 0 ? gm.window : 0.16;
    const half = (w / period) * 0.5;
    gm.ready = gm.phase <= half || gm.phase >= 1 - half;
  } else {
    gm.ready = true;
  }

  let shove = false;
  if (gm.kind === 'shove') {
    if (gm.t - gm.lastShove >= gm.every) { gm.lastShove = gm.t; shove = true; }
  }
  gm.shove = shove;
  return { ready: gm.ready, shove, holdProgress: gm.needed ? Math.min(1, gm.held / gm.needed) : 0, phase: gm.phase };
}

// Il main chiama questo al momento del verbo. Ritorna true se il gesto è valido
// ORA. Per hold/rhythmic/sync dipende dallo stato calcolato in stepGimmick; per
// gli altri tipi è sempre valido.
export function gimmickAccepts(gm) {
  if (gm.kind === 'hold' || gm.kind === 'rhythmic' || gm.kind === 'sync') return !!gm.ready;
  return true;
}

// Testo per l'HUD/prompt.
export function gimmickPrompt(gm) {
  switch (gm.kind) {
    case 'rhythmic': return 'A TEMPO';
    case 'hold':     return 'TIENI PREMUTO';
    case 'shove':    return 'REGGE LA SPINTA';
    case 'sync':     return 'SINCRONIZZA';
    default:         return '';
  }
}
