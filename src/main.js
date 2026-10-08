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
import { drawWall, drawPlayer, drawEncounter, drawInscription, drawTitle, drawLyrics, drawPickup, drawThreatMsg, drawMash, drawKaraoke, drawChapterCard, drawFlow, drawSkyline, drawUIOverlay, drawTitleText, drawLyricsPixel, drawLyricsOverlay, drawNpcScenes, shouldDrawLyrics, drawVariety, drawMissionHUD, drawOmino, lyricIndexAt } from './art.js';
import { KINDS, GIRONE_ENCOUNTERS, resolveEncounter, isAutoKind } from './encounters.js';
import { createClimb, stepClimb, climbPos, climbProgress, encounterAt, centerCol, moveHands } from './climb.js';
import { createVariety, stepVariety } from './variety.js';
import { createObjective, stepObjective, objectiveHud } from './objective.js';
import { createThreatState, stepThreats, pickupPositions, applyPickup, threatEffects } from './threats.js';
import { createMash, startMash, mashHit, stepMash, mashRatio, mashDone, mashPending } from './mash.js';
import { createJuice, impact, addFlow, breakFlow, setBpm, stepJuice, shakeOffsetJ, punchZoom, flowRatio, bpmFor } from './juice.js';
import { KARAOKE } from './karaoke.js';
import { createRenderer } from './renderer.js';
import { createStepper } from './timestep.js';
import { drawThemeBack, drawThemeFront } from './themes.js';
import { createFx, emitFx, stepFx, drawFx } from './fx.js';
import { createGrip, stepGrip, gripHit, gripOutcome } from './grip.js';
import { createOmini, stepOmini, ominoAt, resolveOmino } from './omini.js';
import { hazardSeverity } from './hazard.js';

const canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');   // riassegnato al contesto offscreen del renderer
const VIEW_W = 320, VIEW_H = 180;
let SCALE = 3;

// LYRIC_LEAD: anticipo (secondi) applicato al tempo audio quando si sceglie la
// riga di testo da mostrare. Nel karaoke di produzione la riga appare appena
// PRIMA che la parola venga cantata; un valore negativo anticipa, positivo
// ritarda. Gli start in KARAOKE sono gia' ancorati all'onset della parola
// (tools/align-karaoke.mjs), quindi il default e' 0: alzare a -0.08 se si vuole
// un piccolo anticipo percettivo.
const LYRIC_LEAD = 0.0;

// GRADE — mood cromatico PER TRACCIA (delta deterministici sul post-processing).
// Vive qui (non in themes.js, REF lock): ogni brano ha una "temperatura" diversa
// restando nella palette rosso/nero. Valori piccoli: si sommano alla base di
// playingPost e vengono clampati in [0,1]. Chiave = audioId.
const GRADE = {
  '01-intro':          { vignette: -0.05 },                          // apertura: più luce
  '02-vento':          { chroma: +0.06, grain: +0.02 },              // vento: instabile
  '03-tuoni':          { bloom: +0.06, scan: +0.03 },                // tuoni: lampi
  '04-baghdad':        { vignette: +0.08, grain: +0.04 },            // polvere: cupo
  '05-hosonno':        { vignette: +0.10, chroma: +0.05 },           // sonno: ovattato
  '06-primoposto':     { bloom: +0.05, vignette: -0.06 },            // riflettori
  '07-tictac':         { scan: +0.06, grain: +0.03 },                // meccanico
  '08-tuttofinto':     { chroma: +0.08, scan: +0.04 },               // finto: sfasato
  '09-edera':          { vignette: +0.06, grain: +0.03 },            // edera: organico
  '10-scendi':         { vignette: +0.07, bloom: -0.04 },            // discesa: buio
  '11-lafinedelmondo': { bloom: +0.08, chroma: +0.06 },              // apocalisse
  '12-maranatha':      { bloom: +0.10, vignette: -0.05 },            // rivelazione
  '13-outro':          { vignette: +0.05, grain: +0.02 },            // dissolvenza
};

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
    variety: createVariety(g, climb),    // missione + oggetti/amici/nemici/egg del brano
    threats: createThreatState(),
    grip: createGrip(g),                 // la PRESA: si erode coi pericoli, rigenera col tempo
    omini: createOmini(g, climb),        // i piccoli della scala (deterministici dal girone)
    objective: createObjective(g),       // obiettivo meccanico della traccia (climb/beatClock/…)
    collected: 0, helped: 0,             // contatori per gli obiettivi collect/escort
    activeOmino: null,
    lastLyricIdx: -1,                    // isteresi della lirica (non torna mai indietro)
    lastLyricPos: 0,                     // posizione audio del frame precedente (rileva il loop)
    grade: g.grade || GRADE[g.audioId] || {},   // delta cromatici per traccia (assente = {})
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
  if (state.phase !== 'playing' || !level) return;
  // OMINI: nessun incontro attivo ma un omino a portata -> il verbo parla con lui.
  // Stessi tasti (Z/X, pulsanti touch): nessun binding nuovo.
  if (!level.active && level.activeOmino) {
    const eff = resolveOmino(level.omini, level.activeOmino, verb);
    if (eff.dy) moveHands(level.climb, Math.round(-eff.dy / 24));
    loyalty += eff.loyal;
    if (verb === 'tendi') level.helped = (level.helped || 0) + 1;   // obiettivo 'escort'
    action = verb;
    actionT = 0.5;
    return;
  }
  if (!level.active) return;
  const kind = level.active.kind;
  if (isAutoKind(kind)) return;   // helper/grabber non si scelgono con Z/X
  const eff = resolveEncounter(level.active, verb);
  const cl = level.climb;
  level.active.reactT = 0.8;                    // animazione di reazione del PNG
  level.active.reactVerb = verb;
  // l'esito sposta la scalata su/giù
  if (eff.dy) moveHands(cl, Math.round(-eff.dy / 24));
  loyalty += eff.loyal;
  if (verb === 'tendi') level.helped = (level.helped || 0) + 1;     // obiettivo 'escort'
  action = verb === 'tendi' ? 'tendi' : 'spingi';
  actionT = verb === 'tendi' ? 0.72 : 0.62;
}

// GRIP: esito della presa. Va chiamato PRIMA di stepGrip (la rigenerazione
// riporterebbe v sopra 0 e l'esito non scatterebbe mai). Ritorna true se il
// girone è stato ricaricato (defeat): il chiamante deve uscire dal frame.
//   'fall'   -> scivoli fino alla riga di partenza + mercy 0.5 (non si perde
//               due volte di fila) + impatto.
//   'defeat' -> sconfitta pura: si torna al girone precedente (clampato a 0).
function gripCheck(cl) {
  if (!level || !level.grip) return false;
  const startRow = (level.girone.direction === 'down') ? cl.nRows - 1 : 0;
  const curRow = Math.max(cl.lh.r, cl.rh.r);
  const outcome = gripOutcome(level.grip, curRow, startRow);
  if (outcome === 'fall') {
    moveHands(cl, -Math.max(0, curRow - startRow));
    level.grip.v = 0.5;                       // mercy
    const mp = climbPos(cl);
    emitFx(level.pfx, 'ash', mp.tx, mp.ty + cameraY, { count: 10, spread: 3 });
    emitFx(level.pfx, 'blood', mp.tx, mp.ty + cameraY, { count: 4 });
    impact(juice, 1.3, 0, 1); breakFlow(juice);
    level.events.push('quake');
    return false;
  }
  if (outcome === 'defeat') {
    state = advance(state, 'defeat');
    level = loadGirone(state.gironeIndex);
    return true;
  }
  return false;
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
  if (a.resolved) { setPrompt(''); return; }   // incontro risolto: niente prompt
  const d = KINDS[a.kind];
  if (a.kind === 'helper') setPrompt('◀ ' + d.prompt + ' ▶');
  else if (a.kind === 'grabber') setPrompt('◀ ' + d.prompt + ' ▶   [MARTELLA Z/X]');
  else setPrompt('◀ ' + d.prompt + ' ▶   [Z] tendi   [X] spingi');
}

function drawWorld(lv, camY) {
  if (!SKIP.has('theme')) drawThemeBack(ctx, lv.girone.audioId, camY, time, VIEW_W, VIEW_H, lv.pfx);
  if (!SKIP.has('sky')) drawSkyline(ctx, lv.girone.audioId, camY, time, VIEW_W, VIEW_H, juice.beat);
  // scene NPC per girone (dietro la parete): varieta' visiva per livello
  if (!SKIP.has('npc')) drawNpcScenes(ctx, lv.girone, lv.climb, camY, time, VIEW_W, VIEW_H);
  if (!SKIP.has('wall')) drawWall(ctx, lv.girone, lv.climb, camY, time, VIEW_W, VIEW_H, juice.beat);
  if (!SKIP.has('enc')) for (const e of lv.encounters) drawEncounter(ctx, e, lv.climb, camY, time, e === lv.active);
  if (!SKIP.has('omini')) for (const om of (lv.omini ? lv.omini.list : [])) drawOmino(ctx, om, lv.climb, camY, time, om === lv.activeOmino);
  if (!SKIP.has('pick')) for (const pk of lv.pickups) drawPickup(ctx, pk, lv.climb, camY, time);
  if (!SKIP.has('variety')) drawVariety(ctx, lv.variety, lv.climb, camY, time, VIEW_W, VIEW_H);
  if (!SKIP.has('player')) drawPlayer(ctx, lv.climb, camY, time, action);
  if (!SKIP.has('fx')) drawFx(ctx, lv.pfx, camY, time);
  if (!SKIP.has('themefront')) drawThemeFront(ctx, lv.girone.audioId, camY, time, VIEW_W, VIEW_H, lv.pfx);
  // NB: la lirica PIXEL è disegnata FUORI dalla transform della camera (in main),
  // così non viene mai spinta fuori schermo da shake/zoom.
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

// Lirica PIXEL nella scena offscreen: UNICA fonte per playing/mash/unlocked.
// Stessa sorgente del karaoke (KARAOKE[audioId] + posizione audio + LYRIC_LEAD).
// Mai su title/cta/collapse (shouldDrawLyrics). Resta dentro la scena, così
// attraversa il post-processing come il resto della pixel art.
function drawSceneLyrics(phase) {
  if (!shouldDrawLyrics(phase) || !level || SKIP.has('lyrics')) return;
  const kl = KARAOKE[level.girone.audioId];
  if (kl) {
    const pos = audio.position() + LYRIC_LEAD;
    // ISTERESI: l'indice non torna mai indietro (minIdx = ultimo mostrato).
    // La traccia va in LOOP: se la posizione torna indietro (riavvio), il floor
    // si azzera, altrimenti la lirica resterebbe congelata sull'ultima riga.
    if (pos + 0.5 < (level.lastLyricPos || 0)) level.lastLyricIdx = -1;
    level.lastLyricPos = pos;
    const idx = lyricIndexAt(kl, pos, level.lastLyricIdx);
    level.lastLyricIdx = idx;
    // Il render rispetta il floor (isteresi): la riga non torna mai indietro.
    drawLyricsPixel(ctx, kl, pos, time, VIEW_W, VIEW_H, level.lastLyricIdx);
  }
}

// Overlay UI a RISOLUZIONE PIENA (testo nitido) — sopra la scena pixel art.
const uctx = canvas.getContext('2d');
function drawOverlay() {
  const pos = audio.position() + LYRIC_LEAD;
  // liriche NITIDE a risoluzione piena: solo dove hanno senso (playing/unlocked),
  // mai sopra title/cta/collapse. La scena pixel resta come sfondo tenue.
  // Le liriche sono PIXEL (drawLyricsPixel, nella scena): qui niente testo nitido
  // sovrapposto — evitava il doppio testo. Il resto dell'HUD resta a piena risoluzione.
  drawUIOverlay(uctx, SCALE, VIEW_W, VIEW_H, {
    inscription: level ? level.girone.inscription.text : '',
    threatMsg: '',   // callout rosso soppresso: level.threatMsg resta per la logica
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
  // missione del girone (banda dedicata, sotto l'iscrizione)
  if (level && level.variety && !SKIP.has('variety')) {
    // Se l'obiettivo della traccia NON è un semplice 'climb', mostra l'obiettivo
    // reale (BATTI IL TEMPO / SOPRAVVIVI / SCORTA / REGGI LA PRESA / SCENDI).
    const oh = level.objective && level.objective.kind !== 'climb' ? objectiveHud(level.objective) : null;
    if (oh) {
      const cur = Math.round(oh.progress * 100);
      drawMissionHUD(uctx, SCALE, VIEW_W, VIEW_H, {
        text: oh.text,
        current: cur, target: 100, done: level.objective.done,
      });
    } else {
      drawMissionHUD(uctx, SCALE, VIEW_W, VIEW_H, {
        text: level.variety.mission.text,
        current: level.variety.mission.current,
        target: level.variety.mission.target,
        done: level.variety.mission.done,
      });
    }
  }
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
  // W2-C: lightmap additiva (il giocatore come fonte di luce calda) + LUT rossa.
  // Modulate dal battito/flow: pulsano con la musica. Sottili per non stravolgere.
  post.lights = 0.55 + beat * 0.25;
  post.lut = 0.35 + flow * 0.25;
  // T9: gli effetti dei pericoli modulano il post (varietà visiva per girone).
  const st9 = level && level.fxState;
  if (st9) {
    post.glitch = Math.max(post.glitch, st9.glitch);       // appiglio finto / illusione
    post.vignette = Math.min(0.7, post.vignette + st9.dim * 0.5);  // sonno: scurisce
    post.chroma = Math.min(0.8, post.chroma + st9.dim * 0.3);       // dormiente: sbava
    if (st9.stun > 0.01) post.glitch = Math.max(post.glitch, 0.5);  // terremoto: strappa
  }
  // GRADE per traccia: delta cromatici deterministici (GRADE table / g.grade).
  // Clamp in [0,1]: il mood resta nella palette rosso/nero, mai fuori scala.
  const gd = (level && level.grade) || {};
  const cl01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  post.bloom = cl01(post.bloom + (gd.bloom || 0));
  post.chroma = cl01(post.chroma + (gd.chroma || 0));
  post.scan = cl01(post.scan + (gd.scan || 0));
  post.vignette = cl01(post.vignette + (gd.vignette || 0));
  post.grain = cl01(post.grain + (gd.grain || 0));
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
    if (level.holdUnlocked) level.transition.t = 0.6;   // debug: transizione ferma a metà
    else stepTransition(level.transition, dt);
    stepFx(level.pfx, dt, cameraY, { H: VIEW_H });
    // burst di glitch + flash rosso all'inizio della transizione, poi si spegne
    const k = Math.min(1, level.transition.t / 1.2);
    const burst = (1 - k) * (1 - k);
    const tpost = Object.assign(applyPost('unlocked'), { glitch: 1.1 * burst, flash: 0.7 * burst, chroma: 0.9 * burst });
    renderer.render(() => { drawWorld(level, cameraY); drawTransition(ctx, level.transition, VIEW_W, VIEW_H); drawSceneLyrics('unlocked'); }, { post: tpost });
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
  // GRIP: esito della presa PRIMA della rigenerazione (v==0 da un colpo del frame
  // precedente o forzato dall'esterno). Se il girone viene ricaricato si esce.
  if (gripCheck(cl)) return;
  stepGrip(level.grip, sdt);          // la presa si rigenera col tempo
  stepOmini(level.omini, cl, sdt);    // i piccoli della scala (spawn per fila)
  const NONE = { left: false, right: false, up: false, down: false };
  // Il mash blocca tutto: stai lottando. Il ramo resta attivo anche dopo la
  // vittoria/sconfitta (won/lost) finché non viene risolto e resettato.
  if (mashPending(mash)) {
    if (mash.active && !mash.hold) stepMash(mash, sdt);   // debug ?phase=mash: barra ferma
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
      // GRIP: la lotta persa erode la presa (cfg.hitMash, guard se cfg assente).
      gripHit(level.grip, level.grip && level.grip.cfg ? level.grip.cfg.hitMash : 0.45);
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
      drawSceneLyrics('mash');
    }, { post: playingPost(dt, 0) });
    drawOverlay();
    return;
  }

  // reazioni degli incontri (timer animazione)
  for (const e of level.encounters) if (e.reactT > 0) e.reactT -= sdt;

  // L'incontro attivo FERMA il corpo: finché non scegli (o l'auto si risolve).
  level.active = encounterAt(cl, level.encounters);
  // OMINI: se nessun incontro è attivo, il più vicino entro |dr|<=1 diventa
  // l'interlocutore dei verbi Z/X (stessa regola di encounterAt).
  level.activeOmino = level.active ? null : ominoAt(level.omini, cl);
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
    // GRIP: lo stesso messaggio erode la presa (peso dalla cfg, hazard.js puro).
    gripHit(level.grip, hazardSeverity(msg, level.grip && level.grip.cfg));
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

  // raccolta varietà del brano (missione/oggetti/amici/nemici/easter egg)
  if (level.variety) {
    const vr = stepVariety(level.variety, cl);
    for (const c of vr.collected) {
      level.collected = (level.collected || 0) + 1;   // conteggio per obiettivo 'collect'
      const mp = climbPos(cl);
      // amico/nemico toccano la LEALTÀ (che decide la piramide finale)
      if (c.effect === 'loyal+1') loyalty += 1;
      else if (c.effect === 'loyal-1') loyalty -= 1;
      const fx2 = c.kind === 'enemy' ? 'blood' : c.kind === 'egg' ? 'ash' : 'spark';
      emitFx(level.pfx, fx2, mp.tx, mp.ty + cameraY, { count: c.kind === 'egg' ? 4 : 8, spread: 3 });
      level.threats.lastMsg = (c.kind === 'friend' ? '◈ ' : c.kind === 'enemy' ? '✖ ' : '') + c.name;
      level.threats.msgT = 2;
      impact(juice, c.kind === 'enemy' ? 1.0 : 0.8, 0, c.kind === 'enemy' ? 1 : -1);
      if (c.kind === 'enemy') breakFlow(juice);
    }
    if (vr.missionDone) {
      level.events.push('warm');
      impact(juice, 1.4, 0, -1);
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
    // GRIP: il cedimento del corpo debole erode la presa (0.16 fisso).
    gripHit(level.grip, 0.16);
    emitFx(level.pfx, 'ash', pos.tx, pos.ty + cameraY, { count: 10, spread: 3 });
    emitFx(level.pfx, 'blood', pos.tx, pos.ty + cameraY, { count: 4 });
    impact(juice, 1.1, 0, 1); breakFlow(juice);
    level.events.push('quake');
  }

  level.active = encounterAt(cl, level.encounters);
  level.activeOmino = level.active ? null : ominoAt(level.omini, cl);
  updatePrompt();

  // OBIETTIVO della traccia: decide la VITTORIA (non più solo "raggiungi la cima").
  // Sconfitta per obiettivo mancato (tempo/presa) riusa il motore di sconfitta.
  if (level.objective && state.phase === 'playing') {
    stepObjective(level.objective, {
      reachedTop: cl.reached,
      gripRatio: level.grip ? level.grip.v : 1,
      collected: level.collected || 0,
      helped: level.helped || 0,
      progress: climbProgress(cl),
    }, sdt);
    if (level.objective.failed) {         // es. tempo scaduto / presa persa
      emitFx(level.pfx, 'blood', pos.tx, pos.ty + cameraY, { count: 10 });
      impact(juice, 1.5, 0, 1); breakFlow(juice);
      state = advance(state, 'defeat');
      level = loadGirone(state.gironeIndex);
      return;
    }
    if (level.objective.done) {
      emitFx(level.pfx, 'shock', pos.tx, pos.ty + cameraY, { count: 1 });
      impact(juice, 1.6, 0, -1);
      state = advance(state, 'reachedTop');
    }
  } else if (cl.reached && state.phase === 'playing') {
    emitFx(level.pfx, 'shock', pos.tx, pos.ty + cameraY, { count: 1 });
    impact(juice, 1.6, 0, -1);
    state = advance(state, 'reachedTop');
  }

  // camera: scossa (fx classici) + scossa juice + punch zoom
  const sh = shakeOffset(level.fx, time);
  const jsh = shakeOffsetJ(juice, time);
  const z = punchZoom(juice);
  // W2-C: luci del frame (coordinate scena). Il giocatore emana una luce calda
  // che pulsa col battito; gli appigli vicini brillano piano.
  renderer.lights.length = 0;
  {
    const pp = climbPos(cl);
    renderer.lights.push({ x: pp.tx, y: pp.ty - cameraY, r: 40 + juice.beat * 14, alpha: 0.5 + juice.beat * 0.3 });
  }
  renderer.render(() => {
    ctx.save();
    ctx.translate(VIEW_W / 2, VIEW_H / 2); ctx.scale(z, z); ctx.translate(-VIEW_W / 2, -VIEW_H / 2);
    ctx.translate(sh.x + jsh.x, sh.y + jsh.y);
    drawWorld(level, cameraY);
    ctx.restore();
    // lirica PIXEL protagonista: FUORI dalla transform della camera, in cima alla
    // scena (leggibile in ogni tema, mai spinta fuori da shake/zoom). Resta pixel
    // perché è disegnata nella scena-offscreen che attraversa il post-processing.
    drawSceneLyrics('playing');
    if (level.fx.dim > 0) { ctx.fillStyle = `rgba(0,0,0,${level.fx.dim})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    const prog = climbProgress(cl);
    ctx.fillStyle = C.black; ctx.fillRect(VIEW_W - 4, 0, 4, VIEW_H);
    ctx.fillStyle = C.red; ctx.fillRect(VIEW_W - 4, Math.round(VIEW_H * (1 - prog)), 4, Math.round(VIEW_H * prog));
  }, { post: playingPost(dt, 0) });
  drawOverlay();
}

// --- debug: ?g=NN, ?collapse=N, ?phase=mash|unlocked ---
const _params = new URLSearchParams(location.search);
const _gParam = _params.get('g');
const _colParam = _params.get('collapse');
const _phaseParam = _params.get('phase');
if (_colParam) {
  state = advance(createState(), 'start'); state.gironeIndex = 12;
  level = loadGirone(12);
  state = advance(state, 'reachedTop'); state = advance(state, 'audioDone');
} else if (_gParam) {
  const idx = Math.max(0, Math.min(12, parseInt(_gParam, 10) - 1 || 0));
  state = advance(createState(), 'start'); state.gironeIndex = idx;
  level = loadGirone(idx);
}

// Debug per screenshot: porta il gioco in una fase e la MANTIENE (hold), così
// la si può fotografare senza che avanzi da sola. ?phase=mash|unlocked.
// force('defeat'): sconfitta immediata (grip a 0 -> il loop avanza a 'defeat').
function forcePhase(phase) {
  if (phase === 'defeat') {
    if (!level || state.phase !== 'playing') {
      state = advance(createState(), 'start');
      level = loadGirone(state.gironeIndex);
    }
    if (level.grip) level.grip.v = 0;   // il prossimo frame chiama gripCheck -> defeat
    return true;
  }
  if (phase !== 'mash' && phase !== 'unlocked') return false;
  if (!level || state.phase === 'title' || state.phase === 'cta' || state.phase === 'collapse') {
    state = advance(createState(), 'start');
    level = loadGirone(state.gironeIndex);
  }
  if (phase === 'mash') {
    state = { ...state, phase: 'playing' };
    mash = startMash(createMash(), { kind: 'grabber', row: 3 });
    mash.progress = 0.5; mash.hold = true;   // barra ferma: screenshot affidabile
  } else {
    state = { ...state, phase: 'playing' };
    state = advance(state, 'reachedTop');
    level.holdUnlocked = true;               // transizione ferma: screenshot affidabile
  }
  return true;
}
if (_phaseParam) forcePhase(_phaseParam);
window.__vp = {
  get state() { return state; },
  get level() { return level; },
  get time() { return time; },
  get collapse() { return collapse; },
  get mash() { return mash; },
  get juice() { return juice; },
  get audio() { return audio; },
  get loyalty() { return loyalty; },
  get grip() { return level && level.grip; },
  get omini() { return level && level.omini; },
  get activeOmino() { return level && level.activeOmino; },
  get lastLyricIdx() { return level && level.lastLyricIdx; },
  doVerb, force: forcePhase,
};

loop();







