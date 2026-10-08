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
  lights: 0, lut: 0,
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

// ---------------------------------------------------------------------------
// W2-C: TONEMAP + LUT ROSSA (puri) + LIGHTMAP (feature-flagged).
// ---------------------------------------------------------------------------

// Reinhard: comprime le alte luci (evita il blow-out quando si sommano le luci).
export function tonemap(x) {
  const v = rdrNum(x, 0);
  if (v <= 0) return 0;
  return v / (1 + v);
}

// LUT della rampa rossa: da un valore scalare 0..255 alla terna RGB della rampa
// nero -> rosso scuro -> ... -> rosso acceso -> bianco-caldo. Sempre rosso-dominante.
export const RED_LUT = (() => {
  const stops = [
    [0, 0, 0], [40, 2, 6], [85, 7, 12], [128, 9, 8],
    [168, 10, 6], [192, 15, 10], [224, 16, 16], [245, 245, 245],
  ];
  const out = [];
  for (let i = 0; i < 256; i++) {
    const t = i / 255 * (stops.length - 1);
    const a = Math.min(stops.length - 2, Math.floor(t));
    const f = t - a;
    const c0 = stops[a], c1 = stops[a + 1];
    out.push([Math.round(c0[0] + (c1[0] - c0[0]) * f),
              Math.round(c0[1] + (c1[1] - c0[1]) * f),
              Math.round(c0[2] + (c1[2] - c0[2]) * f)]);
  }
  return out;
})();

// Applica la LUT rossa a un colore: prima tonemap percettiva (max canale), poi LUT.
export function applyRedLut(r, g, b) {
  const m = Math.max(rdrNum(r, 0), rdrNum(g, 0), rdrNum(b, 0));
  const v = Math.min(1, tonemap(m / 255) * 1.6);   // tonemap + guadagno
  const idx = Math.max(0, Math.min(255, Math.round(v * 255)));
  return RED_LUT[idx].slice();
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
  // out buffer: subisce getImageData/putImageData OGNI frame (color grading) →
  // willReadFrequently evita il warning e tiene il buffer in memoria CPU (più veloce).
  const outCtx = out.getContext('2d', { willReadFrequently: true });
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

  // W2-C: buffer LUCI (a bassa risoluzione, metà: basta e avanza per una luce
  // soffusa) + sprite radiale pre-renderizzato (niente createRadialGradient per
  // frame: si scala lo sprite). Zero allocazioni per frame.
  const lw = Math.max(1, w >> 1), lh = Math.max(1, h >> 1);
  const light = mk(lw, lh);
  const lightCtx = light.getContext('2d');
  const lightSprite = mk(64, 64);
  (function fillLightSprite() {
    const lc = lightSprite.getContext('2d');
    try {
      const g = lc.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      lc.fillStyle = g;
    } catch { lc.fillStyle = 'rgba(255,255,255,0.8)'; }
    lc.fillRect(0, 0, 64, 64);
  })();

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
  // Cache: dimensione del canvas visibile (evita di rileggere/ricalcolare la
  // scala a ogni frame) e stringa rgb della soglia bloom (evita di allocarla).
  let cw = -1, ch = -1;
  let lastGv = -1, lastGvStr = '';
  let lutImg = null;   // ImageData riusato per il color grading (LUT rossa)
  // Legge un parametro post SENZA allocare un oggetto per frame: opts.post
  // vince se la chiave è propria, altrimenti fallback su api.post (stessa
  // semantica di Object.assign({}, api.post, opts.post), zero allocazioni).
  const hasOwn = Object.prototype.hasOwnProperty;
  const postVal = (o, key) => (o && hasOwn.call(o, key)) ? o[key] : api.post[key];

  const api = {
    W: w, H: h, scene, glow, out,
    post: createPostDefaults(),
    lights: [],          // W2-C: luci del frame {x,y,r,alpha}; ripopolate dal chiamante

    resize() {
      const nw = rdrNum(canvas.width, 0), nh = rdrNum(canvas.height, 0);
      if (nw !== cw || nh !== ch) {
        cw = nw; ch = nh;
        scale = Math.max(1, Math.floor(Math.min(cw / w, ch / h)));
      }
      return scale;
    },

    render(paint, opts) {
      api.resize();
      const o = opts?.post ?? null;

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
      const bloom = rdrClamp01(postVal(o, 'bloom'));
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
        const thr = rdrClamp01(postVal(o, 'bloomThreshold'));
        const gv = Math.round(255 * (1 - thr));
        if (gv !== lastGv) { lastGv = gv; lastGvStr = `rgb(${gv},${gv},${gv})`; }
        glowCtx.globalCompositeOperation = supportsColorBurn ? 'color-burn' : 'multiply';
        glowCtx.globalAlpha = 1;
        glowCtx.fillStyle = lastGvStr;
        glowCtx.fillRect(0, 0, gw, gh);
        // composita il glow su out
        outCtx.globalCompositeOperation = 'lighter';
        outCtx.globalAlpha = bloom;
        outCtx.imageSmoothingEnabled = true;
        outCtx.drawImage(glow, 0, 0, gw, gh, 0, 0, w, h);
        outCtx.imageSmoothingEnabled = false;
      }

      // 3.5 LIGHTMAP (W2-C): raccoglie le luci in un buffer a metà risoluzione e
      // lo somma in modo additivo ('lighter'). Sprite radiale pre-renderizzato:
      // nessun createRadialGradient per frame. Cap del numero di luci per perf.
      const lights = rdrClamp01(postVal(o, 'lights'));
      if (lights > 0.001 && api.lights.length) {
        lightCtx.globalCompositeOperation = 'source-over';
        lightCtx.globalAlpha = 1;
        lightCtx.clearRect(0, 0, lw, lh);
        lightCtx.globalCompositeOperation = 'lighter';
        const nL = Math.min(24, api.lights.length);
        for (let i = 0; i < nL; i++) {
          const L = api.lights[i];
          if (!L || !Number.isFinite(L.x) || !Number.isFinite(L.y)) continue;
          const lr = Math.max(2, (rdrNum(L.r, 32)) * 0.5);           // metà res
          const a = Math.max(0, Math.min(1, rdrNum(L.alpha, 1))) * lights;
          if (a <= 0.01) continue;
          lightCtx.globalAlpha = a;
          try { lightCtx.drawImage(lightSprite, (L.x * 0.5) - lr, (L.y * 0.5) - lr, lr * 2, lr * 2); } catch { /* niente */ }
        }
        // somma additiva sulla scena
        outCtx.globalCompositeOperation = 'lighter';
        outCtx.globalAlpha = 1;
        outCtx.imageSmoothingEnabled = true;
        outCtx.drawImage(light, 0, 0, lw, lh, 0, 0, w, h);
        outCtx.imageSmoothingEnabled = false;
      }
      api.lights.length = 0;   // consumate: il chiamante le ripopola ogni frame

      // 4. aberrazione cromatica: fantasma rosso a destra, ciano a sinistra
      const chroma = rdrClamp01(postVal(o, 'chroma'));
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
      const scanA = rdrClamp01(postVal(o, 'scan'));
      if (scanA > 0.001 && scanPattern) {
        outCtx.globalCompositeOperation = 'source-over';
        outCtx.globalAlpha = scanA;
        outCtx.fillStyle = scanPattern;
        outCtx.fillRect(0, 0, w, h);
      }
      const grain = rdrClamp01(postVal(o, 'grain'));
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
      const vig = rdrClamp01(postVal(o, 'vignette'));
      if (vig > 0.001 && vignette) {
        outCtx.globalCompositeOperation = 'source-over';
        outCtx.globalAlpha = vig;
        outCtx.fillStyle = vignette;
        outCtx.fillRect(0, 0, w, h);
      }

      // 7. glitch: fette orizzontali spostate
      const glitch = rdrClamp01(postVal(o, 'glitch'));
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
      const flash = rdrClamp01(postVal(o, 'flash'));
      if (flash > 0.001) {
        outCtx.globalCompositeOperation = 'lighter';
        outCtx.globalAlpha = flash;
        outCtx.fillStyle = C.redHot;
        outCtx.fillRect(0, 0, w, h);
        outCtx.globalAlpha = flash * 0.30;
        outCtx.fillStyle = C.white;
        outCtx.fillRect(w * 0.3, h * 0.3, w * 0.4, h * 0.4);
      }

      // 8.5 COLOR GRADING (W3-RENDER): LUT rossa + tonemap. Feature-flagged
      // (post.lut). Applicata al buffer `out` a 320x180 (57.600 px, costo basso).
      // Riusa l'ImageData del buffer (nessuna alloc se le dimensioni non cambiano).
      const lutAmt = rdrClamp01(postVal(o, 'lut'));
      if (lutAmt > 0.001) {
        try {
          if (!lutImg || lutImg.width !== w || lutImg.height !== h) {
            lutImg = outCtx.createImageData(w, h);
          }
          const img = outCtx.getImageData(0, 0, w, h);
          const d = img.data;
          for (let i = 0; i < d.length; i += 4) {
            const rr = d[i], gg = d[i + 1], bb = d[i + 2];
            const m = rr > gg ? (rr > bb ? rr : bb) : (gg > bb ? gg : bb);
            const v = m / 255;
            const toned = v <= 0 ? 0 : v / (1 + v);
            const idx = Math.max(0, Math.min(255, Math.round(toned * 1.6 * 255)));
            const c = RED_LUT[idx];
            // miscela con l'originale secondo l'intensità del grade
            d[i]     = Math.round(rr + (c[0] - rr) * lutAmt);
            d[i + 1] = Math.round(gg + (c[1] - gg) * lutAmt);
            d[i + 2] = Math.round(bb + (c[2] - bb) * lutAmt);
          }
          outCtx.putImageData(img, 0, 0);
        } catch { /* niente grading */ }
      }

      // 9. blit scalato sul canvas visibile (usa la cache di resize: qui non
      // si rileggono canvas.width/height)
      outCtx.globalCompositeOperation = 'source-over';
      outCtx.globalAlpha = 1;
      visibleCtx.globalCompositeOperation = 'source-over';
      visibleCtx.globalAlpha = 1;
      visibleCtx.imageSmoothingEnabled = false;
      const bw = cw > 0 ? cw : w * scale, bh = ch > 0 ? ch : h * scale;
      visibleCtx.clearRect(0, 0, bw, bh);
      visibleCtx.drawImage(out, 0, 0, w, h, 0, 0, w * scale, h * scale);
    },
  };

  api.resize();
  return api;
}

// Alias per i test: il bundler rimuove questa riga, quindi nel gioco resta
// solo `rdrClamp01` (nessuna collisione con `clamp01` di fx.js).
export { rdrClamp01 as clamp01 };
