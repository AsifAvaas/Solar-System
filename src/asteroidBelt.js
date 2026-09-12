import * as THREE from 'three';

/**
 * Asteroid belt as one InstancedMesh scattered in an annulus between
 * innerRadius and outerRadius (real belt sits ~2.2-3.2 AU, between Mars
 * and Jupiter) — one draw call for hundreds of rocks instead of hundreds
 * of meshes.
 */
export function createAsteroidBelt(innerRadius, outerRadius, earthRadius, count = 1200) {
  const rockGeo = new THREE.IcosahedronGeometry(earthRadius * 0.02, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 1, metalness: 0.1, flatShading: true });
  const mesh = new THREE.InstancedMesh(rockGeo, rockMat, count);
  mesh.name = 'asteroidBelt';

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const radius = innerRadius + Math.random() * (outerRadius - innerRadius);
    const theta = Math.random() * Math.PI * 2;
    const yJitter = (Math.random() - 0.5) * earthRadius * 0.5;
    dummy.position.set(Math.cos(theta) * radius, yJitter, Math.sin(theta) * radius);

    const scale = 0.4 + Math.random() * 1.8;
    dummy.scale.setScalar(scale);
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  return mesh;
}
