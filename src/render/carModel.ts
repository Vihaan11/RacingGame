import * as THREE from 'three';
import type { TuningConfig } from '../sim/types';

export interface GT3CarRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  wheelPivots: THREE.Group[]; // [FL, FR, RL, RR]
  wheelMeshes: THREE.Group[]; // spinning sub-groups
  wingBlade: THREE.Mesh;
  steeringWheelMesh: THREE.Group;
  paintMaterial: THREE.MeshPhysicalMaterial;
  accentMaterial: THREE.MeshStandardMaterial;
  brakeLightMaterial: THREE.MeshStandardMaterial;
  caliperMaterial: THREE.MeshStandardMaterial;
  headlightLeft?: THREE.SpotLight;
  headlightRight?: THREE.SpotLight;
  headlightGlowMat: THREE.MeshStandardMaterial;
  backfireLeft: THREE.Mesh;
  backfireRight: THREE.Mesh;
  setLivery: (primaryHex: string, accentHex: string) => void;
  applyTuningVisuals: (tuning: TuningConfig) => void;
  updateDynamicParts: (params: {
    steerAngle: number;
    wheelSpin: number;
    pitch: number;
    roll: number;
    rideHeight: number;
    brakeLight: number;
    brakeHeat: number;
    backfireTimer: number;
    headlightsOn: boolean;
  }) => void;
}

/**
 * Builds a composite 12-part sculpted GT3 hypercar with bottom-center ground pivot,
 * extruded beveled body silhouette, clearcoat PBR paint, carbon aero package,
 * articulated wheels, glowing brake calipers, cockpit wheel, and dynamic lights.
 */
export function createGT3Car(options: {
  primaryColor: string;
  accentColor: string;
  carbonMap: THREE.Texture;
  contactShadowMap: THREE.Texture;
  enableSpotLights: boolean;
  isSoftwareGl: boolean;
}): GT3CarRig {
  const { primaryColor, accentColor, carbonMap, contactShadowMap, enableSpotLights, isSoftwareGl } = options;

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Materials with deliberate roughness/metalness contrast
  const paintMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(primaryColor),
    metalness: 0.65,
    roughness: 0.24,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });

  const accentMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentColor),
    metalness: 0.45,
    roughness: 0.32,
  });

  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: carbonMap,
    metalness: 0.25,
    roughness: 0.48,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0c1320,
    metalness: 0.15,
    roughness: 0.08,
    clearcoat: 1.0,
    transparent: true,
    opacity: isSoftwareGl ? 0.58 : 0.72,
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x16171a,
    metalness: 0.04,
    roughness: 0.86,
  });

  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xd4d8e0,
    metalness: 0.92,
    roughness: 0.18,
  });

  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0x525760,
    metalness: 0.8,
    roughness: 0.35,
  });

  const caliperMaterial = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: new THREE.Color(0xff4500),
    emissiveIntensity: 0.0,
    metalness: 0.4,
    roughness: 0.35,
  });

  const headlightGlowMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: new THREE.Color(0xeef6ff),
    emissiveIntensity: 1.6,
    roughness: 0.1,
  });

  const brakeLightMaterial = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    emissive: new THREE.Color(0xff1e1e),
    emissiveIntensity: 0.65,
    roughness: 0.2,
  });

  // 1. Primary Sculpted Lower Chassis (ExtrudeGeometry side profile facing -Z)
  const lowerShape = new THREE.Shape();
  lowerShape.moveTo(-2.22, 0.22); // Front splitter nose (-Z in 3D after rotation)
  lowerShape.lineTo(-2.12, 0.48); // Low GT3 nose tip
  lowerShape.lineTo(-1.38, 0.72); // Hood slope
  lowerShape.lineTo(-0.72, 0.78); // Base of windshield
  lowerShape.lineTo(1.18, 0.84); // Rear fenders & engine deck
  lowerShape.lineTo(2.14, 0.79); // Rear tail deck
  lowerShape.lineTo(2.24, 0.44); // Rear diffuser top
  lowerShape.lineTo(2.02, 0.22); // Rear underfloor
  lowerShape.closePath();

  const lowerGeo = new THREE.ExtrudeGeometry(lowerShape, {
    depth: 1.84,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.07,
    bevelSegments: 3,
  });
  lowerGeo.center();
  // Rotate so X of shape (-2.22 nose -> +2.24 tail) maps onto Z (-2.22 nose -> +2.24 tail)
  lowerGeo.rotateY(-Math.PI / 2);
  const lowerChassis = new THREE.Mesh(lowerGeo, paintMaterial);
  lowerChassis.position.set(0, 0.52, 0);
  lowerChassis.castShadow = !isSoftwareGl;
  lowerChassis.receiveShadow = !isSoftwareGl;
  bodyGroup.add(lowerChassis);

  // 2. Sculpted Cabin Greenhouse & Roof
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-0.88, 0.0);
  cabinShape.lineTo(-0.18, 0.44);
  cabinShape.lineTo(0.76, 0.43);
  cabinShape.lineTo(1.52, 0.04);
  cabinShape.closePath();

  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: 1.32,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  cabinGeo.center();
  cabinGeo.rotateY(-Math.PI / 2);
  const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
  cabinMesh.position.set(0, 0.96, 0.14);
  cabinMesh.castShadow = !isSoftwareGl;
  bodyGroup.add(cabinMesh);

  // Painted roof cap & racing stripe accent
  const roofCap = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.07, 1.06), paintMaterial);
  roofCap.position.set(0, 1.18, 0.22);
  bodyGroup.add(roofCap);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 4.18), accentMaterial);
  stripe.position.set(0, 0.85, -0.02);
  bodyGroup.add(stripe);

  // 3. Sculpted Widebody Fender Flares (4 wheel arches)
  const archGeo = new THREE.BoxGeometry(0.24, 0.34, 1.12);
  const archCoords: [number, number, number][] = [
    [-0.96, 0.56, -1.32],
    [0.96, 0.56, -1.32],
    [-1.0, 0.6, 1.32],
    [1.0, 0.6, 1.32],
  ];
  for (const [ax, ay, az] of archCoords) {
    const arch = new THREE.Mesh(archGeo, paintMaterial);
    arch.position.set(ax, ay, az);
    arch.castShadow = !isSoftwareGl;
    bodyGroup.add(arch);
  }

  // 4. Carbon Fiber Front Splitter, Side Skirts & Rear Venturi Diffuser
  const frontSplitter = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.06, 0.52), carbonMat);
  frontSplitter.position.set(0, 0.21, -2.14);
  bodyGroup.add(frontSplitter);

  const sideSkirtGeo = new THREE.BoxGeometry(0.14, 0.1, 2.38);
  const skirtL = new THREE.Mesh(sideSkirtGeo, carbonMat);
  skirtL.position.set(-1.02, 0.22, 0);
  const skirtR = new THREE.Mesh(sideSkirtGeo, carbonMat);
  skirtR.position.set(1.02, 0.22, 0);
  bodyGroup.add(skirtL, skirtR);

  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.22, 0.44), carbonMat);
  diffuser.position.set(0, 0.28, 2.15);
  bodyGroup.add(diffuser);

  // Diffuser vertical strakes
  for (let i = -2; i <= 2; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.42), carbonMat);
    fin.position.set(i * 0.32, 0.26, 2.18);
    bodyGroup.add(fin);
  }

  // 5. Adjustable GT3 Swan-Neck Rear Wing Assembly
  const pylonGeo = new THREE.BoxGeometry(0.05, 0.44, 0.26);
  const pylonL = new THREE.Mesh(pylonGeo, carbonMat);
  pylonL.position.set(-0.56, 1.02, 1.98);
  const pylonR = new THREE.Mesh(pylonGeo, carbonMat);
  pylonR.position.set(0.56, 1.02, 1.98);
  bodyGroup.add(pylonL, pylonR);

  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.05, 0.36), carbonMat);
  wingBlade.position.set(0, 1.24, 2.04);
  wingBlade.rotation.x = 0.16;
  wingBlade.castShadow = !isSoftwareGl;
  bodyGroup.add(wingBlade);

  const endplateGeo = new THREE.BoxGeometry(0.04, 0.24, 0.46);
  const endL = new THREE.Mesh(endplateGeo, accentMaterial);
  endL.position.set(-0.99, 1.22, 2.04);
  const endR = new THREE.Mesh(endplateGeo, accentMaterial);
  endR.position.set(0.99, 1.22, 2.04);
  bodyGroup.add(endL, endR);

  // 6. Side Aero Mirrors
  const mirrorGeo = new THREE.BoxGeometry(0.22, 0.09, 0.14);
  const mirrorL = new THREE.Mesh(mirrorGeo, carbonMat);
  mirrorL.position.set(-0.96, 0.88, -0.54);
  const mirrorR = new THREE.Mesh(mirrorGeo, carbonMat);
  mirrorR.position.set(0.96, 0.88, -0.54);
  bodyGroup.add(mirrorL, mirrorR);

  // 7. Interior Cockpit Dashboard & Animated Steering Wheel (visible in Cockpit Cam)
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.18, 0.42), carbonMat);
  dash.position.set(0, 0.82, -0.54);
  bodyGroup.add(dash);

  const steeringWheelMesh = new THREE.Group();
  steeringWheelMesh.position.set(-0.28, 0.86, -0.32);
  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 8, 20), carbonMat);
  const wheelTopMark = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.03), accentMaterial);
  wheelTopMark.position.set(0, 0.14, 0);
  const wheelHub = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.03), rimMat);
  steeringWheelMesh.add(wheelRim, wheelTopMark, wheelHub);
  bodyGroup.add(steeringWheelMesh);

  // 8. LED Headlights + Optional SpotLights (Player car)
  const hlGeo = new THREE.BoxGeometry(0.38, 0.09, 0.14);
  const hlL = new THREE.Mesh(hlGeo, headlightGlowMat);
  hlL.position.set(-0.68, 0.56, -2.14);
  const hlR = new THREE.Mesh(hlGeo, headlightGlowMat);
  hlR.position.set(0.68, 0.56, -2.14);
  bodyGroup.add(hlL, hlR);

  let headlightLeft: THREE.SpotLight | undefined;
  let headlightRight: THREE.SpotLight | undefined;
  if (enableSpotLights) {
    const targetL = new THREE.Object3D();
    targetL.position.set(-0.9, 0.1, -24);
    const targetR = new THREE.Object3D();
    targetR.position.set(0.9, 0.1, -24);
    bodyGroup.add(targetL, targetR);

    headlightLeft = new THREE.SpotLight(0xeef6ff, 0, 75, Math.PI / 5.2, 0.55, 1.3);
    headlightLeft.position.set(-0.68, 0.58, -2.22);
    headlightLeft.target = targetL;
    headlightRight = new THREE.SpotLight(0xeef6ff, 0, 75, Math.PI / 5.2, 0.55, 1.3);
    headlightRight.position.set(0.68, 0.58, -2.22);
    headlightRight.target = targetR;
    bodyGroup.add(headlightLeft, headlightRight);
  }

  // 9. Rear Carbon Grille Panel, Engine Louvers, LED Light Bar & Dual Exhausts
  const rearPanel = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.34, 0.06), carbonMat);
  rearPanel.position.set(0, 0.62, 2.21);
  bodyGroup.add(rearPanel);

  // Engine bay cooling louvers along rear deck
  for (let l = 0; l < 4; l++) {
    const louver = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.03, 0.12), carbonMat);
    louver.position.set(0, 0.87, 0.96 + l * 0.24);
    louver.rotation.x = -0.18;
    bodyGroup.add(louver);
  }

  // Side aero intake scoops behind doors
  const scoopGeo = new THREE.BoxGeometry(0.12, 0.28, 0.65);
  const scoopL = new THREE.Mesh(scoopGeo, carbonMat);
  scoopL.position.set(-0.97, 0.56, 0.48);
  const scoopR = new THREE.Mesh(scoopGeo, carbonMat);
  scoopR.position.set(0.97, 0.56, 0.48);
  bodyGroup.add(scoopL, scoopR);

  // Front radiator grille mouth
  const frontGrille = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.2, 0.08), carbonMat);
  frontGrille.position.set(0, 0.34, -2.2);
  bodyGroup.add(frontGrille);

  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.065, 0.05), brakeLightMaterial);
  tailBar.position.set(0, 0.69, 2.245);
  bodyGroup.add(tailBar);

  // Central GT3 FIA rain light in diffuser
  const rainLed = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.06), brakeLightMaterial);
  rainLed.position.set(0, 0.32, 2.38);
  bodyGroup.add(rainLed);

  const exhaustGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.22, 12);
  exhaustGeo.rotateX(Math.PI / 2);
  const exL = new THREE.Mesh(exhaustGeo, rimMat);
  exL.position.set(-0.42, 0.28, 2.26);
  const exR = new THREE.Mesh(exhaustGeo, rimMat);
  exR.position.set(0.42, 0.28, 2.26);
  bodyGroup.add(exL, exR);

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x60a5fa,
    transparent: true,
    opacity: 0.9,
  });
  const flameGeo = new THREE.ConeGeometry(0.075, 0.42, 8);
  flameGeo.rotateX(Math.PI / 2);
  const backfireLeft = new THREE.Mesh(flameGeo, flameMat);
  backfireLeft.position.set(-0.42, 0.28, 2.48);
  backfireLeft.visible = false;
  const backfireRight = new THREE.Mesh(flameGeo, flameMat);
  backfireRight.position.set(0.42, 0.28, 2.48);
  backfireRight.visible = false;
  bodyGroup.add(backfireLeft, backfireRight);

  // 10. Four Articulated Multi-Part Wheel Assemblies
  const wheelPivots: THREE.Group[] = [];
  const wheelMeshes: THREE.Group[] = [];
  const wheelCoords: [number, number, number][] = [
    [-0.95, 0.34, -1.34], // FL
    [0.95, 0.34, -1.34], // FR
    [-0.98, 0.35, 1.34], // RL
    [0.98, 0.35, 1.34], // RR
  ];

  const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.29, 20);
  tireGeo.rotateZ(Math.PI / 2);
  const rimBarrelGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.305, 14);
  rimBarrelGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.315, 0.41, 0.045);
  const rotorGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 14);
  rotorGeo.rotateZ(Math.PI / 2);
  const caliperGeo = new THREE.BoxGeometry(0.09, 0.14, 0.1);

  for (let i = 0; i < 4; i++) {
    const [wx, wy, wz] = wheelCoords[i];
    const pivot = new THREE.Group();
    pivot.position.set(wx, wy, wz);

    // Non-spinning brake caliper mounted to hub
    const caliper = new THREE.Mesh(caliperGeo, caliperMaterial);
    caliper.position.set(wx < 0 ? 0.04 : -0.04, 0.04, 0.11);
    pivot.add(caliper);

    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = !isSoftwareGl;
    const rim = new THREE.Mesh(rimBarrelGeo, rimMat);
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);

    // 5-spoke pattern (3 intersecting bars)
    for (let s = 0; s < 3; s++) {
      const spoke = new THREE.Mesh(spokeGeo, rimMat);
      spoke.rotation.x = (s * Math.PI) / 3;
      spinGroup.add(spoke);
    }

    spinGroup.add(tire, rim, rotor);
    pivot.add(spinGroup);
    root.add(pivot);

    wheelPivots.push(pivot);
    wheelMeshes.push(spinGroup);
  }

  // 11. Grounded Radial Contact Shadow Disc directly underneath car
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 5.6),
    new THREE.MeshBasicMaterial({
      map: contactShadowMap,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
    }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(0, 0.03, 0);
  root.add(shadowPlane);

  const setLivery = (primaryHex: string, accentHex: string) => {
    paintMaterial.color.set(primaryHex);
    accentMaterial.color.set(accentHex);
  };

  const applyTuningVisuals = (tuning: TuningConfig) => {
    setLivery(tuning.liveryColor, tuning.accentColor);
    // Wing angle visually tilts from low-drag (0.04 rad) to high-downforce (0.34 rad)
    wingBlade.rotation.x = 0.04 + tuning.aeroDownforce * 0.30;
    // Ride height shifts bodyGroup vertical stance
    bodyGroup.position.y = (tuning.rideHeight - 0.35) * 0.16;
  };

  const updateDynamicParts: GT3CarRig['updateDynamicParts'] = ({
    steerAngle,
    wheelSpin,
    pitch,
    roll,
    rideHeight,
    brakeLight,
    brakeHeat,
    backfireTimer,
    headlightsOn,
  }) => {
    // Suspension pitch, roll & ride height
    bodyGroup.position.y = (rideHeight - 0.35) * 0.16;
    bodyGroup.rotation.x = pitch;
    bodyGroup.rotation.z = roll;

    // Front wheel steering (FL = 0, FR = 1)
    const frontSteerRad = -steerAngle * 0.48;
    wheelPivots[0].rotation.y = frontSteerRad;
    wheelPivots[1].rotation.y = frontSteerRad;

    // Spin all 4 wheels forward (negative X rotation rolls forward along -Z)
    for (let i = 0; i < 4; i++) {
      wheelMeshes[i].rotation.x = -wheelSpin;
    }

    // Cockpit steering wheel rotation
    steeringWheelMesh.rotation.z = -steerAngle * 1.45;

    // Tail & brake lights
    brakeLightMaterial.emissiveIntensity = (headlightsOn ? 0.95 : 0.45) + brakeLight * 3.2;

    // Glowing carbon-ceramic brake calipers under heavy braking
    caliperMaterial.emissiveIntensity = brakeHeat * 2.4;

    // Exhaust backfire flash
    const showFlame = backfireTimer > 0;
    backfireLeft.visible = showFlame;
    backfireRight.visible = showFlame;
    if (showFlame) {
      const s = 0.7 + Math.random() * 0.55;
      backfireLeft.scale.set(1, 1, s);
      backfireRight.scale.set(1, 1, s);
    }

    // Dynamic headlights
    headlightGlowMat.emissiveIntensity = headlightsOn ? 3.5 : 1.1;
    if (headlightLeft && headlightRight) {
      const targetInt = headlightsOn ? 26 : 0;
      headlightLeft.intensity = targetInt;
      headlightRight.intensity = targetInt;
    }
  };

  return {
    root,
    bodyGroup,
    wheelPivots,
    wheelMeshes,
    wingBlade,
    steeringWheelMesh,
    paintMaterial,
    accentMaterial,
    brakeLightMaterial,
    caliperMaterial,
    headlightLeft,
    headlightRight,
    headlightGlowMat,
    backfireLeft,
    backfireRight,
    setLivery,
    applyTuningVisuals,
    updateDynamicParts,
  };
}
