// ============================================================================
// TIMESTEP — accumulatore a passo fisso. Converte un frame dt variabile (rAF)
// in N passi di simulazione di durata FISSA, così la fisica è indipendente dal
// refresh rate (60Hz/120Hz/144Hz) e deterministica. Puro e testabile.
//
// Regola (Fiedler, "Fix Your Timestep"): accumula il tempo reale, consuma passi
// fissi finché basta; clamp del frame (maxFrame) e del numero di passi (maxSteps)
// per evitare lo "spiral of death".
// ============================================================================

function tsNum(v, d) { return Number.isFinite(v) ? v : d; }

export function createStepper(opts = {}) {
  const step = Math.max(1 / 1000, tsNum(opts.step, 1 / 120));
  const maxFrame = Math.max(step, tsNum(opts.maxFrame, 0.25));
  const maxSteps = Math.max(1, Math.floor(tsNum(opts.maxSteps, 5)));
  return {
    step,
    maxFrame,
    maxSteps,
    accumulator: 0,
    // step(frameDt) → { steps, dt, used }: esegui `steps` volte il passo fisso.
    step(frameDt) {
      const f = Number.isFinite(frameDt) ? Math.max(0, Math.min(maxFrame, frameDt)) : 0;
      this.accumulator += f;
      let steps = Math.floor(this.accumulator / step);
      if (steps > maxSteps) {
        steps = maxSteps;
        this.accumulator = 0;          // scarta il resto: non inseguire
      } else {
        this.accumulator -= steps * step;
      }
      return { steps, dt: step, used: steps * step };
    },
  };
}
