// ============================================================================
// VARIETY — il "racconto" di ogni girone: una MISSIONE, oggetti da raccogliere,
// AMICI e NEMICI con nome, e un EASTER EGG nascosto. Tutto deterministico e
// posizionato sulla colonna centrale (raggiungibile salendo). Nessun Math.random.
//
// Ogni voce è ancorata al tema del brano: la varietà non è decorativa, dice di
// che canzone si tratta. I nomi sono UNICI su tutti i gironi.
// ============================================================================
import { centerCol } from './climb.js';

// kind: 'item' | 'friend' | 'enemy' | 'egg'
// effect: 'loyal+1' (amico) | 'loyal-1' (nemico) | 'boost'|'firm'|'reveal' (item) | 'egg'
const it = (kind, name, at, effect) => ({ kind, name, at, effect });

export const VARIETY = {
  '01-intro': {
    mission: { text: 'Trova un motivo per restare sveglio', target: 3 },
    items: [
      it('friend', 'Vicino di letto', 0.34, 'loyal+1'),
      it('item', 'Letto sfatto', 0.52, 'boost'),
      it('enemy', 'La notte scura', 0.70, 'loyal-1'),
      it('item', 'Pezzetto di me', 0.86, 'firm'),
      it('egg', 'Via Lattea sul soffitto', 0.16, 'egg'),
    ],
  },
  '02-vento': {
    mission: { text: 'Tieni la rotta contro il vento', target: 3 },
    items: [
      it('friend', 'Compagno di viaggio', 0.30, 'loyal+1'),
      it('item', 'Bussola storta', 0.50, 'firm'),
      it('enemy', 'Raffica del sud', 0.68, 'loyal-1'),
      it('item', 'Brivido improvviso', 0.84, 'reveal'),
      it('egg', 'Microfono rotto', 0.14, 'egg'),
    ],
  },
  '03-tuoni': {
    mission: { text: 'Riparati dal sole dei suoi occhi', target: 3 },
    items: [
      it('friend', 'La mamma', 0.28, 'loyal+1'),
      it('item', 'Collana di pianeti', 0.48, 'reveal'),
      it('enemy', 'Il tuono', 0.66, 'loyal-1'),
      it('item', 'Chiavi di casa', 0.86, 'firm'),
      it('egg', 'Fiamma rossa', 0.13, 'egg'),
    ],
  },
  '04-baghdad': {
    mission: { text: 'Uccidi i mostri che vivono in te', target: 4 },
    items: [
      it('friend', 'Il vicino che tace', 0.26, 'loyal+1'),
      it('item', 'Foglio nella stanza', 0.44, 'reveal'),
      it('enemy', 'Effetto domino', 0.62, 'loyal-1'),
      it('item', 'Scudo di cranio', 0.78, 'firm'),
      it('item', 'Piedi nudi sul gelo', 0.90, 'boost'),
      it('egg', 'Voci dentro ai muri', 0.12, 'egg'),
    ],
  },
  '05-hosonno': {
    mission: { text: 'Resisti al sonno fino all\u2019alba', target: 4 },
    items: [
      it('friend', 'Morfeo', 0.30, 'loyal+1'),
      it('item', 'Caffè caldo', 0.46, 'boost'),
      it('enemy', 'La Sirena', 0.64, 'loyal-1'),
      it('item', 'Latte fresco', 0.80, 'firm'),
      it('egg', 'Cielo dentro il mare', 0.14, 'egg'),
    ],
  },
  '06-primoposto': {
    mission: { text: 'Scala senza diventare come loro', target: 3 },
    items: [
      it('friend', 'Il rivale onesto', 0.30, 'loyal+1'),
      it('item', 'Sorriso e lacrima', 0.50, 'firm'),
      it('enemy', 'Chi ti scavalca', 0.68, 'loyal-1'),
      it('item', 'Biglietto per il mare', 0.86, 'reveal'),
      it('egg', 'Un altro te', 0.15, 'egg'),
    ],
  },
  '07-tictac': {
    mission: { text: 'Arriva prima che il tempo scada', target: 4 },
    items: [
      it('friend', 'Il vecchio dell\u2019orologio', 0.28, 'loyal+1'),
      it('item', 'Chicco di personalità', 0.45, 'boost'),
      it('enemy', 'La lancetta', 0.62, 'loyal-1'),
      it('item', 'Affitto pagato', 0.78, 'firm'),
      it('item', 'Ora che non ho', 0.90, 'reveal'),
      it('egg', 'Specchio rotto (DICA!)', 0.12, 'egg'),
    ],
  },
  '08-tuttofinto': {
    mission: { text: 'Riconosci ciò che è vero', target: 3 },
    items: [
      it('friend', 'Il violinista', 0.30, 'loyal+1'),
      it('item', 'Sipario rosso', 0.48, 'reveal'),
      it('enemy', 'La maschera', 0.66, 'loyal-1'),
      it('item', 'Applauso finto', 0.84, 'firm'),
      it('egg', 'Passamontagna', 0.13, 'egg'),
    ],
  },
  '09-edera': {
    mission: { text: 'Scendi e liberati dall\u2019edera', target: 4 },
    items: [
      it('friend', 'Anima di sotto', 0.30, 'loyal+1'),
      it('item', 'Ramo reciso', 0.48, 'firm'),
      it('enemy', 'Il tuo doppio', 0.66, 'loyal-1'),
      it('item', 'Eccomi', 0.82, 'reveal'),
      it('item', 'Voce che non tace', 0.92, 'boost'),
      it('egg', 'Reset dell\u2019algoritmo', 0.14, 'egg'),
    ],
  },
  '10-scendi': {
    mission: { text: 'Scendi in piazza con gli altri', target: 3 },
    items: [
      it('friend', 'Il popolo', 0.28, 'loyal+1'),
      it('item', 'Pugno al cielo', 0.46, 'firm'),
      it('enemy', 'Le truppe', 0.64, 'loyal-1'),
      it('item', 'Voce che canta', 0.82, 'boost'),
      it('egg', 'Dita puntate al cielo', 0.12, 'egg'),
    ],
  },
  '11-lafinedelmondo': {
    mission: { text: 'Sopravvivi alla fine del mondo', target: 4 },
    items: [
      it('friend', 'Chi conosce il segreto', 0.28, 'loyal+1'),
      it('item', 'Fiore che appassisce', 0.45, 'reveal'),
      it('enemy', 'Il lenzuolo nero', 0.62, 'loyal-1'),
      it('item', 'Cresta dell\u2019acqua', 0.78, 'firm'),
      it('item', 'Buco nella nuvola', 0.90, 'boost'),
      it('egg', 'Ultimo giorno di sole', 0.12, 'egg'),
    ],
  },
  '12-maranatha': {
    mission: { text: 'Unisci le mani al coro', target: 3 },
    items: [
      it('friend', 'Il coro', 0.30, 'loyal+1'),
      it('item', 'Palmo che racchiude', 0.50, 'firm'),
      it('enemy', 'L\u2019atomo solitario', 0.68, 'loyal-1'),
      it('item', 'Salto nel mondo', 0.86, 'reveal'),
      it('egg', 'Sogno di essere me', 0.14, 'egg'),
    ],
  },
  '13-outro': {
    mission: { text: 'Guarda in faccia chi ti ha accompagnato', target: 3 },
    items: [
      it('friend', 'Frate che sento', 0.30, 'loyal+1'),
      it('item', 'Latte della mamma', 0.50, 'firm'),
      it('enemy', 'Il compromesso', 0.68, 'loyal-1'),
      it('item', 'Verità sussurrata', 0.86, 'reveal'),
      it('egg', 'La vetta è di tutti', 0.15, 'egg'),
    ],
  },
};

export const VARIETY_IDS = Object.keys(VARIETY);

// clamp intero
function clampInt(v, lo, hi) { const n = Math.round(v); return n < lo ? lo : n > hi ? hi : n; }

// La fila di un item: frazione `at` dell\u2019altezza utile -> riga [1, nRows-2].
// Poi la colonna centrale di quella riga (centerCol): sempre raggiungibile.
export function createVariety(girone, climb) {
  const id = girone.audioId;
  const def = VARIETY[id] || { mission: { text: '', target: 2 }, items: [] };
  const nRows = climb.nRows;
  const items = def.items.map((src, i) => {
    const row = clampInt(1 + (nRows - 3) * src.at, 1, Math.max(1, nRows - 2));
    const c = centerCol(climb, row);
    return { id: `${id}-${i}`, kind: src.kind, name: src.name, effect: src.effect, at: src.at, row, c, collected: false };
  });
  return {
    id,
    mission: { text: def.mission.text, target: def.mission.target, current: 0, done: false },
    items,
  };
}

// Raccoglie gli item sulla fila corrente (stessa regola degli incontri: |dr| <= 1).
// Ritorna { collected:[{kind,name,effect}], missionDone } — missionDone true solo
// nel passo in cui la missione si completa.
export function stepVariety(variety, climb) {
  const curRow = Math.max(climb.lh.r, climb.rh.r);
  const collected = [];
  let missionDone = false;
  for (const item of variety.items) {
    if (item.collected) continue;
    if (Math.abs(item.row - curRow) > 1) continue;
    item.collected = true;
    collected.push({ kind: item.kind, name: item.name, effect: item.effect });
    if (!variety.mission.done) {
      variety.mission.current = Math.min(variety.mission.target, variety.mission.current + 1);
      if (variety.mission.current >= variety.mission.target) {
        variety.mission.done = true;
        missionDone = true;
      }
    }
  }
  return { collected, missionDone };
}
