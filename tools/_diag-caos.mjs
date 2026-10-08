// AUDIT chiarezza: quante cose "chiedono attenzione" insieme per traccia.
import { GIRONI } from '../src/gironi.js';
import { createClimb } from '../src/climb.js';
import { GIRONE_ENCOUNTERS } from '../src/encounters.js';
import { createVariety } from '../src/variety.js';
import { createOmini } from '../src/omini.js';
import { THREATS } from '../src/threats.js';

console.log('traccia | obiettivo      | gimmick  | incontri | omini | pericolo | TOTALE segnali');
for (const g of GIRONI) {
  const obj = g.objective || { kind: 'climb' };
  const gim = g.gimmick ? (typeof g.gimmick === 'string' ? g.gimmick : g.gimmick.kind) : '—';
  const enc = (GIRONE_ENCOUNTERS[g.id] || []).length;
  const thr = (THREATS[g.audioId] && THREATS[g.audioId].auto || []).length + (THREATS[g.audioId] && THREATS[g.audioId].pickups || []).length;
  const mods = g.modifiers.length;
  // segnali = obiettivo(1) + gimmick(1 se attivo) + incontri + pericoli + mods
  const total = 1 + (gim !== '—' ? 1 : 0) + enc + thr + mods;
  console.log(g.id.padEnd(6), '|', obj.kind.padEnd(14), '|', gim.padEnd(8), '|', String(enc).padStart(6), '|', '  1  ', '|', String(thr).padStart(6), '|', String(total).padStart(3));
}
console.log('\nNB: mods (modificatori) =', GIRONI.map(g=>g.modifiers.length).join(','));
