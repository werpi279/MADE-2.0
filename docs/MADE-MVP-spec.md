# MADE — MVP Specification

**M**anual **A**pproach in **D**igital **E**nvironment
Open-source, camera + voice driven 3D "clay" modeling for people with no modeling experience.

> Successor to the MAIDE thesis prototype (Pierstefano Bellani). MAIDE ran on a wrist IMU (T-Skin) + Blender + Python. MADE re-bases the same interaction philosophy on a **webcam + microphone**, runs **100% client-side in the browser**, and ships as a **free, open-source project on GitHub Pages**.

---

## 1. North Star

A blank space and your hands. You make a lump of digital clay appear by drawing in the air, then shape it the way a child shapes clay — pushing, pulling, stretching, squeezing — with a few **digital conveniences** layered on top (treat a sub-part as a unit, name it, recall it). It should feel like *the tool is helping me make something nice*, never like fighting software. No menus to learn, no modeling vocabulary required.

Three hard constraints frame every decision:

1. **Free to use** — runs in any modern browser from a static URL, no install, no account, no server cost.
2. **Free to develop** — entirely open-source libraries, MIT/Apache licensed, no paid APIs or keys.
3. **Buildable by an agent** — the spec is precise enough to hand to Claude Code and scaffold a working repo.

---

## 2. Design Principles (invariants)

These are the rules the whole system obeys. Every feature below is a consequence of these; implementation must not violate them.

| # | Principle | Why |
|---|-----------|-----|
| P1 | **Modeless.** No mode buttons or mode toggles. The *operation* is selected by world state + hand position + hand pose. | MAIDE testing showed mode toggles (grab-to-enter-extrusion) were the main friction; removing them made non-modelers fluent. |
| P2 | **Distance-to-object picks the layer.** Hand far from the object → navigate the whole workpiece. Hand at the surface → sculpt. A drawn loop → isolate a part. | One legible rule, learned once, reused everywhere. |
| P3 | **Hands = analog/spatial, Voice = symbolic/discrete.** Hands express *where / how much / what shape / which direction*. Voice expresses *commands, names, exact values, constraints*. | Plays each channel to its strength; offloads the things gestures are bad at (undo, "make it a cylinder", "40 mm"). |
| P4 | **Bimanual asymmetry (Guiard).** Non-dominant hand holds/orients/steadies the workpiece (macrometric). Dominant hand does the fine shaping (micrometric). Both act concurrently. | Lets a user turn the work to a good angle with one hand while shaping with the other — the reason two hands exist. |
| P5 | **Engagement requires a pinch / contact; passing by does not.** You only act on something when you deliberately pinch/touch it. Moving near it just previews. | Prevents accidental edits and accidental dismissals; gives a clean "grab → carry → release" model. |
| P6 | **Strong visible feedback substitutes for missing haptics.** In the air there is no resistance to feel, so every imminent action is shown *before* commit: highlights, influence blobs, ghost previews, translucent cages/spheres, magnitude readouts. | MAIDE's worst failures were invisible (selection you couldn't see, edits with no preview). Visibility is load-bearing, not polish. |
| P7 | **Object-centric, never camera-flying.** The user manipulates a held object/turntable; the camera is never "flown" through the scene. | MAIDE testing: users reversed pan/zoom because they couldn't tell if they were moving themselves or the object. Holding the object removes the ambiguity. |
| P8 | **Forgiving by default.** Smart guesses (part boundaries, falloff) are soft and correctable, never hard commitments. Smoothing is on. | The "this is helping me" feeling. |

---

## 3. Interaction Specification

The interaction is organized into **four layers**, selected automatically by P2 (where your hand is) and P1/P5 (pose + pinch). No layer is a "mode" the user enters; the system reads the situation.

```
            hand far from object            hand at the surface
            ┌────────────────────┐          ┌────────────────────┐
   empty →  │   (nothing yet)    │          │                    │
   space    │   CREATE material  │          │     SCULPT         │  ← material exists
            └────────────────────┘          └────────────────────┘
                     ▲                                 ▲
            ┌────────┴───────────┐          ┌──────────┴─────────┐
            │  NAVIGATE (sphere) │          │  ISOLATE (bubble)  │
            │  move/rotate whole │          │  drawn loop around │
            │  workpiece         │          │  a part            │
            └────────────────────┘          └────────────────────┘
```

### 3.A Creation — making material from nothing

Active when there is no material under the hand (or after the voice command "new"). The **double-action rule**: in empty space your motion *creates*; over existing material the same motion *sculpts* (§3.B). World state alone decides — no toggle.

| Gesture | Result | Recognition hint | Feedback |
|---|---|---|---|
| **Finger-pencil coil** — extend index finger, trace a path through space | Material accretes along the path in real time (a 3D "snake"/coil); the childhood "roll a clay snake" primitive | Index extended (landmark 8 far from palm), other fingers curled; track tip 8 over time as a polyline → sweep a tube | Tube grows live along the traced path; faint trail shows where material will land |
| **Coil thickness** — vary thumb–index gap while drawing | Sets the coil's cross-section radius | Distance(thumb tip 4, index tip 8) maps to tube radius | Live tube radius follows the gap; a small caliper readout |
| **Two-hand frame** — both hands, thumb+index of each forming an L or arc | Defines a flat footprint (circle or rectangle) | Four corner points = (thumb 4, index 8) of each hand; their spread defines the footprint | A translucent disc/rect appears at the framed size |
| **Pull frame apart** (separate hands along the framing axis) | Extrudes the footprint into height → disc → cylinder → pinched pot | Distance between the two hands' centroids → height | Solid grows upward as hands separate; ghost preview of final height |
| **Delete-by-toss** — index over existing material, then a quick throw-away flick away from the body | Removes material along the path | Index extended + high outward velocity of the hand/tip after being over geometry | The targeted material fades/lifts away with a toss animation |

> Note on Creation depth: a finger trace is naturally 2D-ish in image space. Map the index tip through the **interaction volume** (§5.2) so depth (toward/away) comes from landmark *z*; because *z* is the noisiest axis, the coil radius and accretion are tolerant (smoothing on the path).

### 3.B Manipulation (Sculpt) — shaping existing material

Active when the hand is at an object's surface. **Local by default** — there is no "select region then act"; you press where you want and the deformation falls off smoothly around your hand. This deliberately deletes the failure-prone selection step.

| Gesture | Result | Recognition hint | Feedback |
|---|---|---|---|
| **Push / Pull** — pinch (P5) on the surface and move in/out | Local indentation or protrusion in the direction of motion | Pinch detected near surface; deformation direction = hand velocity vector | **Influence blob**: the soft region that will deform lights up *before* you move; ghost preview of the result |
| **Influence size** — finger spread / palm openness | Sets the radius of the affected region: one fingertip = tight local dent; open palm = broad swell | Hand "openness" (mean fingertip distance from palm centroid) → falloff radius | The influence blob grows/shrinks with hand openness |
| **Axis stretch (non-proportional)** — grip two opposite sides (two pinch points, one or both hands) and pull apart | Stretches **only along the line between the hands** → circle becomes oval; axis = wherever the hands are (vertical = taller, horizontal = wider, front-back = deeper) | Two pinch points define a line; scale along that axis ∝ change in separation | Live axis indicator; geometry stretches along it only |
| **Uniform scale (proportional)** — *cup* the whole thing (two open palms cradling it) and move in/out | Scales all axes together → stays round | Two open palms facing each other around the object (cradle pose) vs two pinch points (grip pose) | Bounding cage scales uniformly |
| **Smoothing** | **ON by default** — geometry auto-relaxes so results look nice and never tear/twist | Background Laplacian relaxation pass on edited regions | Subtle; the surface "settles" after each edit |
| **Keep an edge sharp** — voice: "sharp" / "crease here" | Locks the edge under the hand against smoothing | Voice command targets the currently highlighted edge/region | The edge marks as a crease (visual tick) |
| **Precision override** — voice: "keep proportions", "make it 40 mm", "twice as wide" | Applies an exact constraint/value to the current manipulation | Voice → numeric/constraint into the active op | Readout confirms the locked value |

**Composition:** influence size (how *much* of the object) and proportional/non-proportional (cup vs grip) are **orthogonal** and combine freely. A tight grip near one spot pulls a local bump into an oval; a wide cup of the whole silhouette scales everything uniformly.

### 3.C Isolation — the Bubble (treat a part as a unit)

The "digital easy" superpower. Pure clay has no parts (pulling a teapot handle would drag the body). The bubble lets you isolate a sub-part and work it without the rest responding.

**Birth.** Trace a finger loop around/near a region. The loop need not be precise.

**Smart boundary — one rule: *prefer structure, fall back to geometry*.**

- **Structure path (preferred):** if the part is a distinct entity — modeled separately and later joined (a recorded boolean union), or a clean topological/connected component — the bubble **ignores the sloppy circle and snaps to the part's real extents**. Circle near the handle → it grabs exactly the handle. *Every join recorded by the system becomes a part the bubble can re-isolate perfectly later.*
- **Geometry path (fallback):** for one continuous lump with no seams, the bubble **invents a boundary** by auto-expanding into depth until it reaches natural cut lines — the **necks** where a feature narrows into the body (minima of the local thickness function, like where you'd intuitively snip a balloon animal) and **curvature ridges**.
- **Soft field, never a hard cut:** geometry at the center is fully captured, geometry near the boundary is partially weighted. So even a slightly-wrong boundary still *blends* at the neck instead of tearing.

**Three guarantees (so the bubble never recreates MAIDE's invisible-selection disaster):**

- **Visible** — a translucent volume you literally see, with the captured geometry lit up inside it.
- **Adjustable** — *cup or grip the bubble* to grow/shrink what it captured; if it took too little of the handle, just open your hands. The boundary is live, not committed.
- **Non-destructive** — the bubble is a *lens/scope*, not an edit. Editing happens only *through* it; popping it harms nothing. A wrong capture costs a poke, not an undo.

**Two ways to act (a pose distinction, no mode):**

- **Hands on the shell** → transform the captured part **as a unit** (cup the bubble → the whole handle scales up, blending at the neck). The bubble acts as a **cage**.
- **Reach inside, touch the geometry** → **sculpt the part in isolation**; the body is masked and won't follow. The bubble acts as a **mask**.

**Dismissal:**

- **Explicit:** point at the bubble and "blow"/poke it → it pops.
- **Implicit:** *engage* (pinch, per P5) another part → the current bubble pops automatically. **Passing near** another part does **not** dismiss it (reuses P5, so the bubble won't vanish out from under you on the way back).

**Deferred (post-MVP):** name a part by voice — circle once, say "call this the handle", then later "handle, 20% bigger" without re-circling. Naming attaches cleanly to a *structured* part, which is why structure-first quietly buys the voice layer later.

### 3.D Navigation — the Sphere (move/rotate the whole workpiece)

A **dashed, semi-transparent sphere** surrounds the object — the "thing you hold". It is the macrometric, non-dominant-hand layer (P4) and resolves the pan/zoom reversal (P7) by giving the user a held object instead of a camera to fly.

| State / gesture | Result | Recognition hint | Feedback |
|---|---|---|---|
| Hand approaches the sphere shell | Sphere **highlights** (ready to grab) | Hand position near bounding-sphere radius | Dashed sphere brightens |
| Hand moves inward toward the surface | Sphere **fades to a faint ghost**; object/sculpt layer lights | Hand crosses inward threshold | Sphere dims (kept as a faint ghost — your only depth gauge with no haptics) |
| **Grab the highlighted sphere** (pinch) + **twist wrist** | Rotate the object (up to ~half a turn per twist) | Pinch on shell + wrist roll (hand orientation delta) | Object rotates with the sphere |
| Grab + **travel the hand** | Move the object in X/Y/Z | Pinch on shell + hand translation | Object follows; both rotation and translation can happen at once (carry-and-turn) |
| **Two-hand turn** (grab the sphere with both hands and rotate like a globe) | Unlimited / precise rotation | Two hands on shell, relative angular motion | Globe-style rotation, no half-turn limit |
| **Pull the sphere toward you** | Bring the object closer (zoom-in) | Pinch on shell + inward translation | Object scales in view (fixes the zoom reversal: "bring it closer", not "move the world") |

**Zoom vs. Scale disambiguation (the eternal "make it bigger"):**

- **Cup the *sphere*** → zoom (view only, geometry unchanged).
- **Cup the *object*** → scale (real geometry changes).
- The highlight tells you which one your hand is on, so the same cupping gesture is never ambiguous.

> The "grab" here is **not** the forbidden mode-grab (P1). It is hold-and-carry: continuous while held, released when done (P5). That kind of grab was always fine.

---

## 4. Feedback & Visual Language

Because there is no touch, the screen carries all the "feel". Required feedback elements:

- **Layer highlight** — the element you're about to act on (sphere, object surface, or bubble) brightens on approach; everything else stays quiet.
- **Influence blob** — the soft region a sculpt will affect, shown before motion, sized by hand openness.
- **Ghost / onion preview** — a translucent preview of the result during a drag, committed on release.
- **Magnitude readouts** — small calipers/numbers for thickness, height, scale, rotation amount.
- **Sphere & bubble states** — dashed/solid, bright/ghost translucency communicate engaged vs. resting.
- **Audio cues (optional, light)** — soft ticks on engage / release / pop to confirm transitions.

---

## 5. System Architecture (client-only, GitHub Pages)

Everything runs in the browser. No backend, no database, no secrets in the repo. The webcam and microphone are accessed via standard browser APIs; the heavy ML model files are loaded from a public CDN so the repo stays small and static.

### 5.1 Pipeline

```
┌─────────┐   frames   ┌──────────────────┐  21×3D landmarks  ┌────────────────┐
│ webcam  │ ─────────► │ HandLandmarker   │ ────────────────► │ Pose / Gesture │
└─────────┘            │ (MediaPipe)      │   ×2 hands        │ Recognizer     │
                       └──────────────────┘                   └───────┬────────┘
┌─────────┐  audio     ┌──────────────────┐  text commands            │ intents
│  mic    │ ─────────► │ Web Speech API   │ ───────────────────────►  │
└─────────┘            └──────────────────┘                   ┌───────▼────────┐
                                                              │ Intent Resolver│
                                                              │ (state machine:│
                                                              │  world-state + │
                                                              │  hand-distance +│
                                                              │  pose → op)    │
                                                              └───────┬────────┘
                                                                      │ operations
                                                              ┌───────▼────────┐
                                                              │ Geometry Engine│
                                                              │ (Three.js +    │
                                                              │  mesh-bvh +    │
                                                              │  bvh-csg)      │
                                                              └───────┬────────┘
                                                                      │
                                                              ┌───────▼────────┐
                                                              │ Render loop +  │
                                                              │ Feedback layer │
                                                              └────────────────┘
```

### 5.2 Key components

- **Capture** — `getUserMedia` for camera + mic; render the video to an offscreen element fed to MediaPipe each frame (`detectForVideo`).
- **HandLandmarker** — MediaPipe Tasks Vision, `numHands: 2`, `runningMode: "VIDEO"`, GPU delegate. Returns 21 landmarks per hand (image-space x,y,z) plus world landmarks. Fingertip indices: thumb **4**, index **8**, middle **12**, ring **16**, pinky **20**; wrist **0**.
- **Pose / Gesture Recognizer** — pure functions over landmarks computing the MADE vocabulary: `isPinch`, `isPointing`, `handOpenness`, `isCupPose` (two open palms facing), `isGripTwoPoints`, `isFramePose` (two-hand L/arc), `tossVelocity`, `wristRoll`. Apply temporal smoothing (One-Euro / EMA filter) to fight jitter; debounce engage/disengage.
- **Interaction Volume / Mapping** — a virtual box in front of the user mapping normalized camera space → scene space. Hand x,y → a plane facing the user; hand z (relative) → depth. This *is* the "fictional working area" of the sphere, generalized. Because z is least reliable, prefer **relative deltas** for depth-driven ops and **two-hand distance** for absolute scale.
- **Intent Resolver** — the state machine implementing §3. Inputs: world state (is there material? is a bubble open?), hand-to-object distance (layer), pose, pinch state, voice intents. Output: a single active operation per hand. Enforces P1/P2/P5.
- **Geometry Engine** — see §5.3.
- **Speech** — Web Speech API (`SpeechRecognition`), continuous, small command grammar (`new`, `sharp`, `crease`, `undo`, `redo`, `bigger`, `smaller`, `keep proportions`, numbers/units). No dependency, no key.
- **Persistence / Export** — in-memory scene graph; **export to glTF / OBJ** via Three.js exporters (download to disk). Optional **localStorage** autosave of the scene JSON. No server.

### 5.3 Geometry representation — the one decision to make consciously

The clay metaphor can be built two ways. They are not equivalent; pick deliberately.

| Approach | What it is | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A. Mesh-based** (recommended for MVP) | Three.js `BufferGeometry`; sculpt = move vertices with falloff (spatial queries via three-mesh-bvh); join/cut = boolean via three-bvh-csg; smooth = Laplacian | Fast, light, GitHub-Pages-friendly; booleans + parts (handle-as-unit) are natural; exports cleanly | Not true gooey-clay blending; very high deformation can stretch topology | **Use for MVP.** Delivers every §3 interaction with good performance. |
| **B. Implicit / Voxel (SDF + marching cubes)** | Clay as a signed-distance/voxel field, re-meshed each frame | Authentic clay feel: lumps blend, add/remove material with no tearing, topology "just works" | Heavier (GPU/CPU), trickier to make snappy in-browser, parts/booleans less natural, harder export | **Defer.** The route to "more authentic clay" in a later version. |

**MVP path:** Approach A. Use **three-mesh-bvh** `closestPointToPoint` / `shapecast` for "which surface, how far → falloff weights"; **three-bvh-csg** `Brush` + `Evaluator` (`ADDITION` for joins, `SUBTRACTION` for cuts) for boolean ops, recording each union so the bubble can re-isolate parts (§3.C). For maximally robust joins/exports, **manifold-3d** (WASM) is an optional drop-in.

### 5.4 Hosting & build

- **Static SPA** built with **Vite**, output to `dist/`, deployed to **GitHub Pages** via a GitHub Actions workflow (`actions/deploy-pages`). Free for public repos.
- ML model + WASM loaded from CDN (jsDelivr / Google storage) so the repo and Pages payload stay small.
- HTTPS is provided by GitHub Pages — required for `getUserMedia` (camera/mic).
- MIT license, public repo, README with a one-paragraph "what it is" + live link + contributor guide.

---

## 6. Open-Source Library List

All free, permissively licensed, client-side. No paid services, no API keys.

| Role | Library | Package | License |
|---|---|---|---|
| Hand tracking (webcam → 21×3D landmarks, 2 hands) | **MediaPipe Tasks Vision** (`HandLandmarker`) | `@mediapipe/tasks-vision` | Apache-2.0 |
| 3D engine / rendering / scene graph | **Three.js** | `three` | MIT |
| Fast spatial queries / raycast / falloff | **three-mesh-bvh** | `three-mesh-bvh` | MIT |
| Boolean / CSG (join, cut) | **three-bvh-csg** | `three-bvh-csg` | MIT |
| Robust manifold booleans (optional, for clean joins/export) | **Manifold** | `manifold-3d` | Apache-2.0 |
| Speech recognition | **Web Speech API** (browser built-in) | — (no dependency) | W3C / browser |
| Build + dev server + static bundle | **Vite** | `vite` | MIT |
| Deploy to GitHub Pages | **GitHub Actions Pages** | `actions/deploy-pages` | free for public repos |
| Landmark smoothing (optional) | **One-Euro filter** (tiny, can be vendored) | — | MIT |

**Deferred (post-MVP) options:**

| Role | Library | License |
|---|---|---|
| Offline / private speech (replace Web Speech) | `vosk-browser` (Vosk WASM) | Apache-2.0 |
| Offline Whisper speech | `@xenova/transformers` (transformers.js) / whisper-web | Apache-2.0 |
| Implicit-surface clay (Approach B) | marching-cubes + custom SDF (or `gpu-io`/WebGPU) | MIT |

---

## 7. MVP Scope vs. Deferred

The line we kept hitting, drawn explicitly.

**In the MVP (first PoC that proves the interaction model):**

- Creation: finger-pencil coil (with thumb–index thickness), two-hand frame → extrude, delete-by-toss.
- Sculpt: local push/pull with hand-openness falloff + live influence blob; axis stretch (grip-and-pull); uniform scale (cup); smoothing on by default with voice "sharp".
- Bubble: loop birth, structure-or-geometry boundary, soft field, cup/grip to adjust, cage-vs-mask, poke/engage dismissal. **(Transient only.)**
- Navigation sphere: highlight/ghost states, grab + twist (rotate), grab + travel (move XYZ), two-hand globe rotate, pull-closer zoom, cup-sphere-vs-cup-object disambiguation.
- Feedback: layer highlight, influence blob, ghost preview, magnitude readouts, sphere/bubble states.
- Voice: small command set (`new`, `sharp`, `crease`, `undo`, `redo`, `bigger`, `smaller`, `keep proportions`, simple numbers).
- Export: glTF / OBJ download; optional localStorage autosave.
- Hosting: live on GitHub Pages, MIT, public.

**Deferred (next versions):**

- Voice **naming & recall** of parts ("call this the handle" → "handle, 20% bigger").
- Approach B **implicit/voxel clay** for authentic blending.
- **Offline/private speech** (Vosk / Whisper).
- Multi-object scenes & a richer boolean UX; precise dimensioning & real units.
- **Ergonomics program**: anti-"gorilla-arm" resting, clutch/re-grip for large moves, left/right-handed profiles & per-user calibration/training.
- AR/VR (HMD) target; real-time collaboration.

---

## 8. Claude Code — Bootstrap Injection Prompt

Paste the block below into Claude Code (see the Claude Code docs: https://docs.claude.com/en/docs/claude-code/overview) at the root of a fresh, empty repo. It encodes the philosophy, the verified stack, the scope, and an incremental build order so the agent doesn't drift.

```text
You are scaffolding and building an open-source web app called MADE
(Manual Approach in Digital Environment): a webcam + voice tool that lets
people with no 3D-modeling experience sculpt 3D "clay" with hand gestures.
It must run 100% client-side in the browser and deploy free to GitHub Pages.
There is NO backend, NO database, and NO secrets/API keys anywhere.

== NON-NEGOTIABLE CONSTRAINTS ==
- Client-only. All compute in the browser. Heavy ML model + WASM loaded from CDN.
- Free & open: only MIT/Apache libraries. License the repo MIT. Public repo.
- Deploy to GitHub Pages via a GitHub Actions workflow (actions/deploy-pages).
- Requires HTTPS (GitHub Pages provides it) for getUserMedia (camera + mic).

== STACK (already verified — use exactly these) ==
- Build: Vite (vanilla TS or JS; keep dependencies minimal).
- Hand tracking: @mediapipe/tasks-vision -> HandLandmarker
  (numHands: 2, runningMode: "VIDEO", GPU delegate). 21 landmarks/hand.
  Fingertips: thumb=4 index=8 middle=12 ring=16 pinky=20, wrist=0.
  Load WASM + hand_landmarker.task from jsDelivr / Google storage CDN.
- 3D: three (Three.js).
- Spatial queries / falloff: three-mesh-bvh (closestPointToPoint, shapecast).
- Booleans (join/cut): three-bvh-csg (Brush, Evaluator, ADDITION, SUBTRACTION).
- Speech: Web Speech API (SpeechRecognition) — no dependency, small grammar.
- Smoothing: small Laplacian pass (vendor a tiny One-Euro filter for landmarks).

== ARCHITECTURE ==
Modules (keep them separate and testable):
  capture/        getUserMedia, feed frames to MediaPipe each tick
  tracking/       HandLandmarker wrapper -> normalized landmark frames
  recognizer/     pure fns over landmarks: isPinch, isPointing, handOpenness,
                  isCupPose, isGripTwoPoints, isFramePose, tossVelocity, wristRoll
                  (temporal smoothing + debounce)
  mapping/        "interaction volume": camera space -> scene space. Depth (z)
                  is least reliable -> use relative deltas; two-hand distance for
                  absolute scale.
  intent/         STATE MACHINE = the heart. Inputs: world state (material?
                  bubble open?), hand-to-object distance (the active LAYER),
                  pose, pinch, voice intents. Output: one active op per hand.
  geometry/       Three.js scene; create primitives; tube/coil along a path;
                  push/pull vertex deformation with falloff (mesh-bvh); boolean
                  join/cut (bvh-csg) recording each union; Laplacian smoothing.
  feedback/       highlights, influence blob, ghost preview, magnitude readouts,
                  dashed sphere + translucent bubble states.
  speech/         Web Speech API; map commands to intents.
  io/             export glTF/OBJ (Three exporters); optional localStorage save.

== INTERACTION MODEL (implement exactly; it is MODELESS — no mode buttons) ==
The OPERATION is chosen by: world state + hand distance to object + hand pose.
Four layers, auto-selected:
  CREATE (empty space): finger-pencil coil draws a tube (thumb–index gap =
    thickness); two-hand frame -> pull apart -> extruded disc/cylinder;
    index + throw-away flick over material = delete.
  SCULPT (hand at surface): pinch + move = local push/pull, LOCAL BY DEFAULT
    with falloff radius = hand openness, shown as an influence blob before
    motion; grip two sides + pull = axis-only stretch (circle->oval); cup the
    object + move = uniform scale; smoothing ON by default; voice "sharp" locks
    an edge.
  ISOLATE (drawn loop around a part) = the "bubble": prefer STRUCTURE (snap to
    a recorded part / boolean union), else GEOMETRY (expand to necks = thickness
    minima, and curvature ridges). Soft field (blends at boundary). The bubble
    is VISIBLE, ADJUSTABLE (cup/grip to grow/shrink capture), and NON-DESTRUCTIVE
    (a lens, not an edit). Hands on shell = transform part as a unit (cage);
    reach inside = sculpt part in isolation (mask). Dismiss by poking it, or by
    pinching another part (passing near it does NOT dismiss).
  NAVIGATE (hand far from object) = the "sphere": a dashed translucent sphere
    around the object; highlights on approach, fades to a faint ghost when the
    hand moves in to sculpt. Grab sphere + twist wrist = rotate (~half turn);
    grab + travel = move XYZ; two hands = globe rotate (unlimited); pull toward
    you = zoom closer. Cup the SPHERE = zoom (view); cup the OBJECT = scale
    (geometry).

Engagement always requires a deliberate pinch/contact; merely passing near
something only previews and never edits or dismisses.

== BUILD ORDER (ship a runnable thing at each step; commit per milestone) ==
M0  Repo scaffold: Vite + TS, MIT license, README, GitHub Actions -> Pages.
    Deploy a "hello" page and confirm the live URL works.
M1  Camera + HandLandmarker: webcam on, draw the 21 landmarks of both hands on
    a canvas overlay at interactive frame rate.
M2  Three.js scene + the navigation SPHERE: render a placeholder object inside a
    dashed sphere; implement grab+twist rotate, grab+travel move, two-hand
    globe rotate, pull-closer zoom, highlight/ghost states.
M3  CREATE: finger-pencil coil (tube along index-tip path, thumb–index radius);
    two-hand frame -> extrude; delete-by-toss.
M4  SCULPT: local push/pull with falloff (mesh-bvh) + influence blob preview;
    axis stretch; cup uniform scale; Laplacian smoothing on by default.
M5  BUBBLE: loop birth; structure-or-geometry boundary; cup/grip adjust;
    cage-vs-mask; poke/engage dismissal. Use bvh-csg for joins/cuts and record
    unions so parts can be re-isolated.
M6  SPEECH (Web Speech API): new, sharp, crease, undo, redo, bigger, smaller,
    keep proportions, simple numbers.
M7  Feedback polish + export (glTF/OBJ) + optional localStorage autosave.

== ACCEPTANCE (MVP is done when) ==
A first-time user, with only a webcam + mic and no instructions beyond on-screen
hints, can: summon clay, sculpt a recognizable shape, isolate and resize one
sub-part via the bubble, rotate/move/zoom the result via the sphere, and export
it — all live in a browser tab served from GitHub Pages, with no install/login.

Start at M0. After each milestone, summarize what works and what's stubbed,
then continue. Keep the interaction MODELESS and the feedback VISIBLE — these
are the two things that make or break the product.
```

---

## 9. Open Questions & Risks

- **Depth axis (z)** is the camera's weakest signal. Lean on relative deltas, two-hand distance for absolute scale, and generous smoothing. Revisit if push/pull-in-depth feels mushy.
- **"Gorilla arm"** — sustained mid-air gestures tire the arms (flagged in MAIDE testing). MVP must at least allow frequent resting and short gestures; a full ergonomics pass (clutch/re-grip, lower working plane) is deferred but should be designed early.
- **Mesh vs. implicit clay (§5.3)** — Approach A delivers the MVP; if the clay "feel" tests as too rigid, Approach B is the upgrade path.
- **Web Speech API** sends audio to a browser-vendor service in some browsers and has uneven cross-browser support. Fine for MVP/free; swap to Vosk/Whisper-web for offline/private later.
- **Pose disambiguation** — cup vs. grip vs. frame must be reliably separable from landmarks. Budget tuning time on thresholds + temporal voting; consider a tiny on-device classifier if hand-tuned rules are brittle.
- **Recognition without per-user training** — MAIDE found accuracy dropped for untrained users. A short optional calibration ("show me an open hand / a pinch") could be added cheaply.
```
