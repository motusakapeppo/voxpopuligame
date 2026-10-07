import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, createPostDefaults, scanlineAlpha, clamp01, bloomPassOn } from '../src/renderer.js';

// ============================================================================
// DOM STUB — nessun canvas reale. Registra OGNI chiamata al contesto 2D così
// i test possono verificare: zero allocazioni per frame (niente createElement /
// createPattern / createRadialGradient / createImageData dopo la costruzione),
// determinismo della sequenza di chiamate, idempotenza di resize, assenza di NaN.
// ============================================================================

function makeStub() {
  const log = [];
  const counts = { createElement: 0, createPattern: 0, createRadialGradient: 0, createImageData: 0, getContext: 0 };
  const canvasSizeReads = { width: 0, height: 0 };

  function makeCtx() {
    const ctx = {
      globalCompositeOperation: 'source-over',
      globalAlpha: 1,
      fillStyle: '#000000',
      font: '10px sans-serif',
      imageSmoothingEnabled: false,
      clearRect: (...a) => log.push(['clearRect', ...a]),
      fillRect: (...a) => log.push(['fillRect', ...a]),
      drawImage: (...a) => log.push(['drawImage', ...a]),
      save: () => log.push(['save']),
      restore: () => log.push(['restore']),
      setTransform: (...a) => log.push(['setTransform', ...a]),
      translate: (...a) => log.push(['translate', ...a]),
      measureText: (s) => { log.push(['measureText', s]); return { width: String(s).length * 6 }; },
      createPattern: () => { counts.createPattern++; log.push(['createPattern']); return { __pattern: true }; },
      createRadialGradient: () => {
        counts.createRadialGradient++;
        log.push(['createRadialGradient']);
        return { addColorStop: () => log.push(['addColorStop']) };
      },
      createImageData: (w, h) => {
        counts.createImageData++;
        log.push(['createImageData', w, h]);
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      },
      putImageData: (...a) => log.push(['putImageData', ...a]),
      getImageData: (x, y, w, h) => {
        log.push(['getImageData', x, y, w, h]);
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      },
    };
    return ctx;
  }

  function makeCanvas(w, h) {
    const c = {
      _w: w, _h: h,
      getContext: () => { counts.getContext++; return makeCtx(); },
    };
    Object.defineProperty(c, 'width', {
      get() { canvasSizeReads.width++; return c._w; },
      set(v) { c._w = v; },
    });
    Object.defineProperty(c, 'height', {
      get() { canvasSizeReads.height++; return c._h; },
      set(v) { c._h = v; },
    });
    return c;
  }

  const doc = {
    createElement: (tag) => { counts.createElement++; return makeCanvas(1, 1); },
  };

  const visible = makeCanvas(640, 360);
  visible.ownerDocument = doc;

  return { doc, visible, log, counts, canvasSizeReads };
}

function snapshot(log) {
  return JSON.stringify(log);
}

// ============================================================================
// PIPELINE — regressione: il render non deve allocare nulla per frame.
// ============================================================================

test('pipeline: createRenderer costruisce una volta sola, render() non crea canvas/pattern/gradienti', () => {
  const s = makeStub();
  const r = createRenderer(s.visible, 320, 180);

  // costruzione: 6 canvas (scene, glow, scratch, tmp, out, scan, noise = 7)
  assert.ok(s.counts.createElement >= 6, 'attesi canvas offscreen alla costruzione');
  assert.ok(s.counts.createPattern >= 1, 'pattern creati alla costruzione');
  assert.ok(s.counts.createRadialGradient >= 1, 'vignettatura creata alla costruzione');
  assert.ok(s.counts.createImageData >= 1, 'grana creata alla costruzione');

  const afterCtor = { ...s.counts };
  const logLen = s.log.length;
  const opts = { post: createPostDefaults() };

  // spia su Object.assign: il render non deve allocare un oggetto opts per frame
  const origAssign = Object.assign;
  let assigns = 0;
  Object.assign = function (...args) { assigns++; return origAssign.apply(this, args); };
  try {
    for (let i = 0; i < 5; i++) r.render(() => {}, opts);
  } finally {
    Object.assign = origAssign;
  }

  assert.equal(s.counts.createElement, afterCtor.createElement, 'render() non deve creare canvas');
  assert.equal(s.counts.createPattern, afterCtor.createPattern, 'render() non deve creare pattern');
  assert.equal(s.counts.createRadialGradient, afterCtor.createRadialGradient, 'render() non deve creare gradienti');
  assert.equal(s.counts.createImageData, afterCtor.createImageData, 'render() non deve creare ImageData');
  assert.equal(assigns, 0, 'render() non deve chiamare Object.assign per frame');
  assert.ok(s.log.length > logLen, 'render() deve disegnare qualcosa');
});

test('pipeline: render() deterministico — stessa sequenza di chiamate a parità di input', () => {
  const s1 = makeStub();
  const r1 = createRenderer(s1.visible, 320, 180);
  const s2 = makeStub();
  const r2 = createRenderer(s2.visible, 320, 180);

  const paint = (ctx) => { ctx.fillRect(10, 10, 4, 4); };
  const opts = { post: { bloom: 0.5, bloomThreshold: 0.45, chroma: 0.6, scan: 0.35, grain: 0.12, vignette: 0.5, glitch: 0.4, flash: 0.2 } };

  r1.render(paint, opts);
  r2.render(paint, opts);

  assert.equal(snapshot(s1.log), snapshot(s2.log), 'sequenze di chiamate diverse tra due renderer identici');
});

test('pipeline: resize() idempotente e render() non ricalcola la scala se la dimensione non cambia', () => {
  const s = makeStub();
  const r = createRenderer(s.visible, 320, 180);

  const a = r.resize();
  const b = r.resize();
  assert.equal(a, b, 'resize() deve essere idempotente');
  assert.equal(a, 2, '640x360 su 320x180 → scala 2');

  // con la cache: 1 sola lettura di width+height per render (check), non 2
  // (check + blit). Il codice pre-fix legge 4 volte per render.
  const readsBefore = s.canvasSizeReads.width + s.canvasSizeReads.height;
  r.render(() => {}, { post: createPostDefaults() });
  r.render(() => {}, { post: createPostDefaults() });
  const readsAfter = s.canvasSizeReads.width + s.canvasSizeReads.height;

  assert.ok(readsAfter - readsBefore <= 4, 'render() rilegge canvas.width/height più del necessario: ' + (readsAfter - readsBefore) + ' letture per 2 render');

  // cambio dimensione → la scala si aggiorna
  s.visible._w = 960; s.visible._h = 540;
  assert.equal(r.resize(), 3, 'dopo il cambio di dimensione la scala deve aggiornarsi');
});

test('pipeline: tutti gli argomenti numerici registrati sono finiti (niente NaN)', () => {
  const s = makeStub();
  const r = createRenderer(s.visible, 320, 180);
  r.render(() => {}, { post: createPostDefaults() });

  for (const entry of s.log) {
    for (let i = 1; i < entry.length; i++) {
      const v = entry[i];
      if (typeof v === 'number') {
        assert.ok(Number.isFinite(v), 'argomento non finito in ' + entry[0] + ': ' + v);
      }
    }
  }
});

test('pipeline: opts.post parziale non muta api.post e non alloca un oggetto per frame', () => {
  const s = makeStub();
  const r = createRenderer(s.visible, 320, 180);
  const base = { ...r.post };

  r.render(() => {}, { post: { flash: 0.5 } });

  assert.deepEqual({ ...r.post }, base, 'api.post non deve essere mutato da opts.post');
  assert.equal(r.post.flash, base.flash, 'flash di api.post deve restare invariato');
});

// ============================================================================
// HELPER PURI (già esistenti)
// ============================================================================

test('createPostDefaults restituisce i campi attesi con valori finiti', () => {
  const d = createPostDefaults();
  for (const k of ['bloom', 'bloomThreshold', 'chroma', 'scan', 'grain', 'vignette', 'glitch', 'flash']) {
    assert.ok(Number.isFinite(d[k]), k + ' non finito');
    assert.ok(d[k] >= 0 && d[k] <= 1, k + ' fuori 0..1: ' + d[k]);
  }
});

test('clamp01 limita e protegge dai non-finiti', () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(NaN), 0);
  assert.equal(clamp01(Infinity), 1);
});

test('scanlineAlpha: righe alternate, clampata, deterministica', () => {
  assert.equal(scanlineAlpha(0, 0.5), 0.5);
  assert.equal(scanlineAlpha(2, 0.5), 0.5);
  assert.equal(scanlineAlpha(1, 0.5), 0);
  assert.equal(scanlineAlpha(3, 0.5), 0);
  assert.equal(scanlineAlpha(0, 5), 1);      // clamp
  assert.equal(scanlineAlpha(NaN, 0.5), 0);  // non finito
});

test('bloomPassOn: il rosso acceso fiorisce, lo scuro no (palette rossa)', () => {
  assert.equal(bloomPassOn(224, 16, 16, 0.45), true);  // C.redHot
  assert.equal(bloomPassOn(88, 8, 8, 0.45), false);    // C.redDark
  assert.equal(bloomPassOn(255, 255, 255, 0.9), true);
  assert.equal(bloomPassOn(0, 0, 0, 0.5), false);
  assert.equal(bloomPassOn(NaN, 0, 0, 0.5), false);    // non finito → false
});
