import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = 'D:/VOX POPULI - ALBUM';
const OUT = fileURLToPath(new URL('../assets/audio/', import.meta.url));
mkdirSync(OUT, { recursive: true });

// start = secondo di inizio, dur = durata in secondi. Ritoccare a orecchio.
const CLIPS = [
  ['01-intro','01 - INTRO DEMO.mp3',20,20],
  ['02-vento','02 - IL VENTO DAL SUD DEMO.mp3',95,20],
  ['03-tuoni','03 - COME I TUONI DEMO.mp3',105,22],
  ['04-baghdad','04 - BAGHDAD DEMO.mp3',30,20],
  ['05-hosonno','05 - HO SONNO feat. Sirene DEMO v2.mp3',75,20],
  ['06-primoposto','06 - PRIMO POSTO DEMO v2.mp3',95,20],
  ['07-tictac','07 - TIC-TAC DEMO.mp3',75,20],
  ['08-tuttofinto','08 - TUTTO FINTO feat. Delta DEMO.mp3',45,20],
  ['09-edera','09 - EDERA DEMO v2.mp3',120,22],
  ['10-scendi','10 - SCENDI DEMO.mp3',60,20],
  ['11-lafinedelmondo','11 - LA FINE DEL MONDO DEMO.mp3',60,22],
  ['12-maranatha','12 - MARANATHA DEMO.mp3',90,22],
  ['13-outro','13 - OUTRO DEMO v2.mp3',40,20],
];

let ok = 0;
for (const [id, file, start, dur] of CLIPS) {
  const src = join(SRC, file);
  const dst = join(OUT, id + '.m4a');
  if (!existsSync(src)) { console.warn('MANCA sorgente:', file); continue; }
  process.stdout.write('slice ' + id + ' ... ');
  try {
    execFileSync('ffmpeg', [
      '-y', '-ss', String(start), '-t', String(dur), '-i', src,
      '-vn', '-map', '0:a:0',
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-c:a', 'aac', '-b:a', '96k', dst,
    ], { stdio: 'ignore' });
    console.log('ok');
    ok++;
  } catch (e) { console.log('ERRORE'); }
}
console.log(`\n${ok}/${CLIPS.length} clip → ${OUT}`);
