# VOX POPULI — Guida di Maestria
### Regole per costruire un gioco pixel-art single-file che sembri "studio multimilionario"

> Documento vivo. Ogni regola è **azionabile** e **citata**. Aggiornato dai cicli di
> auto-verifica in `docs/cycles/`. Fonti raccolte via ricerca (librarian) nei cicli 0-1.

---

## 0. Principi guida (le 6 leggi)

1. **La silhouette comanda.** Riempita di nero, la figura/schermata deve leggersi
   istantaneamente. Se non regge in nero, nessuna ombreggiatura la salverà.
2. **Niente pixel misti.** Un solo "pixel virtuale". Scala intera + nearest-neighbor.
   Mai mescolare risoluzioni diverse nella stessa scena.
3. **Il game feel è timing, non asset.** Hit-stop, screenshake, anticipazione e
   overshoot contano più della grafica.
4. **Il gioco insegna senza testo.** Ogni meccanica ha un momento "a prova di stupido".
5. **Prestazioni = zero allocazioni nel loop.** Riusa, non creare, a 60fps.
6. **Verifica, poi committa.** Ogni ciclo: build + test + screenshot + FPS. Keep/revert.

---

## 1. Proporzioni umane (per l'IK)

Fonte: Proko/Dr. Paul Richer, Life Drawing Academy, Multic, Wikipedia *Body proportions*.

Canone **8 teste** (H = altezza testa = 1/8 altezza totale):

| Segmento | In teste (H) | Frazione altezza |
|---|---|---|
| Testa (diametro) | 1 H | 0.125 |
| Spalla→anca (acromion→ASIS) | 2 H | 0.250 |
| Anca→ginocchio (femore) | 2 H | 0.250 |
| Ginocchio→caviglia | ~1.75–2 H | 0.22–0.25 |
| Spalla→gomito (braccio) | 1.3–1.5 H | 0.16–0.19 |
| Gomito→polso (avambraccio) | 1–1.25 H | 0.125–0.156 |
| Mano | 0.75–1 H | 0.09–0.125 |
| Larghezza spalle (M) | 2 H | 0.250 |
| Larghezza bacino | 1.5 H | 0.19 |

**Regola d'oro per l'IK:** braccio totale (spalla→polso) ≈ **2.5–2.75 H**;
gamba totale (anca→caviglia) ≈ **3.75–4 H**. **Le gambe sono ~1.5× le braccia.**
Se le braccia sembrano "tentacoli", sono troppo lunghe rispetto al torso:
limita il braccio a ~2.5 H e la gamba a ~3.75 H.
> "The Femur measures 2 head units… The distance from the hip joint to the knee
> joint is twice the height of the head." — Proko / Life Drawing Academy

---

## 2. Pixel art a bassa risoluzione (16–32 px)

Fonti: SpriteGen, Pixnote, Pixels and Bloom, GDAD Wiki, Aseprite forum.

- **Le proporzioni realistiche muoiono sotto i ~64px.** Si "bara" verso una testa
  più grande e arti più spessi.
- **Rapporto testa/corpo per dimensione:**
  - 16×16 → 2–3 teste (testa ≈ 40–50% altezza)
  - 24×24 → 2.5–3.5 teste
  - **32×32 → 3–4 teste**
  - 48×48+ → 4–6 teste (verso il realistico)
- **Larghezza minima arto: 2px.** "A one-pixel arm flickers and disappears, especially once it animates."
- **Mani = moffole** fin sotto i 48px.
- **Silhouette test:** riempi di nero solido; se la posa non si legge, non salvare.
- **Depth su 2D:** arto davanti **più chiaro**, arto dietro **più scuro**.
- **Sel-out:** contorno esterno più scuro, interno più chiaro, per separare gli arti.
- **Il gomito/ginocchio si disegna come piega di 1px**, non come linea dritta —
  questo da solo uccide l'effetto "tentacolo".
- **Quando i piedi si muovono, muovi il corpo di 1px**: piedi che si muovono sotto
  un torso immobile leggono come "scivolamento", non come camminata.

---

## 3. Biomeccanica dell'arrampicata (la posa "X")

Fonte chiave: Dech & Kittel, *Biomechanical Principles and Techniques — A
Systematization for Sport Climbing*, MDPI Sports 2026. Più REI, Climbing.com.

- **Posizione "X" stabile:** "lowered CoM close to the wall, **bent knees, and
  almost fully extended arms**. The footholds are loaded via the big toes, which
  point outwards."
- **Braccia quasi distese (non piegate):** "Straight arms are happy arms.
  Straightening your arm allows your skeleton to take most of the weight."
  Su parete verticale: gomito ~160–170°, non 90°.
- **Un'anca contro il muro**, non le anche squadrate. "Beginners often keep hips
  squared to the wall… Try to keep **one hip pushed up against the wall**."
  → Questo è il fix del "frog legs".
- **Piedi direttamente sotto il corpo**, tallone basso, punta del piede verso
  l'esterno, carico sull'alluce.
- **Pattern contro-laterale (diagonale):** "one hand and its **contralateral leg**
  are loaded mainly… the force vector pulls from the main loaded hand and pushes
  from the **opposite foot**." → mano destra + piede sinistro insieme.
- **Drop knee (anti-frog):** "roll your knee in until the outside of your shoe
  rests on the hold and your knee actually **points down**." Regola: "drop the
  same knee as the hand you're reaching with."
- **Flagging:** una gamba si distende di lato contro il muro per bilanciare.
- **Modello in 3 fasi del movimento:** preparazione (spostamento del CoM) →
  fase principale (posizionamento mano/piede) → stabilizzazione.

---

## 4. Ciclo di arrampicata a 4 fasi

Fonti: Sandro Maglione (pixel-art climb), Charios (ladder climb), Animation Mentor.

1. **X-position (stabile):** mani sopra la testa quasi distese, ginocchia piegate,
   bacino basso e vicino al muro, un'anca al muro, punte rivolte in fuori.
2. **Reach (mano destra):** la destra si stacca e sale; il CoM si sposta a sinistra;
   **il piede sinistro carica** (diagonale).
3. **Pull/Push:** il piede sinistro spinge, il corpo sale; la destra afferra la
   nuova presa; la sinistra ora è più in basso.
4. **Mirror:** la mano sinistra si stacca, il piede destro spinge — ciclo.

> "switching hands and legs up and down" — Sandro Maglione
> "Since the legs of the sprite are too short to move up and down, the movement is
> expressed using only color shades." → a 22px, sono le **braccia** a portare la
> lettura del movimento; non animare troppo le gambe corte.

**Peso e inerzia:** "most characters climbing something use their legs to swing
and build momentum rather than muscling straight up with their arms alone."
Aggiungi una micro-pausa al picco della tirata.

---

## 5. IK a 2 segmenti — convenzioni di piega naturale

Fonti: Ryan Juckett (analytic 2-bone IK), Little Polygon (pole vector), CozyClay `ik.js`,
haotianblog (2D IK pitfalls), OpenStax 9.6 (anatomia), CDC ROM study, Kenhub (ginocchio).

**Anatomia (entrambe cerniere unlassiali):**
- **Gomito**: l'olecrano è **posteriore** → il gomito punta **indietro**. Flessione ~145–150°.
- **Ginocchio**: la rotula è **anteriore** → il ginocchio punta **avanti**. Flessione ~120–160°.

**Regola d'oro:** i due lati usano pieghe **speculari**: `bend_left = -bend_right`.
Mai piegare braccia/gambe dello stesso tipo verso lo stesso lato (errore "ragno").

**Matematica IK (schermo, +y in basso):**
```
dx=tx-sx; dy=ty-sy; d=hypot(dx,dy)
d = clamp(d, abs(l1-l2)+eps, l1+l2-eps)
a = (l1*l1 - l2*l2 + d*d)/(2d)
h = sqrt(max(0, l1*l1 - a*a))
ux=dx/d; uy=dy/d
nx=-uy; ny=ux                 // normale oraria su schermo
ex = sx + a*ux + bend*h*nx    // bend=+1 → gomito sul lato orario
ey = sy + a*uy + bend*h*ny
```
**Pole vector (CozyClay):** `armPole = -forward + (0,-0.5,0)` (gomiti piegano
indietro-basso); `legPole = forward + (0,-0.2,0)` (ginocchia piegano avanti-basso).

**Errori che rendono IK "spidery":** lati non speculari; gomiti verso l'alto;
ginocchia aperte simmetricamente (i ginocchi umani puntano avanti); clamp duro
all'estensione (usare **soft IK**: `d_soft = L - s*exp(-(d-(L-s))/s)`, `s≈3–8% L`);
segno di piega instabile frame-to-frame (isteresi); jitter amplificato vicino ai
limiti (lisciare il **target** prima di risolvere).

### 5b. Posa "X" e geometria osservata (da foto reali)

Consenso su parete verticale (foto Unsplash/Wikimedia analizzate):
mani **0.95–1.00 h**, testa 0.80–0.82 h, spalle **0.68–0.72 h**, bacino **0.50–0.55 h**,
ginocchia 0.30 h, piedi 0.00–0.15 h. Un piede "high-step" può arrivare al **livello
dell'anca (0.55 h)**. Gomiti quasi distesi (160–170°) su parete verticale.
→ **Proporzioni per `drawClimber` (h = altezza in piedi):** tronco spalla→anca **0.20 h**,
braccio **~0.155 h/segmento** (0.31 h totale), gamba **~0.235 h/segmento** (0.47 h
totale), testa **0.125 h**. Le gambe sono ~1.5× le braccia.

Sugli sprite ≤16 px gli artisti **eliminano** l'articolazione di gomito/ginocchio e
codificano la scalata con **alternanza degli arti + offset dei piedi**. Sopra i 32 px
tornano gomiti piegati e ginocchia visibili. A 22 px: braccia articolate, gambe
semplificate ma con piega visibile.

---

## 6. Game feel / juice

Fonti: Jan Willem Nijman *Art of Screenshake* (GDC 2013), Jonasson & Purho *Juice It
or Lose It*, Vlambeer, Steve Swink *Game Feel*, rozgames, Bugnet, easings.net.

- **Hit-stop:** pausa del gioco **~20 ms** all'impatto (freeze update, continua il render).
- **Screen shake:** modello a **trauma** (0..1), magnitudine = `trauma²`, rumore
  Perlin (non `rand()`), seed per asse. `decay≈0.5/s`, `max_translation≈20px`
  (→ **2–4 px** alla nostra risoluzione). Toggle di accessibilità obbligatorio.
- **Coyote time:** **4–6 frame** (67–100 ms) — Celeste 6, Hollow Knight ~4, Mario ~5.
- **Input buffering:** **0.05–0.15 s** (default ~0.10–0.12 s).
- **Squash & stretch:** volume costante; anticipazione = squash, impatto = squash
  esagerato, stretch al picco di velocità. Tieni la posa chiave **1 frame**.
- **Easing:** ease-out per chi arriva, ease-in per chi parte, ease-out-back per
  overshoot, ease-out-bounce/elastic per atterraggi giocosi; delay casuale per
  elemento negli "stagger".
- **Checklist juice:** tween pos/rot/scale, squash&stretch, wobble, flash bianco,
  particelle, screen shake, suono, occhi/personalità, ambiente che reagisce.

---

## 7. Prestazioni Canvas 2D

Fonti: MDN *Optimizing canvas*, Gaffer on Games *Fix Your Timestep*.

- **Pre-render** contenuto statico/ripetuto su canvas offscreen e blitta (già fatto
  per la parete).
- **Coordinate intere** (`Math.floor`): niente anti-aliasing sub-pixel.
- **Mai scalare dentro `drawImage`**: pre-scala alla dimensione di disegno.
- **`getContext('2d', { alpha: false })`** quando lo sfondo è opaco (win gratis).
- **Scala con CSS transform (GPU)**, non ri-renderizzando ad alta risoluzione.
- **Non moltiplicare per DPR** in un gioco pixel-art: distruggerebbe la griglia.
- **Fixed timestep + accumulatore** con interpolazione, clamp del frame time (0.25 s)
  per evitare lo "spiral of death".
- **Zero allocazioni nel loop:** riusa vettori, pool di particelle, niente literal.
- Evita `shadowBlur`, testo e cambi di stato inutili.

---

## 8. Level design e guida del giocatore

Fonti: GMTK (Mark Brown), Celia Hodent *The Gamer's Brain*, gamedeveloper.com,
Eurogamer (kishōtenketsu Nintendo).

- **Tutorial invisibile:** affordance (forma = funzione), skill gate (geometria che
  blocca finché non usi l'abilità), metodo dimostrativo (mostra il pericolo in
  sicurezza prima), contestuale (aiuta solo se bloccato a lungo).
- **Kishōtenketsu** (4 tempi): ki (introduzione) → shō (sviluppo) → ten (colpo di
  scena/ribaltamento) → ketsu (conclusione). Applicare per girone.
- **Signposting:** luce, colore, movimento e inquadratura guidano l'occhio; "squint
  test" per il cammino critico.
- **Carico cognitivo:** max **3 novità** insieme durante l'apprendimento.
- **Rossa = solo feedback critico.** Per una palette rosso/nero: il rosso più acceso
  = pericolo; tutto il resto più scuro/desaturo, così il segnale "pop".
- **Insegna facendo** (cinestetico), non leggendo; non assumere che il giocatore
  conosca le meccaniche.

---

## 9. Mobile + deploy file://

Fonti: MDN (viewport, touch, Web Audio best practices), web.dev.

- **`touch-action: none`** su canvas/html/body: elimina scroll, pinch-zoom,
  double-tap-zoom, pull-to-refresh, e il ritardo tap di 300 ms. Listener con
  `{ passive: false }`.
- **Viewport:** `width=device-width, initial-scale=1, viewport-fit=cover`. Evita
  `user-scalable=no` (iOS lo ignora).
- **Safe area:** `env(safe-area-inset-*)` con `viewport-fit=cover`.
- **Touch:** zone invisibili/drag, non bottoni visibili; converti le coord con
  `getBoundingClientRect()` (cache) e scala su `internalWidth/displayWidth`.
- **Audio unlock:** `ctx.resume()` **non basta** su iOS Safari: serve anche un buffer
  silenzioso (1 campione) dentro il gesture handler. Ri-sblocca su
  `visibilitychange`/`pageshow`.
- **Autoplay:** crea/riprendi l'AudioContext **dentro** un gesto utente.
- **Single-file:** asset inline come data-URI base64 (base64 gonfia ~33%); su
  `file://` niente `fetch` né import ES di moduli — un solo `<script>` classico.

