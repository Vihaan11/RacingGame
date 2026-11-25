import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { TimeOfDay, WeatherMode } from '../sim/types';
import type { WorldHandles } from './worldBuilder';
import type { TrackTextureSet } from './textures';

const RAIN_COUNT = 1200;
const SPRAY_COUNT = 140;

const SKY_VERTEX_SHADER = `
  varying vec3 vWorldDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const SKY_FRAGMENT_SHADER = `
  uniform vec3 uTopColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uBottomColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunStrength;
  varying vec3 vWorldDir;

  void main() {
    vec3 dir = normalize(vWorldDir);
    float h = dir.y;
    vec3 col = h >= 0.0
      ? mix(uHorizonColor, uTopColor, pow(clamp(h, 0.0, 1.0), 0.52))
      : mix(uHorizonColor, uBottomColor, clamp(-h * 4.0, 0.0, 1.0));

    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    // Soft atmospheric solar halo + crisp sun disc
    float halo = pow(sunDot, 16.0) * 0.38 * uSunStrength;
    float disc = smoothstep(0.9985, 0.9996, sunDot) * 1.4 * uSunStrength;
    col += uSunColor * (halo + disc);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class WeatherAndLightingRig {
  public readonly sunLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  public readonly skyMesh: THREE.Mesh;
  public readonly rainPoints: THREE.Points;
  public readonly sprayPoints: THREE.Points;

  private skyMaterial: THREE.ShaderMaterial;
  private rainPositions: Float32Array;
  private sprayPositions: Float32Array;
  private sprayVelocities: Float32Array;
  private sprayLife: Float32Array;
  private sprayCursor = 0;

  private weather: WeatherMode = 'clear';
  private timeOfDay: TimeOfDay = 'day';
  private lightningTimer = 4.5;
  private lightningFlash = 0;
  private baseSunIntensity = 2.4;
  private baseSkyColor = new THREE.Color(0x9ec5e8);
  private fog: THREE.FogExp2;
  private envRT: THREE.WebGLRenderTarget;

  public onLightningStrike?: () => void;

  constructor(
    private scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    textures: TrackTextureSet,
    private isSoftwareGl: boolean,
  ) {
    // Mandatory procedural Studio Environment Reflections for metallic car paint & wet asphalt
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = this.envRT.texture;
    pmrem.dispose();

    // Fast, cinematic procedural atmospheric gradient Sky Dome
    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTopColor: { value: new THREE.Color(0x2d68b8) },
        uHorizonColor: { value: new THREE.Color(0xb8d6ee) },
        uBottomColor: { value: new THREE.Color(0x4a5a4e) },
        uSunDir: { value: new THREE.Vector3(0.45, 0.55, -0.7).normalize() },
        uSunColor: { value: new THREE.Color(0xfff1d6) },
        uSunStrength: { value: 1.0 },
      },
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(950, 24, 16), this.skyMaterial);
    scene.add(this.skyMesh);

    // Horizon-matched Exponential Fog
    this.fog = new THREE.FogExp2(0xb8d6ee, 0.0012);
    scene.fog = this.fog;
    scene.background = this.baseSkyColor.clone();

    // Balanced outdoor lighting rig: Warm directional key + Cool hemisphere sky/ground fill
    this.hemiLight = new THREE.HemisphereLight(0xaad2ff, 0x3b4435, 0.92);
    scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5e4, 2.5);
    this.sunLight.position.set(120, 140, 80);
    this.sunLight.castShadow = !isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 260;
    const d = 58;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    // Pooled 3D Rain Streak Particles (zero GC, crisp alpha streak texture)
    this.rainPositions = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * 84;
      this.rainPositions[i * 3 + 1] = Math.random() * 30;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 84;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0xdbeafe,
      map: textures.rainStreakMap,
      size: 1.4,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.rainPoints = new THREE.Points(rainGeo, rainMat);
    this.rainPoints.frustumCulled = false;
    this.rainPoints.visible = false;
    scene.add(this.rainPoints);

    // Pooled Tire Smoke / Rain Spray Ring Buffer (zero GC, soft radial puff texture)
    this.sprayPositions = new Float32Array(SPRAY_COUNT * 3);
    this.sprayVelocities = new Float32Array(SPRAY_COUNT * 3);
    this.sprayLife = new Float32Array(SPRAY_COUNT);
    for (let i = 0; i < SPRAY_COUNT; i++) {
      this.sprayPositions[i * 3 + 1] = -999;
      this.sprayLife[i] = 0;
    }
    const sprayGeo = new THREE.BufferGeometry();
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(this.sprayPositions, 3));
    const sprayMat = new THREE.PointsMaterial({
      color: 0xe2e8f0,
      map: textures.smokePuffMap,
      size: 1.65,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.sprayPoints = new THREE.Points(sprayGeo, sprayMat);
    this.sprayPoints.frustumCulled = false;
    scene.add(this.sprayPoints);
  }

  public applyEnvironment(
    weather: WeatherMode,
    timeOfDay: TimeOfDay,
    world: WorldHandles,
  ): void {
    this.weather = weather;
    this.timeOfDay = timeOfDay;

    let topHex = 0x2a66b8;
    let horizonHex = 0xb9d8f0;
    let bottomHex = 0x4b5c47;
    let sunDir = new THREE.Vector3(0.42, 0.52, -0.74).normalize();
    let sunColHex = 0xfff5e0;
    let sunStrength = 0.95;

    let sunColor = 0xfff6e8;
    let sunIntensity = 2.45;
    let hemiSky = 0x9ecaff;
    let hemiGround = 0x3b4434;
    let hemiIntensity = 0.92;
    let fogHex = 0xb4d2ea;
    let fogDensity = 0.0011;
    let nightFactor = 0.0;

    if (timeOfDay === 'sunset') {
      topHex = 0x242854;
      horizonHex = 0xd97b4c;
      bottomHex = 0x2c222e;
      sunDir = new THREE.Vector3(-0.35, 0.14, -0.92).normalize();
      sunColHex = 0xffa654;
      sunStrength = 1.25;
      sunColor = 0xff934f;
      sunIntensity = 2.25;
      hemiSky = 0xf59e6c;
      hemiGround = 0x2a2433;
      hemiIntensity = 0.72;
      fogHex = 0xc97b58;
      fogDensity = 0.0016;
      nightFactor = 0.6;
    } else if (timeOfDay === 'night') {
      topHex = 0x060b18;
      horizonHex = 0x13203b;
      bottomHex = 0x080c14;
      sunDir = new THREE.Vector3(-0.28, 0.36, -0.88).normalize();
      sunColHex = 0x9ec5ff;
      sunStrength = 0.45;
      sunColor = 0x8bb4ff;
      sunIntensity = 0.68;
      hemiSky = 0x223868;
      hemiGround = 0x121622;
      hemiIntensity = 0.7;
      fogHex = 0x0d1629;
      fogDensity = 0.0022;
      nightFactor = 1.0;
    }

    const isWet = weather === 'rain' || weather === 'storm';
    if (weather === 'fog') {
      sunIntensity *= 0.68;
      sunStrength *= 0.25;
      fogDensity = timeOfDay === 'night' ? 0.0085 : 0.0072;
      fogHex = timeOfDay === 'night' ? 0x162033 : timeOfDay === 'sunset' ? 0xa38274 : 0xc4cfd9;
      topHex = fogHex;
      horizonHex = fogHex;
    } else if (weather === 'rain') {
      sunIntensity *= 0.62;
      sunStrength *= 0.2;
      fogDensity = 0.0038;
      fogHex = timeOfDay === 'night' ? 0x0b1220 : timeOfDay === 'sunset' ? 0x614b52 : 0x6f8194;
      topHex = timeOfDay === 'night' ? 0x060a14 : timeOfDay === 'sunset' ? 0x2d2838 : 0x45566b;
      horizonHex = fogHex;
    } else if (weather === 'storm') {
      sunIntensity *= 0.42;
      sunStrength = 0.05;
      hemiIntensity *= 0.78;
      fogDensity = 0.0056;
      fogHex = timeOfDay === 'night' ? 0x070a12 : 0x3a4454;
      topHex = 0x1a202c;
      horizonHex = fogHex;
    }

    const u = this.skyMaterial.uniforms;
    u.uTopColor.value.setHex(topHex);
    u.uHorizonColor.value.setHex(horizonHex);
    u.uBottomColor.value.setHex(bottomHex);
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.setHex(sunColHex);
    u.uSunStrength.value = sunStrength;

    this.sunLight.color.setHex(sunColor);
    this.sunLight.intensity = sunIntensity;
    this.baseSunIntensity = sunIntensity;

    this.hemiLight.color.setHex(hemiSky);
    this.hemiLight.groundColor.setHex(hemiGround);
    this.hemiLight.intensity = hemiIntensity;

    this.baseSkyColor.setHex(fogHex);
    this.fog.color.setHex(fogHex);
    this.fog.density = fogDensity;
    this.scene.background = this.baseSkyColor.clone();

    // Wet vs Dry asphalt PBR sheen (reflective wet look without blown-out glare)
    world.asphaltMaterial.roughness = weather === 'storm' ? 0.26 : weather === 'rain' ? 0.34 : 0.82;
    world.asphaltMaterial.metalness = isWet ? 0.24 : 0.04;
    world.asphaltMaterial.envMapIntensity = isWet ? 1.35 : 0.55;
    world.asphaltMaterial.needsUpdate = true;

    world.setNightMode(Math.max(nightFactor, weather === 'storm' ? 0.72 : 0));

    // Toggle rain particle cloud
    this.rainPoints.visible = isWet;
    const rainMat = this.rainPoints.material as THREE.PointsMaterial;
    rainMat.opacity = weather === 'storm' ? 0.84 : 0.58;
    rainMat.size = weather === 'storm' ? 1.65 : 1.3;

    const sprayMat = this.sprayPoints.material as THREE.PointsMaterial;
    sprayMat.color.setHex(isWet ? 0xdbeafe : 0xd4d4d8);
    sprayMat.opacity = isWet ? 0.48 : 0.36;
  }

  public isHeadlightsRecommended(): boolean {
    return this.timeOfDay === 'night' || this.timeOfDay === 'sunset' || this.weather === 'storm' || this.weather === 'fog';
  }

  public spawnTireParticle(x: number, y: number, z: number, vx: number, vz: number): void {
    const idx = this.sprayCursor;
    this.sprayCursor = (this.sprayCursor + 1) % SPRAY_COUNT;
    this.sprayPositions[idx * 3] = x + (Math.random() - 0.5) * 0.45;
    this.sprayPositions[idx * 3 + 1] = y + 0.16;
    this.sprayPositions[idx * 3 + 2] = z + (Math.random() - 0.5) * 0.45;
    this.sprayVelocities[idx * 3] = vx * 0.18 + (Math.random() - 0.5) * 1.4;
    this.sprayVelocities[idx * 3 + 1] = 0.9 + Math.random() * 1.2;
    this.sprayVelocities[idx * 3 + 2] = vz * 0.18 + (Math.random() - 0.5) * 1.4;
    this.sprayLife[idx] = 0.5 + Math.random() * 0.35;
  }

  public update(dt: number, anchorX: number, anchorY: number, anchorZ: number): void {
    // Keep sky dome centered on camera/car anchor
    this.skyMesh.position.set(anchorX, anchorY, anchorZ);

    if (!this.isSoftwareGl) {
      this.sunLight.target.position.set(anchorX, anchorY, anchorZ);
      this.sunLight.position.set(anchorX + 65, anchorY + 85, anchorZ + 45);
    }

    if (this.rainPoints.visible) {
      const fallSpeed = this.weather === 'storm' ? 48 : 34;
      const windX = this.weather === 'storm' ? 7.5 : 2.2;
      const pos = this.rainPositions;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const i3 = i * 3;
        pos[i3] += windX * dt;
        pos[i3 + 1] -= fallSpeed * dt;
        if (pos[i3 + 1] < anchorY - 2) {
          pos[i3] = anchorX + (Math.random() - 0.5) * 82;
          pos[i3 + 1] = anchorY + 22 + Math.random() * 14;
          pos[i3 + 2] = anchorZ + (Math.random() - 0.5) * 82;
        }
      }
      (this.rainPoints.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    if (this.weather === 'storm') {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningFlash = 1.0;
        this.lightningTimer = 5.0 + Math.random() * 7.5;
        this.onLightningStrike?.();
      }
      if (this.lightningFlash > 0) {
        this.lightningFlash = Math.max(0, this.lightningFlash - dt * 4.5);
        this.sunLight.intensity = this.baseSunIntensity + this.lightningFlash * 4.5;
      } else {
        this.sunLight.intensity = this.baseSunIntensity;
      }
    }

    const sPos = this.sprayPositions;
    const sVel = this.sprayVelocities;
    let dirty = false;
    for (let i = 0; i < SPRAY_COUNT; i++) {
      if (this.sprayLife[i] > 0) {
        dirty = true;
        this.sprayLife[i] -= dt;
        const i3 = i * 3;
        if (this.sprayLife[i] <= 0) {
          sPos[i3 + 1] = -999;
        } else {
          sPos[i3] += sVel[i3] * dt;
          sPos[i3 + 1] += sVel[i3 + 1] * dt;
          sPos[i3 + 2] += sVel[i3 + 2] * dt;
          sVel[i3 + 1] *= Math.exp(-2.5 * dt);
        }
      }
    }
    if (dirty) {
      (this.sprayPoints.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  public dispose(): void {
    this.envRT.dispose();
    this.skyMesh.geometry.dispose();
    this.skyMaterial.dispose();
    this.rainPoints.geometry.dispose();
    (this.rainPoints.material as THREE.Material).dispose();
    this.sprayPoints.geometry.dispose();
    (this.sprayPoints.material as THREE.Material).dispose();
  }
}
