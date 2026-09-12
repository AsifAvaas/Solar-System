import * as THREE from 'three';
import { createProceduralTextures, mliFoilTexture } from './textures.js';

// Procedural surface detail — swapped in as .map/.bumpMap below without
// touching any material's color/metalness/roughness tuning or geometry.
const tex = createProceduralTextures();

// Added THREE.DoubleSide to matWhite so the paper-thin LatheGeometry renders from all angles
const matGold = new THREE.MeshStandardMaterial({ color: 0xdaa520, metalness: 0.5, roughness: 0.6 });
matGold.map = tex.gold;
matGold.bumpMap = tex.gold;
matGold.bumpScale = 0.03;

const matSilver = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.3 });
matSilver.map = tex.silverBrushed;
matSilver.roughnessMap = tex.silverBrushed;

const matDarkMetal = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.4 });
matDarkMetal.map = tex.darkChassis;
matDarkMetal.bumpMap = tex.darkChassis;
matDarkMetal.bumpScale = 0.02;

const matPanel = new THREE.MeshStandardMaterial({ color: 0x24528c, metalness: 0.4, roughness: 0.5 });
matPanel.map = tex.solarCell;

const matPanelCell = new THREE.LineBasicMaterial({ color: 0x5a9bd4, transparent: true, opacity: 0.7 });

const matWhite = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, metalness: 0.1, roughness: 0.8, side: THREE.DoubleSide });
matWhite.map = tex.whiteQuilt;
matWhite.bumpMap = tex.whiteQuilt;
matWhite.bumpScale = 0.015;

const matBlack = new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.2, roughness: 0.5 });
matBlack.map = tex.lens;

// Every material actually used on the satellite — kept in one list so the
// whole model can be dimmed together when it passes through Earth's
// shadow (see setSatelliteShadowFactor below), without touching Earth's,
// the Sun's, or any other planet's materials.
export const satelliteMaterials = [matGold, matSilver, matDarkMetal, matPanel, matPanelCell, matWhite, matBlack];
satelliteMaterials.forEach((m) => {
  m.userData.baseColor = m.color.clone();
});

/**
 * Scales every satellite material's color toward black by `factor`
 * (1 = full sunlight, 0 = fully in shadow). The Sun stays the only real
 * light in the scene — there's no second light or shadow-map involved,
 * this just tints the surfaces to look unlit while eclipsed, which is far
 * cheaper and more stable than point-light shadow mapping at solar-system
 * scale (the near/far range would be too extreme for usable depth
 * precision).
 */
export function setSatelliteShadowFactor(factor) {
  satelliteMaterials.forEach((m) => {
    m.color.copy(m.userData.baseColor).multiplyScalar(factor);
  });
}

// Alternate hull liveries for the mouse-click texture swap — same procedural
// foil pattern as the default gold, just re-generated with different base
// colors so nothing here depends on an external image asset.
const bodyLiveries = [
  tex.gold,
  mliFoilTexture('#c8ccd2'), // brushed silver
  mliFoilTexture('#7a1f1f'), // NASA-red
  mliFoilTexture('#1f3f7a'), // deep blue
  mliFoilTexture('#333333'), // stealth black
];
let bodyLiveryIndex = 0;

/**
 * Cycles the satellite bus body to the next livery texture. Only the body
 * foil changes — the panels, struts, dishes, etc. keep their own textures.
 */
export function cycleSatelliteTexture() {
  bodyLiveryIndex = (bodyLiveryIndex + 1) % bodyLiveries.length;
  const nextMap = bodyLiveries[bodyLiveryIndex];
  matGold.map = nextMap;
  matGold.bumpMap = nextMap;
  matGold.needsUpdate = true;
}

function buildBus() {
  const bus = new THREE.Group();

  const bodyWidth = 1.6;
  const bodyHeight = 2.4;
  const bodyDepth = 1.6;

  // 1. Main Body Core
  const bodyGeo = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
  const body = new THREE.Mesh(bodyGeo, matGold);
  body.name = 'busBody';
  bus.add(body);

  // 2. Corner Support Rails
  const railGeo = new THREE.CylinderGeometry(0.04, 0.04, bodyHeight + 0.02, 8);
  const cornerOffsets = [
    [0.8, 0.8], [-0.8, 0.8], [0.8, -0.8], [-0.8, -0.8]
  ];
  cornerOffsets.forEach(([x, z]) => {
    const rail = new THREE.Mesh(railGeo, matSilver);
    rail.position.set(x, 0, z);
    bus.add(rail);
  });

  // 3. Heat Radiator Panels (Ribbed structures on X+ and X- faces)
  const radiatorGroup = new THREE.Group();
  const radBaseGeo = new THREE.BoxGeometry(0.1, 1.8, 1.0);
  for (let dir of [-1, 1]) {
    const radBase = new THREE.Mesh(radBaseGeo, matWhite);
    radBase.position.set(dir * 0.82, 0, 0);

    // Horizontal cooling ribs
    for (let r = -0.8; r <= 0.8; r += 0.15) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.9), matSilver);
      rib.position.set(dir * 0.82, r, 0);
      radiatorGroup.add(rib);
    }
    radiatorGroup.add(radBase);
  }
  bus.add(radiatorGroup);

  // 4. High-Detail Front Face Greebles (Z+)
  const frontGreebles = new THREE.Group();

  // Central instrument housing
  const instBlock = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.15), matSilver);
  instBlock.position.set(0, 0.3, 0.82);
  frontGreebles.add(instBlock);

  // Star Trackers (Optical sensors with black lenses)
  const trackerGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.2, 12);
  for (let i = -1; i <= 1; i += 2) {
    const tracker = new THREE.Mesh(trackerGeo, matDarkMetal);
    tracker.position.set(i * 0.2, 0.5, 0.92);
    tracker.rotation.x = Math.PI / 2;
    tracker.rotation.y = i * 0.2; // Angled outward slightly

    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 12), matBlack);
    lens.position.set(0, 0.1, 0);
    tracker.add(lens);

    frontGreebles.add(tracker);
  }

  // Battery and Avionics modules
  for (let y = -0.4; y <= -0.1; y += 0.3) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.15), matWhite);
    box.position.set(0.3, y, 0.85);
    frontGreebles.add(box);
  }
  bus.add(frontGreebles);

  // 5. Top Instrument Deck (Y+)
  const topDeck = new THREE.Group();
  const deckBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 1.2), matSilver);
  deckBase.position.y = 1.25;
  topDeck.add(deckBase);

  const topRing = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 32), matDarkMetal);
  topRing.position.y = 1.35;
  topDeck.add(topRing);

  // Omni-directional antenna probes
  for (let i = 0; i < 3; i++) {
    const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8), matSilver);
    const angle = (i / 3) * Math.PI * 2;
    probe.position.set(Math.cos(angle) * 0.3, 1.5, Math.sin(angle) * 0.3);
    topDeck.add(probe);
  }
  bus.add(topDeck);

  // 6. Enhanced Propulsion & RCS System (Y-)
  const propGroup = new THREE.Group();

  // Thrust cone base
  const propMod = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.5, 16), matDarkMetal);
  propMod.position.y = -1.45;
  propGroup.add(propMod);

  // Main orbital maneuvering engine
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 24, 1, true), matDarkMetal);
  nozzle.position.y = -1.9;
  nozzle.rotation.x = Math.PI;
  propGroup.add(nozzle);

  // Spherical propellant tanks protruding from the bottom
  const tankGeo = new THREE.SphereGeometry(0.25, 16, 16);
  for (let i = -1; i <= 1; i += 2) {
    const tank = new THREE.Mesh(tankGeo, matWhite);
    tank.position.set(i * 0.4, -1.3, 0);
    propGroup.add(tank);
  }

  // Reaction Control System (RCS) thruster quads on the corners
  const rcsGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
  const tinyNozzleGeo = new THREE.ConeGeometry(0.04, 0.1, 8, 1, true);
  cornerOffsets.forEach(([x, z]) => {
    const rcsBlock = new THREE.Mesh(rcsGeo, matSilver);
    rcsBlock.position.set(x * 1.05, -1.0, z * 1.05);

    // X-axis thruster
    const t1 = new THREE.Mesh(tinyNozzleGeo, matDarkMetal);
    t1.position.set(Math.sign(x) * 0.1, 0, 0);
    t1.rotation.z = -Math.sign(x) * Math.PI / 2;
    rcsBlock.add(t1);

    // Z-axis thruster
    const t2 = new THREE.Mesh(tinyNozzleGeo, matDarkMetal);
    t2.position.set(0, 0, Math.sign(z) * 0.1);
    t2.rotation.x = Math.sign(z) * Math.PI / 2;
    rcsBlock.add(t2);

    propGroup.add(rcsBlock);
  });
  bus.add(propGroup);

  return bus;
}

function buildPanelCellLines(width, height, cols, rows) {
  const points = [];
  const halfW = width / 2;
  const halfH = height / 2;
  for (let i = 0; i <= cols; i++) {
    const x = -halfW + (i / cols) * width;
    points.push(new THREE.Vector3(x, -halfH, 0.015), new THREE.Vector3(x, halfH, 0.015));
  }
  for (let j = 0; j <= rows; j++) {
    const y = -halfH + (j / rows) * height;
    points.push(new THREE.Vector3(-halfW, y, 0.015), new THREE.Vector3(halfW, y, 0.015));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineSegments(geo, matPanelCell);
}

function buildSolarWing(direction) {
  const wing = new THREE.Group();

  // Yoke (The open truss connecting bus to the panels)
  const yokeLength = 1.2;
  const yoke = new THREE.Group();

  const mainBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, yokeLength, 12), matSilver);
  mainBoom.rotation.z = Math.PI / 2;
  mainBoom.position.x = direction * (0.8 + yokeLength / 2);
  yoke.add(mainBoom);

  const crossBar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 12), matSilver);
  crossBar.rotation.x = Math.PI / 2;
  crossBar.position.x = direction * (0.8 + yokeLength);
  yoke.add(crossBar);

  // Angled support struts for the yoke
  for (let i = -1; i <= 1; i += 2) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8), matWhite);
    strut.position.set(direction * (0.8 + yokeLength / 2), 0, i * 0.45);
    strut.rotation.x = i * Math.PI / 6;
    strut.rotation.z = Math.PI / 2;
    yoke.add(strut);
  }
  wing.add(yoke);

  // Panel Array: 4 segments instead of 3
  const segW = 1.4;
  const segH = 2.8;
  const gap = 0.08;
  const startX = 0.8 + yokeLength + (segW / 2) + 0.1;

  for (let i = 0; i < 4; i++) {
    const panelGroup = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(segW, segH, 0.03), matPanel);
    panelGroup.add(panel);

    // Front cells
    const cellsFront = buildPanelCellLines(segW, segH, 8, 16);
    panelGroup.add(cellsFront);

    // Back cells - cloned and rotated 180 degrees to snap to the back face
    const cellsBack = cellsFront.clone();
    cellsBack.rotation.y = Math.PI;
    panelGroup.add(cellsBack);

    // Add hinge connectors between panels
    if (i > 0) {
      for (let h = -1; h <= 1; h += 2) {
        const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.08), matDarkMetal);
        hinge.position.set(-segW / 2 - gap / 2, h * 0.8, 0);
        panelGroup.add(hinge);
      }
    }

    const xPos = direction * (startX + i * (segW + gap));
    panelGroup.position.set(xPos, 0, 0);
    wing.add(panelGroup);
  }

  return wing;
}
function buildLateralDish(direction) {
  // To fix the alignment clipping, we create a pivot group anchored EXACTLY 
  // on the bus face (Z = ±0.8). Everything else builds outwards from this pivot.
  const pivotGroup = new THREE.Group();
  const boomLength = 0.7;

  // 1. Complex mounting bracket (Boom) - extending straight out from the bus face
  const mountBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, boomLength, 12), matDarkMetal);
  mountBoom.rotation.x = Math.PI / 2;
  mountBoom.position.set(0, 0, boomLength / 2); // Shifts cylinder so base is at Z=0
  pivotGroup.add(mountBoom);

  // 2. Dish Assembly - Grouped separately so it sits perfectly at the end of the boom
  const dishAssembly = new THREE.Group();
  dishAssembly.position.set(0, 0, boomLength); // Offset outwards by the boom's exact length

  // Parabolic Reflector
  const profilePts = [];
  const depth = 0.4;
  const radius = 1.0;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    profilePts.push(new THREE.Vector2(radius * Math.sqrt(t), t * depth));
  }
  const dishGeo = new THREE.LatheGeometry(profilePts, 32);
  const reflector = new THREE.Mesh(dishGeo, matWhite);
  // Lathe builds towards +Y by default. Rotate to face +Z (outwards relative to dishAssembly)
  reflector.rotation.x = Math.PI / 2;
  dishAssembly.add(reflector);

  // Feed Horn Setup
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.08, 0.4, 12), matSilver);
  horn.position.set(0, 0, 0.6); // Place exactly in front of the dish (+Z)
  horn.rotation.x = -Math.PI / 2; // Point wide base backwards towards dish
  dishAssembly.add(horn);

  // Quad Support Struts
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const sx = Math.cos(angle) * radius * 0.85;
    const sy = Math.sin(angle) * radius * 0.85;

    const strutGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.7, 6);
    const strut = new THREE.Mesh(strutGeo, matSilver);
    strut.position.set(sx * 0.5, sy * 0.5, 0.3);
    // Orient strut to connect rim to the feed horn
    strut.lookAt(0, 0, 0.6);
    strut.rotateX(Math.PI / 2);
    dishAssembly.add(strut);
  }

  pivotGroup.add(dishAssembly);

  // 3. Global Positioning and Orientation 
  // Anchor the pivot point directly onto the Z face of the bus (1.6 depth / 2 = 0.8)
  pivotGroup.position.set(0, 0.2, direction * 0.8);

  // If this is the rear dish, flip the entire assembly 180 degrees so it builds outwards
  if (direction === -1) {
    pivotGroup.rotation.y = Math.PI;
  }

  // Because the pivot point is at the bus surface, applying rotation here 
  // safely tilts the dish without ripping the boom out of the satellite body.
  pivotGroup.rotation.x = -Math.PI / 12;
  pivotGroup.rotation.y += (direction * Math.PI / 8);

  return pivotGroup;
}

export function createSatellite() {
  const satellite = new THREE.Group();
  satellite.name = 'satellite';

  const bus = buildBus();
  satellite.add(bus);

  // Wings on the X axis
  const wingRight = buildSolarWing(1);
  const wingLeft = buildSolarWing(-1);
  satellite.add(wingRight, wingLeft);

  // Large communication dishes on the Z axis (front/back faces)
  const dishFront = buildLateralDish(1);
  const dishBack = buildLateralDish(-1);
  satellite.add(dishFront, dishBack);

  satellite.userData.bodyMesh = bus.getObjectByName('busBody');
  satellite.userData.panelMaterial = matPanel;
  satellite.userData.wings = [wingRight, wingLeft];
  satellite.userData.dishes = [dishFront, dishBack];

  return satellite;
}