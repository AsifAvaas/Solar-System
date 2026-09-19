import * as THREE from 'three';

// Easing curves for each leg of the trip. Ascend/descend use a one-sided
// ease so the rocket visibly *starts* slow off the pad and *ends* slow
// into touchdown; the transit leg keeps the original ease-in-out so it
// accelerates away from departure and decelerates into arrival.
function easeInCubic(t) { return t * t * t; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const UP = new THREE.Vector3(0, 1, 0);
const ASCEND_MS = 2200;
const DESCEND_MS = 2200;

/**
 * Wires up the rocket feature. The rocket always lives in one of two
 * states from the outside world's perspective: parked upright on a body's
 * surface, or mid-flight to a new one. Mid-flight is itself three legs:
 *   ascending  — straight vertical liftoff away from wherever it's parked
 *   transit    — a raised curved arc between the two "orbit heights"
 *   descending — straight vertical touchdown onto the destination body
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Group} earth        - the Group returned by createEarth() (has userData.surface)
 * @param {THREE.Group} earthGroup   - the group Earth's mesh/orbit lives in (see main.js)
 * @param {number} earthRadius
 * @param {Array}  planets           - the array returned by planets.map(createPlanet) in main.js
 * @param {number} rocketSize        - base scale, e.g. satMaxSpan from main.js
 */
export function createRocketMission({ scene, earth, earthGroup, earthRadius, planets, rocketSize }) {
  const rocket = createRocketModel(rocketSize);
  scene.add(rocket);

  const bodyNames = ['Earth', ...planets.map((p) => p.name)];

  function getBodyInfo(name) {
    if (name === 'Earth') {
      return {
        worldPos: earthGroup.getWorldPosition(new THREE.Vector3()),
        radius: earthRadius,
        surfaceMesh: earth.userData.surface,
      };
    }
    const p = planets.find((pl) => pl.name === name);
    if (!p) return null;
    return { worldPos: p.mesh.getWorldPosition(new THREE.Vector3()), radius: p.radius, surfaceMesh: p.mesh };
  }

  // Raised control point for the transit arc — offset perpendicular to
  // travel direction, biased toward world "up" so the path clears other
  // bodies instead of cutting straight through them.
  function raisedMidpoint(a, b) {
    const dir = b.clone().sub(a).normalize();
    const dist = a.distanceTo(b);
    let perp = new THREE.Vector3().crossVectors(dir, UP);
    if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0);
    perp.normalize();
    return a.clone().lerp(b, 0.5).addScaledVector(UP, dist * 0.18).addScaledVector(perp, dist * 0.08);
  }

  // Parents the rocket onto a body's own spinning surface mesh at the
  // point facing `dirWorld`, converting that world-space direction into
  // the mesh's *current* local frame so it survives re-parenting. From
  // then on the rocket is fixed in local space and is carried around by
  // the body's own axial spin — exactly like something standing on the
  // ground should behave, as opposed to the satellite's orbit (which is
  // deliberately decoupled from spin).
  function dockAt(name, info, dirWorld) {
    const q = new THREE.Quaternion();
    info.surfaceMesh.getWorldQuaternion(q);
    const localDir = dirWorld.clone().applyQuaternion(q.invert()).normalize();

    info.surfaceMesh.add(rocket);
    // Offset by groundOffset (local origin → base of the engine nozzle) so
    // the rocket's *base* touches the surface, rather than its geometric
    // center — otherwise half the model sinks into the planet.
    rocket.position.copy(localDir).multiplyScalar(info.radius + rocket.userData.groundOffset);
    rocket.quaternion.setFromUnitVectors(UP, localDir);

    currentBodyName = name;
    state = 'parked';
    rocket.userData.flame.material.opacity = 0;
    setStatus(`Landed on ${name}`);
    refreshButtons();
  }

  // ------------------------------------------------------------------
  // Flight state
  // ------------------------------------------------------------------
  let state = 'parked';
  let currentBodyName = 'Earth';
  let phaseStart = 0;
  let phaseDuration = 0;

  let padDir = null, landDir = null;
  let ascendFrom = null, ascendTo = null;
  let descendFrom = null, descendTo = null;
  let transitCurve = null;
  let pendingTargetName = null, pendingTargetInfo = null;
  let ascendStartQuat = null, ascendGoalQuat = null;
  let descendStartQuat = null, descendGoalQuat = null;

  function launchTo(name) {
    if (state !== 'parked' || name === currentBodyName) return;
    const origin = getBodyInfo(currentBodyName);
    const target = getBodyInfo(name);
    if (!target) return;

    // Ascend straight up from wherever the rocket is *actually* currently
    // sitting — not some recomputed "ideal" point — so there's no pop at
    // liftoff. padDir is that current pad's own local "up" direction.
    const currentPos = rocket.getWorldPosition(new THREE.Vector3());
    padDir = currentPos.clone().sub(origin.worldPos).normalize();

    // Land on the side of the target facing back the way we came, but
    // biased away from that body's own equatorial plane — keeps landing
    // pads (and the launches that follow from them) clear of anything
    // orbiting equatorially, like Earth's satellite.
    landDir = origin.worldPos.clone().sub(target.worldPos).normalize();
    landDir.lerp(UP, 0.35).normalize();

    ascendFrom = currentPos;
    ascendTo = origin.worldPos.clone().addScaledVector(padDir, origin.radius * 2.5);
    descendFrom = target.worldPos.clone().addScaledVector(landDir, target.radius * 2.5);
    // Touchdown point also accounts for groundOffset, same reasoning as dockAt.
    descendTo = target.worldPos.clone().addScaledVector(landDir, target.radius + rocket.userData.groundOffset);
    transitCurve = new THREE.QuadraticBezierCurve3(ascendTo, raisedMidpoint(ascendTo, descendFrom), descendFrom);

    pendingTargetName = name;
    pendingTargetInfo = target;

    scene.attach(rocket); // detach from the current surface mesh, keep world transform
    ascendStartQuat = rocket.quaternion.clone();
    ascendGoalQuat = new THREE.Quaternion().setFromUnitVectors(UP, padDir);

    phaseStart = performance.now();
    phaseDuration = ASCEND_MS;
    state = 'ascending';
    setStatus(`Lifting off from ${currentBodyName}…`);
    refreshButtons();
  }

  function update(nowMs) {
    const flame = rocket.userData.flame;
    if (state === 'parked') return;

    const rawT = (nowMs - phaseStart) / phaseDuration;
    const t = THREE.MathUtils.clamp(rawT, 0, 1);

    if (state === 'ascending') {
      const eased = easeInCubic(t);
      rocket.position.lerpVectors(ascendFrom, ascendTo, eased);
      rocket.quaternion.slerpQuaternions(ascendStartQuat, ascendGoalQuat, eased);
      flame.material.opacity = eased * 0.85; // ramps up from nothing, no instant flash
      flame.scale.y = rocketSize * (1.0 + eased * 0.6);

      if (rawT >= 1) {
        const dist = ascendTo.distanceTo(descendFrom);
        phaseStart = nowMs;
        phaseDuration = THREE.MathUtils.clamp(dist / (rocketSize * 4000), 3000, 14000);
        state = 'transit';
        setStatus(`En route to ${pendingTargetName}…`);
      }
    } else if (state === 'transit') {
      const eased = easeInOutCubic(t);
      const pos = transitCurve.getPoint(eased);
      const tangent = transitCurve.getTangent(Math.min(eased + 0.001, 1)).normalize();
      rocket.position.copy(pos);
      const desired = new THREE.Quaternion().setFromUnitVectors(UP, tangent);
      rocket.quaternion.slerp(desired, 0.12); // smooth catch-up rather than a hard snap

      // engines burn hardest right after departure and right before
      // arrival, and mostly cut out for the coast in between — realistic,
      // and reads clearly as three distinct phases rather than one blur
      const thrust = t < 0.15 ? 1 - t / 0.15 : t > 0.85 ? (t - 0.85) / 0.15 : 0;
      flame.material.opacity = thrust * 0.7;
      flame.scale.y = rocketSize * (1.0 + thrust * 0.6);

      if (rawT >= 1) {
        descendStartQuat = rocket.quaternion.clone();
        descendGoalQuat = new THREE.Quaternion().setFromUnitVectors(UP, landDir);
        phaseStart = nowMs;
        phaseDuration = DESCEND_MS;
        state = 'descending';
        setStatus(`Landing on ${pendingTargetName}…`);
      }
    } else if (state === 'descending') {
      const eased = easeOutCubic(t);
      rocket.position.lerpVectors(descendFrom, descendTo, eased);
      rocket.quaternion.slerpQuaternions(descendStartQuat, descendGoalQuat, eased);
      flame.material.opacity = 0.15 + eased * 0.7; // retro burn intensifies into touchdown
      flame.scale.y = rocketSize * (1.0 + eased * 0.6);

      if (rawT >= 1) {
        dockAt(pendingTargetName, pendingTargetInfo, landDir);
      }
    }
  }

  // ------------------------------------------------------------------
  // Minimal floating UI: one button per body, current/busy states reflected
  // ------------------------------------------------------------------
  let statusEl = null;
  let buttonEls = {};

  function setStatus(text) { if (statusEl) statusEl.textContent = text; }

  function refreshButtons() {
    Object.entries(buttonEls).forEach(([name, btn]) => {
      const isHere = name === currentBodyName;
      btn.disabled = state !== 'parked' || isHere;
      btn.classList.toggle('rocket-here', isHere);
    });
  }

  function buildUI() {
    const style = document.createElement('style');
    style.textContent = `
      #rocket-menu {
        position: fixed; top: 16px; right: 16px; z-index: 20;
        background: rgba(10, 14, 24, 0.72); border: 1px solid rgba(255,255,255,0.15);
        border-radius: 10px; padding: 10px 12px; font-family: sans-serif;
        color: #dfe6f5; max-width: 190px; backdrop-filter: blur(4px);
      }
      #rocket-menu h4 { margin: 0 0 6px; font-size: 12px; letter-spacing: 0.05em; opacity: 0.7; text-transform: uppercase; }
      #rocket-menu .rocket-status { font-size: 12px; margin-bottom: 8px; min-height: 14px; opacity: 0.9; }
      #rocket-menu .rocket-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      #rocket-menu button {
        font-size: 12px; padding: 6px 4px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.18);
        background: rgba(255,255,255,0.06); color: #eef2ff; cursor: pointer;
      }
      #rocket-menu button:hover:not(:disabled) { background: rgba(255,255,255,0.16); }
      #rocket-menu button:disabled { opacity: 0.35; cursor: default; }
      #rocket-menu button.rocket-here { border-color: #66ffcc; color: #a8ffe0; }
      #rocket-menu .rocket-hint { font-size: 11px; margin-top: 8px; opacity: 0.55; }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'rocket-menu';
    panel.innerHTML = `<h4>Launch rocket to</h4><div class="rocket-status"></div><div class="rocket-grid"></div><div class="rocket-hint">Press R to find the rocket</div>`;
    document.body.appendChild(panel);

    statusEl = panel.querySelector('.rocket-status');
    const grid = panel.querySelector('.rocket-grid');

    bodyNames.forEach((name) => {
      const btn = document.createElement('button');
      btn.textContent = name;
      btn.addEventListener('click', () => launchTo(name));
      grid.appendChild(btn);
      buttonEls[name] = btn;
    });

    setStatus('Parked on Earth');
    refreshButtons();
  }
  buildUI();

  // Start parked on Earth, nose pointing straight out from the surface.
  // Done last, after the UI/status elements above exist, since dockAt()
  // calls setStatus() as part of parking.
  dockAt('Earth', getBodyInfo('Earth'), UP.clone());

  // How far the camera should sit from the rocket to frame it without
  // ending up *inside* whatever it's currently standing on — a fixed
  // small distance works for Earth but puts the camera underground on
  // something the size of Jupiter, which is what made the planet vanish
  // (only the outside of the sphere renders) and the rocket look like it
  // was floating in a void.
  function getFocusRadius() {
    const info = getBodyInfo(currentBodyName);
    return Math.max(rocketSize * 4, info.radius * 1.6);
  }

  return { object: rocket, launchTo, update, getFocusRadius };
}

// ------------------------------------------------------------------
// Rocket model — kept in this file (rather than a separate rocket.js) now
// that it's tightly coupled to the docking/orientation logic above.
// Same "no external assets, everything painted on a canvas" approach as
// the rest of the project.
// ------------------------------------------------------------------
function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function hullTexture(size = 256) {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#c23b2c';
  ctx.fillRect(0, size * 0.38, size, size * 0.1);
  ctx.fillRect(0, size * 0.78, size, size * 0.06);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const y = (i / 8) * size;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
  }
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

function flameTexture(size = 128) {
  const { canvas, ctx } = makeCanvas(size);
  const grad = ctx.createRadialGradient(size / 2, size * 0.35, 0, size / 2, size * 0.4, size * 0.5);
  grad.addColorStop(0, 'rgba(220,240,255,1)');
  grad.addColorStop(0.35, 'rgba(255,210,120,0.9)');
  grad.addColorStop(0.7, 'rgba(255,120,40,0.4)');
  grad.addColorStop(1, 'rgba(255,90,30,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const matHullShared = new THREE.MeshStandardMaterial({ map: hullTexture(), roughness: 0.55, metalness: 0.2 });
const matDarkShared = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.5, metalness: 0.4 });
const matFinShared = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.3 });

function createRocketModel(size = 1) {
  const rocket = new THREE.Group();
  rocket.name = 'rocket';

  // Thicker body than before (length:diameter ~4.7:1 instead of ~8:1) so
  // it reads as a rocket rather than a thin needle at typical view distances.
  const bodyRadius = size * 0.32;
  const bodyLen = size * 1.8;

  // Built pointing along local +Y ("nose up"); dockAt()/the flight phases
  // above are responsible for rotating that +Y to face the right way.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyLen, 20), matHullShared);
  rocket.add(body);

  const noseLen = size * 0.8;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(bodyRadius, noseLen, 20), matHullShared);
  nose.position.y = bodyLen / 2 + noseLen / 2;
  rocket.add(nose);

  // Fins: inner edge flush with the hull, extending outward by their full
  // radial depth (previously they were centered ON the hull surface, so
  // half of each fin was buried inside the body and barely visible).
  const finRadialDepth = size * 0.42;
  const finHeight = size * 0.62;
  const finThickness = size * 0.07;
  const finRadius = bodyRadius + finRadialDepth / 2;
  const finGeo = new THREE.BoxGeometry(finThickness, finHeight, finRadialDepth);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(finGeo, matFinShared);
    const angle = (i / 4) * Math.PI * 2;
    fin.position.set(Math.cos(angle) * finRadius, -bodyLen / 2 + finHeight * 0.35, Math.sin(angle) * finRadius);
    fin.rotation.y = -angle;
    rocket.add(fin);
  }

  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius * 0.55, bodyRadius * 0.9, size * 0.35, 16), matDarkShared);
  nozzle.position.y = -bodyLen / 2 - (size * 0.35) / 2;
  rocket.add(nozzle);

  const flameMat = new THREE.SpriteMaterial({
    map: flameTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
  });
  const flame = new THREE.Sprite(flameMat);
  flame.scale.set(size * 0.6, size * 1.4, 1);
  flame.position.y = -bodyLen / 2 - size * 0.35 - (size * 1.4) * 0.35;
  rocket.add(flame);

  rocket.userData.flame = flame;
  // Distance from the rocket's local origin (mid-body) down to the base
  // of the engine nozzle — used to offset surface placement so the base
  // touches the ground rather than the model's center.
  rocket.userData.groundOffset = bodyLen / 2 + size * 0.35;
  return rocket;
}