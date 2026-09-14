import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createSatellite, setSatelliteShadowFactor, cycleSatelliteTexture } from './satellite.js';
import { createEarth } from './earth.js';
import { createSun } from './sun.js';
import { createOrbitLine } from './orbitLine.js';
import { PLANET_DATA, createPlanet } from './planets.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// preview-only orbit controls — swapped for the keyboard rig in a later pass
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// faint deep-space fill so shadowed faces aren't pure black — deliberately
// dim relative to the sun, which is the only real light source below
const ambient = new THREE.AmbientLight(0x334466, 0.15);
scene.add(ambient);

const satellite = createSatellite();

// Size Earth relative to the satellite's own bounding box rather than a
// hardcoded guess, so it stays correct if the satellite model changes.
const satBounds = new THREE.Box3().setFromObject(satellite);
const satSize = new THREE.Vector3();
satBounds.getSize(satSize);
const satMaxSpan = Math.max(satSize.x, satSize.y, satSize.z);

// Earth diameter ~6x the satellite's widest span — clearly planet-scale
// while the satellite stays big enough to read as a detailed object next
// to it (true astronomical scale would shrink it to an invisible speck).
const earthRadius = satMaxSpan * 3;

// Sun is 20x its earlier size, so every orbit distance is scaled up by the
// same 20x — that keeps Mercury (the innermost, tightest orbit) clear of
// the Sun's much bigger surface, and preserves the original ratio between
// the Sun's radius and 1 AU rather than just shoving planets out by an
// arbitrary amount.
const SUN_SCALE = 20;

// 1 AU expressed in world units — every planet's Sun-distance below is
// this times its real distance in AU, so relative spacing between planets
// is exactly true even though the absolute scale is compressed to fit a
// navigable scene (true AU units would put Neptune ~600,000x Earth's own
// radius away).
const auUnit = earthRadius * 22 * SUN_SCALE;

// --- Sun: true center of the system, and the sole light source ---------
const sunRadius = earthRadius * 6 * SUN_SCALE;
const sun = createSun(sunRadius);
scene.add(sun);

// A point light at the Sun's position radiates outward in every direction,
// which is what a system with planets all around a central star needs
// (a single DirectionalLight only models light arriving from one fixed
// direction). decay is left at 0 so distant planets stay visibly lit
// rather than fading to black — a deliberate demo simplification over
// physically-accurate inverse-square falloff.
const sunLight = new THREE.PointLight(0xfff4e0, 3.5, 0, 0);
sunLight.position.set(0, 0, 0);
scene.add(sunLight);

// --- Earth + its satellite, orbiting the Sun ----------------------------
const earthDistance = auUnit * 1.0;
const earthOrbitPivot = new THREE.Group();
earthOrbitPivot.name = 'earthOrbitPivot';
// random starting point on the orbit, same reason as the other planets
earthOrbitPivot.rotation.y = Math.random() * Math.PI * 2;
scene.add(earthOrbitPivot);

const earthGroup = new THREE.Group();
earthGroup.position.set(earthDistance, 0, 0);
earthOrbitPivot.add(earthGroup);

const earth = createEarth(earthRadius);
earthGroup.add(earth);

const earthOrbitLine = createOrbitLine(earthDistance, { opacity: 0.25 });
scene.add(earthOrbitLine);

// Satellite's own low orbit around Earth — nested inside earthGroup so it
// automatically travels with Earth as Earth orbits the Sun.
const satOrbitDistance = earthRadius + satMaxSpan * 0.7;
const satOrbitPivot = new THREE.Group();
satOrbitPivot.name = 'satOrbitPivot';
satellite.position.set(satOrbitDistance, 0, 0);
satOrbitPivot.add(satellite);
earthGroup.add(satOrbitPivot);

// Visible only once zoomed out far enough from Earth to read as a path
// rather than clutter right on top of the satellite.
const satOrbitLine = createOrbitLine(satOrbitDistance, { opacity: 0.6 });
const satOrbitLineShowDistance = satOrbitDistance * 1.6;
earthGroup.add(satOrbitLine);

// --- The other 7 planets, each on their own orbit around the Sun -------
const planets = PLANET_DATA.map((data) => createPlanet(data, earthRadius, auUnit));
planets.forEach((p) => scene.add(p.pivot, p.orbitLine));

// far plane pushed past Neptune's orbit so nothing pops when zooming out
camera.far = auUnit * 32;
camera.updateProjectionMatrix();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Keyboard: 0-9 jump camera focus between bodies ---------------------
// 0 Sun, 1-8 the planets in distance order, 9 the satellite.
const planetByName = {};
planets.forEach((p) => { planetByName[p.name] = p; });
const FOCUS_ORDER = ['Sun', 'Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Satellite'];

function getFocusInfo(name) {
  if (name === 'Sun') return { pos: new THREE.Vector3(0, 0, 0), radius: sunRadius };
  if (name === 'Earth') return { pos: earthGroup.getWorldPosition(new THREE.Vector3()), radius: earthRadius };
  if (name === 'Satellite') return { pos: satellite.getWorldPosition(new THREE.Vector3()), radius: satMaxSpan };
  const p = planetByName[name];
  return { pos: p.mesh.getWorldPosition(new THREE.Vector3()), radius: p.radius };
}

let focusedName = 'Sun';
const prevFocusPos = new THREE.Vector3(0, 0, 0);
const focusViewDir = new THREE.Vector3(0.6, 0.35, 0.8).normalize();

function setFocus(name, distOverride) {
  focusedName = name;
  const info = getFocusInfo(name);
  // Earth gets a wider frame so its orbiting satellite stays in view too;
  // every other body is framed relative to its own size, unless the
  // caller asks for a specific distance (used for the startup shot below).
  const dist = distOverride ?? (name === 'Earth' ? satOrbitDistance * 1.5 : info.radius * 3.2);
  camera.position.copy(info.pos).addScaledVector(focusViewDir, dist);
  controls.target.copy(info.pos);
  prevFocusPos.copy(info.pos);
}

window.addEventListener('keydown', (e) => {
  if (e.key >= '0' && e.key <= '9') {
    const name = FOCUS_ORDER[Number(e.key)];
    if (name) setFocus(name);
  }
});

// Start focused on the satellite, but pulled back far enough that Earth is
// also in frame — the assignment's actual subject, front and center.
setFocus('Satellite', satOrbitDistance * 3.2);

// --- Keyboard: H toggles the instructions panel -------------------------
const instructionsPanel = document.getElementById('instructions');
const hintLabel = document.getElementById('hint');
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'h') {
    instructionsPanel.hidden = !instructionsPanel.hidden;
    hintLabel.hidden = !instructionsPanel.hidden;
  }
});

// --- Keyboard: P pauses every orbit/spin/shadow animation instantly -----
// Camera navigation (drag, zoom, focus jumps, arrow-key satellite orbit)
// stays live even while paused — only the scene's own motion freezes.
let paused = false;
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'p') paused = !paused;
});

// --- Keyboard: arrow keys orbit the camera around the satellite --------
// Only active while focused on the satellite (key 9) — held keys are
// tracked in a set so the rotation is smooth for as long as they're down.
const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const pressedArrowKeys = new Set();
window.addEventListener('keydown', (e) => {
  if (ARROW_KEYS.includes(e.key)) {
    pressedArrowKeys.add(e.key);
    e.preventDefault(); // stop the page from scrolling
  }
});
window.addEventListener('keyup', (e) => {
  pressedArrowKeys.delete(e.key);
});
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// --- Mouse: left click swaps the satellite's texture, satellite view only
// Click is detected manually (press+release within a small movement
// threshold) rather than the browser's native 'click' event, so dragging
// to orbit the camera with OrbitControls doesn't also cycle the texture.
let pointerDownAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button === 0) pointerDownAt = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (e.button === 0 && pointerDownAt) {
    const moved = Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y);
    if (moved < 5 && focusedName === 'Satellite') cycleSatelliteTexture();
  }
  pointerDownAt = null;
});

// Everything except the satellite is deliberately near-static — the
// satellite orbiting Earth is the one motion meant to read as "moving" on
// sight; the Sun/planets/asteroid belt only drift, at 3% of their
// original speed, so the system still very slowly turns over time.
const SLOW = 0.03;
const ORBIT_SPEED_EARTH = (0.01 / Math.sqrt(1.0)) * SLOW;

// In real vacuum the Sun doesn't grow a bigger glow/halo as you back away
// from it — it just shrinks with perspective like anything else, same as
// the planets, until it's small enough that a real eye or camera would
// lose it. The one thing that's actually true of a star is that it never
// quite disappears: its light is so concentrated it still reads as a
// single bright point at any practical distance. So the glow sprite is
// left at its real, fixed world size (sun.userData.baseGlowSize) — it
// shrinks normally on screen as you zoom out — and is only clamped up to
// a small minimum pixel footprint once it would otherwise fall below that,
// which is what keeps it visible without ever ballooning or changing hue.
const MIN_GLOW_PIXELS = 14;

// scratch vectors reused every frame instead of allocating new ones
const _sunToEarth = new THREE.Vector3();
const _earthToSat = new THREE.Vector3();
let shadowFactor = 1;

function animate() {
  requestAnimationFrame(animate);

  if (!paused) {
    earthOrbitPivot.rotation.y += ORBIT_SPEED_EARTH;
    satOrbitPivot.rotation.y += 0.0025; // satellite orbiting Earth — kept fast
    satellite.rotation.y += 0.003; // satellite's own local spin — kept fast
    // axial spin (day/night turning) is kept at full speed, unlike the
    // orbits below — it's the "rotate on its own axis" motion and should
    // read clearly rather than disappear into the near-static system
    earth.userData.surface.rotation.y += 0.0006;
    earth.userData.clouds.rotation.y += 0.0009;

    planets.forEach((p) => {
      p.pivot.rotation.y += p.orbitSpeed * SLOW; // revolution around the Sun — slowed
      p.mesh.rotation.y += p.spinSpeed; // axial spin — full speed
    });

  }

  // keep Earth's hand-written shader lighting pointed at the Sun's actual
  // position (it's static here, but this stays correct if that ever changes)
  earth.userData.surfaceMaterial.uniforms.lightPos.value.copy(sun.position);

  // only draw the satellite's path once zoomed out far enough for it to
  // read as a path rather than clutter right on top of the satellite
  const earthWorldPos = earthGroup.getWorldPosition(new THREE.Vector3());
  satOrbitLine.visible = camera.position.distanceTo(earthWorldPos) > satOrbitLineShowDistance;

  // --- Eclipse check: is the satellite behind Earth, away from the Sun? --
  // Treat Earth's shadow as an infinite cylinder of radius earthRadius
  // pointing straight away from the Sun through Earth's center (a fair
  // approximation since the Sun is effectively far away at Earth's scale).
  // The satellite is inside it when it's on the far side of Earth from the
  // Sun (along the shadow axis) AND within earthRadius of that axis.
  const satWorldPos = satellite.getWorldPosition(new THREE.Vector3());
  _sunToEarth.copy(earthWorldPos).normalize(); // Sun sits at the origin
  _earthToSat.copy(satWorldPos).sub(earthWorldPos);
  const along = _earthToSat.dot(_sunToEarth);
  const perpDist = _earthToSat.clone().addScaledVector(_sunToEarth, -along).length();
  const eclipsed = along > 0 && perpDist < earthRadius;

  if (!paused) {
    // ease toward the target brightness instead of snapping, so entering/
    // leaving the shadow reads as a fade rather than a flicker
    const targetShadow = eclipsed ? 0.12 : 1;
    shadowFactor += (targetShadow - shadowFactor) * 0.08;
    setSatelliteShadowFactor(shadowFactor);
  }

  // Sun shrinks normally with distance, same as everything else — it's
  // only floored to a minimum on-screen pixel size so it never vanishes.
  const camDistToSun = camera.position.length();
  const pixelWorldSize = (2 * camDistToSun * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
    / renderer.domElement.clientHeight;
  const minGlowSize = MIN_GLOW_PIXELS * pixelWorldSize;
  sun.userData.glow.scale.setScalar(Math.max(sun.userData.baseGlowSize, minGlowSize));

  // keep chasing the focused body as it orbits — translate the camera by
  // however far the target moved this frame so any manual zoom/rotate the
  // user has done since focusing is preserved, then let OrbitControls
  // re-settle around the new target position
  const focusPos = getFocusInfo(focusedName).pos;
  camera.position.add(focusPos.clone().sub(prevFocusPos));
  controls.target.copy(focusPos);
  prevFocusPos.copy(focusPos);

  // arrow keys orbit the camera around the satellite, satellite-focus only
  if (focusedName === 'Satellite' && pressedArrowKeys.size > 0) {
    const ROT_SPEED = 0.02;
    const offset = camera.position.clone().sub(focusPos);
    if (pressedArrowKeys.has('ArrowLeft')) offset.applyAxisAngle(WORLD_UP, ROT_SPEED);
    if (pressedArrowKeys.has('ArrowRight')) offset.applyAxisAngle(WORLD_UP, -ROT_SPEED);
    if (pressedArrowKeys.has('ArrowUp') || pressedArrowKeys.has('ArrowDown')) {
      const right = new THREE.Vector3().crossVectors(WORLD_UP, offset).normalize();
      const dir = pressedArrowKeys.has('ArrowUp') ? 1 : -1;
      const rotated = offset.clone().applyAxisAngle(right, ROT_SPEED * dir);
      // clamp so it can't rotate through the poles and flip
      const polar = rotated.angleTo(WORLD_UP);
      if (polar > THREE.MathUtils.degToRad(8) && polar < THREE.MathUtils.degToRad(172)) {
        offset.copy(rotated);
      }
    }
    camera.position.copy(focusPos).add(offset);
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();
