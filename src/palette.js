// ============================================================================
// PALETTE — VOX POPULI. Solo NERO + rampa di ROSSO, come la copertina.
// Il disco e la cover non usano ocra, blu o grigio: solo figure rosse su nero.
// Valori campionati dalla cover ufficiale.
// ============================================================================
export const C = {
  black:    '#000000', // fondo
  redDeep:  '#2a0202', // figure lontane / in ombra
  redDark:  '#580808',
  redMid:   '#800808',
  red:      '#a80808', // il "rosso cover"
  redBright:'#c00d0d', // figura vicina / primo piano
  redHot:   '#e01010', // accenti: la mano tesa, il sangue, il titolo
  white:    '#f5f5f5', // solo testo/HUD
};

// indice 0 = trasparente; il resto sono i rossi disegnabili, dal più scuro al più acceso
export const PALETTE = [
  null,
  C.black,     // 1
  C.redDeep,   // 2
  C.redDark,   // 3
  C.redMid,    // 4
  C.red,       // 5
  C.redBright, // 6
  C.redHot,    // 7
  C.white,     // 8
];

// Rampa di rosso per "profondità": più sei in alto/vicino, più il rosso è acceso.
export const RED_RAMP = [C.redDeep, C.redDark, C.redMid, C.red, C.redBright, C.redHot];

// Tinta della figura in base alla profondità relativa (0 = lontano, 1 = vicino)
export function depthRed(depth) {
  const d = Math.max(0, Math.min(1, depth));
  const i = Math.round(d * (RED_RAMP.length - 1));
  return RED_RAMP[i];
}
