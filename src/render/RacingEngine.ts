import * as THREE from 'three';
import { ALPINE_TRACK, START_FINISH_T } from '../sim/track';
import { createInitialVehicleState, stepVehiclePhysics } from '../sim/physics';
import { createAiRacers, stepAiRacer, type AiRacer } from '../sim/ai';
import { InputManager } from '../sim/input';
import { RacingAudio } from '../sim/audio';
import { buildLiveLeaderboard } from '../sim/leaderboard';
import type {
  CameraMode,
  FinishSummary,
  GameState,
  HudSnapshot,
  TimeOfDay,
  TuningConfig,
  VehicleState,
  WeatherMode,
  WheelSettings,
} from '../sim/types';
import type { RemotePlayerState } from '../shared/protocol';
import { createTrackTextures, type TrackTextureSet } from './textures';
import { createGT3Car, type GT3CarRig } from './carModel';
import { buildAlpineWorld, type WorldHandles } from './worldBuilder';
import { WeatherAndLightingRig } from './weatherAndLighting';

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onFinish: (summary: FinishSummary) => void;
  onActionHotkey: (action: string) => void;
  onTelemetryTick?: (telemetry: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    speedKmh: number;
    steerAngle: number;
    lap: number;
    trackProgress: number;
    bestLapMs: number | null;
    finished: boolean;
    finishTimeMs: number | null;
  }) => void;
}

interface RemoteCarVisual {
  rig: GT3CarRig;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetYaw: number;
  speedKmh: number;
  steerAngle: number;
  wheelSpin: number;
  color: string;
}

const TOTAL_LAPS = 3;

// Pre-allocated scratch vectors (zero GC inside render loop)
const _camTargetPos = new THREE.Vector3();
const _camLookAt = new THREE.Vector3();
const _smoothedLookAt = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class RacingEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private textures: TrackTextureSet;
  private world: WorldHandles;
  private weatherRig: WeatherAndLightingRig;
  private playerRig: GT3CarRig;
  private aiCars: Array<{ state: AiRacer; rig: GT3CarRig }> = [];
  private remoteCars = new Map<string, RemoteCarVisual>();

  public readonly input: InputManager;
  public readonly audio: RacingAudio;

  private gameState: GameState = 'title';
  private cameraMode: CameraMode = 'chase';
  private weather: WeatherMode = 'clear';
  private timeOfDay: TimeOfDay = 'day';
  private tuning: TuningConfig;
  private driverName = 'You';
  private isMultiplayer = false;
  private remotePlayers: RemotePlayerState[] = [];
  private localPlayerId = '';

  private playerState: VehicleState;
  private frameId = 0;
  private disposed = false;
  private lastTickTime = 0;
  private titleOrbitAngle = 0.45;
  private hudThrottleAcc = 0;
  private hitstopTimer = 0;
  private bannerTimer = 0;
  private prevImpactTrauma = 0;
  private resizeObserver: ResizeObserver;
  private callbacks: EngineCallbacks;

  constructor(
    private mountEl: HTMLElement,
    initialTuning: TuningConfig,
    initialWheelSettings: WheelSettings,
    callbacks: EngineCallbacks,
  ) {
    this.tuning = { ...initialTuning };
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    // Renderer configured per Three.js PBR + Software-WebGL skill standards
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 0.75 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const rect = mountEl.getBoundingClientRect();
    const initW = Math.max(320, rect.width || window.innerWidth);
    const initH = Math.max(240, rect.height || window.innerHeight);
    this.renderer.setSize(initW, initH);

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'sim-canvas');
    mountEl.innerHTML = '';
    mountEl.appendChild(this.renderer.domElement);

    // Handle WebGL context loss safely
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, initW / initH, 0.15, 1600);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createTrackTextures(maxAniso);
    this.world = buildAlpineWorld(ALPINE_TRACK, this.textures, this.isSoftwareGl);
    this.scene.add(this.world.group);

    this.weatherRig = new WeatherAndLightingRig(this.scene, this.renderer, this.textures, this.isSoftwareGl);
    this.weatherRig.applyEnvironment(this.weather, this.timeOfDay, this.world);

    // Build Player GT3 Hypercar
    this.playerState = createInitialVehicleState(ALPINE_TRACK, 0);
    this.playerRig = createGT3Car({
      primaryColor: this.tuning.liveryColor,
      accentColor: this.tuning.accentColor,
      carbonMap: this.textures.carbonMap,
      contactShadowMap: this.textures.contactShadowMap,
      enableSpotLights: true,
      isSoftwareGl: this.isSoftwareGl,
    });
    this.playerRig.applyTuningVisuals(this.tuning);
    this.syncCarTransform(this.playerRig.root, this.playerState.x, this.playerState.y, this.playerState.z, this.playerState.yaw);
    this.scene.add(this.playerRig.root);

    // Build 5 AI GT3 Opponents
    const aiStates = createAiRacers(ALPINE_TRACK);
    for (const ai of aiStates) {
      const rig = createGT3Car({
        primaryColor: ai.color,
        accentColor: ai.accentColor,
        carbonMap: this.textures.carbonMap,
        contactShadowMap: this.textures.contactShadowMap,
        enableSpotLights: false,
        isSoftwareGl: this.isSoftwareGl,
      });
      this.syncCarTransform(rig.root, ai.x, ai.y, ai.z, ai.yaw);
      this.scene.add(rig.root);
      this.aiCars.push({ state: ai, rig });
    }

    // Input & Procedural Audio
    this.audio = new RacingAudio();
    this.weatherRig.onLightningStrike = () => {
      if (this.gameState === 'playing') this.audio.playThunder();
    };
    this.input = new InputManager(initialWheelSettings, (action) => {
      if (action === 'reset' && this.gameState === 'playing') {
        this.resetCarToTrack();
      } else {
        this.callbacks.onActionHotkey(action);
      }
    });
    this.input.attach();

    // Initial Title Camera staging + immediate frame-0 draw so Title Screen never shows blank canvas
    this.positionTitleCamera(0);
    _smoothedLookAt.set(this.playerState.x, this.playerState.y + 0.9, this.playerState.z - 2);
    this.weatherRig.update(0, this.playerState.x, this.playerState.y, this.playerState.z);

    // Unlock Web Audio strictly on first user gesture (zero Chrome autoplay warnings)
    const unlockOnce = () => {
      this.audio.unlock();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce, { passive: true });
    window.addEventListener('keydown', unlockOnce, { passive: true });

    // Pre-warm shaders on GPU only (skip on software WebGL per skill directive)
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
    this.renderer.render(this.scene, this.camera);

    // ResizeObserver for crisp viewport sizing without cleared-buffer flash
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(100, Math.floor(entry.contentRect.width));
        const h = Math.max(100, Math.floor(entry.contentRect.height));
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.renderer.render(this.scene, this.camera);
      }
    });
    this.resizeObserver.observe(mountEl);

    this.lastTickTime = performance.now();
    this.scheduleNextFrame();
  }

  private syncCarTransform(obj: THREE.Object3D, x: number, y: number, z: number, yaw: number): void {
    obj.position.set(x, y + 0.04, z);
    obj.rotation.set(0, yaw, 0);
  }

  public setCallbacks(callbacks: EngineCallbacks): void {
    this.callbacks = callbacks;
  }

  public setDriverName(name: string): void {
    this.driverName = name.trim() || 'You';
  }

  public setGameState(state: GameState): void {
    const prev = this.gameState;
    this.gameState = state;
    if (state === 'playing') {
      if (prev === 'title') {
        this.input.clearHeld();
        this.snapCameraToGameplay();
        this.bannerTimer = 1.6;
        this.world.setStartLightState(5, true);
        this.audio.playCountdownBeep(true);
      }
    } else if (state === 'paused' || state === 'title' || state === 'gameover') {
      this.audio.silenceLoops();
      this.input.clearHeld();
    }
  }

  public startNewRace(isMultiplayer = false, gridSlot = 0): void {
    this.isMultiplayer = isMultiplayer;
    this.playerState = createInitialVehicleState(ALPINE_TRACK, gridSlot);
    this.syncCarTransform(
      this.playerRig.root,
      this.playerState.x,
      this.playerState.y,
      this.playerState.z,
      this.playerState.yaw,
    );

    // Reset AI cars (hide AI when 2+ real players in multiplayer, or keep AI grid fillers when solo/1-player MP!)
    const freshAi = createAiRacers(ALPINE_TRACK);
    this.aiCars.forEach((entry, idx) => {
      entry.state = freshAi[idx];
      entry.rig.root.visible = !isMultiplayer || this.remotePlayers.length <= 1;
      this.syncCarTransform(entry.rig.root, entry.state.x, entry.state.y, entry.state.z, entry.state.yaw);
    });

    this.hitstopTimer = 0;
    this.prevImpactTrauma = 0;
    this.bannerTimer = 1.6;
    this.world.setStartLightState(5, true);
    this.snapCameraToGameplay();
    this.input.clearHeld();
    this.audio.playCountdownBeep(true);
    this.emitHudSnapshot();
  }

  public resetCarToTrack(): void {
    const s = ALPINE_TRACK.sampleAt(this.playerState.trackT);
    this.playerState.x = s.x;
    this.playerState.y = s.y;
    this.playerState.z = s.z;
    this.playerState.yaw = ALPINE_TRACK.getHeadingAt(this.playerState.trackT);
    this.playerState.vx = 0;
    this.playerState.vz = 0;
    this.playerState.yawRate = 0;
    this.playerState.speedMs = 0;
    this.playerState.speedKmh = 0;
  }

  public setTuning(tuning: TuningConfig): void {
    this.tuning = { ...tuning };
    this.playerRig.applyTuningVisuals(this.tuning);
  }

  public setWheelSettings(settings: WheelSettings): void {
    this.input.wheelSettings = { ...settings };
  }

  public testForceFeedback(): void {
    this.input.triggerForceFeedback(0.85, 220);
  }

  public setWeather(weather: WeatherMode): void {
    this.weather = weather;
    this.weatherRig.applyEnvironment(this.weather, this.timeOfDay, this.world);
  }

  public setTimeOfDay(timeOfDay: TimeOfDay): void {
    this.timeOfDay = timeOfDay;
    this.weatherRig.applyEnvironment(this.weather, this.timeOfDay, this.world);
  }

  public setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
  }

  public setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  public syncRemotePlayers(players: RemotePlayerState[], localPlayerId: string, isMultiplayer: boolean): void {
    this.localPlayerId = localPlayerId;
    this.remotePlayers = players;
    this.isMultiplayer = isMultiplayer;

    const activeIds = new Set<string>();
    for (const p of players) {
      if (p.id === localPlayerId) continue;
      activeIds.add(p.id);

      let visual = this.remoteCars.get(p.id);
      if (!visual) {
        const rig = createGT3Car({
          primaryColor: p.color,
          accentColor: '#f59e0b',
          carbonMap: this.textures.carbonMap,
          contactShadowMap: this.textures.contactShadowMap,
          enableSpotLights: false,
          isSoftwareGl: this.isSoftwareGl,
        });
        this.syncCarTransform(rig.root, p.x, p.y, p.z, p.yaw);
        this.scene.add(rig.root);
        visual = {
          rig,
          targetX: p.x,
          targetY: p.y,
          targetZ: p.z,
          targetYaw: p.yaw,
          speedKmh: p.speedKmh,
          steerAngle: p.steerAngle,
          wheelSpin: 0,
          color: p.color,
        };
        this.remoteCars.set(p.id, visual);
      } else {
        visual.targetX = p.x;
        visual.targetY = p.y;
        visual.targetZ = p.z;
        visual.targetYaw = p.yaw;
        visual.speedKmh = p.speedKmh;
        visual.steerAngle = p.steerAngle;
        if (visual.color !== p.color) {
          visual.color = p.color;
          visual.rig.setLivery(p.color, '#f59e0b');
        }
      }
    }

    // Remove departed remote cars
    for (const [id, visual] of this.remoteCars.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(visual.rig.root);
        this.remoteCars.delete(id);
      }
    }

    // Keep AI grid visible in solo or if alone in online room so track is always exciting
    const showAi = !isMultiplayer || activeIds.size === 0;
    for (const ai of this.aiCars) {
      ai.rig.root.visible = showAi;
    }
  }

  private snapCameraToGameplay(): void {
    const sinY = Math.sin(this.playerState.yaw);
    const cosY = Math.cos(this.playerState.yaw);
    const fwdX = -sinY;
    const fwdZ = -cosY;
    this.camera.position.set(
      this.playerState.x - fwdX * 7.6,
      this.playerState.y + 3.0,
      this.playerState.z - fwdZ * 7.6,
    );
    _smoothedLookAt.set(
      this.playerState.x + fwdX * 14,
      this.playerState.y + 1.1,
      this.playerState.z + fwdZ * 14,
    );
    this.camera.lookAt(_smoothedLookAt);
  }

  private positionTitleCamera(dt: number): void {
    this.titleOrbitAngle += dt * 0.14;
    // Frame car on right-center third so left third has calm negative space for SVG Title Lockup!
    const radius = 8.4;
    const angle = 0.55 + Math.sin(this.titleOrbitAngle) * 0.42;
    const px = this.playerState.x;
    const py = this.playerState.y;
    const pz = this.playerState.z;

    this.camera.position.set(
      px + Math.sin(angle) * radius - 1.4,
      py + 2.35 + Math.sin(this.titleOrbitAngle * 0.7) * 0.25,
      pz - Math.cos(angle) * radius,
    );
    // Look slightly left of car so car occupies right-of-center hero focal anchor
    _camLookAt.set(px - 1.6, py + 0.95, pz + 0.6);
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(_camLookAt);
  }

  private updateGameplayCamera(dt: number): void {
    const ps = this.playerState;
    const sinY = Math.sin(ps.yaw);
    const cosY = Math.cos(ps.yaw);
    const fwdX = -sinY;
    const fwdZ = -cosY;
    const rightX = cosY;
    const rightZ = -sinY;

    const speedRatio = Math.min(1, ps.speedKmh / 290);
    let targetFov = 62 + speedRatio * 14;
    let dampLambda = 10;

    if (this.cameraMode === 'chase') {
      const dist = 7.4 + speedRatio * 1.1;
      _camTargetPos.set(
        ps.x - fwdX * dist + rightX * ps.steerAngle * 0.65,
        ps.y + 2.85 + speedRatio * 0.25,
        ps.z - fwdZ * dist + rightZ * ps.steerAngle * 0.65,
      );
      _camLookAt.set(ps.x + fwdX * 14, ps.y + 1.15, ps.z + fwdZ * 14);
    } else if (this.cameraMode === 'close') {
      _camTargetPos.set(ps.x - fwdX * 5.2, ps.y + 2.05, ps.z - fwdZ * 5.2);
      _camLookAt.set(ps.x + fwdX * 16, ps.y + 1.0, ps.z + fwdZ * 16);
      targetFov = 66 + speedRatio * 14;
      dampLambda = 13;
    } else if (this.cameraMode === 'hood') {
      _camTargetPos.set(ps.x + fwdX * 0.55, ps.y + 1.24, ps.z + fwdZ * 0.55);
      _camLookAt.set(ps.x + fwdX * 26, ps.y + 1.05, ps.z + fwdZ * 26);
      targetFov = 70 + speedRatio * 10;
      dampLambda = 28;
    } else {
      // Cockpit view (driver seat left side looking over steering wheel & hood)
      _camTargetPos.set(
        ps.x - rightX * 0.28 + fwdX * 0.08,
        ps.y + 1.08,
        ps.z - rightZ * 0.28 + fwdZ * 0.08,
      );
      _camLookAt.set(
        ps.x - rightX * 0.22 + fwdX * 24,
        ps.y + 0.96,
        ps.z - rightZ * 0.22 + fwdZ * 24,
      );
      targetFov = 72 + speedRatio * 8;
      dampLambda = 36;
    }

    const alpha = 1 - Math.exp(-dampLambda * dt);
    if (this.cameraMode === 'cockpit' || this.cameraMode === 'hood') {
      this.camera.position.copy(_camTargetPos);
      _smoothedLookAt.copy(_camLookAt);
    } else {
      this.camera.position.lerp(_camTargetPos, alpha);
      _smoothedLookAt.lerp(_camLookAt, alpha);
    }

    // Impact trauma shake
    if (ps.impactTrauma > 0.01) {
      const shake = ps.impactTrauma * ps.impactTrauma * 0.36;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake * 0.7;
    }

    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(_smoothedLookAt);
  }

  private resolveCarCollisions(): void {
    const ps = this.playerState;
    for (const ai of this.aiCars) {
      if (!ai.rig.root.visible) continue;
      const dx = ps.x - ai.state.x;
      const dz = ps.z - ai.state.z;
      const dist = Math.hypot(dx, dz);
      const minDist = 2.65;
      if (dist > 0.001 && dist < minDist) {
        const nx = dx / dist;
        const nz = dz / dist;
        const push = (minDist - dist) * 0.65;
        ps.x += nx * push;
        ps.z += nz * push;
        ps.vx += nx * 3.8;
        ps.vz += nz * 3.8;
        ps.impactTrauma = Math.min(1, ps.impactTrauma + 0.38);
      }
    }
  }

  private emitHudSnapshot(): void {
    const ps = this.playerState;
    const racers: Array<{
      id: string;
      name: string;
      color: string;
      isPlayer: boolean;
      isRemote: boolean;
      lap: number;
      totalProgress: number;
      speedKmh: number;
      bestLapMs: number | null;
      finished: boolean;
      finishTimeMs: number | null;
      x: number;
      z: number;
      yaw: number;
    }> = [
      {
        id: this.localPlayerId || 'player',
        name: this.driverName,
        color: this.tuning.liveryColor,
        isPlayer: true,
        isRemote: false,
        lap: ps.lap,
        totalProgress: ps.totalProgress,
        speedKmh: ps.speedKmh,
        bestLapMs: ps.bestLapMs,
        finished: ps.finished,
        finishTimeMs: ps.finishTimeMs,
        x: ps.x,
        z: ps.z,
        yaw: ps.yaw,
      },
    ];

    for (const ai of this.aiCars) {
      if (!ai.rig.root.visible) continue;
      racers.push({
        id: ai.state.id,
        name: ai.state.name,
        color: ai.state.color,
        isPlayer: false,
        isRemote: false,
        lap: ai.state.lap,
        totalProgress: ai.state.totalProgress,
        speedKmh: ai.state.speedKmh,
        bestLapMs: ai.state.bestLapMs,
        finished: ai.state.finished,
        finishTimeMs: ai.state.finishTimeMs,
        x: ai.state.x,
        z: ai.state.z,
        yaw: ai.state.yaw,
      });
    }

    for (const rp of this.remotePlayers) {
      if (rp.id === this.localPlayerId) continue;
      racers.push({
        id: rp.id,
        name: rp.name,
        color: rp.color,
        isPlayer: false,
        isRemote: true,
        lap: rp.lap,
        totalProgress: rp.totalProgress,
        speedKmh: rp.speedKmh,
        bestLapMs: rp.bestLapMs,
        finished: rp.finished,
        finishTimeMs: rp.finishTimeMs,
        x: rp.x,
        z: rp.z,
        yaw: rp.yaw,
      });
    }

    const leaderboard = buildLiveLeaderboard(racers, ALPINE_TRACK.totalLength);
    const playerRow = leaderboard.find((r) => r.isPlayer);

    // Wrong-way check (dot product of car forward with track tangent)
    const sample = ALPINE_TRACK.sampleAt(ps.trackT);
    const fwdX = -Math.sin(ps.yaw);
    const fwdZ = -Math.cos(ps.yaw);
    const headingDot = fwdX * sample.tx + fwdZ * sample.tz;
    const wrongWay = ps.speedKmh > 18 && headingDot < -0.35;

    this.callbacks.onHudUpdate({
      speedKmh: Math.round(ps.speedKmh),
      rpm: Math.round(ps.rpm),
      maxRpm: 8600,
      gear: ps.gear,
      throttle: this.input.lastControlInput.throttle,
      brake: this.input.lastControlInput.brake,
      steer: ps.steerAngle,
      slipRatio: ps.slipRatio,
      surface: ps.surface,
      lap: Math.min(TOTAL_LAPS, ps.lap),
      totalLaps: TOTAL_LAPS,
      currentLapMs: ps.currentLapMs,
      bestLapMs: ps.bestLapMs,
      totalRaceMs: ps.totalRaceMs,
      position: playerRow?.position ?? 1,
      totalRacers: leaderboard.length,
      topSpeedKmh: Math.round(ps.topSpeedKmh),
      wrongWay,
      countdownText: this.bannerTimer > 0 ? 'GREEN FLAG' : null,
      leaderboard,
      minimapRacers: racers.map((r) => ({
        id: r.id,
        x: r.x,
        z: r.z,
        color: r.color,
        isPlayer: r.isPlayer,
        yaw: r.yaw,
      })),
      wheelConnected: this.input.wheelConnected,
      wheelName: this.input.connectedGamepadName,
      inputSource: this.input.lastControlInput.source,
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 90);
    }
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = window.requestAnimationFrame(this.tick);
    }
  }

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = Math.max(0.001, (now - this.lastTickTime) / 1000);
    this.lastTickTime = now;
    // Cap total frame progression to 0.25s and integrate physics in <= 0.04s safe substeps
    const totalStepDt = Math.min(rawDt, this.isSoftwareGl ? 0.28 : 0.05);
    const dt = Math.min(rawDt, 0.05);

    const headlightsOn = this.weatherRig.isHeadlightsRecommended();

    if (this.gameState === 'title') {
      this.positionTitleCamera(totalStepDt);
      this.playerRig.updateDynamicParts({
        steerAngle: Math.sin(this.titleOrbitAngle * 0.8) * 0.22,
        wheelSpin: 0,
        pitch: 0,
        roll: 0,
        rideHeight: this.tuning.rideHeight,
        brakeLight: 0.2,
        brakeHeat: 0,
        backfireTimer: 0,
        headlightsOn,
      });
      this.weatherRig.update(totalStepDt, this.playerState.x, this.playerState.y, this.playerState.z);
    } else if (this.gameState === 'playing') {
      const ctrl = this.input.sample();
      if (this.bannerTimer > 0) this.bannerTimer = Math.max(0, this.bannerTimer - totalStepDt);

      // Brief sim hitstop on heavy guardrail impacts (35-55ms)
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - totalStepDt);
      } else {
        const wasFinished = this.playerState.finished;
        const subSteps = Math.max(1, Math.ceil(totalStepDt / 0.04));
        const subDt = totalStepDt / subSteps;

        for (let s = 0; s < subSteps; s++) {
          this.playerState = stepVehiclePhysics(
            this.playerState,
            ctrl,
            this.tuning,
            this.weather,
            ALPINE_TRACK,
            subDt,
            TOTAL_LAPS,
            true,
          );
          this.resolveCarCollisions();

          // Step AI rivals in lockstep
          for (const ai of this.aiCars) {
            if (!ai.rig.root.visible) continue;
            stepAiRacer(
              ai.state,
              ALPINE_TRACK,
              this.weather,
              subDt,
              TOTAL_LAPS,
              { x: this.playerState.x, z: this.playerState.z },
              true,
            );
          }
        }

        // Trigger heavy impact audio + short hitstop when trauma spikes
        if (this.playerState.impactTrauma > this.prevImpactTrauma + 0.22) {
          this.audio.playImpact(this.playerState.impactTrauma);
          if (this.playerState.impactTrauma > 0.52) {
            this.hitstopTimer = 0.045;
          }
        }
        this.prevImpactTrauma = this.playerState.impactTrauma;

        // Force Feedback to connected wheel/gamepad
        if (this.playerState.ffbIntensity > 0.12) {
          this.input.triggerForceFeedback(this.playerState.ffbIntensity, 80);
        }

        // Sync AI visual rigs
        for (const ai of this.aiCars) {
          if (!ai.rig.root.visible) continue;
          this.syncCarTransform(ai.rig.root, ai.state.x, ai.state.y, ai.state.z, ai.state.yaw);
          ai.rig.updateDynamicParts({
            steerAngle: ai.state.steerAngle,
            wheelSpin: ai.state.wheelSpin,
            pitch: 0,
            roll: -ai.state.steerAngle * 0.035,
            rideHeight: 0.35,
            brakeLight: ai.state.brakeLight,
            brakeHeat: ai.state.brakeLight * 0.6,
            backfireTimer: 0,
            headlightsOn,
          });
        }

        // Smoothly interpolate online remote players
        const remAlpha = 1 - Math.exp(-12 * dt);
        for (const visual of this.remoteCars.values()) {
          visual.rig.root.position.x = THREE.MathUtils.lerp(visual.rig.root.position.x, visual.targetX, remAlpha);
          visual.rig.root.position.y = THREE.MathUtils.lerp(visual.rig.root.position.y, visual.targetY + 0.04, remAlpha);
          visual.rig.root.position.z = THREE.MathUtils.lerp(visual.rig.root.position.z, visual.targetZ, remAlpha);
          let yDiff = visual.targetYaw - visual.rig.root.rotation.y;
          while (yDiff > Math.PI) yDiff -= Math.PI * 2;
          while (yDiff < -Math.PI) yDiff += Math.PI * 2;
          visual.rig.root.rotation.y += yDiff * remAlpha;
          visual.wheelSpin += ((visual.speedKmh / 3.6) / 0.34) * dt;
          visual.rig.updateDynamicParts({
            steerAngle: visual.steerAngle,
            wheelSpin: visual.wheelSpin,
            pitch: 0,
            roll: -visual.steerAngle * 0.035,
            rideHeight: 0.35,
            brakeLight: 0.1,
            brakeHeat: 0,
            backfireTimer: 0,
            headlightsOn,
          });
        }

        // Emit multiplayer telemetry
        const pNorm = (((this.playerState.trackT - START_FINISH_T) % 1) + 1) % 1;
        this.callbacks.onTelemetryTick?.({
          x: this.playerState.x,
          y: this.playerState.y,
          z: this.playerState.z,
          yaw: this.playerState.yaw,
          speedKmh: this.playerState.speedKmh,
          steerAngle: this.playerState.steerAngle,
          lap: this.playerState.lap,
          trackProgress: pNorm,
          bestLapMs: this.playerState.bestLapMs,
          finished: this.playerState.finished,
          finishTimeMs: this.playerState.finishTimeMs,
        });

        // Handle Race Finish!
        if (!wasFinished && this.playerState.finished) {
          this.emitHudSnapshot();
          const allRacers = [
            {
              id: this.localPlayerId || 'player',
              name: this.driverName,
              color: this.tuning.liveryColor,
              isPlayer: true,
              isRemote: false,
              lap: this.playerState.lap,
              totalProgress: this.playerState.totalProgress,
              speedKmh: this.playerState.speedKmh,
              bestLapMs: this.playerState.bestLapMs,
              finished: true,
              finishTimeMs: this.playerState.finishTimeMs,
            },
            ...this.aiCars
              .filter((a) => a.rig.root.visible)
              .map((a) => ({
                id: a.state.id,
                name: a.state.name,
                color: a.state.color,
                isPlayer: false,
                isRemote: false,
                lap: a.state.lap,
                totalProgress: a.state.totalProgress,
                speedKmh: a.state.speedKmh,
                bestLapMs: a.state.bestLapMs,
                finished: a.state.finished,
                finishTimeMs: a.state.finishTimeMs,
              })),
            ...this.remotePlayers
              .filter((rp) => rp.id !== this.localPlayerId)
              .map((rp) => ({
                id: rp.id,
                name: rp.name,
                color: rp.color,
                isPlayer: false,
                isRemote: true,
                lap: rp.lap,
                totalProgress: rp.totalProgress,
                speedKmh: rp.speedKmh,
                bestLapMs: rp.bestLapMs,
                finished: rp.finished,
                finishTimeMs: rp.finishTimeMs,
              })),
          ];
          const finalBoard = buildLiveLeaderboard(allRacers, ALPINE_TRACK.totalLength);
          const me = finalBoard.find((r) => r.isPlayer);
          this.callbacks.onFinish({
            position: me?.position ?? 1,
            totalRacers: finalBoard.length,
            totalRaceMs: this.playerState.finishTimeMs ?? this.playerState.totalRaceMs,
            bestLapMs: this.playerState.bestLapMs,
            topSpeedKmh: Math.round(this.playerState.topSpeedKmh),
            weather: this.weather,
            timeOfDay: this.timeOfDay,
            isMultiplayer: this.isMultiplayer,
            leaderboard: finalBoard,
          });
        }
      }

      // Sync Player 3D car & tire spray/smoke particles
      const ps = this.playerState;
      this.syncCarTransform(this.playerRig.root, ps.x, ps.y, ps.z, ps.yaw);
      this.playerRig.updateDynamicParts({
        steerAngle: ps.steerAngle,
        wheelSpin: ps.wheelSpin,
        pitch: ps.pitch,
        roll: ps.roll,
        rideHeight: this.tuning.rideHeight,
        brakeLight: ctrl.brake > 0.08 || ctrl.handbrake ? 1 : 0,
        brakeHeat: ps.brakeHeat,
        backfireTimer: ps.backfireTimer,
        headlightsOn,
      });

      const isWet = this.weather === 'rain' || this.weather === 'storm';
      if ((isWet && ps.speedKmh > 65) || ps.slipRatio > 0.25 || ps.surface === 'gravel') {
        const sinY = Math.sin(ps.yaw);
        const cosY = Math.cos(ps.yaw);
        const backX = ps.x + sinY * 1.65;
        const backZ = ps.z + cosY * 1.65;
        this.weatherRig.spawnTireParticle(backX - cosY * 0.85, ps.y, backZ + sinY * 0.85, ps.vx, ps.vz);
        this.weatherRig.spawnTireParticle(backX + cosY * 0.85, ps.y, backZ - sinY * 0.85, ps.vx, ps.vz);
      }

      this.updateGameplayCamera(dt);
      this.weatherRig.update(dt, ps.x, ps.y, ps.z);
      this.audio.update(ps.rpm, ctrl.throttle, ps.speedKmh, ps.slipRatio, this.weather, true);

      // Throttle React HUD updates (~12Hz)
      this.hudThrottleAcc += dt;
      if (this.hudThrottleAcc >= 0.08) {
        this.hudThrottleAcc = 0;
        this.emitHudSnapshot();
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  };

  public dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.input.detach();
    this.audio.dispose();
    this.textures.dispose();
    this.weatherRig.dispose();
    this.renderer.dispose();
  }
}
