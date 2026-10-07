import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THEME_IDS, THEME_FALLBACK, themeFor, themeHasWater, themeParticlePlan,
  themeLayers, drawThemeBack, drawThemeFront,
} from '../src/themes.js';
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
