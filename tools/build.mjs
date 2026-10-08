import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const GAME = fileURLToPath(new URL('..', import.meta.url));

function stripModuleSyntax(src) {
  return src
    // import multilinea e monoriga:  import { a, b } from './x.js';
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?/gm, '')
    // import con effetti collaterali:  import './x.js';
    .replace(/^\s*import\s+['"][^'"]+['"];?/gm, '')
    // export davanti a dichiarazioni
    .replace(/^\s*export\s+(const|function|let|var|class)\b/gm, '$1')
    // export di default / re-export residui
    .replace(/^\s*export\s*\{[^}]*\};?/gm, '')
    .replace(/^\s*export\s+default\s+/gm, 'return ');
}

// Puro e testabile: dato un set di sorgenti e un ordine, produce un bundle IIFE.
export function bundleModules(sources, order) {
  const parts = [];
  for (const file of order) {
    const src = sources[file];
    if (src == null) continue;
    parts.push(`// --- ${file} ---\n${stripModuleSyntax(src)}`);
  }
  return '(function(){\n"use strict";\nvar AUDIO_DATA = (typeof AUDIO_DATA!=="undefined")?AUDIO_DATA:window.__AUDIO__||{};\n'
    + parts.join('\n\n') + '\n})();';
}

export const ORDER = [
  'palette.js','timestep.js','input.js','physics.js','gironi.js','climb.js','mash.js','juice.js','karaoke.js','modifiers.js','threats.js','lyrics.js',
  'encounters.js','effects.js','fx.js','themes.js','ragdoll.js','renderer.js','transition.js','audio.js','collapse.js',
  'cta.js','figure.js','grip.js','omini.js','hazard.js','art.js','state.js','variety.js','main.js',
];

function build() {
  const srcDir = join(GAME, 'src');
  const sources = {};
  for (const f of ORDER) sources[f] = readFileSync(join(srcDir, f), 'utf8');

  const audioDir = join(GAME, 'assets', 'audio');
  let audioEntries = [];
  try {
    for (const f of readdirSync(audioDir)) {
      if (!f.endsWith('.m4a')) continue;
      const b64 = readFileSync(join(audioDir, f)).toString('base64');
      audioEntries.push(`  ${JSON.stringify(basename(f, '.m4a'))}: "data:audio/mp4;base64,${b64}"`);
    }
  } catch { /* nessun audio: build senza tracce */ }
  const audioBlock = 'window.__AUDIO__ = {\n' + audioEntries.join(',\n') + '\n};\n';

  const bundle = audioBlock + bundleModules(sources, ORDER);

  // verifica di sintassi OBBLIGATORIA: una collisione di nomi tra moduli
  // (es. VIEW_H in due file) romperebbe il gioco silenziosamente.
  const check = spawnSync(process.execPath, ['--check', '-'], { input: bundle, encoding: 'utf8' });
  if (check.status !== 0) {
    console.error('\n❌ BUNDLE NON VALIDO — collisione di nomi tra moduli?');
    console.error(check.stderr);
    process.exit(1);
  }

  const html = readFileSync(join(GAME, 'index.html'), 'utf8')
    .replace('<script type="module" src="src/main.js"></script>', `<script>\n${bundle}\n</script>`);

  const out = join(GAME, 'VOX_POPULI_GIOCO.html');
  writeFileSync(out, html);
  console.log('built →', out, `(${(html.length / 1024 / 1024).toFixed(2)} MB, ${audioEntries.length} tracce) — bundle OK`);
}

if (process.argv[1] && process.argv[1].endsWith('build.mjs')) build();
