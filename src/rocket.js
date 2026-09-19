import * as THREE from 'three';

// Same "no external image assets" approach as sun.js / textures.js — the
// rocket's hull, fin and flame surfaces are all painted onto canvases at
// runtime rather than loaded from files.

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

// White/orange hull with horizontal panel seams and a couple of stenciled
// stripe bands — enough visual detail to read as a real vehicle up close
// without needing a UV-unwrapped decal texture.
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
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
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

// Radial-gradient sprite for the exhaust plume — same technique as the
// Sun's glow sprite in sun.js, just a hot blue-white core fading to orange.
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

/**
 * Builds a rocket as a Group scaled so its total length is roughly
 * `size * 3` world units — pass in something derived from the satellite's
 * own scale (see rocketMission.js) so it reads at a consistent level of
 * detail next to the rest of the scene.
 */
export function createRocket(size = 1) {
  const rocket = new THREE.Group();
  rocket.name = 'rocket';

  const bodyLen = size * 1.6;
  const bodyRadius = size * 0.28;

  // Rocket built pointing along +Y locally; rocketMission.js handles
  // orienting +Y to face the direction of travel each frame.
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyLen, 20),
    matHullShared
  );
  rocket.add(body);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(bodyRadius, size * 0.7, 20),
    matHullShared
  );
  nose.position.y = bodyLen / 2 + (size * 0.7) / 2;
  rocket.add(nose);

  const finGeo = new THREE.BoxGeometry(size * 0.05, size * 0.55, size * 0.4);
  const finCount = 4;
  for (let i = 0; i < finCount; i++) {
    const fin = new THREE.Mesh(finGeo, matFinShared);
    const angle = (i / finCount) * Math.PI * 2;
    fin.position.set(Math.cos(angle) * bodyRadius, -bodyLen / 2 + size * 0.2, Math.sin(angle) * bodyRadius);
    fin.rotation.y = -angle;
    rocket.add(fin);
  }

  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(bodyRadius * 0.55, bodyRadius * 0.9, size * 0.35, 16),
    matDarkShared
  );
  nozzle.position.y = -bodyLen / 2 - (size * 0.35) / 2;
  rocket.add(nozzle);

  // Exhaust flame — hidden until launch, scaled/opacity-driven every frame
  // by rocketMission.js based on the current thrust phase.
  const flameMat = new THREE.SpriteMaterial({
    map: flameTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0,
  });
  const flame = new THREE.Sprite(flameMat);
  flame.scale.set(size * 0.6, size * 1.4, 1);
  flame.position.y = -bodyLen / 2 - size * 0.35 - (size * 1.4) * 0.35;
  rocket.add(flame);

  rocket.userData.flame = flame;
  rocket.userData.length = bodyLen + size * 0.7;

  return rocket;
}