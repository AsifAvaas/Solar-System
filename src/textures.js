import * as THREE from 'three';

// Procedural canvas textures for the satellite. Generated in-code (no image
// assets) so every material gets real surface detail without pulling in
// external files. Each function returns a ready-to-use THREE.CanvasTexture
// with sensible wrap/repeat set.

function makeCanvas(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function finish(canvas, repeatX = 2, repeatY = 2) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Crinkled gold/silver Multi-Layer Insulation (MLI) thermal blanket foil.
// Exported too — the satellite reuses this to generate alternate body
// liveries for the mouse-click texture swap.
export function mliFoilTexture(baseColor, size = 256) {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // quilted diamond seams
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  const step = size / 8;
  for (let i = -8; i <= 16; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step - size, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step + size, size);
    ctx.stroke();
  }

  // random crinkle highlights/shadows
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 4 + Math.random() * 14;
    const angle = Math.random() * Math.PI * 2;
    ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  return finish(canvas, 3, 4);
}

// Brushed metal: fine directional noise streaks.
function brushedMetalTexture(baseColor, size = 256) {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y++) {
    const shade = Math.random() * 30 - 15;
    ctx.strokeStyle = `rgba(${shade > 0 ? 255 : 0},${shade > 0 ? 255 : 0},${shade > 0 ? 255 : 0},${Math.abs(shade) / 60})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  // a few subtle panel seams
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo((i * size) / 4, 0);
    ctx.lineTo((i * size) / 4, size);
    ctx.stroke();
  }

  return finish(canvas, 2, 2);
}

// Dark electronics chassis: granular noise + rectangular access-panel seams + rivets.
function darkChassisTexture(size = 256) {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#1c1e20';
  ctx.fillRect(0, 0, size, size);

  const imgData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    imgData.data[i] += n;
    imgData.data[i + 1] += n;
    imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);

  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(size * 0.08, size * 0.08, size * 0.84, size * 0.84);
  ctx.strokeRect(size * 0.3, size * 0.3, size * 0.4, size * 0.4);

  ctx.fillStyle = 'rgba(200,200,200,0.5)';
  const rivetPositions = [0.1, 0.9];
  rivetPositions.forEach((rx) => {
    rivetPositions.forEach((ry) => {
      ctx.beginPath();
      ctx.arc(rx * size, ry * size, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  return finish(canvas, 2, 2);
}

// Solar cell array: grid of dark-blue photovoltaic cells with corner glints
// and thin silver conductive strips — matches the LineSegments cell grid
// already drawn over the panels.
function solarCellTexture(cols = 8, rows = 16, size = 512) {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#0d2440';
  ctx.fillRect(0, 0, size, size);

  const cellW = size / cols;
  const cellH = size / rows;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = c * cellW;
      const y = r * cellH;
      const shade = 0.85 + Math.random() * 0.3;
      ctx.fillStyle = `rgb(${18 * shade}, ${58 * shade}, ${102 * shade})`;
      ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

      // diagonal glint on each cell
      ctx.strokeStyle = 'rgba(150,200,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + cellH - 2);
      ctx.lineTo(x + cellW - 2, y + 2);
      ctx.stroke();

      // thin conductive strip
      ctx.strokeStyle = 'rgba(200,200,200,0.4)';
      ctx.beginPath();
      ctx.moveTo(x + cellW * 0.5, y);
      ctx.lineTo(x + cellW * 0.5, y + cellH);
      ctx.stroke();
    }
  }

  return finish(canvas, 1, 1);
}

// White MLI/radiator quilting — similar seams to gold foil but pale and flat.
function whiteQuiltTexture(size = 256) {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(120,120,120,0.4)';
  ctx.lineWidth = 1.2;
  const cell = size / 6;
  for (let i = 0; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      ctx.strokeStyle = 'rgba(180,180,180,0.5)';
      ctx.beginPath();
      ctx.arc(i * cell + cell / 2, j * cell + cell / 2, cell * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  return finish(canvas, 2, 3);
}

// Matte black lens/optics coating with a faint radial reflection ring.
function lensTexture(size = 128) {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, size, size);

  const grad = ctx.createRadialGradient(size * 0.4, size * 0.4, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(160,190,220,0.45)');
  grad.addColorStop(0.3, 'rgba(40,40,40,0.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  return finish(canvas, 1, 1);
}

export function createProceduralTextures() {
  return {
    gold: mliFoilTexture('#8a6a1e'),
    silverBrushed: brushedMetalTexture('#b9bec3'),
    darkChassis: darkChassisTexture(),
    solarCell: solarCellTexture(8, 16),
    whiteQuilt: whiteQuiltTexture(),
    lens: lensTexture(),
  };
}
