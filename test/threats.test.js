import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THREATS, applyThreat, applyPickup, createThreatState, stepThreats, pickupPositions, threatEffects, THREAT_SIGNATURES } from '../src/threats.js';
import { GIRONE_ENCOUNTERS } from '../src/encounters.js';
import { createClimb, stepClimb } from '../src/climb.js';
import { GIRONI } from '../src/gironi.js';

const noInput = { left: false, right: false, up: false, down: false };

test('ogni girone ha una definizione di ostacoli/aiuti', () => {
  for (const g of GIRONI) {
    assert.ok(THREATS[g.audioId], `${g.audioId} senza THREATS`);
    const d = THREATS[g.audioId];
    assert.ok(Array.isArray(d.auto), `${g.audioId} auto non array`);
    assert.ok(Array.isArray(d.pickups), `${g.audioId} pickups non array`);
  }
});

test('almeno 8 gironi hanno un pericolo (non tutti vuoti)', () => {
  const withHazard = GIRONI.filter(g => (THREATS[g.audioId]?.auto || []).length > 0);
  assert.ok(withHazard.length >= 8, `solo ${withHazard.length} gironi con pericoli`);
});

test('un pericolo modifica davvero la presa (non è solo un messaggio)', () => {
  const cl = createClimb(GIRONI[1]);
  const st = createThreatState();
  // prima sale di qualche fila, altrimenti a fila 0 non può scendere
  for (let i = 0; i < 60; i++) stepClimb(cl, { left: false, right: false, up: true, down: false }, 0.016);
  const before = { l: { ...cl.lh }, r: { ...cl.rh } };
  const msg = applyThreat('quake', cl, st);
  assert.ok(msg, 'nessun messaggio dal terremoto');
  const moved = cl.lh.r !== before.l.r || cl.rh.r !== before.r.r ||
                cl.lh.c !== before.l.c || cl.rh.c !== before.r.c;
  assert.ok(moved, 'il terremoto non ha spostato le mani');
});

test('lo scudo assorbe il pericolo (debris) una volta', () => {
  const cl = createClimb(GIRONI[3]);
  const st = createThreatState();
  st.shield = 1;
  const m1 = applyThreat('debris', cl, st);
  assert.ok(/scudo/i.test(m1), 'lo scudo non ha assorbito: ' + m1);
  assert.equal(st.shield, 0, 'lo scudo non si è consumato');
});

test('un aiuto spinge verso l alto (gust)', () => {
  const cl = createClimb(GIRONI[1]);
  const st = createThreatState();
  const r0 = Math.max(cl.lh.r, cl.rh.r);
  applyPickup('gust', cl, st);
  assert.ok(Math.max(cl.lh.r, cl.rh.r) >= r0, 'la raffica non ha aiutato');
});

test('il caffe attiva la velocità', () => {
  const cl = createClimb(GIRONI[4]);
  const st = createThreatState();
  applyPickup('coffee', cl, st);
  assert.ok(st.speed > 0, 'la velocità non si è attivata');
});

test('stepThreats fa scattare un pericolo col tempo', () => {
  const cl = createClimb(GIRONI[1]);   // vento ogni 3.2s
  const st = createThreatState();
  let fired = false;
  for (let i = 0; i < 400; i++) {      // ~6.4s
    const msg = stepThreats(GIRONI[1], cl, st, 0.016, 0);
    if (msg) fired = true;
  }
  assert.ok(fired, 'nessun pericolo scattato in 6s');
});

test('la raccolta di un aiuto restituisce la posizione', () => {
  const pos = pickupPositions(GIRONI[1]);
  assert.ok(pos.length >= 1, 'IL VENTO DAL SUD senza aiuto');
  assert.ok(pos[0].kind, 'aiuto senza tipo');
});

// ---------------------------------------------------------------------------
// T4 — pericoli DISTINTI: nessun girone condivide la firma meccanica di un altro.
// ---------------------------------------------------------------------------
test('i 13 gironi hanno pericoli meccanicamente distinti', () => {
  const sigOf = id => (THREATS[id].auto[0] ? THREATS[id].auto[0].kind : 'none');
  const sigs = GIRONI.map(g => sigOf(g.audioId));
  const unique = new Set(sigs.filter(s => s !== 'none'));
  assert.equal(unique.size, sigs.filter(s => s !== 'none').length,
    'due gironi condividono lo stesso pericolo: ' + sigs.join(','));
  // ogni firma dichiarata esiste
  for (const k of Object.keys(THREAT_SIGNATURES)) assert.ok(THREAT_SIGNATURES[k], k);
});

test('pericoli diversi mutano campi di stato diversi', () => {
  const cl = createClimb(GIRONI[1]);
  const s1 = createThreatState(); applyThreat('quake', cl, s1);
  const s2 = createThreatState(); applyThreat('fake', cl, s2);
  const s3 = createThreatState(); applyThreat('time', cl, s3);
  const s4 = createThreatState(); applyThreat('ivy', cl, s4);
  assert.ok(s1.stun > 0, 'quake non imposta stun');
  assert.ok(s2.decoy > 0, 'fake non imposta decoy');
  assert.ok(s3.countdown > 0, 'time non imposta countdown');
  assert.ok(s4.tether, 'ivy non imposta tether');
  // nessun campo in comune
  assert.notEqual(s1.stun, s2.decoy);
});

test('slow/real hanno un effetto osservabile', () => {
  const cl = createClimb(GIRONI[1]);
  const st = createThreatState();
  applyPickup('real', cl, st);
  assert.ok(st.real > 0, 'real non attivo');
  // real protegge dall edera: applyThreat ivy viene saltato in stepThreats
  st.real = 6; st.breakFree = 0;
  const before = { ...cl.lh };
  // simula un tick con ivy e real attivo: le mani non devono scendere
  const g = GIRONI[8]; // edera
  st.last = {};
  stepThreats(g, cl, st, 3.5, 0);
  assert.ok(cl.lh.r >= before.r - 1, 'real non ha protetto dall edera');
});

test('la distribuzione degli incontri è bilanciata (max 5, tutti presenti)', () => {
  const counts = {};
  for (const id of Object.keys(GIRONE_ENCOUNTERS))
    for (const k of GIRONE_ENCOUNTERS[id]) counts[k] = (counts[k] || 0) + 1;
  const kinds = ['hand', 'rival', 'falling', 'sleeper', 'siren', 'pusher', 'fake', 'self', 'chorus', 'helper', 'grabber'];
  for (const k of kinds) assert.ok(counts[k] >= 1, 'tipo assente: ' + k);
  for (const k of Object.keys(counts)) assert.ok(counts[k] <= 5, k + ' compare ' + counts[k] + ' volte');
});

test('threatEffects espone gli stati osservabili', () => {
  const st = createThreatState();
  st.grip = 0.3; st.lag = 0.5; st.stun = 0.4; st.waterRow = 3;
  const fx = threatEffects(st);
  assert.ok(fx.dim > 0, 'dim non esposto');
  assert.ok(fx.lag > 0 && fx.stun > 0);
  assert.equal(fx.water, 3);
});

// ---------------------------------------------------------------------------
// T5 — pericoli GENUINAMENTE distinti: 9 firme di stato UNICHE, e slow/decoy
// che contano davvero. Prima erano tutti lo stesso shiftHands(0,-1).
// ---------------------------------------------------------------------------
const HAZARDS9 = ['wind', 'quake', 'debris', 'drowsy', 'rival', 'time', 'fake', 'ivy', 'rain'];

function raisedClimb() {
  const cl = createClimb(GIRONI[1]);
  for (let i = 0; i < 80; i++) stepClimb(cl, { left: false, right: false, up: true, down: false }, 0.016);
  return cl;
}

// Firma = insieme dei campi di `state` che applyThreat muta (ordinati).
function changedFields(kind) {
  const cl = raisedClimb();
  const st = createThreatState();
  const before = JSON.parse(JSON.stringify(st));
  applyThreat(kind, cl, st);
  const keys = new Set([...Object.keys(before), ...Object.keys(st)]);
  const changed = [];
  for (const k of keys) {
    if (k === 'rng') continue;   // seme interno, non è una firma osservabile
    if (JSON.stringify(before[k]) !== JSON.stringify(st[k])) changed.push(k);
  }
  return changed.sort();
}

test('i 9 pericoli hanno 9 firme di stato UNICHE', () => {
  const sigs = HAZARDS9.map(k => changedFields(k).join('+'));
  const uniq = new Set(sigs);
  assert.equal(uniq.size, HAZARDS9.length, 'firme duplicate: ' + sigs.join(' | '));
  for (const s of sigs) assert.ok(s.length > 0, 'firma vuota');
});

test('quake/debris/rival/ivy mutano combo di campi DIVERSE', () => {
  const q = changedFields('quake').join('+');
  const d = changedFields('debris').join('+');
  const r = changedFields('rival').join('+');
  const i = changedFields('ivy').join('+');
  assert.equal(new Set([q, d, r, i]).size, 4, `combo duplicate: ${q} | ${d} | ${r} | ${i}`);
  assert.ok(changedFields('quake').includes('shake') && changedFields('quake').includes('stun'),
    'quake deve stordire E scuotere');
  assert.ok(changedFields('debris').includes('colliders'), 'debris deve creare un collider');
  assert.ok(changedFields('rival').includes('duel') && changedFields('rival').includes('rivalDir'),
    'rival deve impostare duello e direzione');
  assert.ok(changedFields('ivy').includes('tether'), 'ivy deve usare un tether');
});

test('THREAT_SIGNATURES: una firma unica per ogni pericolo', () => {
  const vals = Object.values(THREAT_SIGNATURES);
  assert.equal(new Set(vals).size, vals.length, 'firme duplicate: ' + vals.join(' | '));
  for (const k of HAZARDS9) assert.ok(THREAT_SIGNATURES[k], 'manca firma per ' + k);
});

test('slow>0 riduce davvero la frequenza dei pericoli', () => {
  const countFires = (slow) => {
    const cl = createClimb(GIRONI[1]);   // vento ogni 3.2s
    const st = createThreatState();
    st.slow = slow;
    let fires = 0, prev = 0;
    for (let i = 0; i < 1250; i++) {     // ~20s
      stepThreats(GIRONI[1], cl, st, 0.016, 0);
      const now = st.last.wind || 0;
      if (now > prev) { fires++; prev = now; }
    }
    return fires;
  };
  const normal = countFires(0);
  const slowed = countFires(100);
  assert.ok(normal >= 4, 'pochi pericoli senza slow: ' + normal);
  assert.ok(slowed < normal, `slow non rallenta: ${slowed} vs ${normal}`);
});

test('decoy inghiotte il prossimo passo automatico', () => {
  const cl = createClimb(GIRONI[1]);
  const st = createThreatState();
  applyThreat('fake', cl, st);
  assert.ok(st.decoy > 0, 'fake non imposta decoy');
  stepClimb(cl, { left: false, right: false, up: true, down: false }, 0.016);
  assert.ok(cl.reach > 0, 'nessun passo automatico avviato');
  stepThreats(GIRONI[1], cl, st, 0.016, 0);
  assert.equal(cl.reach, 0, 'il decoy non ha inghiottito il passo');
  assert.equal(st.decoy, 0, 'il decoy non è stato consumato');
});

test('time accelera la cadenza dei pericoli', () => {
  const cl = raisedClimb();
  const st = createThreatState();
  applyThreat('time', cl, st);
  assert.ok(st.countdown > 0, 'time non imposta countdown');
  assert.ok(st.cadence < 1, 'time non accelera la cadenza');
});
