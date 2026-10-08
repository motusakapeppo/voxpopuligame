// AUDIT giocabilita': tempi di scalata reali vs limiti obiettivi + gimmick 'hold'.
import { GIRONI } from '../src/gironi.js';
import { createClimb, stepClimb, climbProgress } from '../src/climb.js';
import { createGimmick, stepGimmick, gimmickAccepts } from '../src/gimmicks.js';

console.log('=== TEMPO REALE DI SCALATA (bot preme avanti ogni frame, 60fps) ===');
for (const g of GIRONI) {
  const cl = createClimb(g);
  const adv = g.direction === 'down' ? { left:false,right:false,up:false,down:true } : { left:false,right:false,up:true,down:false };
  let f = 0;
  for (; f < 30000; f++) { stepClimb(cl, adv, 1/60); if (cl.reached) break; }
  const secs = (f/60).toFixed(1);
  const obj = g.objective || {};
  const lim = obj.kind === 'beatClock' ? ' (limite ' + obj.limit + 's)' : obj.kind === 'survive' ? ' (sopravvivi ' + obj.limit + 's)' : '';
  console.log(g.id.padEnd(3), (g.climb.layout||'?').padEnd(8), obj.kind.padEnd(10), 'scalata=' + secs + 's' + lim);
}

console.log('\n=== GIMMICK hold: si puo vincere con pressioni REALI (keydown once)? ===');
const gm = createGimmick({ gimmick: { kind: 'hold', needed: 0.6 } });
// il main chiama gimmickAccepts(gm, true) UNA VOLTA per keydown; l'utente puo
// martellare ma NON e' "tenere premuto"
let accepted = false;
for (let presses = 1; presses <= 100 && !accepted; presses++) {
  accepted = gimmickAccepts(gm, true);
  if (accepted) console.log('  accettato dopo ' + presses + ' pressioni');
}
if (!accepted) console.log('  MAI accettato con pressioni ripetute (BUG: serve accumulo TEMPORALE)');

console.log('\n=== GIMMICK rhythmic: % di finestra aperta (accettazione) ===');
const gr = createGimmick({ gimmick: 'rhythmic' });
let open = 0, N = 6000;
for (let i = 0; i < N; i++) { const r = stepGimmick(gr, 1/60); if (r.ready) open++; }
console.log('  finestra aperta ' + Math.round(open/N*100) + '% del tempo');
