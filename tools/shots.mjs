// ============================================================================
// shots.mjs — screenshot reali del gioco via Chrome headless (CDP).
// Cattura le fasi chiave in docs/shots/ (usate anche dal README).
// Uso: node tools/shots.mjs [--g NN]
// ============================================================================
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = ROOT + 'docs/shots';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FILE = 'file:///D:/VOX%20POPULI%20-%20ALBUM/game/VOX_POPULI_GIOCO.html';
const wait = ms => new Promise(r => setTimeout(r, ms));
try { mkdirSync(OUT, { recursive: true }); } catch {}

const G = (process.argv.find(a => a === '--g') ? process.argv[process.argv.indexOf('--g') + 1] : '07');

async function withChrome(url, fn) {
  const PORT = 9900 + Math.floor(Math.random() * 90);
  const profile = `C:/Users/motus/AppData/Local/Temp/opencode/sh${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--window-size=960,540', url], { stdio: 'ignore' });
  try {
    let list = [];
    for (let i = 0; i < 25 && !list.length; i++) { await wait(400); try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch {} }
    const page = list.find(t => t.type === 'page' && t.url.includes('VOX_POPULI'));
    if (!page) throw new Error('pagina non trovata');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0; const pending = new Map();
    const send = (m, p) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    await new Promise(r => ws.onopen = r);
    await send('Page.enable'); await send('Runtime.enable');
    const js = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); return r.result?.result?.value; };
    const shot = async name => {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      if (s.result?.data) { writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.result.data, 'base64')); console.log('  ->', name + '.png'); }
    };
    await fn({ js, shot });
  } finally { try { chrome.kill(); } catch {} }
}

console.log('shots → docs/shots/');
// 1) TITLE (piramide) — nessun parametro
await withChrome(`${FILE}?t=${Date.now()}`, async ({ js, shot }) => {
  await wait(1500);
  await shot('01-title');
});
// 2) PLAYING con lirica (girone scelto), audio in play → la lirica avanza
await withChrome(`${FILE}?g=${G}&t=${Date.now()}`, async ({ js, shot }) => {
  await wait(3500);
  await shot('02-playing-lyrics');
  await wait(4000);
  await shot('02b-playing-lyrics-later');
});
// 3) MASH (barra della lotta + lirica, bande disgiunte)
await withChrome(`${FILE}?g=${G}&phase=mash&t=${Date.now()}`, async ({ js, shot }) => {
  await wait(2500);
  await shot('03-mash');
});
// 4) UNLOCKED (transizione + lirica visibile)
await withChrome(`${FILE}?g=${G}&phase=unlocked&t=${Date.now()}`, async ({ js, shot }) => {
  await wait(2500);
  await shot('04-unlocked');
});
console.log('done.');
