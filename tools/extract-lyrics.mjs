import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = 'D:/VOX POPULI - ALBUM/Testi Album';
const map = { '01':'01-intro','02':'02-vento','03':'03-tuoni','04':'04-baghdad','05':'05-hosonno',
  '06':'06-primoposto','07':'07-tictac','08':'08-tuttofinto','09':'09-edera','10':'10-scendi',
  '11':'11-lafinedelmondo','12':'12-maranatha','13':'13-outro' };
const out = {};
const files = readdirSync(dir);
for (const [num, id] of Object.entries(map)) {
  const f = files.find(n => n.startsWith(num + ' -'));
  const txt = f ? readFileSync(join(dir, f), 'utf8') : '';
  const lines = txt.split(/\r?\n/).map(s => s.trim())
    .filter(s => s.length > 14 && s.length < 60)
    .filter(s => !/^[\[(]/.test(s) && !/^(---|===)/.test(s))
    .filter(s => !/testo|ufficiale|nota|trascritta|strofe|feat\.|v\.\d|sirene|delta/i.test(s))
    .filter(s => !/^[A-Z0-9 ()]+$/.test(s))
    .filter(s => /[a-z]/.test(s));
  const seen = new Set(); const uniq = [];
  for (const l of lines) { if (!seen.has(l)) { seen.add(l); uniq.push(l); } if (uniq.length >= 7) break; }
  out[id] = uniq;
}
const header = '// Versi estratti dai testi ufficiali del album. Testo animato sullo sfondo.\n';
writeFileSync('src/lyrics.js', header + 'export const LYRICS = ' + JSON.stringify(out, null, 2) + ';\n');
console.log('ok, tracce:', Object.keys(out).length);
for (const [k, v] of Object.entries(out)) console.log(k, '|', (v[0] || '').slice(0, 55));
