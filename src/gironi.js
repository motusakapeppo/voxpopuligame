// I "mattoni" della piramide. Un girone è una fascia verticale alta `height`,
// percorsa su una SCALA di mensole di corpi che si sovrappongono orizzontalmente,
// così ogni gradino è raggiungibile con un salto. Geometria tarata sulla fisica:
// salto ≈ 48px con vy0=-6.4, passo verticale 24px, velocità orizzontale 1.7/frame.

let _id = 0;
export function makeBody(x, y, w = 16, h = 8, stable = 4, kind = 'stable') {
  return { x, y, w, h, stable, kind, _k: _id++ };
}

export const STEP_Y   = 24;   // dislivello tra una mensola e la successiva
export const LEDGE_W  = 150;  // larghezza di una mensola
export const LEDGE_H  = 10;   // spessore (collider) della mensola
export const TOP_Y    = 40;   // sommità del girone
export const STABLE   = 110;  // frame di peso sopportati prima di cedere (~1.8s)
const COL_X = [16, 126];      // due colonne sovrapposte: 16..166 e 126..276

// Scala di mensole: la sommità è esattamente a TOP_Y, il fondo a TOP_Y + N*STEP_Y.
export function wall(topY, height, { stable = STABLE } = {}) {
  const out = [];
  const n = Math.max(1, Math.floor((height - 80) / STEP_Y));
  for (let k = 0; k <= n; k++) {
    const y = topY + k * STEP_Y;
    out.push(makeBody(COL_X[k % 2], y, LEDGE_W, LEDGE_H, stable, 'stable'));
  }
  return out;
}

export const PLAYER_W = 8, PLAYER_H = 14;

// Posizione di partenza: in piedi sulla mensola più bassa (o più alta, se si scende).
export function spawnFor(g) {
  const ys = g.bodies.map(b => b.y);
  const feet = g.direction === 'down' ? Math.min(...ys) : Math.max(...ys);
  const onIt = g.bodies.filter(b => b.y === feet);
  const x = onIt[0] ? onIt[0].x + onIt[0].w / 2 : 160;
  return { x: x - PLAYER_W / 2, y: feet - PLAYER_H };
}

// La vetta è raggiunta? (up: in cima — down: in fondo)
export function isTopReached(g, p) {
  const ys = g.bodies.map(b => b.y);
  const feet = p.y + PLAYER_H;
  if (g.direction === 'down') return feet >= Math.max(...ys) - 1;
  return feet <= Math.min(...ys) + 2;
}

export const GIRONI = [
  { id:'01', track:'INTRO', title:'INTRO', audioId:'01-intro', direction:'up', height:720,
    bodies: [...wall(TOP_Y, 720)], modifiers:[{kind:'tutorial'}], climb:{reach:0.14,hold:0.18,hang:11,weakEvery:10,shape:'pyramid'},
    npcScenes:['sleepers','seaWall'], inscription:{ text:'INTRO' } },

  { id:'02', track:'IL VENTO DAL SUD', title:'IL VENTO DAL SUD', audioId:'02-vento', direction:'up', height:720,
    bodies: [...wall(TOP_Y, 720)], modifiers:[{kind:'wind', period:4, strength:2.5, dust:true}], climb:{reach:0.11,hold:0.14,hang:12,weakEvery:9,shape:'pyramid'},
    npcScenes:['blownBodies','domeHouses'], inscription:{ text:'IL VENTO DAL SUD' } },

  { id:'03', track:'COME I TUONI', title:'COME I TUONI', audioId:'03-tuoni', direction:'up', height:720,
    bodies: [...wall(TOP_Y, 720)], modifiers:[{kind:'quake', every:5, shakeT:0.8, shakeAmp:6}], climb:{reach:0.12,hold:0.20,hang:11,weakEvery:6,shape:'pyramid'},
    npcScenes:['separatedMothers','trembling'], inscription:{ text:'COME I TUONI' } },

  { id:'04', track:'BAGHDAD', title:'BAGHDAD', audioId:'04-baghdad', direction:'up', height:720,
    bodies: [...wall(TOP_Y, 720, { stable:6 })], modifiers:[{kind:'fallingBlades', every:3, speed:3}], climb:{reach:0.10,hold:0.13,hang:12,weakEvery:5,shape:'gaps'},
    npcScenes:['repressedProtest','stillBody'], inscription:{ text:'BAGHDAD' } },

  { id:'05', track:'HO SONNO', title:'HO SONNO', audioId:'05-hosonno', direction:'up', height:720,
    bodies: [...wall(TOP_Y, 720)], modifiers:[{kind:'sleep', dimTo:0.35, wakeTouchEvery:1.2}], climb:{reach:0.16,hold:0.24,hang:10,weakEvery:9,shape:'pyramid'},
    npcScenes:['workLoop','timecard','sirene'], inscription:{ text:'HO SONNO' } },

  { id:'06', track:'PRIMO POSTO', title:'PRIMO POSTO', audioId:'06-primoposto', direction:'up', height:720,
    bodies: [...wall(TOP_Y, 720)], modifiers:[{kind:'rivals', count:3, pushForce:2}], climb:{reach:0.09,hold:0.12,hang:13,weakEvery:8,shape:'overhang'},
    npcScenes:['snakes','climbers'], inscription:{ text:'PRIMO POSTO' } },

  { id:'07', track:'TIC-TAC', title:'TIC-TAC', audioId:'07-tictac', direction:'up', height:720,
    bodies: [...wall(TOP_Y, 720)], modifiers:[{kind:'timer', total:35, collapseSpeed:0.6}], climb:{reach:0.08,hold:0.11,hang:11,weakEvery:7,shape:'pyramid'},
    npcScenes:['clocks','wornBodies','crackedMirror'], inscription:{ text:'TIC-TAC' } },

  { id:'08', track:'TUTTO FINTO', title:'TUTTO FINTO', audioId:'08-tuttofinto', direction:'up', height:720,
    bodies: [...wall(TOP_Y, 720).map((b, i) => i % 3 === 1 ? { ...b, kind:'fake' } : b)],
    modifiers:[{kind:'illusion', fakeRatio:0.4, flames:true}], climb:{reach:0.12,hold:0.16,hang:12,weakEvery:6,shape:'pyramid'},
    npcScenes:['redCurtain','maskedOrchestra','delta'], inscription:{ text:'TUTTO FINTO' } },

  { id:'09', track:'EDERA', title:'EDERA', audioId:'09-edera', direction:'down', height:720,
    bodies: [...wall(TOP_Y, 720)], modifiers:[{kind:'descent', verlet:true, verletFor:15, ivy:true}], climb:{reach:0.15,hold:0.22,hang:9,weakEvery:5,shape:'spiral'},
    npcScenes:['snakes','cerberus','double'], inscription:{ text:'EDERA' } },

  { id:'10', track:'SCENDI', title:'SCENDI', audioId:'10-scendi', direction:'up', height:720,
    bodies: [...wall(TOP_Y, 720)], modifiers:[{kind:'rain', slip:true, pushers:3}], climb:{reach:0.11,hold:0.15,hang:12,weakEvery:7,shape:'pyramid'},
    npcScenes:['protest','raisedFists','wetCrowd'], inscription:{ text:'SCENDI' } },

  { id:'11', track:'LA FINE DEL MONDO', title:'LA FINE DEL MONDO', audioId:'11-lafinedelmondo', direction:'up', height:720,
    bodies: [...wall(TOP_Y, 720)], modifiers:[{kind:'risingWater', riseSpeed:0.8}, {kind:'fallingBlades', every:2.5, speed:3}], climb:{reach:0.13,hold:0.17,hang:10,weakEvery:6,shape:'gaps'},
    npcScenes:['screamingWorld','wiltingFlowers','blackShroud'], inscription:{ text:'LA FINE DEL MONDO' } },

  { id:'12', track:'MARANATHA', title:'MARANATHA', audioId:'12-maranatha', direction:'up', height:720,
    bodies: [...wall(TOP_Y, 720, { stable:6 })], modifiers:[{kind:'handhold', hands:true}], climb:{reach:0.12,hold:0.15,hang:11,weakEvery:12,shape:'pyramid'},
    npcScenes:['popoliInCammino','chorus'], inscription:{ text:'MARANATHA' } },

  { id:'13', track:'OUTRO', title:'OUTRO', audioId:'13-outro', direction:'up', height:720,
    bodies: [...wall(TOP_Y, 720, { stable:6 })], modifiers:[{kind:'handhold', hands:true, final:true}], climb:{reach:0.13,hold:0.16,hang:11,weakEvery:14,shape:'overhang'},
    npcScenes:['theTop'], inscription:{ text:'OUTRO' } },
];

// Firma meccanica di un girone: kind + parametri autoriali ordinati.
// Serve a garantire che i 13 gironi siano meccanicamente distinguibili.
export function modifierSignature(g) {
  return g.modifiers.map(m => {
    const keys = Object.keys(m).filter(k => k !== 'kind').sort();
    return m.kind + '(' + keys.map(k => k + '=' + m[k]).join(',') + ')';
  }).join('+');
}

export function validateGironi(list) {
  if (!Array.isArray(list) || list.length !== 13) throw new Error('malformed: expected 13 gironi');
  for (const g of list) {
    const ok = g && typeof g.id === 'string' && typeof g.audioId === 'string' &&
      (g.direction === 'up' || g.direction === 'down') &&
      typeof g.height === 'number' && Array.isArray(g.bodies) && g.bodies.length > 0 &&
      Array.isArray(g.modifiers) && g.modifiers.length > 0 && Array.isArray(g.npcScenes) &&
      g.inscription && typeof g.inscription.text === 'string';
    if (!ok) throw new Error('malformed girone: ' + JSON.stringify(g && g.id));
  }
  return { ok: true };
}
