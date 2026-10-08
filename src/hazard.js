// ============================================================================
// HAZARD — classificazione PURA dei messaggi dei pericoli in "quanto erode la
// presa". Deterministico: nessun DOM, nessuna sorgente di entropia. Estratto da main.js
// per essere testabile: la stessa regex che sceglie l'effetto visivo decide
// anche il peso del colpo, ma i pesi vengono dalla cfg della presa (grip.js).
// ============================================================================

const HAZARD_SMALL = 0.08;   // messaggio non classificato: erosione minima

// hazardSeverity(msg, cfg) -> numero finito >= 0.
//   /vento|pioggia|scivol/ -> cfg.hitWind   (default 0.10)
//   /tuono/                -> cfg.hitQuake  (default 0.22)
//   /tempo|detrito|cranio/ -> cfg.hitDebris (default 0.18)
//   /edera/                -> cfg.hitIvy    (default 0.12)
//   altrimenti             -> 0.08
// cfg assente o valori non finiti -> default. msg null/undefined -> 0.08.
export function hazardSeverity(msg, cfg) {
  const m = String(msg == null ? '' : msg).toLowerCase();
  const c = cfg || {};
  const pick = (v, d) => (Number.isFinite(v) ? v : d);
  if (/vento|pioggia|scivol/.test(m)) return pick(c.hitWind, 0.10);
  if (/tuono/.test(m)) return pick(c.hitQuake, 0.22);
  if (/tempo|detrito|cranio/.test(m)) return pick(c.hitDebris, 0.18);
  if (/edera/.test(m)) return pick(c.hitIvy, 0.12);
  return HAZARD_SMALL;
}
