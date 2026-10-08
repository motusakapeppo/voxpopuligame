// ============================================================================
// LEVELGEN — generatore di GRIGLIE di scalata PER-TRACCIA. Ogni brano può avere
// una struttura davvero diversa: numero di colonne, passo, larghezza, forma del
// profilo, corsie multiple, altezza delle file. Tutto PURO e DETERMINISTICO:
// nessun RNG, nessun Math.random. Il layout di default riproduce ESATTAMENTE la
// griglia storica (21 colonne a 11px, piramide lineare 120->30), così i test e il
// comportamento esistente non cambiano finché non si sceglie un altro layout.
// ============================================================================

// Layout di riferimento = comportamento storico ESATTO.
export const DEFAULT_LAYOUT = {
  cols: 21, colStep: 11, colCenter: 160,
  widthBase: 120, widthTop: 30, curve: 'linear',
  rowStep: 24, density: 1, lanes: 1,
  zigAmp: 0, zigFreq: 0, stair: 0,
};

// Preset di layout. Ognuno è una STRUTTURA diversa, non un ritocco.
export const LAYOUTS = {
  // piramide classica (default)
  pyramid: { ...DEFAULT_LAYOUT },
  // parete LARGA: molte colonne, passo stretto -> più spazio orizzontale
  wide:    { cols: 29, colStep: 9,  colCenter: 160, widthBase: 156, widthTop: 74,
             curve: 'linear',   rowStep: 23, density: 1,    lanes: 1 },
  // ciminiera STRETTA: poche colonne -> claustrofobica
  narrow:  { cols: 13, colStep: 15, colCenter: 160, widthBase: 74,  widthTop: 26,
             curve: 'linear',   rowStep: 27, density: 1,    lanes: 1 },
  // IMBUTO: larghissima sotto, strettissima in cima
  funnel:  { cols: 21, colStep: 11, colCenter: 160, widthBase: 146, widthTop: 10,
             curve: 'funnel',   rowStep: 24, density: 1,    lanes: 1 },
  // CAVERNA: ampia su tutta l'altezza, con qualche buco
  cavern:  { cols: 25, colStep: 10, colCenter: 160, widthBase: 152, widthTop: 120,
             curve: 'cavern',   rowStep: 24, density: 0.82, lanes: 1 },
  // SERPENTINA: la fascia valida ondeggia di lato salendo
  zigzag:  { cols: 19, colStep: 12, colCenter: 160, widthBase: 62,  widthTop: 62,
             curve: 'linear',   rowStep: 24, density: 1,    lanes: 1, zigAmp: 46, zigFreq: 0.5 },
  // SCALA: fascia che si sposta a gradoni (a scatti) salendo
  stair:   { cols: 23, colStep: 10, colCenter: 160, widthBase: 92,  widthTop: 92,
             curve: 'linear',   rowStep: 25, density: 1,    lanes: 1, stair: 5 },
  // DOPPIA CORSIA: due corridoi verticali separati (scegli la tua linea)
  double:  { cols: 27, colStep: 10, colCenter: 160, widthBase: 150, widthTop: 150,
             curve: 'linear',   rowStep: 24, density: 1,    lanes: 2 },
};

// Risolve il layout di un girone: preset da `pc.layout` + override puntuali.
export function resolveLayout(g) {
  const pc = (g && g.climb) || {};
  const preset = LAYOUTS[pc.layout] || DEFAULT_LAYOUT;
  const out = { ...preset };
  // override numerici puntuali (solo se finiti e sensati)
  const ov = ['cols', 'colStep', 'colCenter', 'widthBase', 'widthTop', 'rowStep', 'density', 'lanes', 'zigAmp', 'zigFreq', 'stair'];
  for (const k of ov) if (Number.isFinite(pc[k])) out[k] = pc[k];
  if (typeof pc.curve === 'string') out.curve = pc.curve;
  return out;
}

// Half-width del profilo alla fila r (0..nRows-1). t=0 fondo, t=1 cima.
export function halfWidthAt(layout, r, nRows) {
  const t = nRows <= 1 ? 0 : r / (nRows - 1);
  const { widthBase: b, widthTop: tp, curve } = layout;
  switch (curve) {
    case 'funnel':  return b + (tp - b) * Math.pow(t, 2.4);     // resta largo, poi stringe
    case 'cavern':  return b + (tp - b) * Math.sin(t * Math.PI * 0.5);  // ampio subito
    case 'bulge':   return b + (tp - b) * (1 - Math.abs(2 * t - 1));    // rigonfio al centro
    default:        return b + (tp - b) * t;                    // lineare (storico)
  }
}

// Spostamento laterale del centro della fascia alla fila r (px). 0 = centrato.
export function centerShiftAt(layout, r, nRows) {
  let dx = 0;
  if (layout.zigAmp) dx += Math.round(Math.sin(r * (layout.zigFreq || 0.4)) * layout.zigAmp);
  if (layout.stair) dx += (Math.floor(r / layout.stair) - Math.floor(nRows / (2 * layout.stair))) * (layout.colStep * 1.2);
  return dx;
}

// Costruisce cols + holds per un layout e un numero di file. Ritorna {cols, holds}.
export function buildGrid(layout, nRows) {
  const nCols = Math.max(3, Math.floor(layout.cols));
  const cols = Array.from({ length: nCols }, (_, i) =>
    layout.colCenter - ((nCols - 1) / 2) * layout.colStep + i * layout.colStep);
  const holds = [];
  for (let r = 0; r < nRows; r++) {
    const hw = halfWidthAt(layout, r, nRows);
    const cx = layout.colCenter + centerShiftAt(layout, r, nRows);
    const row = new Array(nCols);
    if (layout.lanes >= 2) {
      // due corsie: due lobi simmetrici attorno al centro
      const off = Math.max(layout.colStep * 2, hw * 0.52);
      const lobe = Math.max(layout.colStep, hw * 0.42);
      for (let c = 0; c < nCols; c++) {
        const x = cols[c];
        row[c] = Math.abs(x - (cx - off)) <= lobe || Math.abs(x - (cx + off)) <= lobe;
      }
    } else {
      for (let c = 0; c < nCols; c++) row[c] = Math.abs(cols[c] - cx) <= hw;
    }
    holds.push(row);
  }
  // DENSITÀ: buchi deterministici (nessun RNG). density<1 rimuove alcune prese.
  if (layout.density < 1) {
    for (let r = 0; r < nRows; r++)
      for (let c = 0; c < nCols; c++) {
        const h = ((r * 73856093) ^ (c * 19349663)) >>> 0;   // hash deterministico
        if ((h % 1000) / 1000 > layout.density) holds[r][c] = false;
      }
  }
  return { cols, holds };
}
