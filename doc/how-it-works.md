# How the Code Works

This document walks through the project file by file, explaining what each
piece does, why it's built the way it is, and which code implements which
assignment requirement. For a quick controls reference and setup
instructions, see the top-level [README.md](../README.md) instead — this
document is the deeper "how" behind it.

## Stack

Plain [three.js](https://threejs.org/) (`^0.186.0`) + [Vite](https://vitejs.dev/)
(`^6.4.3`) as a dev server/bundler. No framework, no state library — one
`<script type="module">` entry point, a handful of ES modules, each
exporting a factory function that returns a `THREE.Group` or `THREE.Mesh`.

```
index.html          — page shell, HUD overlay markup
src/
  main.js            — scene setup, scale math, animation loop, all input handling
  satellite.js        — satellite model + eclipse dimming + texture cycling
  earth.js              — Earth: shader-lit surface, clouds, atmosphere
  sun.js                  — Sun: core + glow sprite
  planets.js                — the other 7 planets + their orbit rings
  orbitLine.js                — shared white orbit-ring helper
  textures.js                    — procedural canvas textures for the satellite
```

## Requirement → code map

| Requirement | Where it lives |
|---|---|
| Custom shaders | [earth.js](../src/earth.js) — hand-written GLSL vertex + fragment shader on Earth's surface material |
| Lighting | one `THREE.PointLight` at the Sun's position ([main.js](../src/main.js)); Earth's shader does its own manual lighting math against the same position |
| Perspective projection | `THREE.PerspectiveCamera` in [main.js](../src/main.js) |
| Texture per object | every material has a `.map` from a procedurally generated `THREE.CanvasTexture` — see [textures.js](../src/textures.js), [earth.js](../src/earth.js), [planets.js](../src/planets.js), [sun.js](../src/sun.js) |
| Animation | orbits, axial spin, eclipse fade — all in the `animate()` loop in [main.js](../src/main.js) |
| Keyboard interaction | digit keys (focus), arrow keys (orbit camera around satellite), `H` (instructions), `P` (pause) — [main.js](../src/main.js) |
| Mouse interaction | left-click cycles the satellite's hull texture — [main.js](../src/main.js) + [satellite.js](../src/satellite.js) |
| Satellite object, textured | [satellite.js](../src/satellite.js) |
| Earth object, textured | [earth.js](../src/earth.js) |
| Satellite orbits Earth | nested pivot groups — see "Scene graph" below |

## index.html

The page shell. No canvas element is written by hand — three.js creates
`renderer.domElement` and `main.js` appends it to `<body>` at runtime. Two
plain `<div>`s make up the HUD, both pure HTML/CSS with no JS logic of
their own:

- `#hint` — the persistent "Press [H] for instructions" label, top-left.
- `#instructions` — the full control list, `hidden` by default. Its
  `hidden` attribute is toggled from `main.js`, not from any script in
  this file.

Everything else (camera, lights, models, input) is set up in
`src/main.js`, loaded as `<script type="module" src="/src/main.js">`.

## main.js — the orchestrator

This is the only file that knows about the whole scene. Every other
module is a self-contained factory that hands back objects for this file
to place, scale, and animate.

### Scene basics

```js
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000); // far is raised later
const renderer = new THREE.WebGLRenderer({ antialias: true });
const controls = new OrbitControls(camera, renderer.domElement);
```

`OrbitControls` handles mouse drag-to-rotate and scroll-to-zoom. Nothing
else drives the camera directly — even the keyboard features below work
*through* `OrbitControls` by moving `camera.position` and
`controls.target` and letting `controls.update()` reconcile them.

### The scale chain

Real astronomical numbers don't render usefully — the satellite would be
an invisible speck next to a real-scale Earth, and Neptune would sit
millions of units away. Instead, every size and distance in the scene is
derived from one starting measurement, keeping *relative* proportions
accurate while compressing the *absolute* scale to something navigable:

```js
const satBounds = new THREE.Box3().setFromObject(satellite);
const satMaxSpan = /* satellite's widest dimension */;

const earthRadius = satMaxSpan * 3;
const SUN_SCALE = 20;
const auUnit    = earthRadius * 22 * SUN_SCALE;   // world units per 1 AU
const sunRadius = earthRadius * 6  * SUN_SCALE;
```

From there, every planet's actual radius is `earthRadius * (its real
ratio to Earth)` and its distance from the Sun is `auUnit * (its real AU
distance)` — see [planets.js](../src/planets.js). Because both numbers
scale off the same real ratios, the planets stay correctly proportioned
to each other and to Earth, even though nothing here matches real-world
units.

`SUN_SCALE = 20` scales *both* the Sun's radius and `auUnit` by the same
factor — the ratio between the Sun's size and 1 AU stays what it was
before, and every planet's orbit stays clear of the Sun's now-much-bigger
surface without needing per-planet clearance hacks.

### Scene graph — how the satellite ends up in orbit around an orbiting Earth

```
scene
 ├─ sun                                  (fixed at origin)
 ├─ PointLight                            (also at origin)
 ├─ earthOrbitPivot                        (rotates → Earth's revolution around the Sun)
 │    └─ earthGroup                         (offset to earthDistance)
 │         ├─ earth                          (the Group from earth.js)
 │         └─ satOrbitPivot                    (rotates → satellite's orbit)
 │              └─ satellite                    (offset to satOrbitDistance)
 └─ 7× planet.pivot                       (each rotates → that planet's revolution)
      └─ planet.mesh                        (offset to that planet's distance)
```

The satellite is nested *inside* Earth's own orbit group. Rotating
`earthOrbitPivot` moves Earth *and* carries the satellite's whole
sub-orbit along with it automatically — nothing has to manually re-sync
the satellite's world position to Earth's each frame. This is the
standard three.js pattern for "orbit around a thing that's itself
orbiting something else": an empty `Group` as the pivot, the actual
mesh offset from that pivot's origin, rotate the pivot.

### The animation loop

```js
function animate() {
  requestAnimationFrame(animate);
  if (!paused) {
    earthOrbitPivot.rotation.y += ORBIT_SPEED_EARTH;   // Earth's revolution — slow
    satOrbitPivot.rotation.y  += 0.0025;                // satellite's orbit — fast
    satellite.rotation.y      += 0.003;                 // satellite's own spin — fast
    earth.userData.surface.rotation.y += 0.0006;        // axial spin — full speed
    earth.userData.clouds.rotation.y  += 0.0009;
    planets.forEach((p) => {
      p.pivot.rotation.y += p.orbitSpeed * SLOW;         // revolution — slow
      p.mesh.rotation.y  += p.spinSpeed;                  // axial spin — full speed
    });
  }
  // ...eclipse check, sun glow clamp, camera focus-chase, arrow-key orbit...
  controls.update();
  renderer.render(scene, camera);
}
```

Two different "speeds" are deliberately mixed: **revolution** (orbiting
around a parent body) is multiplied by `SLOW = 0.03` so the whole system
reads as nearly static except for the one thing meant to draw the eye —
the satellite orbiting Earth. **Axial spin** (a body turning on its own
axis) runs at full, unscaled speed, so "the planets rotate on their own
axis" stays a clearly visible, distinct animation from their (deliberately
slowed) orbits.

`if (!paused)` wraps only the motion — camera navigation, the sun's
glow-size clamp, and the focus-chase logic all keep running even while
paused, so you can still look around a frozen scene.

### The eclipse effect (no shadow maps)

When the satellite passes behind Earth, away from the Sun, it should go
dark. A real point-light shadow map from the Sun's position was tried and
rejected: the near/far depth range would have to stretch from close to
the Sun's core out past Earth's orbit (tens of thousands of world units)
down to the satellite's own tiny local orbit (tens of units) — nowhere
near enough depth-buffer precision to resolve a shadow correctly at that
ratio.

Instead, it's computed with plain vector geometry every frame: treat
Earth's shadow as an infinite cylinder of radius `earthRadius`, extending
straight away from the Sun through Earth's center.

```js
_sunToEarth.copy(earthWorldPos).normalize();        // Sun sits at the origin
_earthToSat.copy(satWorldPos).sub(earthWorldPos);
const along    = _earthToSat.dot(_sunToEarth);        // how far behind Earth (along the shadow axis)
const perpDist = _earthToSat.clone()
  .addScaledVector(_sunToEarth, -along).length();     // distance from the shadow's central axis
const eclipsed = along > 0 && perpDist < earthRadius;
```

`along > 0` means the satellite is on the far side of Earth from the Sun;
`perpDist < earthRadius` means it's within the cylinder's radius, not off
to the side where sunlight would still reach it. The result eases toward
a target brightness (`0.12` eclipsed, `1` lit) rather than snapping, so
crossing the shadow boundary fades instead of flickers, and
`setSatelliteShadowFactor()` (in `satellite.js`) applies it.

### Keeping the Sun visible at any zoom, without it "blooming"

Two competing goals: the Sun should never shrink into invisibility even
when the camera is zoomed out past all 8 planets, but it also shouldn't
visually balloon into a giant halo as you back away — that's not how a
real star looks (there's no medium in vacuum to scatter light outward;
distance just makes it a smaller, still-bright point).

The fix keeps the glow sprite's *real* size fixed (`sun.userData
.baseGlowSize`, set once in `sun.js`) so it shrinks with normal
perspective like anything else, and only overrides that with a
distance-scaled floor once perspective would otherwise shrink it below a
minimum pixel footprint:

```js
const pixelWorldSize = (2 * camDistToSun * Math.tan(degToRad(camera.fov / 2)))
  / renderer.domElement.clientHeight;
const minGlowSize = MIN_GLOW_PIXELS * pixelWorldSize;
sun.userData.glow.scale.setScalar(Math.max(sun.userData.baseGlowSize, minGlowSize));
```

Close up, `baseGlowSize` wins and the glow looks exactly as designed. Zoom
out far enough and `minGlowSize` (which grows just fast enough to hold a
constant `MIN_GLOW_PIXELS`-tall footprint on screen) takes over, so the
Sun never disappears — the same trick real-time space visualizations use
for distant stars.

### Camera focus system (keys 0–9)

`getFocusInfo(name)` returns `{ pos, radius }` for whichever body is
named — the Sun (fixed at the origin), Earth (`earthGroup`'s world
position), the Satellite (`satellite`'s world position), or one of the 7
planets (`planet.mesh`'s world position, looked up by name in
`planetByName`). `setFocus(name)` uses that to place the camera at a
distance proportional to the body's own radius (or, for Earth, wide
enough to keep the orbiting satellite in frame too) and points
`controls.target` at it.

Because these bodies keep moving, every frame re-reads the focused body's
current position and *translates* the camera by however far it moved
since last frame — not by resetting the camera outright — so any manual
drag/zoom you've done since focusing is preserved while the camera keeps
tracking the target:

```js
const focusPos = getFocusInfo(focusedName).pos;
camera.position.add(focusPos.clone().sub(prevFocusPos));
controls.target.copy(focusPos);
prevFocusPos.copy(focusPos);
```

### Arrow-key orbit around the satellite

Active only while `focusedName === 'Satellite'`. Held arrow keys are
tracked in a `Set` (not handled purely in the `keydown` event) so the
rotation is smooth for as long as a key stays down, not a single step per
press. Each frame, the camera's current offset from the satellite is
rotated around the world-up axis (left/right, yaw) or around the
perpendicular axis (up/down, pitch), with the pitch clamped to 8°–172° so
it can't spin through the poles and flip upside down.

### Left-click texture cycling

Detected manually — `pointerdown` position is recorded, and on
`pointerup` the movement distance is checked against a 5px threshold —
rather than using the browser's native `click` event, specifically so
that dragging the mouse to orbit the camera (via `OrbitControls`) doesn't
also accidentally cycle the texture. Gated to `focusedName === 'Satellite'`.

## satellite.js

Builds the satellite as a `THREE.Group` from primitive geometries only
(`BoxGeometry`, `CylinderGeometry`, `ConeGeometry`, `SphereGeometry`,
`LatheGeometry` for the parabolic dish reflectors) — no imported model.
`buildBus()`, `buildSolarWing()`, and `buildLateralDish()` are separate
builder functions composed together in `createSatellite()`.

Seven materials are shared across the model's many meshes: gold foil
(bus body), brushed silver (struts, booms, rails), dark chassis (thruster
nozzles, hinges, star trackers), solar-cell blue (panel faces), white
quilt (radiators, propellant tanks), matte black (camera lenses), and a
`LineBasicMaterial` for the solar panel's cell-grid overlay lines. Each
gets a `.map` texture from `textures.js`; the metal materials also get a
matching `.bumpMap` for subtle relief.

Two exported functions let `main.js` reach into this otherwise
self-contained module:

- **`setSatelliteShadowFactor(factor)`** — every material's `userData
  .baseColor` is cached once at module load. Calling this multiplies each
  material's live `.color` by `factor`, which is how the eclipse-darkening
  effect actually renders: not a real shadow, a color tint applied to
  every satellite material together.
- **`cycleSatelliteTexture()`** — swaps just the bus body material's
  `.map`/`.bumpMap` to the next entry in a small array of alternate
  foil textures (gold → silver → red → blue → stealth-black), each
  generated by calling `mliFoilTexture()` (from `textures.js`) with a
  different base color. Only the body's texture changes; panels, struts,
  and dishes keep their own materials untouched.

## earth.js

Builds Earth as three nested spheres: `surface` (the custom-shaded day
side), `clouds` (a transparent shell at `radius * 1.01`), and
`atmosphere` (a `BackSide`, additively-blended rim glow at `radius *
1.05` for a soft limb-light effect).

### The custom shader

This is the project's one hand-written `ShaderMaterial` — everything else
uses three.js's built-in materials. The vertex shader's job is just to
hand the fragment shader two things in world space (not the default local
object space, since lighting needs to be computed relative to the Sun's
actual world position):

```glsl
// vertex shader
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
```

The fragment shader computes Lambertian diffuse lighting by hand — the
same `max(dot(N, L), 0)` idea a built-in material does internally, just
written out explicitly — against a `lightPos` uniform (synced from the
Sun's actual position each frame in `main.js`), with a soft
`smoothstep`-based day/night terminator instead of a hard clamp, and a
flat `ambientStrength` floor standing in for the scene's `AmbientLight`
(which a `ShaderMaterial` doesn't receive automatically — only built-in
materials read scene lights):

```glsl
// fragment shader
vec3 N = normalize(vWorldNormal);
vec3 L = normalize(lightPos - vWorldPosition);
float lit = smoothstep(-0.2, 0.15, dot(N, L));
vec3 color = texture2D(dayMap, vUv).rgb * lightColor * mix(ambientStrength, 1.0, lit);
```

`modelMatrix`, `viewMatrix`, `projectionMatrix`, `position`, `normal`,
and `uv` are all built-in attributes/uniforms three.js's `ShaderMaterial`
injects automatically — they don't need declaring.

### Procedural day map

`dayMapTexture()` builds an equirectangular texture by hand on a
`<canvas>`: an ocean gradient base, several clusters of overlapping soft
ellipses in graduated greens/browns for continents (`blobCluster()`),
white gradient bands at the top/bottom for polar ice caps, and a faint
lat/long grid overlay. `cloudMapTexture()` scatters soft white ellipse
puffs at varying alpha across a transparent canvas for the cloud layer.

## sun.js

The core sphere uses `MeshBasicMaterial` — deliberately *not* affected by
lighting, since it's the thing emitting the light. The glow is a
`THREE.Sprite` (always faces the camera) with a `SpriteMaterial` using
`AdditiveBlending` and a radial-gradient canvas texture
(`glowTexture()`), giving the soft falloff halo. `sun.userData
.baseGlowSize` is exposed specifically so `main.js`'s per-frame
pixel-floor clamp (described above) has the sprite's true, un-clamped
design size to compare against.

## planets.js

`PLANET_DATA` is a plain array — one entry per planet, each carrying its
real `radiusRatio` and `auDistance` (both relative to Earth = 1), a
small color palette, and flags for whether it needs banded-gas-giant
texturing (`bands`) or a ring (`ring`, Saturn only).

`createPlanet(data, earthRadius, auUnit)` does the actual building:
multiplies the ratios into real world-unit radius/distance, picks
`bandedTexture()` (horizontal color bands plus scattered turbulence
streaks plus a Great-Red-Spot-style blob) or `rockyTexture()` (scattered
soft-alpha color splotches) depending on the `bands` flag, and — for
Saturn — builds a `RingGeometry` with its UVs manually remapped from
radial to linear (`RingGeometry`'s default UVs would stretch a banded
texture wrong) so `ringTexture()`'s concentric bands read correctly
outward from the planet.

Each planet gets its own orbit pivot with a **random starting angle**
(`pivot.rotation.y = Math.random() * Math.PI * 2`) so the 7 planets don't
all start lined up on the same ray from the Sun. `orbitSpeed` is computed
as `ORBIT_SPEED_BASE / Math.sqrt(auDistance)` rather than the real
Kepler relationship (period ∝ distance^1.5) — the real ratio would make
Neptune take roughly 70× longer than Mercury to complete a visible arc of
its orbit, unwatchable in a short demo. The `^-0.5` compromise keeps
"closer orbits faster" true while every planet still visibly moves within
about a minute.

## orbitLine.js

One small shared helper, `createOrbitLine(radius, options)` — walks a
circle in the XZ plane and returns it as a `THREE.LineLoop` with a
translucent white `LineBasicMaterial`. Used identically for the
satellite's ring around Earth and every planet's ring around the Sun, so
there's one implementation instead of two near-duplicate ones.

## textures.js

Every texture the satellite uses is generated at runtime on an offscreen
`<canvas>` with the 2D drawing context — gradients, `arc()`/`ellipse()`
calls, per-pixel noise via `getImageData`/`putImageData`, stroked lines —
then wrapped in a `THREE.CanvasTexture`. No image files exist anywhere in
this project. Functions: `mliFoilTexture()` (crinkled quilted foil, used
for gold/silver/red/blue/black satellite liveries), `brushedMetalTexture()`
(directional noise streaks), `darkChassisTexture()` (per-pixel grain plus
rectangular seams and rivets), `solarCellTexture()` (a grid of individual
photovoltaic cells with diagonal glints and conductive strips),
`whiteQuiltTexture()` (radiator/MLI blanket quilting), and `lensTexture()`
(a small radial-gradient glint for camera lenses).

`createProceduralTextures()` bundles the default set used at satellite
construction; `mliFoilTexture()` is also exported individually so
`satellite.js` can call it again with different colors for the
click-to-cycle livery palette.
