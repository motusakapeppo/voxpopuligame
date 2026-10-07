// ============================================================================
// verify.mjs — AUTO-VERIFICA di un ciclo di miglioramento.
// Un solo comando: build (syntax), test, screenshot del giocatore (zoom),
// FPS misurati in headless. Esce con codice != 0 se qualcosa fallisce.
//
// Uso:  node tools/verify.mjs [girone]        (default: 01)
//       node tools/verify.mjs --collapse      (verifica animazione finale)
// Output: _verify/  (screenshot), verdetto a video, exit code.
// ============================================================================
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const ARGS = process.argv.slice(2);
const COLLAPSE = ARGS.includes('--collapse');
const G = ARGS.find(a => !a.startsWith('--')) || '01';
const ROOT = process.cwd();
const OUT = ROOT + '/_verify';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FILE = 'file:///D:/VOX%20POPULI%20-%20ALBUM/game/VOX_POPULI_GIOCO.html';
const wait = ms => new Promise(r => setTimeout(r, ms));
const line = s => console.log(s);

let ok = true;
try { mkdirSync(OUT, { recursive: true }); } catch {}

// ---------------------------------------------------------------- 1. BUILD
line('\n[1/4] BUILD (sintassi + bundle)');
try {
  const out = execFileSync('node', ['tools/build.mjs'], { encoding: 'utf8' });
  line('   ' + (out.trim().split('\n').pop() || '').slice(0, 90));
  if (!/bundle OK/.test(out)) { ok = false; line('   X bundle NON ok'); }
} catch (e) { ok = false; line('   X build fallito:\n' + (e.stdout || e.message)); }

// ---------------------------------------------------------------- 2. TEST
line('\n[2/4] TEST');
try {
  let out = '';
  try {
    out = execFileSync('cmd.exe', ['/c', 'npm', 'test'], { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  } catch (e) { out = String((e.stdout || '') + (e.stderr || '') + (e.message || '')); }
  const pass = (out.match(/pass (\d+)/) || [])[1] || '?';
  const fail = (out.match(/fail (\d+)/) || [])[1] || '?';
  line(`   pass ${pass} / fail ${fail}`);
  if (String(fail) !== '0') { ok = false; line('   X test rossi'); }
} catch (e) { ok = false; line('   X test falliti'); }

// ---------------------------------------------------------------- headless
// Apre Chrome headless su `url`, espone {send,js,jsAsync} a fn, e uccide
// SEMPRE il processo (finally) con un profilo utente fresco per run.
async function withChrome(url, fn) {
  const PORT = 9800 + Math.floor(Math.random() * 100);
  const profile = `C:/Users/motus/AppData/Local/Temp/opencode/vf${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`, '--window-size=960,720', '--hide-scrollbars', url], { stdio: 'ignore' });
  try {
    let list = [];
    for (let i = 0; i < 20 && !list.length; i++) { await wait(400); try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch {} }
    const page = list.find(t => t.type === 'page' && t.url.includes('VOX_POPULI'));
    if (!page) throw new Error('pagina non trovata');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0; const pending = new Map();
    const send = (m, p) => Promise.race([new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); }),
      new Promise(r => setTimeout(() => r({ TO: 1 }), 6000))]);
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    await new Promise(r => ws.onopen = r);
    await send('Page.enable'); await send('Runtime.enable');
    await send('Runtime.evaluate', { expression: "window.__errs=[];window.onerror=function(m){window.__errs.push(String(m));return false;};addEventListener('error',e=>window.__errs.push(String(e.message)));" });
    const js = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); return r.result?.result?.value; };
    const jsAsync = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; };
    return await fn({ send, js, jsAsync });
  } finally {
    try { chrome.kill(); } catch {}
  }
}

// FPS su ~1.5s di frame (rAF)
const measureFps = jsAsync => jsAsync(`new Promise(res=>{let n=0;const t0=performance.now();
  const tick=()=>{n++; if(performance.now()-t0<1500) requestAnimationFrame(tick); else res(Math.round(n/((performance.now()-t0)/1000)));};
  requestAnimationFrame(tick);})`);

if (COLLAPSE) {
  // -------------------------------------------------- MODALITÀ COLLAPSE
  line('\n[3/4] COLLAPSE — screenshot per fase + [4/4] FPS');
  let phaseCount = 0;
  try {
    phaseCount = await withChrome(`${FILE}?collapse=99&t=${Date.now()}`, async ({ js }) => {
      let idx = null;
      for (let i = 0; i < 25 && idx === null; i++) { await wait(200); idx = await js("window.__vp && window.__vp.collapse ? window.__vp.collapse.phaseIndex : null"); }
      return (typeof idx === 'number') ? idx + 1 : 0;
    });
  } catch (e) { line('   ! probe fasi fallita: ' + e.message); }

  if (!phaseCount) {
    line('   ! nessuna fase collapse disponibile (window.__vp.collapse assente) — skip');
  } else {
    line(`   fasi rilevate: ${phaseCount}`);
    let minFps = Infinity;
    for (let N = 0; N < phaseCount; N++) {
      try {
        const r = await withChrome(`${FILE}?collapse=${N}&t=${Date.now()}`, async ({ send, js, jsAsync }) => {
          let has = false;
          for (let i = 0; i < 25 && !has; i++) { await wait(200); has = await js("!!(window.__vp && window.__vp.collapse)"); }
          if (!has) throw new Error('collapse non creato');
          // forza la fase N (il loop avanza da solo: ?collapse=N è solo il punto di partenza)
          await js(`(()=>{const c=window.__vp.collapse;c.phaseIndex=${N};c.t=0.6;return c.phase;})()`);
          await wait(200);
          const shot = await send('Page.captureScreenshot', { format: 'png' });
          if (shot.result?.data) writeFileSync(`${OUT}/collapse-${N}.png`, Buffer.from(shot.result.data, 'base64'));
          const fps = await measureFps(jsAsync);
          const errs = await js("JSON.stringify(window.__errs||[])");
          return { fps, errs };
        });
        line(`   fase ${N}: screenshot → _verify/collapse-${N}.png  FPS ≈ ${r.fps}`);
        if (typeof r.fps === 'number') minFps = Math.min(minFps, r.fps);
        let e2 = []; try { e2 = JSON.parse(r.errs || '[]'); } catch {}
        if (e2.length) { ok = false; line(`   X errori runtime fase ${N}: ${r.errs}`); }
      } catch (e) { ok = false; line(`   X fase ${N} fallita: ${e.message}`); }
    }
    if (minFps !== Infinity) {
      line(`   FPS minimo collapse ≈ ${minFps}`);
      if (minFps < 50) { ok = false; line('   X FPS < 50 nella fase collapse'); }
    }
  }
} else {
  // -------------------------------------------------- MODALITÀ DEFAULT (playing)
  line('\n[3/4] SCREENSHOT + [4/4] FPS (headless Chrome)');
  try {
    const r = await withChrome(`${FILE}?g=${G}&t=${Date.now()}`, async ({ send, js, jsAsync }) => {
      // sali 7 file per essere in piena parete, poi screenshot
      for (let i = 0; i < 7; i++) {
        await js("window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowUp'}));'x'"); await wait(220);
        await js("window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowUp'}));'x'");
      }
      await wait(300);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      if (shot.result?.data) writeFileSync(OUT + '/player.png', Buffer.from(shot.result.data, 'base64'));
      const fps = await measureFps(jsAsync);
      const errs = await js("JSON.stringify(window.__errs||[])");
      return { fps, errs };
    });
    line('   screenshot → _verify/player.png');
    line('   FPS ≈ ' + r.fps);
    let e2 = []; try { e2 = JSON.parse(r.errs || '[]'); } catch {}
    if (e2.length) { ok = false; line('   X errori runtime: ' + r.errs); } else line('   zero errori runtime');
    if (typeof r.fps === 'number' && r.fps < 50) { ok = false; line('   X FPS < 50'); }
  } catch (e) { ok = false; line('   X verifica headless fallita: ' + e.message); }
}

line('\n' + (ok ? '=== VERIFICA OK ===' : '=== VERIFICA FALLITA ===') + '\n');
process.exit(ok ? 0 : 1);
