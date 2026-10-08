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

// mission.kind: 'collect' | 'survive' | 'help' | 'descend' | 'resist'
// Ogni brano ha un OBIETTIVO diverso: testo distinto + kind che ne dice il sapore.
export const VARIETY = {
  '01-intro': {
    mission: { kind: 'resist', text: 'Resta sveglio finché non sorge il sole', target: 3 },
    items: [
      it('friend', 'Vicino di letto', 0.30, 'loyal+1'),
      it('item', 'Letto sfatto', 0.44, 'boost'),
      it('item', 'Pezzetto di me', 0.58, 'firm'),
      it('enemy', 'La notte scura', 0.70, 'loyal-1'),
      it('item', 'Coperte per terra', 0.80, 'boost'),
      it('item', 'Raggio rosso', 0.88, 'reveal'),
      it('egg', 'Via Lattea sul soffitto', 0.14, 'egg'),
    ],
  },
  '02-vento': {
    mission: { kind: 'resist', text: 'Tieni la rotta mentre il vento ti spinge indietro', target: 3 },
    items: [
      it('friend', 'Compagno di viaggio', 0.28, 'loyal+1'),
      it('item', 'Bussola storta', 0.42, 'firm'),
      it('item', 'Vela strappata', 0.55, 'boost'),
      it('enemy', 'Raffica del sud', 0.68, 'loyal-1'),
      it('item', 'Brivido improvviso', 0.80, 'reveal'),
      it('egg', 'Microfono rotto', 0.14, 'egg'),
    ],
  },
  '03-tuoni': {
    mission: { kind: 'survive', text: 'Sopravvivi al tuono che ti cade addosso', target: 3 },
    items: [
      it('friend', 'La mamma', 0.26, 'loyal+1'),
      it('item', 'Collana di pianeti', 0.40, 'reveal'),
      it('item', 'Chiavi di casa', 0.54, 'firm'),
      it('item', 'Sole dei tuoi occhi', 0.66, 'boost'),
      it('enemy', 'Il tuono', 0.78, 'loyal-1'),
      it('item', 'Racconto di casa', 0.88, 'reveal'),
      it('egg', 'Fiamma rossa', 0.13, 'egg'),
    ],
  },
  '04-baghdad': {
    mission: { kind: 'resist', text: 'Resisti ai mostri che ti crescono dentro', target: 4 },
    items: [
      it('friend', 'Il vicino che tace', 0.26, 'loyal+1'),
      it('item', 'Cenere sul davanzale', 0.34, 'reveal'),
      it('item', 'Foglio nella stanza', 0.40, 'reveal'),
      it('item', 'Scudo di cranio', 0.54, 'firm'),
      it('enemy', 'Effetto domino', 0.66, 'loyal-1'),
      it('item', 'Piedi nudi sul gelo', 0.78, 'boost'),
      it('item', 'Lampada di sera', 0.88, 'firm'),
      it('egg', 'Voci dentro ai muri', 0.12, 'egg'),
    ],
  },
  '05-hosonno': {
    mission: { kind: 'survive', text: 'Sopravvivi al sonno fino all\u2019alba', target: 4 },
    items: [
      it('friend', 'Morfeo', 0.28, 'loyal+1'),
      it('item', 'Caffè caldo', 0.42, 'boost'),
      it('item', 'Latte fresco', 0.55, 'firm'),
      it('enemy', 'La Sirena', 0.68, 'loyal-1'),
      it('item', 'Pozzo della moneta', 0.80, 'reveal'),
      it('egg', 'Cielo dentro il mare', 0.14, 'egg'),
    ],
  },
  '06-primoposto': {
    mission: { kind: 'resist', text: 'Resisti alla voglia di scavalcare gli altri', target: 3 },
    items: [
      it('friend', 'Il rivale onesto', 0.28, 'loyal+1'),
      it('item', 'Sorriso e lacrima', 0.44, 'firm'),
      it('item', 'Biglietto per il mare', 0.58, 'reveal'),
      it('item', 'Lacrima al sorriso', 0.70, 'boost'),
      it('enemy', 'Chi ti scavalca', 0.80, 'loyal-1'),
      it('item', 'Musica che illude', 0.90, 'reveal'),
      it('egg', 'Un altro te', 0.15, 'egg'),
    ],
  },
  '07-tictac': {
    mission: { kind: 'survive', text: 'Sopravvivi al tempo che ti scade tra le mani', target: 4 },
    items: [
      it('friend', 'Il vecchio dell\u2019orologio', 0.26, 'loyal+1'),
      it('item', 'Sabbia nella clessidra', 0.34, 'boost'),
      it('item', 'Chicco di personalità', 0.40, 'boost'),
      it('item', 'Affitto pagato', 0.54, 'firm'),
      it('enemy', 'La lancetta', 0.66, 'loyal-1'),
      it('item', 'Ora che non ho', 0.78, 'reveal'),
      it('item', 'Bravo anche solo una volta', 0.90, 'firm'),
      it('egg', 'Specchio rotto (DICA!)', 0.12, 'egg'),
    ],
  },
  '08-tuttofinto': {
    mission: { kind: 'collect', text: 'Raccogli le prove di ciò che è vero', target: 3 },
    items: [
      it('friend', 'Il violinista', 0.28, 'loyal+1'),
      it('item', 'Sipario rosso', 0.42, 'reveal'),
      it('item', 'Applauso finto', 0.55, 'firm'),
      it('enemy', 'La maschera', 0.68, 'loyal-1'),
      it('item', 'Sipario che si alza', 0.80, 'boost'),
      it('egg', 'Passamontagna', 0.13, 'egg'),
    ],
  },
  '09-edera': {
    mission: { kind: 'descend', text: 'Scendi e strappa l\u2019edera che ti trattiene', target: 4 },
    items: [
      it('friend', 'Anima di sotto', 0.28, 'loyal+1'),
      it('item', 'Ramo reciso', 0.42, 'firm'),
      it('item', 'Eccomi', 0.55, 'reveal'),
      it('enemy', 'Il tuo doppio', 0.68, 'loyal-1'),
      it('item', 'Voce che non tace', 0.80, 'boost'),
      it('item', 'Ripartire da zero', 0.90, 'reveal'),
      it('egg', 'Reset dell\u2019algoritmo', 0.14, 'egg'),
    ],
  },
  '10-scendi': {
    mission: { kind: 'help', text: 'Aiuta il popolo a scendere in piazza', target: 3 },
    items: [
      it('friend', 'Il popolo', 0.26, 'loyal+1'),
      it('item', 'Bandiera strappata', 0.34, 'firm'),
      it('item', 'Pugno al cielo', 0.40, 'firm'),
      it('item', 'Voce che canta', 0.54, 'boost'),
      it('enemy', 'Le truppe', 0.66, 'loyal-1'),
      it('item', 'Folla in strada', 0.78, 'reveal'),
      it('item', 'Slogan sui muri', 0.90, 'boost'),
      it('egg', 'Dita puntate al cielo', 0.12, 'egg'),
    ],
  },
  '11-lafinedelmondo': {
    mission: { kind: 'survive', text: 'Sopravvivi all\u2019acqua che sale e al cielo che cade', target: 4 },
    items: [
      it('friend', 'Chi conosce il segreto', 0.26, 'loyal+1'),
      it('item', 'Fiore che appassisce', 0.40, 'reveal'),
      it('item', 'Cresta dell\u2019acqua', 0.54, 'firm'),
      it('enemy', 'Il lenzuolo nero', 0.66, 'loyal-1'),
      it('item', 'Buco nella nuvola', 0.78, 'boost'),
      it('egg', 'Ultimo giorno di sole', 0.12, 'egg'),
    ],
  },
  '12-maranatha': {
    mission: { kind: 'help', text: 'Unisci le mani al coro e reggi il mondo', target: 3 },
    items: [
      it('friend', 'Il coro', 0.28, 'loyal+1'),
      it('item', 'Palmo che racchiude', 0.42, 'firm'),
      it('item', 'Salto nel mondo', 0.55, 'reveal'),
      it('enemy', 'L\u2019atomo solitario', 0.68, 'loyal-1'),
      it('item', 'Il mondo in mano', 0.80, 'boost'),
      it('item', 'Salto che racchiude', 0.90, 'reveal'),
      it('egg', 'Sogno di essere me', 0.14, 'egg'),
    ],
  },
  '13-outro': {
    mission: { kind: 'help', text: 'Accompagna a riva chi ti ha accompagnato', target: 3 },
    items: [
      it('friend', 'Frate che sento', 0.28, 'loyal+1'),
      it('item', 'Bottiglia al tramonto', 0.34, 'reveal'),
      it('item', 'Latte della mamma', 0.42, 'firm'),
      it('item', 'Dosi di libertà', 0.55, 'boost'),
      it('enemy', 'Il compromesso', 0.68, 'loyal-1'),
      it('item', 'Verità sussurrata', 0.80, 'reveal'),
      it('item', 'Lealtà che resta', 0.90, 'firm'),
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
  const def = VARIETY[id] || { mission: { kind: 'collect', text: '', target: 2 }, items: [] };
  const nRows = climb.nRows;
  const items = def.items.map((src, i) => {
    const row = clampInt(1 + (nRows - 3) * src.at, 1, Math.max(1, nRows - 2));
    const c = centerCol(climb, row);
    return { id: `${id}-${i}`, kind: src.kind, name: src.name, effect: src.effect, at: src.at, row, c, collected: false };
  });
  return {
    id,
    mission: { kind: def.mission.kind, text: def.mission.text, target: def.mission.target, current: 0, done: false },
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
