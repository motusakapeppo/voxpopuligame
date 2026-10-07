import { C } from './palette.js';
import { createInput } from './input.js';
import { GIRONI } from './gironi.js';
import { createModState, applyModifier } from './modifiers.js';
import { createState, advance } from './state.js';
import { createTransition, stepTransition, drawTransition } from './transition.js';
import { createEffects, spawnFromEvents, stepEffects, shakeOffset } from './effects.js';
import { createAudio } from './audio.js';
import { createCollapse, stepCollapse, drawCollapse, collapseFinished } from './collapse.js';
import { drawCta, ctaButtonRect, CTA_URL } from './cta.js';
import { drawWall, drawPlayer, drawEncounter, drawInscription, drawTitle, drawLyrics, drawPickup, drawThreatMsg, drawMash, drawKaraoke, drawChapterCard, drawFlow, drawSkyline, drawUIOverlay, drawTitleText, drawLyricsPixel, drawLyricsOverlay } from './art.js';
import { KINDS, GIRONE_ENCOUNTERS, resolveEncounter, isAutoKind } from './encounters.js';
import { createClimb, stepClimb, climbPos, climbProgress, encounterAt, centerCol, moveHands } from './climb.js';
import { createThreatState, stepThreats, pickupPositions, applyPickup, threatEffects } from './threats.js';
import { createMash, startMash, mashHit, stepMash, mashRatio, mashDone } from './mash.js';
import { createJuice, impact, addFlow, breakFlow, setBpm, stepJuice, shakeOffsetJ, punchZoom, flowRatio, bpmFor } from './juice.js';
import { KARAOKE } from './karaoke.js';
import { createRenderer } from './renderer.js';
import { createStepper } from './timestep.js';
import { drawThemeBack, drawThemeFront } from './themes.js';
import { createFx, emitFx, stepFx, drawFx } from './fx.js';

const canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');   // riassegnato al contesto offscreen del renderer
const VIEW_W = 320, VIEW_H = 180;
let SCALE = 3;

function resize() {
  const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  SCALE = Math.max(1, Math.floor(s));
  canvas.width = VIEW_W * SCALE; canvas.height = VIEW_H * SCALE;
  canvas.style.width = (VIEW_W * SCALE) + 'px'; canvas.style.height = (VIEW_H * SCALE) + 'px';
  ctx.imageSmoothingEnabled = false;
  if (renderer) renderer.resize();
}
window.addEventListener('resize', resize);

// Pipeline di post-processing: bloom, scanline, grana, aberrazione, glitch.
// Tutto il disegno avviene sul contesto OFFSCREEN `scene` del renderer (320×180);
// il renderer compone, applica gli effetti e scala sul canvas visibile.
const renderer = createRenderer(canvas, VIEW_W, VIEW_H);
ctx = renderer.scene.getContext('2d');
ctx.imageSmoothingEnabled = false;
resize();

const input = createInput();
input.attach(window);
input.attachTouch(document);

const loadClip = id =>
  (typeof AUDIO_DATA !== 'undefined' && AUDIO_DATA[id])
    ? Promise.resolve(AUDIO_DATA[id])
    : Promise.resolve(`assets/audio/${id}.m4a`);
const storage = (typeof localStorage !== 'undefined') ? localStorage : { getItem: () => null, setItem: () => {} };
const audio = createAudio({ storage, loadClip });

let state = createState();
let level = null;
let collapse = null;
let cameraY = 0;
let time = 0;
let loyalty = 0;
let action = 'idle';
let actionT = 0;
let mash = createMash();
let juice = createJuice();
// stepper fisso 1/120 per il crollo ragdoll (stabilità + determinismo indipendente dal refresh)
const collapseStepper = createStepper({ step: 1 / 120, maxFrame: 0.05, maxSteps: 6 });

const trackLabel = document.getElementById('track-label');
const btnAudio = document.getElementById('btn-audio');
const btnTracklist = document.getElementById('btn-tracklist');
const tracklist = document.getElementById('tracklist');
const btnCta = document.getElementById('btn-cta');
const btnTendi = document.getElementById('btn-tendi');
const btnSpingi = document.getElementById('btn-spingi');
const promptEl = document.getElementById('prompt');

// incontri piazzati su file della parete. Attivazione per FILA: il tipo dipende
// da CHI incontri, e il posto è sempre sulla colonna centrale (dove passa il corpo).
function makeEncounters(g, climb) {
  const kinds = GIRONE_ENCOUNTERS[g.id] || ['hand'];
  const out = [];
  const n = kinds.length;
  for (let i = 0; i < n; i++) {
    // distribuiti dal basso verso l'alto, mai sulla fila 0 (partenza) né sull'ultima
    const row = Math.max(2, Math.min(climb.nRows - 2,
      Math.round((climb.nRows - 1) * ((i + 1) / (n + 1))) + 1));
    const c = centerCol(climb, row);
    out.push({ id: 'enc' + i, kind: kinds[i], row, c,
      x: climb.xOf(c), y: climb.yOf(row) + 4, w: 8, h: 12,
      resolved: false, verb: null });
  }
  return out;
}

function loadGirone(index) {
  const g = GIRONI[index];
  const modStates = g.modifiers.map(m => createModState(m));
  if (trackLabel) trackLabel.textContent = g.title;
  const bodies = g.bodies.map(b => ({ ...b, stress: 0, state: 'stable' }));
  const climb = createClimb(g);
  // potenziamenti/aiuti da raccogliere: sulla colonna centrale, così il corpo
  // del giocatore ci passa sopra salendo (raccolta per fila, impossibile mancarli)
  const pickups = pickupPositions(g).map((p, i) => {
    const r = Math.max(2, Math.round((climb.nRows - 3) * p.at) + 1);
    return { kind: p.kind, taken: false, phase: i, r, c: centerCol(climb, r) };
  });
  audio.play(g.audioId);   // la traccia del girone suona mentre lo giochi
  setBpm(juice, bpmFor(g.audioId));
  return {
    girone: g, modStates, climb,
    bodies,
    encounters: makeEncounters(g, climb),
    pickups,
    threats: createThreatState(),
    pfx: createFx((index + 1) * 7919),   // particelle cinematografiche (deterministiche)
    events: [], fx: createEffects(), transition: null, active: null, threatMsg: '',
    chapter: 1.4,                        // chapter card del brano
  };
}

// --- tracklist ---
function refreshTracklist() {
  if (!tracklist) return;
  tracklist.innerHTML = GIRONI.map(g =>
    `<button data-id="${g.audioId}" ${audio.isUnlocked(g.audioId) ? '' : 'disabled'}>${g.id} ${g.title}</button>`
  ).join('');
}
if (btnTracklist && tracklist) {
  btnTracklist.addEventListener('click', () => { tracklist.classList.toggle('open'); refreshTracklist(); });
  tracklist.addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (b && !b.disabled) audio.play(b.dataset.id);
  });
}
if (btnAudio) btnAudio.addEventListener('click', () => {
  const on = audio.toggle(); btnAudio.textContent = 'audio: ' + (on ? 'on' : 'off');
});

// sblocca l'audio (iOS) al PRIMO gesto utente, una sola volta. Guida §9.
(function primeAudio() {
  const once = () => { audio.unlock(); window.removeEventListener('pointerdown', once); window.removeEventListener('keydown', once); window.removeEventListener('touchstart', once); };
  window.addEventListener('pointerdown', once, { passive: true });
  window.addEventListener('keydown', once);
  window.addEventListener('touchstart', once, { passive: true });
})();

function goToCta() {
  // su file:// aprendo una nuova scheda Chrome blocca l'accesso: usiamo
  // location.href solo per URL reali; col placeholder non navighiamo affatto.
  if (!CTA_URL || CTA_URL === '#') {
    setPrompt('URL di pre-save non ancora impostato');
    return;
  }
  try { window.open(CTA_URL, '_blank', 'noopener'); }
  catch { location.href = CTA_URL; }
}

canvas.addEventListener('pointerdown', e => {
  if (state.phase !== 'cta') return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * VIEW_W;
  const y = (e.clientY - rect.top) / rect.height * VIEW_H;
  const r = ctaButtonRect(VIEW_W, VIEW_H);
  if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) goToCta();
});

function showCtaButton(show) {
  if (!btnCta) return;
  btnCta.classList.toggle('show', show);
}
function setPrompt(txt) {
  if (!promptEl) return;
  if (txt) { promptEl.textContent = txt; promptEl.classList.add('show'); }
  else promptEl.classList.remove('show');
}
function doVerb(verb) {
  if (state.phase !== 'playing' || !level || !level.active) return;
  const kind = level.active.kind;
  if (isAutoKind(kind)) return;   // helper/grabber non si scelgono con Z/X
  const eff = resolveEncounter(level.active, verb);
  const cl = level.climb;
  level.active.reactT = 0.8;                    // animazione di reazione del PNG
  level.active.reactVerb = verb;
  // l'esito sposta la scalata su/giù
  if (eff.dy) moveHands(cl, Math.round(-eff.dy / 24));
  loyalty += eff.loyal;
  action = verb === 'tendi' ? 'tendi' : 'spingi';
  actionT = verb === 'tendi' ? 0.72 : 0.62;
}

// Martella durante il minigioco di lotta.
function mashPress() {
  if (mash.active) { mashHit(mash); action = 'spingi'; actionT = 0.2; }
}
if (btnTendi) btnTendi.addEventListener('pointerdown', ev => { ev.preventDefault(); mash.active ? mashPress() : doVerb('tendi'); });
if (btnSpingi) btnSpingi.addEventListener('pointerdown', ev => { ev.preventDefault(); mash.active ? mashPress() : doVerb('spingi'); });
if (btnCta) btnCta.addEventListener('pointerdown', ev => { ev.preventDefault(); goToCta(); });
window.addEventListener('keydown', ev => {
  if (ev.code === 'KeyZ' || ev.code === 'KeyX' || ev.code === 'Space' || ev.code === 'ArrowUp') {
    if (mash.active) { mashPress(); }
    else if (ev.code === 'KeyZ') doVerb('tendi');
    else if (ev.code === 'KeyX') doVerb('spingi');
  }
});

const SKIP = new Set((new URLSearchParams(location.search).get('no') || '').split(',').filter(Boolean));

// Prompt in basso: cambia in base a chi incontri e al tipo di interazione.
function updatePrompt() {
  const a = level && level.active;
  if (!a) { setPrompt(''); return; }
  const d = KINDS[a.kind];
  if (a.kind === 'helper') setPrompt('◀ ' + d.prompt + ' ▶');
  else if (a.kind === 'grabber') setPrompt('◀ ' + d.prompt + ' ▶   [MARTELLA Z/X]');
  else setPrompt('◀ ' + d.prompt + ' ▶   [Z] tendi   [X] spingi');
}

function drawWorld(lv, camY) {
  if (!SKIP.has('theme')) drawThemeBack(ctx, lv.girone.audioId, camY, time, VIEW_W, VIEW_H, lv.pfx);
  if (!SKIP.has('sky')) drawSkyline(ctx, lv.girone.audioId, camY, time, VIEW_W, VIEW_H, juice.beat);
  // lirica estetica in PIXEL ART (coerente col mondo)
  const kl = KARAOKE[lv.girone.audioId];
  if (kl && !SKIP.has('lyrics')) drawLyricsPixel(ctx, kl, audio.position(), time, VIEW_W, VIEW_H);
  if (!SKIP.has('wall')) drawWall(ctx, lv.girone, lv.climb, camY, time, VIEW_W, VIEW_H, juice.beat);
  if (!SKIP.has('enc')) for (const e of lv.encounters) drawEncounter(ctx, e, lv.climb, camY, time, e === lv.active);
  if (!SKIP.has('pick')) for (const pk of lv.pickups) drawPickup(ctx, pk, lv.climb, camY, time);
  if (!SKIP.has('player')) drawPlayer(ctx, lv.climb, camY, time, action);
  if (!SKIP.has('fx')) drawFx(ctx, lv.pfx, camY, time);
  if (!SKIP.has('themefront')) drawThemeFront(ctx, lv.girone.audioId, camY, time, VIEW_W, VIEW_H, lv.pfx);
  // T9: acqua che sale (girone 11) — copre la scena sotto il livello raggiunto.
  const wl = lv.fxState && lv.fxState.water;
  if (wl && wl > 0) {
    const cl = lv.climb;
    const wr = Math.min(cl.nRows - 1, Math.round(wl));
    const wy = Math.round(cl.yOf(wr) - camY);
    if (wy < VIEW_H) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = C.redDeep;           // acqua: rosso profondo
      ctx.fillRect(0, Math.max(0, wy), VIEW_W, VIEW_H - Math.max(0, wy));
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = C.redHot;            // cresta dell'acqua
      ctx.fillRect(0, Math.max(0, wy), VIEW_W, 1);
      ctx.restore();
    }
  }
}

// Overlay UI a RISOLUZIONE PIENA (testo nitido) — sopra la scena pixel art.
const uctx = canvas.getContext('2d');
function drawOverlay() {
  const pos = audio.position();
  // liriche NITIDE a risoluzione piena: solo dove hanno senso (playing/unlocked),
  // mai sopra title/cta/collapse. La scena pixel resta come sfondo tenue.
  if (level && (state.phase === 'playing' || state.phase === 'unlocked')) {
    const kl = KARAOKE[level.girone.audioId];
    if (kl && !SKIP.has('lyrics')) drawLyricsOverlay(uctx, SCALE, kl, pos, VIEW_W, VIEW_H, time);
  }
  drawUIOverlay(uctx, SCALE, VIEW_W, VIEW_H, {
    inscription: level ? level.girone.inscription.text : '',
    threatMsg: level ? level.threatMsg : '',
    chapterT: level ? level.chapter : 0,
    chapterTitle: level ? level.girone.title : '',
    prompt: promptEl ? promptEl.textContent : '',
    promptK: promptEl && promptEl.classList.contains('show') ? 1 : 0,
    flow: flowRatio(juice),
    beat: juice.beat,
    mash,
    pos,
    time,
  });
}

// Post-processing con JUICE: battito a tempo, flow, flash/shake, vignettatura.
function playingPost(dt, glitch) {
  const post = renderer.post;
  const beat = juice.beat;
  const flow = flowRatio(juice);
  const pulse = 1 + beat * (0.10 + flow * 0.35);   // la scena "respira" a tempo
  post.bloom = 0.30 * pulse + flow * 0.1;
  post.bloomThreshold = 0.6 - beat * 0.08 - flow * 0.1;
  post.chroma = 0.2 + beat * 0.12 + flow * 0.15;
  post.scan = 0.14 + beat * 0.05;
  post.grain = 0.06 + flow * 0.05;
  post.vignette = 0.40 - beat * 0.06;
  post.flash = juflash();
  post.glitch = Math.max(glitch || 0, juice.shake > 3 ? 0.5 : 0) * 0.9;
  // T9: gli effetti dei pericoli modulano il post (varietà visiva per girone).
  const st9 = level && level.fxState;
  if (st9) {
    post.glitch = Math.max(post.glitch, st9.glitch);       // appiglio finto / illusione
    post.vignette = Math.min(0.7, post.vignette + st9.dim * 0.5);  // sonno: scurisce
    post.chroma = Math.min(0.8, post.chroma + st9.dim * 0.3);       // dormiente: sbava
    if (st9.stun > 0.01) post.glitch = Math.max(post.glitch, 0.5);  // terremoto: strappa
  }
  return post;
}
function juflash() { return Math.max(0, juice.flash); }

// Parametri di post-processing per fase. Imposta la base e fa decadere
// glitch/flash del frame precedente; gli eventi del frame poi li rinforzano.
function applyPost(kind) {
  const post = renderer.post;
  post.bloom = 0.22; post.bloomThreshold = 0.66; post.chroma = 0.22;
  post.scan = 0.16; post.grain = 0.07; post.vignette = 0.42;
  if (kind === 'title') { post.bloom = 0.28; post.vignette = 0.5; }
  post.glitch *= 0.55;
  post.flash *= 0.55;
  if (post.glitch < 0.01) post.glitch = 0;
  if (post.flash < 0.01) post.flash = 0;
  return post;
}

function loop(now) {
  requestAnimationFrame(loop);
  // FIX frame-rate: dt REALE misurato dal timestamp rAF (clampato), non più
  // 0.016 fisso. Così la simulazione non accelera a 120/144Hz.
  const prev = loop._last || now || 0;
  const rawDt = now ? (now - prev) / 1000 : 1 / 60;
  loop._last = now || 0;
  const dt = Math.max(0, Math.min(0.05, rawDt));
  stepJuice(juice, dt);
  const sdt = juice.hitstop > 0 ? 0 : dt;   // hit-stop: congela la simulazione
  time += dt;
  if (actionT > 0) { actionT -= dt; if (actionT <= 0) action = 'idle'; }

  if (state.phase === 'title') {
    showCtaButton(false); setPrompt('');
    renderer.render(() => drawTitle(ctx, VIEW_W, VIEW_H, time), { post: applyPost('title') });
    // testo del titolo nitido (full-res), sopra la scena
    uctx.setTransform(1, 0, 0, 1, 0, 0);
    drawTitleText(uctx, VIEW_W, VIEW_H, time, SCALE);
    if (input.consumeJump()) { state = advance(state, 'start'); level = loadGirone(state.gironeIndex); }
    return;
  }
  if (state.phase === 'cta') {
    showCtaButton(true); setPrompt('');
    if (!collapse) collapse = createCollapse({ bodies: level ? level.bodies : [], viewW: VIEW_W, viewH: VIEW_H, supported: Math.max(0, loyalty + 4) });
    renderer.render(() => { drawCollapse(ctx, collapse, time); drawCta(ctx, VIEW_W, VIEW_H, time); }, { post: applyPost('cta') }); drawOverlay();
    return;
  }
  if (state.phase === 'collapse') {
    showCtaButton(false); setPrompt('');
    if (!collapse) {
      collapse = createCollapse({ bodies: level ? level.bodies : [], viewW: VIEW_W, viewH: VIEW_H,
        supported: Math.max(0, loyalty + 4) });
      const jp = new URLSearchParams(location.search).get('collapse');
      if (jp && +jp >= 0) { collapse.phaseIndex = Math.min(4, +jp); collapse.t = 0;
        collapse.phase = ['zoomOut','revealBodies','crack','collapse','settle'][collapse.phaseIndex]; }
      audio.stop();
    }
    // crollo a SUBSTEP FISSI: la fisica ragdoll è stabile solo a passo fisso.
    const cr = collapseStepper.step(dt);
    for (let i = 0; i < cr.steps; i++) stepCollapse(collapse, cr.dt);
    renderer.render(() => drawCollapse(ctx, collapse, time), { post: applyPost('collapse') });
    if (collapseFinished(collapse)) state = advance(state, 'collapseDone');
    return;
  }

  const cl = level.climb, g = level.girone;

  if (state.phase === 'unlocked') {
    setPrompt('');
    if (!level.transition) {
      level.transition = createTransition(state.gironeIndex, state.gironeIndex + 1);
      audio.markUnlocked(g.audioId);   // completato: riascoltabile in tracklist
      audio.stop();
    }
    stepTransition(level.transition, dt);
    stepFx(level.pfx, dt, cameraY, { H: VIEW_H });
    // burst di glitch + flash rosso all'inizio della transizione, poi si spegne
    const k = Math.min(1, level.transition.t / 1.2);
    const burst = (1 - k) * (1 - k);
    const tpost = Object.assign(applyPost('unlocked'), { glitch: 1.1 * burst, flash: 0.7 * burst, chroma: 0.9 * burst });
    renderer.render(() => { drawWorld(level, cameraY); drawTransition(ctx, level.transition, VIEW_W, VIEW_H); }, { post: tpost });
    drawOverlay();   // liriche nitide anche durante la transizione di sblocco
    if (level.transition.done) {
      state = advance(state, 'audioDone');
      if (state.phase === 'playing') level = loadGirone(state.gironeIndex);
      else level.transition = null;
    }
    return;
  }

  // --- playing: arrampicata ---
  level.events.length = 0;
  if (level.chapter > 0) level.chapter -= dt;
  const NONE = { left: false, right: false, up: false, down: false };
  // Il mash blocca tutto: stai lottando.
  if (mash.active) {
    stepMash(mash, sdt);
    const mp = climbPos(cl);
    if (mash.won) {
      // hai vinto: butti giù l'avversario e sali di 3
      moveHands(cl, +3); loyalty += 1;
      emitFx(level.pfx, 'spark', mp.tx, mp.ty + cameraY, { count: 12, spread: 4 });
      impact(juice, 1.4, 0, -1);
      if (level.active) { level.active.resolved = true; level.active.verb = 'spingi'; }
      mash = createMash();
    } else if (mash.lost) {
      // perso: scendi di 4
      moveHands(cl, -4);
      emitFx(level.pfx, 'blood', mp.tx, mp.ty + cameraY, { count: 8 });
      impact(juice, 1.2, 0, 1); breakFlow(juice);
      if (level.active) { level.active.resolved = true; level.active.verb = 'tendi'; }
      mash = createMash();
    }
    stepFx(level.pfx, dt, cameraY, { H: VIEW_H });
    const pc = climbPos(cl);
    cameraY = Math.max(0, Math.min(Math.max(0, cl.rows[0] - VIEW_H + 40), pc.by - VIEW_H * 0.55));
    updatePrompt();
    if (cl.reached && state.phase === 'playing') state = advance(state, 'reachedTop');
    const msh = shakeOffsetJ(juice, time);
    renderer.render(() => {
      ctx.save(); ctx.translate(msh.x, msh.y);
      drawWorld(level, cameraY);
      ctx.restore();
    }, { post: playingPost(dt, 0) });
    drawOverlay();
    return;
  }

  // reazioni degli incontri (timer animazione)
  for (const e of level.encounters) if (e.reactT > 0) e.reactT -= sdt;

  // L'incontro attivo FERMA il corpo: finché non scegli (o l'auto si risolve).
  level.active = encounterAt(cl, level.encounters);
  // helper: ti tira su da solo. grabber: parte la lotta a martello.
  if (level.active && !level.active.triggered) {
    const kind = level.active.kind;
    if (kind === 'helper') {
      level.active.triggered = true;
      const mp = climbPos(cl);
      level.autoHelp = 0.7;            // animazione: il salvatore ti tira
      emitFx(level.pfx, 'spark', mp.tx, mp.ty + cameraY, { count: 8, spread: 3 });
      renderer.post.flash = 0.3;
    } else if (kind === 'grabber') {
      level.active.triggered = true;
      mash = startMash(createMash(), { kind: 'grabber', row: level.active.row });
    }
  }
  if (!mash.active && level.active && level.active.triggered) {
    const kind = level.active.kind;
    if (kind === 'helper') {
      // risolvi dopo un attimo (l'animazione del tiro su)
      level.autoHelpT = (level.autoHelpT || 0) + dt;
      if (level.autoHelpT > 0.5) {
        level.active.resolved = true; level.active.verb = 'tendi';
        moveHands(cl, +2); loyalty += 1;
        level.autoHelp = 0; level.autoHelpT = 0;
      }
    } else if (kind === 'grabber') {
      level.active.resolved = true;   // gestito dal mash (vinto/perso)
    }
  }
  const acts = (level.active && !isAutoKind(level.active.kind)) ? NONE : input.climbActions();
  if (!level.active && level.threats.speed > 0 && acts.up) stepClimb(cl, NONE, dt);

  // scintille quando le mani si muovono
  const prevL = { c: cl.lhA.c, r: cl.lhA.r }, prevR = { c: cl.rhA.c, r: cl.rhA.r };
  const rowBefore = Math.max(cl.lh.r, cl.rh.r);
  stepClimb(cl, acts, sdt);
  const moved = Math.abs(cl.lhA.c - prevL.c) + Math.abs(cl.lhA.r - prevL.r) +
                Math.abs(cl.rhA.c - prevR.c) + Math.abs(cl.rhA.r - prevR.r);
  if (moved > 0.02) {
    const p0 = climbPos(cl);
    emitFx(level.pfx, 'spark', p0.lx, p0.ly + cameraY, { count: 1, spread: 2 });
  }
  // FLOW: salire di fila lo carica; l'impatto lo azzera
  if (Math.max(cl.lh.r, cl.rh.r) > rowBefore) addFlow(juice, 0.06);
  else if (moved < 0.001) addFlow(juice, -dt * 0.5);

  // ostacoli/aiuti legati alla canzone
  const msg = stepThreats(g, cl, level.threats, sdt, 0);
  if (msg && msg !== level.threatMsg) {
    const m = msg.toLowerCase();
    const mp = climbPos(cl);
    if (/vento|pioggia|scivol/.test(m)) { level.events.push('slip'); emitFx(level.pfx, 'dust', mp.tx, mp.ty + cameraY, { count: 5 }); }
    else if (/tuono|tempo/.test(m)) { level.events.push('quake'); emitFx(level.pfx, 'spark', mp.tx, mp.ty + cameraY, { count: 6 }); }
    else if (/detrito|cranio|edera|sonno/.test(m)) { level.events.push('blade'); emitFx(level.pfx, 'blood', mp.tx, mp.ty + cameraY, { count: 5 }); }
    else { level.events.push('fake'); emitFx(level.pfx, 'ash', mp.tx, mp.ty + cameraY, { count: 4 }); }
    impact(juice, 0.8, 0, 1);
    breakFlow(juice);
  }
  level.threatMsg = msg;

  // raccolta potenziamenti
  const curRow = Math.max(cl.lh.r, cl.rh.r);
  for (const pk of level.pickups) {
    if (pk.taken) continue;
    if (Math.abs(pk.r - curRow) <= 1) {
      pk.taken = true;
      const m = applyPickup(pk.kind, cl, level.threats);
      if (m) {
        level.threats.lastMsg = m; level.threats.msgT = 2; level.events.push('warm');
        const mp = climbPos(cl);
        emitFx(level.pfx, 'spark', mp.tx, mp.ty + cameraY, { count: 8, spread: 3 });
        impact(juice, 0.9, 0, -1);
      }
    }
  }

  // moduli tematici (vento, tuoni, dim, ecc.) emettono eventi visivi
  const pos = climbPos(cl);
  const fakeP = { x: pos.tx - 4, y: pos.ty, w: 8, h: 12, vx: 0, vy: 0, onGround: true };
  // T9: gli effetti osservabili dei pericoli/modificatori alimentano il rendering.
  const teff = threatEffects(level.threats);
  const mctx = { player: fakeP, world: { bodies: level.bodies, gravity: 0 }, time, events: level.events,
    effects: level.modsFx || (level.modsFx = { dim: 0, flicker: 0, water: 0, elapsed: 0, verlet: false }) };
  for (let i = 0; i < g.modifiers.length; i++)
    applyModifier(g.modifiers[i], mctx, sdt, level.modStates[i]);
  // fonde gli stati: sonno (dim), glitch (flicker/decoy), acqua che sale, stordimento.
  level.fxState = {
    dim: Math.max(mctx.effects.dim, teff.dim),
    glitch: Math.max(mctx.effects.flicker, teff.decoy > 0 ? 0.4 : 0),
    water: Math.max(mctx.effects.water, teff.water),
    stun: teff.stun,
  };
  // il terremoto stordisce: congela l'input per `stun` secondi (già in teff)
  if (teff.stun > 0.01) input.frozen = true; else input.frozen = false;

  spawnFromEvents(level.fx, level.events, cameraY, pos.tx);
  stepEffects(level.fx, sdt, cameraY, VIEW_H);
  stepFx(level.pfx, dt, cameraY, { H: VIEW_H });

  const maxCam = Math.max(0, cl.rows[0] - VIEW_H + 40);
  cameraY = Math.max(0, Math.min(maxCam, pos.ty - VIEW_H * 0.55));

  // cedimento di un corpo debole: cade da solo e ti trascina giù
  if (cl.collapseEvent) {
    cl.collapseEvent = null;
    emitFx(level.pfx, 'ash', pos.tx, pos.ty + cameraY, { count: 10, spread: 3 });
    emitFx(level.pfx, 'blood', pos.tx, pos.ty + cameraY, { count: 4 });
    impact(juice, 1.1, 0, 1); breakFlow(juice);
    level.events.push('quake');
  }

  level.active = encounterAt(cl, level.encounters);
  updatePrompt();

  if (cl.reached && state.phase === 'playing') {
    emitFx(level.pfx, 'shock', pos.tx, pos.ty + cameraY, { count: 1 });
    impact(juice, 1.6, 0, -1);
    state = advance(state, 'reachedTop');
  }

  // camera: scossa (fx classici) + scossa juice + punch zoom
  const sh = shakeOffset(level.fx, time);
  const jsh = shakeOffsetJ(juice, time);
  const z = punchZoom(juice);
  renderer.render(() => {
    ctx.save();
    ctx.translate(VIEW_W / 2, VIEW_H / 2); ctx.scale(z, z); ctx.translate(-VIEW_W / 2, -VIEW_H / 2);
    ctx.translate(sh.x + jsh.x, sh.y + jsh.y);
    drawWorld(level, cameraY);
    ctx.restore();
    if (level.fx.dim > 0) { ctx.fillStyle = `rgba(0,0,0,${level.fx.dim})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    const prog = climbProgress(cl);
    ctx.fillStyle = C.black; ctx.fillRect(VIEW_W - 4, 0, 4, VIEW_H);
    ctx.fillStyle = C.red; ctx.fillRect(VIEW_W - 4, Math.round(VIEW_H * (1 - prog)), 4, Math.round(VIEW_H * prog));
  }, { post: playingPost(dt, 0) });
  drawOverlay();
}

// --- debug: ?g=NN ---
const _gParam = new URLSearchParams(location.search).get('g');
const _colParam = new URLSearchParams(location.search).get('collapse');
if (_colParam) {
  state = advance(createState(), 'start'); state.gironeIndex = 12;
  level = loadGirone(12);
  state = advance(state, 'reachedTop'); state = advance(state, 'audioDone');
} else if (_gParam) {
  const idx = Math.max(0, Math.min(12, parseInt(_gParam, 10) - 1 || 0));
  state = advance(createState(), 'start'); state.gironeIndex = idx;
  level = loadGirone(idx);
}
window.__vp = { get state() { return state; }, get level() { return level; }, get time() { return time; }, get collapse() { return collapse; }, get mash() { return mash; }, get juice() { return juice; }, get audio() { return audio; }, doVerb };

loop();







