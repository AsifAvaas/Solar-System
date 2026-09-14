# A Satellite in Orbit

CG Lab project — Three.js. A satellite built from primitive geometries orbits
a textured Earth, set inside a small solar system (Sun + all 8 planets)
that gives the scene scale and a real light source.

## Requirements covered

- **Custom shaders** — Earth's surface is a hand-written `ShaderMaterial`
  (see [src/earth.js](src/earth.js)): the vertex shader passes world
  normal/position, the fragment shader computes Lambert diffuse lighting
  against the Sun's position itself, with a soft terminator and an
  ambient floor standing in for the scene's ambient light. Everything
  else uses `MeshStandardMaterial`/`MeshBasicMaterial`.
- **Lighting** — a single `THREE.PointLight` at the Sun's position (the
  sole light source in the scene) plus a faint ambient fill; Earth's
  shader (above) does its own lighting math against the same Sun
  position rather than relying on the built-in light.
- **Perspective projection** — `THREE.PerspectiveCamera`.
- **Texture for each object** — every material uses a procedurally
  generated `THREE.CanvasTexture` (no external image assets): satellite
  hull foil, brushed metal, solar cells, dark chassis, Earth's day map +
  clouds, banded gas-giant textures, rocky textures, etc. See
  [src/textures.js](src/textures.js), [src/earth.js](src/earth.js),
  [src/planets.js](src/planets.js).
- **Animation** — the satellite orbits Earth (fast, always visible);
  Earth and the other 7 planets self-rotate on their own axis at full
  speed, while their orbit around the Sun is slowed to near-static so the
  satellite's motion stays the one thing that reads as clearly moving.
- **Mouse interaction** — while focused on the satellite (see below),
  left-click cycles its hull texture through 5 liveries.
- **Keyboard interaction** — number keys `0`-`9` jump the camera to a
  body; while focused on the satellite, arrow keys orbit the camera
  around it.

## Run it

```
npm install
npm run dev
```

Open the printed `localhost` URL.

## Controls

- Drag to orbit the camera, scroll to zoom (`OrbitControls`).
- `0`-`9` — jump camera focus: `0` Sun, `1`-`8` Mercury → Neptune in
  distance order, `9` Satellite.
- While focused on the satellite (`9`):
  - Arrow keys — orbit the camera around the satellite.
  - Left-click — cycle the satellite's hull texture.
- `H` — toggle the on-screen instructions panel.
- `P` — pause/resume all orbiting, spinning, and shadow-fade animation
  instantly. Camera navigation (drag, zoom, focus jumps, arrow-key
  satellite orbit) stays live while paused.

## Notable implementation details

- **Scale**: real astronomical ratios would make the scene unusable (the
  satellite would be an invisible speck, Neptune millions of units away).
  Sizes and distances are compressed but kept *proportional* — every
  planet's radius and orbital distance is its real ratio to Earth's,
  multiplied by one shared unit (`earthRadius`, `auUnit`), so relative
  scale between bodies is accurate even though the absolute numbers
  aren't to real-world scale.
- **Orbit speed**: real orbital periods (∝ distance^1.5) would make outer
  planets imperceptibly slow in a short demo, so speed instead falls off
  as distance^-0.5 — order (closer orbits faster) is preserved, motion
  stays watchable.
- **Satellite eclipse**: when the satellite passes behind Earth (away
  from the Sun), it darkens — computed each frame via simple vector
  geometry (is it inside Earth's shadow cylinder?) rather than real
  point-light shadow mapping, which would need an impractical near/far
  depth range at this scale.
- **Sun visibility**: the Sun's glow sprite keeps its real fixed size
  (shrinks with distance like anything else) and is only floored to a
  minimum on-screen pixel size once perspective would shrink it away —
  so it never disappears, but also never balloons or changes hue as you
  zoom out.

## File structure

```
index.html          entry point
src/
  main.js            scene setup, lighting, camera focus, animation loop
  satellite.js        satellite model (primitives) + hull texture cycling
  earth.js             Earth: day map, clouds, atmosphere
  sun.js                Sun: core + glow sprite
  planets.js            the other 7 planets + orbit rings
  orbitLine.js            shared white orbit-ring helper
  textures.js              procedural canvas textures for the satellite
```
