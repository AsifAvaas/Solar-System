import * as THREE from 'three';

// Radial-gradient sprite used for the sun's glow halo — same
// no-external-assets approach as the other procedural textures.
function glowTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,244,214,1)');
  grad.addColorStop(0.25, 'rgba(255,214,140,0.55)');
  grad.addColorStop(0.6, 'rgba(255,170,80,0.15)');
  grad.addColorStop(1, 'rgba(255,170,80,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

/**
 * Builds the Sun as a self-lit sphere (MeshBasicMaterial — it is the light
 * source, so it isn't shaded by anything) plus a camera-facing glow sprite.
 * Positioning/scale relative to Earth is decided by the caller (main.js).
 */
export function createSun(radius = 1) {
  const sun = new THREE.Group();
  sun.name = 'sun';

  const coreGeo = new THREE.SphereGeometry(radius, 48, 48);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.name = 'sunCore';
  sun.add(core);

  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: 0xffcc77,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(radius * 6, radius * 6, 1);
  sun.add(glow);

  sun.userData.core = core;
  sun.userData.glow = glow;
  sun.userData.radius = radius;
  sun.userData.baseGlowSize = radius * 6; // the glow's real, un-clamped design size

  return sun;
}
