# Cicli di auto-miglioramento — VOX POPULI

Ogni ciclo: **applica una regola → auto-verifica → keep/revert → commit**.
Verifica = `node tools/verify.mjs <girone>` (build + 118 test + screenshot + FPS + zero errori).

---

## Ciclo 1 — Posa anatomica dell'arrampicatore
**Data:** 2026-10-07 · **Commit:** *(vedi git)*

**Problema:** il giocatore sembrava un ragno: braccia a V larga e rigide, gambe
penzolanti corte e "a rana". HANG arbitrario, proporzioni scollegate dall'anatomia.

**Regole applicate** (guida §1, §3, §5b):
- Foto reali: mani 0.95–1.00h, spalle 0.68–0.72h, bacino 0.50–0.55h, ginocchia 0.30h.
- Tronco spalla→anca = 0.20h (era 0.38h → corpo sproporzionato).
- Braccia 0.17h/segmento (0.34h tot.), quasi distese con gomito visibile.
- Gambe 0.24h/segmento (0.48h tot., ~1.4× le braccia → gambe più lunghe, come umani).
- `HANG = 11` ≈ 0.5h (bacino a metà altezza) → le braccia arrivano davvero alle prese.
- Appigli a 11px (erano 14px/24px) → mani ~1.4× larghezza spalle, braccia quasi verticali.
- Pattern **contro-laterale**: una gamba spinge (distesa in basso), l'altra sale
  (ginocchio piegato), alternate col ciclo di salita. Bias asimmetrica di base →
  mai l'istante simmetrico "squat".
- Testa 0.07h raggio, spalle 0.14h mezza-larghezza (più strette, non spidery).

**Verifica:** 118/118 test · FPS 60 · zero errori runtime · screenshot banco 6 fasi.

**Esito:** KEEP. La silhouette ora si legge come uno scalatore in 6 fasi.

**File:** `src/figure.js` (`drawClimber`), `src/climb.js` (cols 11px, c0=10, HANG 11).

---

## Ciclo 2 — Parete che "respira"
**Data:** 2026-10-07 · **Commit:** *(vedi git)*

**Problema:** la folla dietro era troppo fitta e accesa → caos rosso, il giocatore si
perdeva. (Segnalato dall'utente.)

**Regole applicate** (guida §4.6 "rosso solo per il critico", §1.4 "valore batte tinta"):
- Densità folla ridotta: passo `13–21px` (era `10–16px`) → più buio tra i corpi.
- Valori del rosso di sfondo abbassati: `depthRed(0.04–0.42)` (era `0.08–0.62`) → la
  folla resta nella metà bassa della rampa.
- Layer dietro più raro (0.65) e più trasparente (0.50).
- La parete intera si attenua: `globalAlpha 0.80` (era 0.92) → sfondo, non soggetto.

**Verifica:** 118/118 test · FPS 60 · zero errori · screenshot parete completa.

**Esito:** KEEP. Il giocatore (contorno chiaro + rosso acceso) domina la scena.

**File:** `src/art.js` (`buildWallCanvas`, `drawWall`).

---

## Ciclo 3 — Mani ancorate alle prese
**Data:** 2026-10-07 · **Commit:** *(vedi git)*

**Problema:** la presa era disegnata 1px sotto il punto afferrato → la mano del
giocatore sembrava "sfiorare" e non afferrare.

**Regole applicate** (guida §2 "il gomito/giunto si disegna sulla piega", §5 "IK
raggiunge il target senza scatti"):
- La presa è ora centrata **esattamente** su `yOf(r)` (era `yOf(r)+1`), così il palmo
  del giocatore coincide col pixel della presa.

**Verifica:** 118/118 test · FPS 60 · zero errori.

**Esito:** KEEP.

**File:** `src/art.js` (`drawWall`, appigli live).

---

## Ciclo 4 — Canvas opaco `alpha:false`
**Data:** 2026-10-07 · **Commit:** *(vedi git)*

**Problema (perf):** il canvas visibile usava il contesto con canale alpha attivo,
pur coprendo sempre tutto lo schermo (out è opaco) → composizione alpha inutile.

**Regole applicate** (guida §7.4): `getContext('2d', { alpha:false })` sul canvas
visibile, con fallback se non supportato.

**Verifica:** 118/118 test · FPS 60 · zero errori.

**Esito:** KEEP.

**File:** `src/renderer.js` (`createRenderer`).

---

## Ciclo 5 — Hit-stop e shake ai valori di ricerca
**Data:** 2026-10-07 · **Commit:** *(vedi git)*

**Problema:** hit-stop 45ms (ricerca ~20ms) e shake max 10px (ricerca 2–4px a questa
risoluzione) → impatti troppo "morbidi" e scossa sproporzionata.

**Regole applicate** (guida §6, Nijman *Art of Screenshake*):
- hit-stop base 20ms (era 45ms), cap 50ms.
- shake base 2.2px (era 4px), cap 6px (era 10px).
- glitch threshold abbassata da `shake > 6` a `shake > 3` (ora raggiungibile).
- Test aggiornati: nuovo test blocca 20ms/2.2px.

**Verifica:** 119/119 test · FPS 60 · zero errori.

**Esito:** KEEP.

**File:** `src/juice.js` (`impact`), `src/main.js` (glitch), `test/juice.test.js`.

---

## Ciclo 6 — Mobile (viewport, safe-area, audio unlock)
**Data:** 2026-10-07 · **Commit:** *(vedi git)*

**Problema:** nessun supporto notch (`viewport-fit`), UI sotto le safe-area, e su iOS
Safari `play()` asincrono perdeva il gesto utente → audio non partiva.

**Regole applicate** (guida §9):
- `viewport-fit=cover` + `env(safe-area-inset-*)` su dpad/verbs/hud/cta/prompt.
- `overscroll-behavior:none` sul body (blocca pull-to-refresh).
- `audio.unlock()`: WAV silenzioso di 1 campione riprodotto DENTRO il primo gesto
  utente (`pointerdown`/`keydown`/`touchstart`, one-shot) → le `play()` asincrone
  successive sono permesse su Safari.

**Verifica:** 119/119 test · FPS 60 · zero errori · bundle OK.

**Esito:** KEEP.

**File:** `index.html`, `src/audio.js` (`unlock`), `src/main.js` (primeAudio).

---

## Ciclo 7 — Palette: rampa rossa con hue-shift
**Data:** 2026-10-07 · **Commit:** *(vedi git)*

**Problema:** la rampa rossa era a tinta piatta (`g=b=0` ovunque) → i passi di
profondità si distinguevano solo per luminosità, senza la vibrazione cromatica che
rende "viva" una palette pixel-art.

**Regole applicate** (guida §1.3): hue-shift sottile lungo la rampa — i toni scuri
tirano al **freddo** (+blu), quelli accesi al **caldo** (+verde), restando rosso
dominante (la copertina resta "solo rosso").
- `redDeep #280206`, `redDark #55070c`, `redMid #800908` (freddi)
- `red #a80a06`, `redBright #c00f0a` (caldi), `redHot #e01010` (invariato)

**Verifica:** 119/119 test (il test "rosso dominante" continua a passare) · FPS 60 ·
zero errori · bundle OK.

**Esito:** KEEP.

**File:** `src/palette.js` (`C`).

---

## Prossimi cicli (backlog prioritizzato dalla ricerca)

1. **Parete che respira** — la folla dietro è caotica; ridurre densità/scurire per far
   staccare il giocatore (guida §4.6: rosso solo per il critico). *(user-requested)*
2. **Ancoraggio mani alle prese** — far combaciare la mano col pixel della presa.
3. **Game feel** (guida §6): hit-stop 20ms, trauma-shake 2–4px, coyote/buffer,
   squash&stretch, easing. Verificare i valori attuali vs ricerca.
4. **Perf** (guida §7): `alpha:false`, coordinate intere, zero allocazioni nel loop.
5. **Level design** (guida §8): kishōtenketsu per girone, tutorial invisibile, max 3 novità.
6. **Mobile** (guida §9): `touch-action:none`, safe-area, audio unlock iOS.
7. **Palette** (guida §1.3): rampa rossa 3–5 step con hue-shift; rosso acceso = pericolo.
