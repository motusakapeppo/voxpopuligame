// ============================================================================
// OBJECTIVE — la VITTORIA di ogni traccia può essere diversa dal semplice
// "arriva in cima". Ogni brano dichiara un obiettivo meccanico (batti il tempo,
// sopravvivi, raccogli, scorta, reggi la presa, scendi). PURO e DETERMINISTICO:
// nessun DOM, nessun RNG. La sconfitta per obiettivo mancato si aggancia al
// motore di sconfitta esistente (grip/defeat): qui si decide SOLO se/puoi vincere.
// ============================================================================

// Tipi supportati. Tutti realizzabili coi comandi esistenti (su/giù/sx/dx + Z/X).
export const OBJECTIVE_KINDS = ['climb', 'beatClock', 'survive', 'collect', 'escort', 'holdGrip', 'descend'];

// Config per girone (g.objective). Default = 'climb' (comportamento storico:
// vinci quando raggiungi la cima/fondo).
export function createObjective(g) {
  const cfg = (g && g.objective) || {};
  const kind = OBJECTIVE_KINDS.includes(cfg.kind) ? cfg.kind : 'climb';
  return {
    kind,
    limit: Number.isFinite(cfg.limit) ? cfg.limit : 0,      // secondi (beatClock/survive/holdGrip)
    target: Number.isFinite(cfg.target) ? cfg.target : 0,   // conteggio (collect/escort)
    grace: Number.isFinite(cfg.grace) ? cfg.grace : 0,      // tolleranza presa bassa (holdGrip)
    elapsed: 0,
    progress: 0,     // 0..1 per l'HUD (aggiornato in stepObjective)
    done: false,
    failed: false,
    reason: '',
  };
}

// Avanza l'obiettivo. `ctx` (letto, non mutato):
//   { reachedTop, gripRatio, collected, helped, direction }
// Ritorna { done, failed, reason }. Deterministico.
export function stepObjective(obj, ctx, dt) {
  if (obj.done || obj.failed) return obj;
  const d = Number.isFinite(dt) ? dt : 0;
  obj.elapsed += d;
  const c = ctx || {};
  const grip = Number.isFinite(c.gripRatio) ? c.gripRatio : 1;

  switch (obj.kind) {
    case 'climb':
    case 'descend':
      // vinci quando raggiungi la cima (per 'descend' la cima È il fondo, gestito da climb.reached)
      if (c.reachedTop) { obj.done = true; }
      obj.progress = Number.isFinite(c.progress) ? Math.max(0, Math.min(1, c.progress)) : obj.progress;
      break;

    case 'beatClock':
      // vinci in cima PRIMA che scada il tempo; oltre il limite -> sconfitta.
      obj.progress = Math.max(0, Math.min(1, obj.elapsed / Math.max(0.001, obj.limit)));
      if (c.reachedTop) { obj.done = true; obj.reason = 'in tempo'; }
      else if (obj.elapsed >= obj.limit) { obj.failed = true; obj.reason = 'tempo scaduto'; }
      break;

    case 'survive':
      // vinci se raggiungi la cima (via di fuga) O se resisti `limit` secondi;
      // perdi se la presa cede. Rushing o resistere: due strategie valide.
      obj.progress = Math.max(0, Math.min(1, obj.elapsed / Math.max(0.001, obj.limit)));
      if (grip <= 0) { obj.failed = true; obj.reason = 'presa persa'; }
      else if (c.reachedTop) { obj.done = true; obj.reason = 'fuggito in cima'; }
      else if (obj.elapsed >= obj.limit) { obj.done = true; obj.reason = 'sopravvissuto'; }
      break;

    case 'collect':
      // vinci raccogliendo `target` oggetti della missione (variety).
      obj.progress = obj.target > 0 ? Math.max(0, Math.min(1, (c.collected || 0) / obj.target)) : 0;
      if ((c.collected || 0) >= obj.target && obj.target > 0) { obj.done = true; obj.reason = 'raccolti'; }
      break;

    case 'escort':
      // vinci aiutando `target` figure (tendi su omini/incontri).
      obj.progress = obj.target > 0 ? Math.max(0, Math.min(1, (c.helped || 0) / obj.target)) : 0;
      if ((c.helped || 0) >= obj.target && obj.target > 0) { obj.done = true; obj.reason = 'scortati'; }
      break;

    case 'holdGrip':
      // "nessun errore": arriva in cima senza MAI far scendere la presa sotto
      // `grace` (default 0.3). Un passo falso -> sconfitta immediata.
      {
        const grace = obj.grace > 0 ? obj.grace : 0.3;
        if (grip <= 0) { obj.failed = true; obj.reason = 'presa persa'; }
        else if (grip < grace) { obj.failed = true; obj.reason = 'presa troppo debole'; }
        else if (c.reachedTop) { obj.done = true; obj.reason = 'presa tenuta'; }
      }
      obj.progress = Number.isFinite(c.progress) ? Math.max(0, Math.min(1, c.progress)) : obj.progress;
      break;

    default:
      if (c.reachedTop) obj.done = true;
      break;
  }
  return obj;
}

// Etichetta leggibile per l'HUD: { text, progress } (progress 0..1).
export function objectiveHud(obj) {
  const prog = Number.isFinite(obj.progress) ? Math.max(0, Math.min(1, obj.progress)) : 0;
  switch (obj.kind) {
    case 'beatClock': return { text: 'BATTI IL TEMPO', progress: prog };
    case 'survive':   return { text: 'SOPRAVVIVI ' + Math.round(obj.limit) + 's', progress: prog };
    case 'collect':   return { text: 'RACCOGLI', progress: prog };
    case 'escort':    return { text: 'SCORTA', progress: prog };
    case 'holdGrip':  return { text: 'REGGI LA PRESA', progress: prog };
    case 'descend':   return { text: 'SCENDI', progress: prog };
    default:          return { text: 'RAGGIUNGI LA VETTA', progress: prog };
  }
}
