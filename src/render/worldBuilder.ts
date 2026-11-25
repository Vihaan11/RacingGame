import * as THREE from 'three';
import {
  BARRIER_LIMIT,
  GRAVEL_OUTER_EDGE,
  KERB_OUTER_EDGE,
  RaceTrack,
  START_FINISH_T,
  TRACK_HALF_WIDTH,
} from '../sim/track';
import type { TrackTextureSet } from './textures';

export interface WorldHandles {
  group: THREE.Group;
  asphaltMaterial: THREE.MeshStandardMaterial;
  floodlightHeads: THREE.MeshStandardMaterial;
  floodPointLights: THREE.PointLight[];
  gantryLights: THREE.MeshStandardMaterial[];
  lakeMaterial: THREE.MeshStandardMaterial;
  setStartLightState: (redCount: number, isGreen: boolean) => void;
  setNightMode: (nightFactor: number) => void;
}

/**
 * Generates a continuous closed ribbon BufferGeometry along the track spline
 * between lateral offsets [latLeft, latRight] with Y offset for clean depth separation.
 */
function buildTrackRibbon(
  track: RaceTrack,
  latLeft: number,
  latRight: number,
  yOffset: number,
  uScale = 1,
  vScale = 1,
): THREE.BufferGeometry {
  const n = track.sampleCount;
  const positions = new Float32Array((n + 1) * 2 * 3);
  const normals = new Float32Array((n + 1) * 2 * 3);
  const uvs = new Float32Array((n + 1) * 2 * 2);
  const indices: number[] = [];

  for (let i = 0; i <= n; i++) {
    const s = track.samples[i % n];
    const vCoord = (i / n) * vScale;

    const lx = s.x + s.rx * latLeft;
    const ly = s.y + yOffset;
    const lz = s.z + s.rz * latLeft;

    const rx = s.x + s.rx * latRight;
    const ry = s.y + yOffset;
    const rz = s.z + s.rz * latRight;

    const vIdx = i * 2;
    positions[vIdx * 3] = lx;
    positions[vIdx * 3 + 1] = ly;
    positions[vIdx * 3 + 2] = lz;

    positions[(vIdx + 1) * 3] = rx;
    positions[(vIdx + 1) * 3 + 1] = ry;
    positions[(vIdx + 1) * 3 + 2] = rz;

    normals[vIdx * 3] = 0;
    normals[vIdx * 3 + 1] = 1;
    normals[vIdx * 3 + 2] = 0;

    normals[(vIdx + 1) * 3] = 0;
    normals[(vIdx + 1) * 3 + 1] = 1;
    normals[(vIdx + 1) * 3 + 2] = 0;

    uvs[vIdx * 2] = 0;
    uvs[vIdx * 2 + 1] = vCoord;

    uvs[(vIdx + 1) * 2] = uScale;
    uvs[(vIdx + 1) * 2 + 1] = vCoord;

    if (i < n) {
      const a = vIdx;
      const b = vIdx + 1;
      const c = vIdx + 2;
      const d = vIdx + 3;
      // Winding facing +Y
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds vertical steel Armco barrier ribbons along both sides of the circuit.
 */
function buildGuardrailRibbon(
  track: RaceTrack,
  latOffset: number,
  height: number,
  flipSide: boolean,
): THREE.BufferGeometry {
  const n = track.sampleCount;
  const positions = new Float32Array((n + 1) * 2 * 3);
  const uvs = new Float32Array((n + 1) * 2 * 2);
  const indices: number[] = [];

  for (let i = 0; i <= n; i++) {
    const s = track.samples[i % n];
    const bx = s.x + s.rx * latOffset;
    const by = s.y + 0.05;
    const bz = s.z + s.rz * latOffset;

    const vIdx = i * 2;
    positions[vIdx * 3] = bx;
    positions[vIdx * 3 + 1] = by;
    positions[vIdx * 3 + 2] = bz;

    positions[(vIdx + 1) * 3] = bx;
    positions[(vIdx + 1) * 3 + 1] = by + height;
    positions[(vIdx + 1) * 3 + 2] = bz;

    uvs[vIdx * 2] = i * 0.25;
    uvs[vIdx * 2 + 1] = 0;
    uvs[(vIdx + 1) * 2] = i * 0.25;
    uvs[(vIdx + 1) * 2 + 1] = 1;

    if (i < n) {
      const a = vIdx;
      const b = vIdx + 1;
      const c = vIdx + 2;
      const d = vIdx + 3;
      if (flipSide) {
        indices.push(a, c, b, b, c, d);
      } else {
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildAlpineWorld(
  track: RaceTrack,
  textures: TrackTextureSet,
  isSoftwareGl: boolean,
): WorldHandles {
  const group = new THREE.Group();

  // 1. Extended Alpine Terrain Mesh (760m x 760m) with smooth vertex-color biome shading
  const terrainSize = 860;
  const terrainSegs = 96;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegs, terrainSegs);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  const cGrass = new THREE.Color(0x3a5a32);
  const cMeadow = new THREE.Color(0x4b6b3a);
  const cRock = new THREE.Color(0x575b63);
  const cSnow = new THREE.Color(0xdbe4ef);
  const tmpCol = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    // Center terrain around circuit center (95, 0)
    const wx = posAttr.getX(i) + 95;
    const wz = posAttr.getZ(i);
    const wy = track.groundHeightAt(wx, wz) - 0.14;
    posAttr.setXYZ(i, wx, wy, wz);

    if (wy > 26) {
      tmpCol.copy(cRock).lerp(cSnow, Math.min(1, (wy - 26) / 18));
    } else if (wy > 12) {
      tmpCol.copy(cGrass).lerp(cRock, (wy - 12) / 14);
    } else {
      const n = (Math.sin(wx * 0.04) * Math.cos(wz * 0.04) + 1) * 0.5;
      tmpCol.copy(cGrass).lerp(cMeadow, n);
    }
    colors[i * 3] = tmpCol.r;
    colors[i * 3 + 1] = tmpCol.g;
    colors[i * 3 + 2] = tmpCol.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = !isSoftwareGl;
  group.add(terrainMesh);

  // 2. Alpine Lake surface on the southeast side of the circuit
  const lakeMaterial = new THREE.MeshStandardMaterial({
    color: 0x1b4f6e,
    roughness: 0.18,
    metalness: 0.32,
    envMapIntensity: 1.2,
  });
  const lake = new THREE.Mesh(new THREE.CircleGeometry(135, 36), lakeMaterial);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(275, -0.85, 200);
  group.add(lake);

  // 3. Gravel Run-Off Aprons (Y = +0.02 above terrain)
  const gravelMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.gravelMap,
    roughness: 0.95,
    metalness: 0.02,
  });
  const gravelGeo = buildTrackRibbon(track, -GRAVEL_OUTER_EDGE, GRAVEL_OUTER_EDGE, 0.01, 1, 1);
  const gravelMesh = new THREE.Mesh(gravelGeo, gravelMat);
  gravelMesh.receiveShadow = !isSoftwareGl;
  group.add(gravelMesh);

  // 4. Main Asphalt Road Surface (Y = +0.04 above gravel to guarantee zero Z-fighting)
  const asphaltMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.asphaltMap,
    bumpMap: textures.asphaltBump,
    bumpScale: 0.024,
    roughnessMap: textures.asphaltRoughness,
    roughness: 0.82,
    metalness: 0.04,
    envMapIntensity: 0.55,
  });
  const roadGeo = buildTrackRibbon(track, -TRACK_HALF_WIDTH, TRACK_HALF_WIDTH, 0.04, 1, 1);
  const roadMesh = new THREE.Mesh(roadGeo, asphaltMaterial);
  roadMesh.receiveShadow = !isSoftwareGl;
  group.add(roadMesh);

  // 5. Red & White FIA Kerbs (left and right shoulders, Y = +0.065)
  const kerbMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.kerbMap,
    roughness: 0.72,
    metalness: 0.05,
  });
  const leftKerb = new THREE.Mesh(
    buildTrackRibbon(track, -KERB_OUTER_EDGE, -TRACK_HALF_WIDTH + 0.05, 0.065, 1, 1),
    kerbMat,
  );
  const rightKerb = new THREE.Mesh(
    buildTrackRibbon(track, TRACK_HALF_WIDTH - 0.05, KERB_OUTER_EDGE, 0.065, 1, 1),
    kerbMat,
  );
  leftKerb.receiveShadow = !isSoftwareGl;
  rightKerb.receiveShadow = !isSoftwareGl;
  group.add(leftKerb, rightKerb);

  // 6. Armco Steel Guardrails along outer boundary (±BARRIER_LIMIT)
  const barrierMat = new THREE.MeshStandardMaterial({
    color: 0xb8c0cc,
    metalness: 0.72,
    roughness: 0.36,
    side: THREE.DoubleSide,
  });
  const leftBarrier = new THREE.Mesh(
    buildGuardrailRibbon(track, -BARRIER_LIMIT, 1.05, false),
    barrierMat,
  );
  const rightBarrier = new THREE.Mesh(
    buildGuardrailRibbon(track, BARRIER_LIMIT, 1.05, true),
    barrierMat,
  );
  group.add(leftBarrier, rightBarrier);

  // 7. Checkered Start/Finish Line Strip (Y = +0.068, polygonOffset for crispness)
  const sfSample = track.sampleAt(START_FINISH_T);
  const sfHeading = track.getHeadingAt(START_FINISH_T);
  const finishPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 2 - 0.8, 3.6),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.finishLineMap,
      roughness: 0.65,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  finishPlane.rotation.order = 'YXZ';
  finishPlane.rotation.y = sfHeading;
  finishPlane.rotation.x = -Math.PI / 2;
  finishPlane.position.set(sfSample.x, sfSample.y + 0.068, sfSample.z);
  group.add(finishPlane);

  // 8. Signature Start/Finish Timing Gantry & 5 Race Launch Lights (Tall Spawn Vista Landmark!)
  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(sfSample.x, sfSample.y, sfSample.z);
  gantryGroup.rotation.y = sfHeading;

  const trussMat = new THREE.MeshStandardMaterial({
    color: 0x262b34,
    metalness: 0.75,
    roughness: 0.35,
  });
  const pillarGeo = new THREE.BoxGeometry(1.1, 9.6, 1.1);
  const pLeft = new THREE.Mesh(pillarGeo, trussMat);
  pLeft.position.set(-(TRACK_HALF_WIDTH + 3.2), 4.8, 0);
  const pRight = new THREE.Mesh(pillarGeo, trussMat);
  pRight.position.set(TRACK_HALF_WIDTH + 3.2, 4.8, 0);
  pLeft.castShadow = !isSoftwareGl;
  pRight.castShadow = !isSoftwareGl;

  const bridgeBeam = new THREE.Mesh(
    new THREE.BoxGeometry((TRACK_HALF_WIDTH + 3.8) * 2, 2.2, 1.4),
    trussMat,
  );
  bridgeBeam.position.set(0, 8.6, 0);
  bridgeBeam.castShadow = !isSoftwareGl;

  const bannerFront = new THREE.Mesh(
    new THREE.PlaneGeometry((TRACK_HALF_WIDTH + 3.0) * 2, 1.95),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.gantryBannerMap,
      roughness: 0.45,
      metalness: 0.15,
    }),
  );
  bannerFront.position.set(0, 8.6, 0.72);

  const bannerBack = bannerFront.clone();
  bannerBack.rotation.y = Math.PI;
  bannerBack.position.set(0, 8.6, -0.72);

  gantryGroup.add(pLeft, pRight, bridgeBeam, bannerFront, bannerBack);

  // 5 Overhead Race Start Signal Lights
  const gantryLights: THREE.MeshStandardMaterial[] = [];
  const lightBox = new THREE.Mesh(new THREE.BoxGeometry(6.8, 1.05, 0.45), trussMat);
  lightBox.position.set(0, 6.95, 0.55);
  gantryGroup.add(lightBox);

  const bulbGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.12, 14);
  bulbGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const lMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
      roughness: 0.2,
    });
    const bulb = new THREE.Mesh(bulbGeo, lMat);
    bulb.position.set(-2.4 + i * 1.2, 6.95, 0.8);
    gantryGroup.add(bulb);
    gantryLights.push(lMat);
  }
  group.add(gantryGroup);

  // 9. Pit Lane Garages, Race Control Tower & Grandstands flanking the Main Straight
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.82, metalness: 0.08 });
  const darkRoofMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.42, metalness: 0.55 });
  const redAccentMat = new THREE.MeshStandardMaterial({ color: 0xd92626, roughness: 0.45, metalness: 0.25 });
  const windowMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f1c2e,
    roughness: 0.12,
    metalness: 0.65,
    clearcoat: 1.0,
  });

  // Grandstand on Left side of main straight (x = -26)
  const grandstand = new THREE.Group();
  grandstand.position.set(sfSample.x - 27, sfSample.y, sfSample.z + 18);
  const standBase = new THREE.Mesh(new THREE.BoxGeometry(10, 6.5, 68), concreteMat);
  standBase.position.set(0, 3.25, 0);
  const standRoof = new THREE.Mesh(new THREE.BoxGeometry(13, 0.7, 70), darkRoofMat);
  standRoof.position.set(1.8, 10.6, 0);
  standRoof.rotation.z = -0.14;
  const standFascia = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 70), redAccentMat);
  standFascia.position.set(8.2, 9.7, 0);
  grandstand.add(standBase, standRoof, standFascia);
  // Tiered spectator steps
  for (let tier = 0; tier < 4; tier++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 66), tier % 2 === 0 ? redAccentMat : concreteMat);
    step.position.set(4.5 - tier * 1.8, 1.5 + tier * 1.3, 0);
    grandstand.add(step);
  }
  group.add(grandstand);

  // Pit Complex & Tall Race Control Tower on Right side of main straight (x = +27)
  const pitBuilding = new THREE.Group();
  pitBuilding.position.set(sfSample.x + 28, sfSample.y, sfSample.z + 12);
  const pitHall = new THREE.Mesh(new THREE.BoxGeometry(11, 6.2, 74), concreteMat);
  pitHall.position.set(0, 3.1, 0);
  const pitGlass = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 70), windowMat);
  pitGlass.position.set(-5.6, 4.4, 0);
  const pitTrim = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.65, 74.6), redAccentMat);
  pitTrim.position.set(0, 6.3, 0);
  // Tall Glass Race Control Tower
  const towerCore = new THREE.Mesh(new THREE.BoxGeometry(7.5, 16.5, 9.5), concreteMat);
  towerCore.position.set(1.5, 8.25, -24);
  const towerObs = new THREE.Mesh(new THREE.BoxGeometry(9.2, 3.6, 11.2), windowMat);
  towerObs.position.set(0.5, 15.2, -24);
  const towerCap = new THREE.Mesh(new THREE.BoxGeometry(10.0, 0.6, 12.0), darkRoofMat);
  towerCap.position.set(0.5, 17.3, -24);
  pitBuilding.add(pitHall, pitGlass, pitTrim, towerCore, towerObs, towerCap);
  group.add(pitBuilding);

  // 10. Trackside Floodlight Towers around the circuit (for Sunset & Night lighting)
  const floodlightHeads = new THREE.MeshStandardMaterial({
    color: 0xe5e7eb,
    emissive: new THREE.Color(0xfff4d6),
    emissiveIntensity: 0.15,
    roughness: 0.2,
  });
  const floodPointLights: THREE.PointLight[] = [];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.7, roughness: 0.4 });
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.28, 12.5, 8);
  const headGeo = new THREE.BoxGeometry(2.4, 0.55, 0.9);

  const floodIndices = [16, 56, 108, 168, 224, 286, 344, 392];
  floodIndices.forEach((sampleIdx, idx) => {
    const s = track.samples[sampleIdx % track.sampleCount];
    const side = idx % 2 === 0 ? 1 : -1;
    const fx = s.x + s.rx * (BARRIER_LIMIT + 3.2) * side;
    const fz = s.z + s.rz * (BARRIER_LIMIT + 3.2) * side;
    const fy = s.y;

    const tower = new THREE.Group();
    tower.position.set(fx, fy, fz);
    tower.rotation.y = track.getHeadingAt(s.t);

    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 6.25;
    const head = new THREE.Mesh(headGeo, floodlightHeads);
    head.position.set(-side * 1.1, 12.3, 0);
    tower.add(pole, head);
    group.add(tower);

    // Keep unshadowed PointLights within budget (5 lights spread around key sectors)
    if (idx < 5) {
      const pl = new THREE.PointLight(0xffeed4, 0, 88, 1.35);
      pl.position.set(s.x, fy + 11.5, s.z);
      group.add(pl);
      floodPointLights.push(pl);
    }
  });

  // 11. InstancedMesh Alpine Pine Forest (composite trunk + 2-tier foliage with scale & tint variation)
  const treePositions: Array<{ x: number; y: number; z: number; scale: number; tint: number }> = [];
  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 420; i++) {
    const x = -170 + rand() * 540;
    const z = -340 + rand() * 640;
    const proj = track.project(x, z);
    // Keep clear of track corridor, pit complex, grandstands, and alpine lake
    if (Math.abs(proj.lateralOffset) < BARRIER_LIMIT + 9) continue;
    if (Math.hypot(x - 275, z - 200) < 138) continue;
    if (Math.abs(x) < 42 && z > -60 && z < 80) continue;

    const y = track.groundHeightAt(x, z);
    if (y < 0.2 || y > 24) continue;
    treePositions.push({
      x,
      y,
      z,
      scale: 0.85 + rand() * 0.42,
      tint: rand(),
    });
  }

  const count = treePositions.length;
  const trunkGeo = new THREE.CylinderGeometry(0.24, 0.38, 2.4, 7);
  trunkGeo.translate(0, 1.2, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3621, roughness: 0.92 });

  const coneLowGeo = new THREE.ConeGeometry(2.1, 4.6, 8);
  coneLowGeo.translate(0, 4.1, 0);
  const coneTopGeo = new THREE.ConeGeometry(1.45, 3.8, 8);
  coneTopGeo.translate(0, 6.8, 0);
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.02 });

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const coneLowInst = new THREE.InstancedMesh(coneLowGeo, foliageMat, count);
  const coneTopInst = new THREE.InstancedMesh(coneTopGeo, foliageMat, count);

  const dummy = new THREE.Object3D();
  const basePineA = new THREE.Color(0x1f4228);
  const basePineB = new THREE.Color(0x2e5932);
  const instCol = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const tp = treePositions[i];
    dummy.position.set(tp.x, tp.y - 0.15, tp.z);
    dummy.rotation.set(0, tp.tint * Math.PI * 2, 0);
    dummy.scale.setScalar(tp.scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);
    coneLowInst.setMatrixAt(i, dummy.matrix);
    coneTopInst.setMatrixAt(i, dummy.matrix);

    instCol.copy(basePineA).lerp(basePineB, tp.tint);
    coneLowInst.setColorAt(i, instCol);
    coneTopInst.setColorAt(i, instCol.clone().multiplyScalar(1.12));
  }
  trunkInst.instanceMatrix.needsUpdate = true;
  coneLowInst.instanceMatrix.needsUpdate = true;
  coneTopInst.instanceMatrix.needsUpdate = true;
  if (coneLowInst.instanceColor) coneLowInst.instanceColor.needsUpdate = true;
  if (coneTopInst.instanceColor) coneTopInst.instanceColor.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  coneLowInst.computeBoundingSphere();
  coneTopInst.computeBoundingSphere();
  group.add(trunkInst, coneLowInst, coneTopInst);

  // 12. Distant Alpine Mountain Peaks framing the horizon
  const peakGeo = new THREE.ConeGeometry(62, 115, 7);
  peakGeo.translate(0, 52, 0);
  const peakMat = new THREE.MeshStandardMaterial({
    color: 0x4b5563,
    roughness: 0.94,
    metalness: 0.04,
  });
  const peakRingCount = 16;
  const peakInst = new THREE.InstancedMesh(peakGeo, peakMat, peakRingCount);
  for (let i = 0; i < peakRingCount; i++) {
    const angle = (i / peakRingCount) * Math.PI * 2;
    const dist = 395 + (i % 3) * 42;
    dummy.position.set(95 + Math.cos(angle) * dist, -4, Math.sin(angle) * dist);
    dummy.rotation.set(0, angle * 1.7, 0);
    const s = 0.85 + (i % 4) * 0.25;
    dummy.scale.set(s * 1.4, s, s * 1.2);
    dummy.updateMatrix();
    peakInst.setMatrixAt(i, dummy.matrix);
  }
  peakInst.instanceMatrix.needsUpdate = true;
  peakInst.computeBoundingSphere();
  group.add(peakInst);

  const setStartLightState = (redCount: number, isGreen: boolean) => {
    for (let i = 0; i < gantryLights.length; i++) {
      const m = gantryLights[i];
      if (isGreen) {
        m.emissive.setHex(0x22c55e);
        m.emissiveIntensity = 4.0;
        m.color.setHex(0x22c55e);
      } else if (i < redCount) {
        m.emissive.setHex(0xef4444);
        m.emissiveIntensity = 3.8;
        m.color.setHex(0xef4444);
      } else {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
        m.color.setHex(0x222222);
      }
    }
  };

  const setNightMode = (nightFactor: number) => {
    floodlightHeads.emissiveIntensity = 0.15 + nightFactor * 4.2;
    for (const pl of floodPointLights) {
      pl.intensity = nightFactor * 42;
    }
  };

  return {
    group,
    asphaltMaterial,
    floodlightHeads,
    floodPointLights,
    gantryLights,
    lakeMaterial,
    setStartLightState,
    setNightMode,
  };
}
