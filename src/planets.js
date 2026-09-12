import * as THREE from 'three';
import { createOrbitLine } from './orbitLine.js';

// Real relative ratios (Earth = 1) — these two columns are kept accurate so
// the planets' *proportions* to each other and to Earth are correct.
// auDistance is the real semi-major axis in AU (Earth = 1 AU).
export const PLANET_DATA = [
  { name: 'Mercury', radiusRatio: 0.383, auDistance: 0.39, bands: false, colors: ['#8f8a82', '#6e6a63', '#b5afa4'] },
  { name: 'Venus', radiusRatio: 0.949, auDistance: 0.72, bands: false, colors: ['#d9c27a', '#c9a86a', '#e8dca0'] },
  { name: 'Mars', radiusRatio: 0.532, auDistance: 1.52, bands: false, colors: ['#b5502e', '#7a3a20', '#d97b52'] },
  { name: 'Jupiter', radiusRatio: 11.2, auDistance: 5.2, bands: true, colors: ['#d8ba7a', '#a9784f', '#e8dcc0', '#c2703f'] },
  { name: 'Saturn', radiusRatio: 9.45, auDistance: 9.58, bands: true, colors: ['#e0c893', '#c7a96f', '#f0e2b8'], ring: true },
  { name: 'Uranus', radiusRatio: 4.01, auDistance: 19.2, bands: false, colors: ['#b3e3e3', '#9fd1d1'] },
  { name: 'Neptune', radiusRatio: 3.88, auDistance: 30.05, bands: false, colors: ['#3a5fcd', '#2c4aa8'] },
];

// Orbital speed uses distance^-0.5 rather than the real Kepler distance^-1.5
// — real ratios would make Neptune take ~70x longer than Mercury to
// complete a visible arc, unwatchable in a demo. This keeps "closer orbits
// faster" true while every planet still visibly moves within a minute.
const ORBIT_SPEED_BASE = 0.01;

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function rockyTexture(colors, size = 256) {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const r = 2 + Math.random() * 10;
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = colors[(1 + Math.floor(Math.random() * (colors.length - 1))) % colors.length];
    ctx.globalAlpha = 0.35 + Math.random() * 0.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return new THREE.CanvasTexture(canvas);
}

function bandedTexture(colors, size = 512) {
  const { canvas, ctx } = makeCanvas(size);
  const bandCount = 14;
  for (let i = 0; i < bandCount; i++) {
    const y = (i / bandCount) * size;
    const h = size / bandCount;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(0, y, size, h + 1);
  }
  // horizontal turbulence streaks
  for (let i = 0; i < 400; i++) {
    const y = Math.random() * size;
    const x = Math.random() * size;
    const w = 20 + Math.random() * 80;
    ctx.strokeStyle = colors[(Math.floor(Math.random() * colors.length))];
    ctx.globalAlpha = 0.15 + Math.random() * 0.2;
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + (Math.random() - 0.5) * 4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // a great-red-spot-style oval for gas giants
  ctx.fillStyle = 'rgba(180,80,50,0.5)';
  ctx.beginPath();
  ctx.ellipse(size * 0.65, size * 0.55, size * 0.09, size * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

function ringTexture(color, size = 256) {
  const { canvas, ctx } = makeCanvas(size);
  ctx.clearRect(0, 0, size, size);
  for (let x = 0; x < size; x++) {
    const t = x / size;
    const alpha = 0.25 + 0.5 * Math.abs(Math.sin(t * Math.PI * 10));
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return new THREE.CanvasTexture(canvas);
}

/**
 * Builds one planet: an orbit pivot at the Sun (origin) holding the planet
 * mesh at its scaled AU distance, plus a visible orbit ring.
 */
export function createPlanet(data, earthRadius, auUnit) {
  const radius = earthRadius * data.radiusRatio;
  const distance = auUnit * data.auDistance;

  const texture = data.bands ? bandedTexture(data.colors) : rockyTexture(data.colors);
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0.0 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 48), material);
  mesh.name = data.name;

  if (data.ring) {
    const ringGeo = new THREE.RingGeometry(radius * 1.3, radius * 2.3, 64);
    // RingGeometry UVs are radial, not linear — remap so the banded ring
    // texture reads outward from inner to outer edge instead of stretching.
    const pos = ringGeo.attributes.position;
    const uv = ringGeo.attributes.uv;
    const v3 = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v3.fromBufferAttribute(pos, i);
      const dist = v3.length();
      const t = (dist - radius * 1.3) / (radius * 2.3 - radius * 1.3);
      uv.setXY(i, t, 0.5);
    }
    const ringMat = new THREE.MeshStandardMaterial({
      map: ringTexture(data.colors[0]),
      side: THREE.DoubleSide,
      transparent: true,
      roughness: 1,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2 - 0.35;
    mesh.add(ring);
  }

  mesh.position.set(distance, 0, 0);

  const pivot = new THREE.Group();
  pivot.name = `${data.name}Pivot`;
  pivot.add(mesh);
  // random starting point on the orbit — otherwise every planet begins
  // lined up on the same ray from the Sun, which looks wrong immediately
  pivot.rotation.y = Math.random() * Math.PI * 2;

  const orbitLine = createOrbitLine(distance, { opacity: 0.25 });

  return {
    name: data.name,
    pivot,
    mesh,
    orbitLine,
    radius,
    orbitSpeed: ORBIT_SPEED_BASE / Math.sqrt(data.auDistance),
    spinSpeed: 0.0006 + Math.random() * 0.002,
  };
}
