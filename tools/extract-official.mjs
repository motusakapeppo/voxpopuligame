// Estrae TUTTE le righe ufficiali (in ordine) da "Testi Album" → tools/_official.json
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = 'D:/VOX POPULI - ALBUM/Testi Album';
const map = { '01':'01-intro','02':'02-vento','03':'03-tuoni','04':'04-baghdad','05':'05-hosonno',
  '06':'06-primoposto','07':'07-tictac','08':'08-tuttofinto','09':'09-edera','10':'10-scendi',
  '11':'11-lafinedelmondo','12':'12-maranatha','13':'13-outro' };
const files = readdirSync(dir);
const out = {};
for (const [num, id] of Object.entries(map)) {
  const f = files.find(n => n.startsWith(num + ' -'));
  const txt = f ? readFileSync(join(dir, f), 'utf8') : '';
  const lines = txt.split(/\r?\n/).map(s => s.trim())
    .filter(s => s.length > 6)
    .filter(s => !/^[\[(]/.test(s) && !/^(---|===)/.test(s))
    .filter(s => !/testo|ufficiale|nota|trascritta|strofe|feat\.|v\.\d|sirene|delta|indice|album|traccia/i.test(s))
    .filter(s => !/^[A-Z0-9 ()]+$/.test(s))
    .filter(s => /[a-z]/.test(s));
  out[id] = lines;
}
writeFileSync('tools/_official.json', JSON.stringify(out, null, 1));
console.log('ok', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
