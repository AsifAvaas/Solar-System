import * as THREE from 'three';

// Shared helper: a plain circular path in the XZ plane, reused for the
// satellite's orbit around Earth and every planet's orbit around the Sun.
export function createOrbitLine(radius, { color = 0xffffff, opacity = 0.4, segments = 160 } = {}) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.LineLoop(geo, mat);
}
