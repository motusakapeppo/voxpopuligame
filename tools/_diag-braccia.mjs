// Diagnostica: (1) braccia dell'arrampicatore in varie pose; (2) timing liriche.
import { readFileSync } from 'node:fs';

// --- 1. Braccia: render ASCII di drawClimber a diverse distanze mani ---
// reimplementiamo ik2 e il tracciamento linee per vedere la forma.
const PI = Math.PI;
function ik2(sx, sy, tx, ty, l1, l2, bend) {
  const dx = tx - sx, dy = ty - sy;
  let d = Math.hypot(dx, dy); if (d < 0.001) d = 0.001;
  const maxD = l1 + l2 - 0.02, minD = Math.abs(l1 - l2) + 0.02;
  const dc = Math.max(minD, Math.min(maxD, d));
  const ux = dx / d, uy = dy / d;
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return { ex: sx + ux * a - uy * hgt * bend, ey: sy + uy * a + ux * hgt * bend, hx: sx + ux * dc, hy: sy + uy * dc };
}
function renderArms(h, lx, ly, rx, ry, bx, by) {
  const hipX = bx, hipY = by, shHalf = Math.max(2, Math.round(h * 0.14));
  const shY = hipY - h * 0.20, shX = hipX, shLx = shX - shHalf, shRx = shX + shHalf;
  const up = h * 0.17, lo = h * 0.17;
  const aL = ik2(shLx, shY, lx, ly, up, lo, -1);
  const aR = ik2(shRx, shY, rx, ry, up, lo, 1);
  const pts = [];
  const line = (x0,y0,x1,y1)=>{x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);const dx=Math.abs(x1-x0),dy=Math.abs(y1-y0);const sx=x0<x1?1:-1,sy=y0<y1?1:-1;let err=dx-dy;for(;;){pts.push([x0,y0]);if((x0===x1&&y0===y1))break;const e2=2*err;if(e2>-dy){err-=dy;x0+=sx;}if(e2<dx){err+=dx;y0+=sy;}}};
  line(shLx,shY,aL.ex,aL.ey); line(aL.ex,aL.ey,aL.hx,aL.hy);
  line(shRx,shY,aR.ex,aR.ey); line(aR.ex,aR.ey,aR.hx,aR.hy);
  line(hipX,hipY,shX,shY);
  const minX=Math.min(...pts.map(p=>p[0]))-2,maxX=Math.max(...pts.map(p=>p[0]))+2;
  const minY=Math.min(...pts.map(p=>p[1]))-2,maxY=Math.max(...pts.map(p=>p[1]))+2;
  const g=[];
  for(let y=minY;y<=maxY;y++){let row='';for(let x=minX;x<=maxX;x++){row+=pts.some(p=>p[0]===x&&p[1]===y)?'#':'.';}g.push(row);}
  return g.join('\n');
}
const h=18;
console.log('=== BRACCIA: mani vicine (default, scala normale) ===');
console.log(renderArms(h, 160,100, 171,100, 165,111));
console.log('\n=== BRACCIA: mano sx spostata di 1 colonna (11px) — il caso "mi muovo di lato" ===');
console.log(renderArms(h, 149,100, 171,100, 160,111));
console.log('\n=== BRACCIA: mani molto distanti (2 colonne) ===');
console.log(renderArms(h, 138,100, 182,100, 160,111));

// --- 2. Liriche: quanto sono "fabbricati" gli start? ---
const karaoke = JSON.parse(readFileSync('src/karaoke.js','utf8').replace(/^[\s\S]*?=\s*/,'').replace(/;\s*$/,''));
const words = JSON.parse(readFileSync('tools/_words.json','utf8'));
console.log('\n=== LIRICHE: confronto start karaoke vs onset parole reali ===');
for (const id of Object.keys(karaoke).slice(0,3)) {
  const ent = karaoke[id]; const ws = words[id].words.map(w=>w[0]);
  console.log('\n'+id+' — start lirica:', ent.map(e=>e[0]).join(', '));
  console.log(id+' — onset whisper:', ws.slice(0,Math.max(ent.length,ws.length)).map(x=>x.toFixed(2)).join(', '));
}
