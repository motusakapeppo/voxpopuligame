import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THEME_IDS, THEME_FALLBACK, themeFor, themeHasWater, themeParticlePlan,
  themeLayers, drawThemeBack, drawThemeFront,
} from '../src/themes.js';
// Namespace import: consente di leggere il contatore di debug S-REND senza
// far fallire il link dell'intero file se non è ancora esposto (RED pulito).
import * as THM from '../src/themes.js';
import { C, depthRed } from '../src/palette.js';
import { createFx } from '../src/fx.js';

// ctx finto: registra le chiamate senza DOM. Conta anche save() (= drawFigure).
function fakeCtx() {
  const calls = { fillRect: 0, save: 0, restore: 0, dot: 0 };
  const noop = () => {};
  const ctx = {
    _calls: calls,
    fillRect: () => { calls.fillRect++; },
    save: () => { calls.save++; },
    restore: () => { calls.restore++; },
    clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    arc: noop, fill: noop, stroke: noop, translate: noop, scale: noop, rotate: noop,
    fillText: noop, measureText: () => ({ width: 0 }),
    drawImage: noop, setTransform: noop,
    createPattern: () => ({}), createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', font: '',
    lineWidth: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: false,
  };
  return ctx;
}

// ctx registratore: sequenza esatta delle chiamate (determinismo + colori usati).
function recCtx() {
  const seq = [];
  const noop = () => {};
  const ctx = {
    _seq: seq,
    fillRect(x, y, w, h) { seq.push(['r', x, y, w, h, ctx.fillStyle, ctx.globalAlpha]); },
    save() { seq.push(['save']); },
    restore() { seq.push(['restore']); },
    clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    arc: noop, fill: noop, stroke: noop, translate: noop, scale: noop, rotate: noop,
    fillText: noop, measureText: () => ({ width: 0 }),
    drawImage: noop, setTransform: noop,
    createPattern: () => ({}), createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', font: '',
    lineWidth: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: false,
  };
  return ctx;
}

function usedColors(seq) {
  const s = new Set();
  for (const c of seq) if (c[0] === 'r') s.add(c[5]);
  return s;
}

// Solo nero/bianco o rosso dominante (r > g e r > b): la palette della cover.
function isRedDominant(hex) {
  if (hex === C.black || hex === C.white) return true;
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r > g && r > b;
}

const ALL_IDS = [...THEME_IDS, THEME_FALLBACK];

test('themeFor: i 13 id noti sono distinti e noti; ignoti → fallback', () => {
  const ids = THEME_IDS.map(themeFor);
  assert.equal(new Set(ids).size, 13, 'gli id dei temi non sono distinti');
  for (const id of ids) assert.ok(THEME_IDS.includes(id), 'tema ignoto ' + id);
  for (const bad of ['xx', undefined, null, '', 42, {}]) {
    assert.equal(themeFor(bad), THEME_FALLBACK, 'fallback errato per ' + String(bad));
  }
});

test('themeHasWater è vero solo per LA FINE DEL MONDO', () => {
  assert.equal(themeHasWater('11-lafinedelmondo'), true);
  for (const id of THEME_IDS) if (id !== '11-lafinedelmondo') assert.equal(themeHasWater(id), false, id);
  assert.equal(themeHasWater('xx'), false);
});

test('themeParticlePlan è ben formato per tutti i temi e il fallback', () => {
  for (const id of [...THEME_IDS, 'xx', undefined]) {
    const p = themeParticlePlan(id);
    assert.ok(Array.isArray(p.types) && p.types.length >= 1, 'types vuoto per ' + String(id));
    for (const t of p.types) assert.ok(typeof t === 'string' && t.length > 0, 'tipo non valido');
    assert.ok(Number.isFinite(p.rate) && p.rate > 0, 'rate non valido per ' + String(id));
  }
});

test('drawThemeBack/Front non lanciano e restano nel budget per ogni tema', () => {
  const fx = createFx(7);
  for (const id of [...THEME_IDS, undefined, 'xx']) {
    const ctx = fakeCtx();
    assert.doesNotThrow(() => drawThemeBack(ctx, id, 120, 3.3, 320, 180, fx), 'back lancia per ' + String(id));
    assert.doesNotThrow(() => drawThemeFront(ctx, id, 120, 3.3, 320, 180, fx), 'front lancia per ' + String(id));
    assert.ok(ctx._calls.fillRect <= 400, `troppi fillRect (${ctx._calls.fillRect}) per ${String(id)}`);
    assert.ok(ctx._calls.save <= 20, `troppe drawFigure (${ctx._calls.save}) per ${String(id)}`);
  }
});

test('drawThemeBack non lancia senza fx e con input non finiti', () => {
  const ctx = fakeCtx();
  assert.doesNotThrow(() => drawThemeBack(ctx, '03-tuoni', NaN, NaN, 320, 180, undefined));
  assert.doesNotThrow(() => drawThemeBack(ctx, '03-tuoni', 0, 0, undefined, undefined, null));
  assert.doesNotThrow(() => drawThemeFront(ctx, null, 0, 0, 320, 180));
});

test('drawThemeBack è deterministico: stesso tempo → stesso numero di fillRect', () => {
  const a = fakeCtx(), b = fakeCtx();
  drawThemeBack(a, '04-baghdad', 200, 5.5, 320, 180, undefined);
  drawThemeBack(b, '04-baghdad', 200, 5.5, 320, 180, undefined);
  assert.equal(a._calls.fillRect, b._calls.fillRect);
});

test('l ambra ambientale emette su fx quando il bucket cambia', () => {
  const fx = createFx(3);
  const ctx = fakeCtx();
  for (let i = 0; i < 120; i++) drawThemeBack(ctx, '11-lafinedelmondo', 100, i / 60, 320, 180, fx);
  assert.ok(fx.parts.length >= 1, 'nessuna particella ambientale emessa');
});

// --- parallasse + nebbia -----------------------------------------------------

test('themeLayers: >=2 strati per tema, profondità e colori distinti, color = depthRed(depth)', () => {
  for (const id of [...ALL_IDS, 'xx', undefined]) {
    const layers = themeLayers(id);
    assert.ok(Array.isArray(layers) && layers.length >= 2, 'strati insufficienti per ' + String(id));
    const depths = layers.map((l) => l.depth);
    const colors = layers.map((l) => l.color);
    assert.equal(new Set(depths).size, depths.length, 'profondità duplicate per ' + String(id));
    assert.equal(new Set(colors).size, colors.length, 'colori duplicati per ' + String(id));
    for (const l of layers) {
      assert.ok(Number.isFinite(l.depth) && l.depth >= 0 && l.depth <= 1, 'depth non valido per ' + String(id));
      assert.ok(Number.isFinite(l.speed) && l.speed > 0, 'speed non valido per ' + String(id));
      assert.equal(l.color, depthRed(l.depth), 'colore non coerente con depthRed per ' + String(id));
    }
  }
});

test('drawThemeBack è deterministico: stessa sequenza di chiamate a parità di input', () => {
  for (const id of ALL_IDS) {
    const a = recCtx(), b = recCtx();
    drawThemeBack(a, id, 120, 3.3, 320, 180, undefined);
    drawThemeBack(b, id, 120, 3.3, 320, 180, undefined);
    assert.deepEqual(a._seq, b._seq, 'sequenza non deterministica per ' + id);
  }
});

test('la parallasse risponde alla camera: camY diverso → sequenza diversa', () => {
  for (const id of ALL_IDS) {
    const a = recCtx(), b = recCtx();
    drawThemeBack(a, id, 120, 3.3, 320, 180, undefined);
    drawThemeBack(b, id, 157, 3.3, 320, 180, undefined);
    assert.notDeepEqual(a._seq, b._seq, 'camY non cambia il disegno per ' + id);
  }
});

test('dominanza del rosso: ogni colore disegnato è nero/bianco o con r>g e r>b', () => {
  for (const id of ALL_IDS) {
    const ctx = recCtx();
    drawThemeBack(ctx, id, 120, 3.3, 320, 180, undefined);
    for (const col of usedColors(ctx._seq)) {
      assert.ok(isRedDominant(col), `colore non rosso (${col}) per ${id}`);
    }
  }
});

test('gli strati di themeLayers sono davvero disegnati nello sfondo', () => {
  for (const id of ALL_IDS) {
    const ctx = recCtx();
    drawThemeBack(ctx, id, 120, 3.3, 320, 180, undefined);
    const used = usedColors(ctx._seq);
    for (const l of themeLayers(id)) {
      assert.ok(used.has(l.color), `strato ${l.color} non disegnato per ${id}`);
    }
  }
});

// --- S-REND: guardia "nessun cambio visivo" + riuso allocazioni --------------

// Hash FNV-1a della sequenza registrata: impronta stabile e compatta.
function hashSeq(seq) {
  const s = JSON.stringify(seq);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

// Impronta di riferimento catturata dall'implementazione PRE-refactor.
// Se cambia anche un solo primitivo disegnato, questi hash cambiano → test rosso.
const REF = {
  '01-intro': [[3667857461, 304, 611673129, 6], [4124375742, 305, 1498893188, 7]],
  '02-vento': [[609023432, 158, 2889890364, 68], [2439605109, 153, 4071402270, 68]],
  '03-tuoni': [[2905870897, 245, 1947613349, 0], [3505602484, 247, 1947613349, 0]],
  '04-baghdad': [[477701795, 255, 1346374851, 5], [1419986094, 248, 3180536496, 6]],
  '05-hosonno': [[823067459, 293, 3096924092, 1], [1210234668, 292, 4023118249, 1]],
  '06-primoposto': [[2635353345, 254, 284184351, 64], [2942455989, 256, 3319994151, 64]],
  '07-tictac': [[1978515950, 239, 942003670, 61], [824579435, 240, 1014982464, 58]],
  '08-tuttofinto': [[801492124, 294, 345691016, 66], [3732313135, 294, 345691016, 66]],
  '09-edera': [[1526756889, 275, 1995386895, 14], [2706853403, 275, 478780436, 14]],
  '10-scendi': [[1313391371, 327, 1514720364, 41], [608461687, 320, 2991681208, 42]],
  '11-lafinedelmondo': [[2156084731, 168, 691758725, 10], [1417966453, 168, 519550647, 10]],
  '12-maranatha': [[598866772, 252, 4035554001, 58], [3248413878, 251, 1209617664, 58]],
  '13-outro': [[2029749381, 325, 3901673499, 1], [616996996, 285, 1013127396, 1]],
  'default': [[614794437, 106, 549137722, 4], [2233076925, 106, 3379290323, 4]],
};

test('S-REND: drawThemeBack/Front producono la sequenza ESATTA di riferimento (nessun cambio visivo)', () => {
  const params = [[120, 3.3], [157, 7.7]];
  for (const id of ALL_IDS) {
    for (let k = 0; k < params.length; k++) {
      const [camY, time] = params[k];
      const b = recCtx(); drawThemeBack(b, id, camY, time, 320, 180, undefined);
      const f = recCtx(); drawThemeFront(f, id, camY, time, 320, 180, undefined);
      assert.equal(hashSeq(b._seq), REF[id][k][0], `back hash cambiato per ${id} @${k}`);
      assert.equal(b._seq.length, REF[id][k][1], `back lunghezza cambiata per ${id} @${k}`);
      assert.equal(hashSeq(f._seq), REF[id][k][2], `front hash cambiato per ${id} @${k}`);
      assert.equal(f._seq.length, REF[id][k][3], `front lunghezza cambiata per ${id} @${k}`);
    }
  }
});

test('S-REND: chiamare due volte lo stesso tema produce sequenze deepEqual', () => {
  for (const id of ALL_IDS) {
    const a = recCtx(), b = recCtx();
    drawThemeBack(a, id, 120, 3.3, 320, 180, undefined);
    drawThemeBack(b, id, 120, 3.3, 320, 180, undefined);
    assert.deepEqual(a._seq, b._seq, 'back non ripetibile per ' + id);
    const c = recCtx(), d = recCtx();
    drawThemeFront(c, id, 120, 3.3, 320, 180, undefined);
    drawThemeFront(d, id, 120, 3.3, 320, 180, undefined);
    assert.deepEqual(c._seq, d._seq, 'front non ripetibile per ' + id);
  }
});

test('S-REND: il painter è riusato per lo stesso ctx (nessuna ricreazione per frame)', () => {
  assert.ok(THM.__thmDebug && typeof THM.__thmDebug.paintersCreated === 'number',
    'contatore di debug __thmDebug.paintersCreated non esposto');
  const ctx = recCtx();
  const before = THM.__thmDebug.paintersCreated;
  for (let i = 0; i < 50; i++) drawThemeBack(ctx, '04-baghdad', 120, i / 60, 320, 180, undefined);
  const afterBack = THM.__thmDebug.paintersCreated;
  assert.equal(afterBack - before, 1, 'il painter non è stato riusato per lo stesso ctx (back)');
  for (let i = 0; i < 50; i++) drawThemeFront(ctx, '04-baghdad', 120, i / 60, 320, 180, undefined);
  assert.equal(THM.__thmDebug.paintersCreated - afterBack, 0,
    'il painter è stato ricreato per il front sullo stesso ctx');
});

test('S-REND: il painter è ricreato quando cambia il ctx', () => {
  assert.ok(THM.__thmDebug && typeof THM.__thmDebug.paintersCreated === 'number',
    'contatore di debug __thmDebug.paintersCreated non esposto');
  const a = recCtx(), b = recCtx();
  const before = THM.__thmDebug.paintersCreated;
  drawThemeBack(a, '01-intro', 120, 3.3, 320, 180, undefined);
  drawThemeBack(b, '01-intro', 120, 3.3, 320, 180, undefined);
  assert.equal(THM.__thmDebug.paintersCreated - before, 2, 'ctx diversi devono avere painter distinti');
});

test('S-REND: le closure LCG per strato sono riusate (nessuna ricreazione per frame)', () => {
  assert.ok(THM.__thmDebug && typeof THM.__thmDebug.lcgCreated === 'number',
    'contatore di debug __thmDebug.lcgCreated non esposto');
  const ctx = recCtx();
  drawThemeBack(ctx, '04-baghdad', 120, 3.3, 320, 180, undefined); // riscalda la cache
  const before = THM.__thmDebug.lcgCreated;
  for (let i = 0; i < 50; i++) drawThemeBack(ctx, '04-baghdad', 120, 3.3 + i / 60, 320, 180, undefined);
  assert.equal(THM.__thmDebug.lcgCreated - before, 0,
    'le closure LCG degli strati sono state ricreate per frame');
});

// ---------------------------------------------------------------------------
// W3-TEMI: palette-per-regione. 13 descrittori distinti, palette-safe.
// ---------------------------------------------------------------------------
import { themePalette } from '../src/themes.js';

test('W3-TEMI: themePalette copre 13 id + fallback con descrittori distinti', () => {
  const ids = ['01-intro','02-vento','03-tuoni','04-baghdad','05-hosonno','06-primoposto',
    '07-tictac','08-tuttofinto','09-edera','10-scendi','11-lafinedelmondo','12-maranatha','13-outro'];
  const seen = new Set();
  for (const id of ids) {
    const p = themePalette(id);
    assert.ok(p && p.motif && p.tone, id + ' palette incompleta');
    for (const key of ['base','mid','hot','accent']) {
      const c = p[key];
      assert.ok(typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c), id + ' ' + key + ' non colore');
      const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
      assert.ok(r >= g && r >= b, id + ' ' + key + ' non rosso-dominante: ' + c);
    }
    seen.add(p.motif + '|' + p.tone + '|' + p.hot);
  }
  assert.ok(seen.size >= 10, 'descrivatori troppo simili: ' + seen.size);
  const fb = themePalette('sconosciuto');
  assert.ok(fb && fb.motif, 'fallback assente');
});
