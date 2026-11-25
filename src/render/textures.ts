import * as THREE from 'three';

export interface TrackTextureSet {
  asphaltMap: THREE.CanvasTexture;
  asphaltBump: THREE.CanvasTexture;
  asphaltRoughness: THREE.CanvasTexture;
  kerbMap: THREE.CanvasTexture;
  gravelMap: THREE.CanvasTexture;
  carbonMap: THREE.CanvasTexture;
  finishLineMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  gantryBannerMap: THREE.CanvasTexture;
  rainStreakMap: THREE.CanvasTexture;
  smokePuffMap: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createTrackTextures(maxAnisotropy: number): TrackTextureSet {
  const aniso = Math.max(1, Math.min(maxAnisotropy, 16));

  // 1. Asphalt albedo + bump + roughness
  const [aCanvas, aCtx] = makeCanvas(512, 512);
  aCtx.fillStyle = '#25282e';
  aCtx.fillRect(0, 0, 512, 512);

  // Subtle darker rubberized racing groove down center-left & center-right
  const grooveGrad = aCtx.createLinearGradient(0, 0, 512, 0);
  grooveGrad.addColorStop(0.0, 'rgba(15,17,22,0.18)');
  grooveGrad.addColorStop(0.18, 'rgba(12,14,18,0.38)');
  grooveGrad.addColorStop(0.5, 'rgba(30,33,40,0.06)');
  grooveGrad.addColorStop(0.82, 'rgba(12,14,18,0.38)');
  grooveGrad.addColorStop(1.0, 'rgba(15,17,22,0.18)');
  aCtx.fillStyle = grooveGrad;
  aCtx.fillRect(0, 0, 512, 512);

  // Fine mineral aggregate noise
  for (let i = 0; i < 16000; i++) {
    const x = (i * 73) % 512;
    const y = ((i * 197) + Math.floor(i / 512) * 37) % 512;
    const shade = 28 + ((i * 29) % 34);
    aCtx.fillStyle = `rgb(${shade},${shade + 1},${shade + 4})`;
    aCtx.fillRect(x, y, 2, 2);
  }

  // Crisp FIA white track limit edge lines
  aCtx.fillStyle = '#e5e7eb';
  aCtx.fillRect(18, 0, 10, 512);
  aCtx.fillRect(484, 0, 10, 512);

  // Subtle dashed center reference line
  aCtx.fillStyle = 'rgba(229, 231, 235, 0.24)';
  for (let y = 16; y < 512; y += 64) {
    aCtx.fillRect(254, y, 4, 28);
  }

  const asphaltMap = new THREE.CanvasTexture(aCanvas);
  asphaltMap.colorSpace = THREE.SRGBColorSpace;
  asphaltMap.wrapS = THREE.RepeatWrapping;
  asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltMap.repeat.set(1, 160);
  asphaltMap.anisotropy = aniso;

  // Asphalt Bump Map (linear space)
  const [bCanvas, bCtx] = makeCanvas(256, 256);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 12000; i++) {
    const x = (i * 53) % 256;
    const y = (i * 131 + Math.floor(i / 256) * 19) % 256;
    const v = 90 + ((i * 47) % 85);
    bCtx.fillStyle = `rgb(${v},${v},${v})`;
    bCtx.fillRect(x, y, 2, 2);
  }
  const asphaltBump = new THREE.CanvasTexture(bCanvas);
  asphaltBump.wrapS = THREE.RepeatWrapping;
  asphaltBump.wrapT = THREE.RepeatWrapping;
  asphaltBump.repeat.set(2, 260);
  asphaltBump.anisotropy = aniso;

  // Asphalt Roughness Map (linear)
  const [rCanvas, rCtx] = makeCanvas(256, 256);
  rCtx.fillStyle = '#cfcfcf';
  rCtx.fillRect(0, 0, 256, 256);
  const rGrad = rCtx.createLinearGradient(0, 0, 256, 0);
  rGrad.addColorStop(0, '#dedede');
  rGrad.addColorStop(0.25, '#a8a8a8');
  rGrad.addColorStop(0.5, '#c8c8c8');
  rGrad.addColorStop(0.75, '#a8a8a8');
  rGrad.addColorStop(1, '#dedede');
  rCtx.fillStyle = rGrad;
  rCtx.fillRect(0, 0, 256, 256);
  const asphaltRoughness = new THREE.CanvasTexture(rCanvas);
  asphaltRoughness.wrapS = THREE.RepeatWrapping;
  asphaltRoughness.wrapT = THREE.RepeatWrapping;
  asphaltRoughness.repeat.set(1, 140);
  asphaltRoughness.anisotropy = aniso;

  // 2. Red & White FIA Apex Kerb Texture
  const [kCanvas, kCtx] = makeCanvas(128, 256);
  kCtx.fillStyle = '#d92626';
  kCtx.fillRect(0, 0, 128, 128);
  kCtx.fillStyle = '#f1f5f9';
  kCtx.fillRect(0, 128, 128, 128);
  // Subtle concrete wear
  kCtx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 600; i++) {
    kCtx.fillRect((i * 37) % 128, (i * 89) % 256, 3, 2);
  }
  const kerbMap = new THREE.CanvasTexture(kCanvas);
  kerbMap.colorSpace = THREE.SRGBColorSpace;
  kerbMap.wrapS = THREE.RepeatWrapping;
  kerbMap.wrapT = THREE.RepeatWrapping;
  kerbMap.repeat.set(1, 220);
  kerbMap.anisotropy = aniso;

  // 3. Gravel Run-off Texture
  const [gCanvas, gCtx] = makeCanvas(256, 256);
  gCtx.fillStyle = '#7c766c';
  gCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7000; i++) {
    const x = (i * 61) % 256;
    const y = (i * 107 + Math.floor(i / 256) * 23) % 256;
    const v = 95 + ((i * 31) % 55);
    gCtx.fillStyle = `rgb(${v + 8},${v + 2},${v - 8})`;
    gCtx.fillRect(x, y, 2, 2);
  }
  const gravelMap = new THREE.CanvasTexture(gCanvas);
  gravelMap.colorSpace = THREE.SRGBColorSpace;
  gravelMap.wrapS = THREE.RepeatWrapping;
  gravelMap.wrapT = THREE.RepeatWrapping;
  gravelMap.repeat.set(2, 180);
  gravelMap.anisotropy = aniso;

  // 4. Carbon Fiber Weave Texture
  const [cCanvas, cCtx] = makeCanvas(64, 64);
  cCtx.fillStyle = '#14161a';
  cCtx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) {
    for (let x = 0; x < 64; x += 8) {
      const alt = ((x + y) / 8) % 2 === 0;
      cCtx.fillStyle = alt ? '#23272f' : '#181b21';
      cCtx.fillRect(x, y, 6, 4);
      cCtx.fillStyle = alt ? '#1b1f26' : '#292e38';
      cCtx.fillRect(x + 2, y + 4, 6, 4);
    }
  }
  const carbonMap = new THREE.CanvasTexture(cCanvas);
  carbonMap.colorSpace = THREE.SRGBColorSpace;
  carbonMap.wrapS = THREE.RepeatWrapping;
  carbonMap.wrapT = THREE.RepeatWrapping;
  carbonMap.repeat.set(6, 6);
  carbonMap.anisotropy = aniso;

  // 5. Checkered Start/Finish Line
  const [fCanvas, fCtx] = makeCanvas(512, 128);
  const cols = 16;
  const rows = 4;
  const cw = 512 / cols;
  const ch = 128 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      fCtx.fillStyle = (r + c) % 2 === 0 ? '#f8fafc' : '#111318';
      fCtx.fillRect(c * cw, r * ch, cw, ch);
    }
  }
  const finishLineMap = new THREE.CanvasTexture(fCanvas);
  finishLineMap.colorSpace = THREE.SRGBColorSpace;
  finishLineMap.anisotropy = aniso;

  // 6. Soft Radial Contact Shadow Disc
  const [sCanvas, sCtx] = makeCanvas(256, 256);
  const grad = sCtx.createRadialGradient(128, 128, 16, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.58, 'rgba(0, 0, 0, 0.42)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 256, 256);
  const contactShadowMap = new THREE.CanvasTexture(sCanvas);

  // 7. Overhead Timing Gantry Banner
  const [gbCanvas, gbCtx] = makeCanvas(1024, 192);
  gbCtx.fillStyle = '#0d1017';
  gbCtx.fillRect(0, 0, 1024, 192);
  gbCtx.fillStyle = '#f59e0b';
  gbCtx.fillRect(0, 0, 1024, 12);
  gbCtx.fillRect(0, 180, 1024, 12);
  gbCtx.fillStyle = '#dc2626';
  gbCtx.fillRect(36, 36, 18, 120);
  gbCtx.fillRect(970, 36, 18, 120);
  gbCtx.fillStyle = '#f8fafc';
  gbCtx.font = 'bold 74px sans-serif';
  gbCtx.textAlign = 'center';
  gbCtx.textBaseline = 'middle';
  gbCtx.fillText('VELOCE GT  ·  ALPINE GP', 512, 98);
  const gantryBannerMap = new THREE.CanvasTexture(gbCanvas);
  gantryBannerMap.colorSpace = THREE.SRGBColorSpace;
  gantryBannerMap.anisotropy = aniso;

  // 8. Rain Streak Particle Texture (vertical tapered translucent streak)
  const [rnCanvas, rnCtx] = makeCanvas(32, 128);
  const rnGrad = rnCtx.createLinearGradient(16, 0, 16, 128);
  rnGrad.addColorStop(0.0, 'rgba(219, 234, 254, 0.0)');
  rnGrad.addColorStop(0.3, 'rgba(219, 234, 254, 0.45)');
  rnGrad.addColorStop(0.85, 'rgba(255, 255, 255, 0.92)');
  rnGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  rnCtx.fillStyle = rnGrad;
  rnCtx.fillRect(14, 0, 4, 128);
  const rainStreakMap = new THREE.CanvasTexture(rnCanvas);
  rainStreakMap.colorSpace = THREE.SRGBColorSpace;

  // 9. Soft Radial Tire Smoke / Wet Spray Puff Texture
  const [smCanvas, smCtx] = makeCanvas(64, 64);
  const smGrad = smCtx.createRadialGradient(32, 32, 4, 32, 32, 30);
  smGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.78)');
  smGrad.addColorStop(0.55, 'rgba(226, 232, 240, 0.34)');
  smGrad.addColorStop(1.0, 'rgba(226, 232, 240, 0.0)');
  smCtx.fillStyle = smGrad;
  smCtx.fillRect(0, 0, 64, 64);
  const smokePuffMap = new THREE.CanvasTexture(smCanvas);
  smokePuffMap.colorSpace = THREE.SRGBColorSpace;

  return {
    asphaltMap,
    asphaltBump,
    asphaltRoughness,
    kerbMap,
    gravelMap,
    carbonMap,
    finishLineMap,
    contactShadowMap,
    gantryBannerMap,
    rainStreakMap,
    smokePuffMap,
    dispose: () => {
      asphaltMap.dispose();
      asphaltBump.dispose();
      asphaltRoughness.dispose();
      kerbMap.dispose();
      gravelMap.dispose();
      carbonMap.dispose();
      finishLineMap.dispose();
      contactShadowMap.dispose();
      gantryBannerMap.dispose();
      rainStreakMap.dispose();
      smokePuffMap.dispose();
    },
  };
}
