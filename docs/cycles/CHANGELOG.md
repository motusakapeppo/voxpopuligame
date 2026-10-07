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
