import * as THREE from 'three';

// Procedural Earth textures (same no-external-assets approach as the
// satellite's textures.js) — an equirectangular day map with continents,
// polar ice caps and a faint lat/long grid, plus a separate wispy cloud
// alpha map for a thin cloud shell.

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

function dayMapTexture(w = 1024, h = 512) {
  const { canvas, ctx } = makeCanvas(w, h);

  // ocean base with a subtle vertical gradient
  const ocean = ctx.createLinearGradient(0, 0, 0, h);
  ocean.addColorStop(0, '#123a63');
  ocean.addColorStop(0.5, '#1a5c96');
  ocean.addColorStop(1, '#123a63');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, w, h);

  // continents: clusters of overlapping soft blobs so coastlines look organic
  function blobCluster(cx, cy, count, spread, minR, maxR, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const x = cx + (Math.random() - 0.5) * spread;
      const y = cy + (Math.random() - 0.5) * spread * 0.6;
      const r = minR + Math.random() * (maxR - minR);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const landGreen = '#3f7d3a';
  const landOlive = '#5c8a3f';
  const landSand = '#a68a52';

  // a handful of continent-like landmass clusters spread across the map
  const clusters = [
    [w * 0.18, h * 0.35, 180],
    [w * 0.28, h * 0.62, 140],
    [w * 0.5, h * 0.28, 160],
    [w * 0.58, h * 0.6, 150],
    [w * 0.78, h * 0.32, 170],
    [w * 0.85, h * 0.68, 130],
  ];
  clusters.forEach(([cx, cy, spread]) => {
    blobCluster(cx, cy, 14, spread, 10, 34, landGreen);
    blobCluster(cx, cy, 8, spread * 0.7, 6, 18, landOlive);
    blobCluster(cx, cy, 5, spread * 0.5, 5, 14, landSand);
  });

  // polar ice caps
  const iceH = h * 0.1;
  const iceGradTop = ctx.createLinearGradient(0, 0, 0, iceH);
  iceGradTop.addColorStop(0, 'rgba(255,255,255,0.95)');
  iceGradTop.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = iceGradTop;
  ctx.fillRect(0, 0, w, iceH);

  const iceGradBottom = ctx.createLinearGradient(0, h - iceH, 0, h);
  iceGradBottom.addColorStop(0, 'rgba(255,255,255,0)');
  iceGradBottom.addColorStop(1, 'rgba(255,255,255,0.95)');
  ctx.fillStyle = iceGradBottom;
  ctx.fillRect(0, h - iceH, w, iceH);

  // faint lat/long grid for a technical globe look
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 12; i++) {
    const x = (i / 12) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let j = 0; j <= 6; j++) {
    const y = (j / 6) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cloudMapTexture(w = 1024, h = 512) {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < 90; i++) {
    const cx = Math.random() * w;
    const cy = Math.random() * h * 0.85 + h * 0.075;
    const puffs = 4 + Math.floor(Math.random() * 5);
    const alpha = 0.15 + Math.random() * 0.25;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    for (let p = 0; p < puffs; p++) {
      const ox = (Math.random() - 0.5) * 40;
      const oy = (Math.random() - 0.5) * 14;
      const r = 8 + Math.random() * 16;
      ctx.beginPath();
      ctx.ellipse(cx + ox, cy + oy, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return new THREE.CanvasTexture(canvas);
}

// Custom shader for Earth's surface — lighting is computed by hand here
// instead of relying on MeshStandardMaterial's built-in model, using the
// Sun's actual world position as a uniform (updated from main.js each
// frame, even though the Sun happens to be static). ambientStrength
// stands in for the scene's AmbientLight, since a ShaderMaterial doesn't
// pick that up automatically.
const surfaceVertexShader = `
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
`;

const surfaceFragmentShader = `
  uniform sampler2D dayMap;
  uniform vec3 lightPos;
  uniform vec3 lightColor;
  uniform float ambientStrength;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(lightPos - vWorldPosition);
    float ndotl = dot(N, L);
    // soft terminator instead of a hard day/night clamp
    float lit = smoothstep(-0.2, 0.15, ndotl);
    vec3 tex = texture2D(dayMap, vUv).rgb;
    vec3 color = tex * lightColor * mix(ambientStrength, 1.0, lit);
    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * Builds Earth as a Group: a custom-shaded, hand-lit day-side sphere, a
 * slightly larger semi-transparent cloud shell, and a faint additive
 * atmosphere rim. `radius` should be picked relative to the satellite
 * model's own scale — see main.js for how the two are sized against each
 * other.
 */
export function createEarth(radius = 40) {
  const earth = new THREE.Group();
  earth.name = 'earth';

  const surfaceGeo = new THREE.SphereGeometry(radius, 64, 64);
  const surfaceMat = new THREE.ShaderMaterial({
    vertexShader: surfaceVertexShader,
    fragmentShader: surfaceFragmentShader,
    uniforms: {
      dayMap: { value: dayMapTexture() },
      lightPos: { value: new THREE.Vector3(0, 0, 0) },
      lightColor: { value: new THREE.Color(0xfff4e0) },
      ambientStrength: { value: 0.25 },
    },
  });
  const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
  surface.name = 'earthSurface';
  earth.add(surface);

  const cloudGeo = new THREE.SphereGeometry(radius * 1.01, 64, 64);
  const cloudMat = new THREE.MeshStandardMaterial({
    map: cloudMapTexture(),
    transparent: true,
    depthWrite: false,
    roughness: 1,
  });
  const clouds = new THREE.Mesh(cloudGeo, cloudMat);
  clouds.name = 'earthClouds';
  earth.add(clouds);

  const atmoGeo = new THREE.SphereGeometry(radius * 1.05, 48, 48);
  const atmoMat = new THREE.MeshBasicMaterial({
    color: 0x4da6ff,
    transparent: true,
    opacity: 0.12,
    side: THREE.BackSide,
  });
  const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
  earth.add(atmosphere);

  earth.userData.surface = surface;
  earth.userData.surfaceMaterial = surfaceMat;
  earth.userData.clouds = clouds;
  earth.userData.radius = radius;

  return earth;
}
