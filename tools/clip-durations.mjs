// tools/clip-durations.mjs
// SINGLE SOURCE OF TRUTH per le durate (in secondi) delle 13 clip.
// Usato da tools/align-karaoke.mjs (allineamento liriche su tutta la clip)
// e dai test di copertura. Durate in secondi interi, deterministico.

export const CLIPS = [
  ['01-intro', 20],
  ['02-vento', 20],
  ['03-tuoni', 22],
  ['04-baghdad', 20],
  ['05-hosonno', 20],
  ['06-primoposto', 20],
  ['07-tictac', 20],
  ['08-tuttofinto', 20],
  ['09-edera', 22],
  ['10-scendi', 20],
  ['11-lafinedelmondo', 22],
  ['12-maranatha', 22],
  ['13-outro', 20],
];

const DUR = new Map(CLIPS);

// Durata della clip `id`; fallback deterministico (20s) per id sconosciuto.
export function clipDur(id) {
  const d = DUR.get(String(id));
  return Number.isFinite(d) ? d : 20;
}