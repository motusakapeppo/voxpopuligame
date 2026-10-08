// AUDIT fattibilita' obiettivi: collect/escort/holdGrip sono vincibili?
import { GIRONI } from '../src/gironi.js';
import { createClimb } from '../src/climb.js';
import { createVariety, stepVariety } from '../src/variety.js';
import { createOmini, stepOmini } from '../src/omini.js';
import { createGrip, gripHit, stepGrip } from '../src/grip.js';

console.log('=== COLLECT: quanti oggetti ha la traccia vs target ===');
for (const g of GIRONI) {
  const obj = g.objective || {};
  if (obj.kind !== 'collect') continue;
  const cl = createClimb(g);
  const v = createVariety(g, cl);
  const collectibles = v.items.filter(it => it.kind !== 'egg').length; // egg non conta? conta tutto
  const total = v.items.length;
  console.log(g.id, 'target=' + obj.target, 'oggetti totali=' + total, 'non-egg=' + collectibles, (total >= obj.target ? 'OK' : 'IMPOSSIBILE'));
}

console.log('\n=== ESCORT: quanti omini compaiono vs target ===');
for (const g of GIRONI) {
  const obj = g.objective || {};
  if (obj.kind !== 'escort') continue;
  const cl = createClimb(g);
  const o = createOmini(g, cl);
  const adv = { left:false,right:false,up:true,down:false };
  let spawned = 0;
  for (let i = 0; i < 20000 && !cl.reached; i++) {
    // simula la salita e conta gli spawn
    const prev = o.spawned;
    // il giocatore "sale" di una fila ogni ~10 frame
    cl.lh.r = Math.min(cl.nRows-1, Math.floor(i/12)); cl.rh.r = cl.lh.r; cl.lhA.r=cl.lh.r; cl.rhA.r=cl.lh.r;
    stepOmini(o, cl, 1/60);
  }
  console.log(g.id, 'target=' + obj.target, 'omini spawnati=' + o.spawned, (o.spawned >= obj.target ? 'OK' : 'IMPOSSIBILE'));
}

console.log('\n=== HOLDGRIP (12): si puo arrivare in cima con presa>0.3? ===');
{
  const g = GIRONI[11];
  const cl = createClimb(g);
  const grip = createGrip(g);
  let minGrip = 1;
  // salita ideale, nessun pericolo -> presa resta 1
  for (let i = 0; i < 20000 && !cl.reached; i++) {
    cl.lh.r = Math.min(cl.nRows-1, Math.floor(i/12)); cl.rh.r = cl.lh.r; cl.lhA.r=cl.lh.r; cl.rhA.r=cl.lh.r;
    stepGrip(grip, 1/60); minGrip = Math.min(minGrip, grip.v);
  }
  console.log('12', 'presa minima (senza pericoli)=' + minGrip.toFixed(2), (minGrip > 0.3 ? 'OK base' : 'check'));
  // con un pericolo: la presa scende sotto 0.3? allora "nessun errore" e' impossibile
  const grip2 = createGrip(g);
  gripHit(grip2, 0.26); // un tuono
  console.log('   dopo 1 colpo tuono: ' + grip2.v.toFixed(2), (grip2.v < 0.3 ? '<-- gia sotto soglia 0.3 con 1 colpo!' : 'OK'));
}
