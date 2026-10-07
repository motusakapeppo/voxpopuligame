// ============================================================================
// RENDERER — pipeline di post-processing per la pixel art.
// scene (gioco) → glow (metà risoluzione) → out (composito) → canvas visibile.
// Effetti: bloom, aberrazione cromatica, scanline, grana, vignettatura, glitch,
// flash. Deterministico (LCG), mai Math.random. Importabile senza DOM.
//
// NOTA IMPORTANTE (bundle): il build concatena tutti i moduli in una sola IIFE,
// quindi i nomi top-level devono essere UNICI. `clamp01` esiste già in fx.js:
// qui il clamp è `rdrClamp01`, esportato come `clamp01` via alias (l'alias viene
// rimosso dal bundler, che è esattamente ciò che serve).
// ============================================================================
import { C } from './palette.js';

const RD_POST = {
  bloom: 0.55, bloomThreshold: 0.45, chroma: 0.6,
  scan: 0.35, grain: 0.12, vignette: 0.5, glitch: 0, flash: 0,
};

export function createPostDefaults() { return { ...RD_POST }; }

function rdrClamp01(v) { if (Number.isNaN(v)) return 0; return v < 0 ? 0 : v > 1 ? 1 : v; }
function rdrNum(v, d) { return Number.isFinite(v) ? v : d; }
function rdrLcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// Alpha di una scanline in base alla riga: linee scure una riga sì e una no.
export function scanlineAlpha(y, amount) {
  const a = rdrClamp01(amount);
  if (!Number.isFinite(y)) return 0;
  return (Math.floor(y) & 1) === 0 ? a : 0;
}

// Un pixel "brilla abbastanza" per il bloom? Il gioco è rosso puro, quindi la
// luminosità utile è il canale massimo (non la luminanza: il rosso saturo è
// percepito scuro per la luminanza e non fiorirebbe mai).
export function bloomPassOn(r, g, b, thr) {
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return false;
  const m = Math.max(r, g, b) / 255;
  return m >= rdrClamp01(thr);
}

function rdrSupportsOp(ctx, op) {
  if (!ctx) return false;
  try {
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = op;
    const ok = ctx.globalCompositeOperation === op;
    ctx.globalCompositeOperation = prev;
    return ok;
  } catch { return false; }
}

export function createRenderer(canvas, W, H) {
  const w = Math.max(1, Math.floor(rdrNum(W, 320)));
  const h = Math.max(1, Math.floor(rdrNum(H, 180)));
  const gw = Math.max(1, w >> 1), gh = Math.max(1, h >> 1);
  const doc = (canvas && canvas.ownerDocument) ? canvas.ownerDocument
    : (typeof document !== 'undefined' ? document : null);
  if (!doc || !canvas || typeof canvas.getContext !== 'function') {
    throw new Error('createRenderer: serve un canvas con ownerDocument (browser)');
  }

  const mk = (ww, hh) => { const c = doc.createElement('canvas'); c.width = ww; c.height = hh; return c; };
  const scene = mk(w, h), glow = mk(gw, gh), scratch = mk(gw, gh), tmp = mk(w, h), out = mk(w, h);
  const sceneCtx = scene.getContext('2d');
  const glowCtx = glow.getContext('2d');
  const scratchCtx = scratch.getContext('2d');
  const tmpCtx = tmp.getContext('2d');
  const outCtx = out.getContext('2d');
  // il canvas VISIBILE è opaco per costruzione (out copre tutto lo schermo):
  // alpha:false lascia che il browser salti la composizione del canale alpha
  // (guida di maestria §7.4).
  let visibleCtx = null;
  try { visibleCtx = canvas.getContext('2d', { alpha: false }); } catch { visibleCtx = null; }
  if (!visibleCtx) visibleCtx = canvas.getContext('2d');

  // pattern scanline (1×2): riga pari nera, riga dispari trasparente
  const scan = mk(1, 2);
  const scanCtx = scan.getContext('2d');
  scanCtx.fillStyle = C.black;
  for (let y = 0; y < 2; y++) {
    const a = scanlineAlpha(y, 1);
    if (a > 0) { scanCtx.globalAlpha = a; scanCtx.fillRect(0, y, 1, 1); }
  }
  let scanPattern = null;
  try { scanPattern = outCtx.createPattern(scan, 'repeat'); } catch { scanPattern = null; }

  // pattern grana (64×64) precomputato una volta
  const noise = mk(64, 64);
  const noiseCtx = noise.getContext('2d');
  (function fillNoise() {
    const rn = rdrLcg(0x9e3779b9);
    let img = null;
    try { img = noiseCtx.createImageData(64, 64); } catch { img = null; }
    if (img && img.data && img.data.length >= 64 * 64 * 4) {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = 96 + Math.floor(rn() * 64);
        d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
      }
      try { noiseCtx.putImageData(img, 0, 0); } catch { /* niente */ }
    } else {
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const v = 96 + Math.floor(rn() * 64);
        noiseCtx.fillStyle = `rgb(${v},${v},${v})`;
        noiseCtx.fillRect(x, y, 1, 1);
      }
    }
  })();
  let noisePattern = null;
  try { noisePattern = outCtx.createPattern(noise, 'repeat'); } catch { noisePattern = null; }

  // vignettatura cache (dipende solo da W,H)
  let vignette = null;
  try {
    vignette = outCtx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.30, w / 2, h / 2, Math.max(w, h) * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,1)');
  } catch { vignette = null; }

  const supportsColorBurn = rdrSupportsOp(glowCtx, 'color-burn');
  const supportsOverlay = rdrSupportsOp(outCtx, 'overlay');
  const rng = rdrLcg(1);
  let scale = 1;

  const api = {
    W: w, H: h, scene, glow, out,
    post: createPostDefaults(),

    resize() {
      const cw = rdrNum(canvas.width, 0), ch = rdrNum(canvas.height, 0);
      scale = Math.max(1, Math.floor(Math.min(cw / w, ch / h)));
      return scale;
    },

    render(paint, opts) {
      api.resize();
      const o = (opts && opts.post) ? Object.assign({}, api.post, opts.post) : api.post;

      // 1. scena
      sceneCtx.globalCompositeOperation = 'source-over';
      sceneCtx.globalAlpha = 1;
      sceneCtx.clearRect(0, 0, w, h);
      sceneCtx.fillStyle = C.black;
      sceneCtx.fillRect(0, 0, w, h);
      if (typeof paint === 'function') {
        try { paint(sceneCtx); } catch (e) { if (typeof console !== 'undefined') console.error('renderer.paint', e); }
      }

      // 2. composita la scena su out
      outCtx.globalCompositeOperation = 'source-over';
      outCtx.globalAlpha = 1;
      outCtx.clearRect(0, 0, w, h);
      outCtx.drawImage(scene, 0, 0);

      // 3. bloom (glow a metà risoluzione, bloom additivo)
      const bloom = rdrClamp01(o.bloom);
      if (bloom > 0.001) {
        glowCtx.globalCompositeOperation = 'source-over';
        glowCtx.globalAlpha = 1;
        glowCtx.clearRect(0, 0, gw, gh);
        glowCtx.imageSmoothingEnabled = true;
        glowCtx.drawImage(scene, 0, 0, w, h, 0, 0, gw, gh);
        // blur economico: 2 giri di copie spostate di ±1px
        for (let round = 0; round < 2; round++) {
          scratchCtx.globalCompositeOperation = 'source-over';
          scratchCtx.globalAlpha = 1;
          scratchCtx.clearRect(0, 0, gw, gh);
          scratchCtx.drawImage(glow, 0, 0);
          glowCtx.globalCompositeOperation = 'lighter';
          glowCtx.globalAlpha = 0.22;
          glowCtx.drawImage(scratch, 1, 0);
          glowCtx.drawImage(scratch, -1, 0);
          glowCtx.drawImage(scratch, 0, 1);
          glowCtx.drawImage(scratch, 0, -1);
        }
        // soglia: color-burn (vera soglia) o multiply (fallback)
        const thr = rdrClamp01(o.bloomThreshold);
        const gv = Math.round(255 * (1 - thr));
        glowCtx.globalCompositeOperation = supportsColorBurn ? 'color-burn' : 'multiply';
        glowCtx.globalAlpha = 1;
        glowCtx.fillStyle = `rgb(${gv},${gv},${gv})`;
        glowCtx.fillRect(0, 0, gw, gh);
        // composita il glow su out
        outCtx.globalCompositeOperation = 'lighter';
        outCtx.globalAlpha = bloom;
        outCtx.imageSmoothingEnabled = true;
        outCtx.drawImage(glow, 0, 0, gw, gh, 0, 0, w, h);
        outCtx.imageSmoothingEnabled = false;
      }

      // 4. aberrazione cromatica: fantasma rosso a destra, ciano a sinistra
      const chroma = rdrClamp01(o.chroma);
      const dx = Math.round(chroma * 3);
      if (dx > 0) {
        outCtx.globalCompositeOperation = 'lighter';
        outCtx.globalAlpha = 0.14 * chroma;
        outCtx.drawImage(scene, dx, 0);
        tmpCtx.globalCompositeOperation = 'source-over';
        tmpCtx.globalAlpha = 1;
        tmpCtx.clearRect(0, 0, w, h);
        tmpCtx.drawImage(scene, 0, 0);
        tmpCtx.globalCompositeOperation = 'source-atop';
        tmpCtx.fillStyle = 'rgba(0,216,216,0.6)';
        tmpCtx.fillRect(0, 0, w, h);
        outCtx.globalAlpha = 0.10 * chroma;
        outCtx.drawImage(tmp, -dx, 0);
      }

      // 5. scanline + grana
      const scanA = rdrClamp01(o.scan);
      if (scanA > 0.001 && scanPattern) {
        outCtx.globalCompositeOperation = 'source-over';
        outCtx.globalAlpha = scanA;
        outCtx.fillStyle = scanPattern;
        outCtx.fillRect(0, 0, w, h);
      }
      const grain = rdrClamp01(o.grain);
      if (grain > 0.001 && noisePattern) {
        const gx = Math.floor(rng() * 64), gy = Math.floor(rng() * 64);
        outCtx.globalCompositeOperation = supportsOverlay ? 'overlay' : 'source-over';
        outCtx.globalAlpha = grain;
        outCtx.save();
        outCtx.translate(gx, gy);
        outCtx.fillStyle = noisePattern;
        outCtx.fillRect(-gx, -gy, w, h);
        outCtx.restore();
      }

      // 6. vignettatura
      const vig = rdrClamp01(o.vignette);
      if (vig > 0.001 && vignette) {
        outCtx.globalCompositeOperation = 'source-over';
        outCtx.globalAlpha = vig;
        outCtx.fillStyle = vignette;
        outCtx.fillRect(0, 0, w, h);
      }

      // 7. glitch: fette orizzontali spostate
      const glitch = rdrClamp01(o.glitch);
      if (glitch > 0.001) {
        tmpCtx.globalCompositeOperation = 'source-over';
        tmpCtx.globalAlpha = 1;
        tmpCtx.clearRect(0, 0, w, h);
        tmpCtx.drawImage(out, 0, 0);
        const n = 2 + Math.floor(glitch * 6);
        for (let i = 0; i < n; i++) {
          const sy = Math.floor(rng() * h);
          const sh = 2 + Math.floor(rng() * 10);
          const sdx = Math.round((rng() * 2 - 1) * glitch * 12);
          outCtx.globalCompositeOperation = 'source-over';
          outCtx.globalAlpha = 1;
          try { outCtx.drawImage(tmp, 0, sy, w, sh, sdx, sy, w, sh); } catch { /* niente */ }
          if (rng() < 0.5) {
            outCtx.globalCompositeOperation = 'lighter';
            outCtx.globalAlpha = 0.06 * glitch;
            outCtx.fillStyle = C.redHot;
            outCtx.fillRect(Math.max(0, sdx), sy, w, sh);
          }
        }
      }

      // 8. flash
      const flash = rdrClamp01(o.flash);
      if (flash > 0.001) {
        outCtx.globalCompositeOperation = 'lighter';
        outCtx.globalAlpha = flash;
        outCtx.fillStyle = C.redHot;
        outCtx.fillRect(0, 0, w, h);
        outCtx.globalAlpha = flash * 0.30;
        outCtx.fillStyle = C.white;
        outCtx.fillRect(w * 0.3, h * 0.3, w * 0.4, h * 0.4);
      }

      // 9. blit scalato sul canvas visibile
      outCtx.globalCompositeOperation = 'source-over';
      outCtx.globalAlpha = 1;
      visibleCtx.globalCompositeOperation = 'source-over';
      visibleCtx.globalAlpha = 1;
      visibleCtx.imageSmoothingEnabled = false;
      const cw = rdrNum(canvas.width, w * scale), ch = rdrNum(canvas.height, h * scale);
      visibleCtx.clearRect(0, 0, cw, ch);
      visibleCtx.drawImage(out, 0, 0, w, h, 0, 0, w * scale, h * scale);
    },
  };

  api.resize();
  return api;
}

// Alias per i test: il bundler rimuove questa riga, quindi nel gioco resta
// solo `rdrClamp01` (nessuna collisione con `clamp01` di fx.js).
export { rdrClamp01 as clamp01 };
