import type { ControlInput, WheelSettings } from './types';

export interface GamepadLike {
  id: string;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
  vibrationActuator?: {
    playEffect?: (
      type: string,
      params: { duration: number; strongMagnitude: number; weakMagnitude: number },
    ) => Promise<unknown>;
  };
}

export function applyDeadzoneAndCurve(
  raw: number,
  deadzone: number,
  linearity: number,
  sensitivity: number,
): number {
  const clamped = Math.max(-1, Math.min(1, raw));
  const absVal = Math.abs(clamped);
  if (absVal <= deadzone) return 0;
  const scaled = (absVal - deadzone) / Math.max(0.01, 1 - deadzone);
  const curved = Math.pow(scaled, linearity) * sensitivity;
  return Math.max(-1, Math.min(1, Math.sign(clamped) * curved));
}

/**
 * Pure mapper supporting Logitech G29/G920/G923, Thrustmaster T300/T150, Fanatec wheels,
 * and standard Xbox/PlayStation controllers via the Web Gamepad API.
 */
export function mapGamepadToControlInput(
  gp: GamepadLike,
  settings: WheelSettings,
): ControlInput {
  const rawSteer = gp.axes[settings.steeringAxis] ?? 0;
  const steer = applyDeadzoneAndCurve(
    rawSteer,
    settings.deadzone,
    settings.linearity,
    settings.sensitivity,
  );

  // Detect steering wheels by ID or explicit axis configuration
  const isWheelPeripheral = /wheel|g29|g920|g923|thrustmaster|t300|t150|fanatec|moza|driving force/i.test(gp.id);

  let throttle = 0;
  let brake = 0;

  if (settings.throttleAxis >= 0 && gp.axes[settings.throttleAxis] !== undefined) {
    const raw = gp.axes[settings.throttleAxis];
    throttle = settings.invertPedals ? (1 - raw) * 0.5 : (raw + 1) * 0.5;
  } else if (isWheelPeripheral && gp.axes.length >= 3) {
    // Most racing wheels expose throttle on axis 2 (resting at +1, pressed to -1)
    const rawT = gp.axes[2] ?? 1;
    throttle = settings.invertPedals ? (rawT + 1) * 0.5 : (1 - rawT) * 0.5;
  } else {
    // Standard gamepad RT (button 7) or A (button 0)
    throttle = Math.max(gp.buttons[7]?.value ?? 0, gp.buttons[0]?.pressed ? 1 : 0);
  }

  if (settings.brakeAxis >= 0 && gp.axes[settings.brakeAxis] !== undefined) {
    const raw = gp.axes[settings.brakeAxis];
    brake = settings.invertPedals ? (1 - raw) * 0.5 : (raw + 1) * 0.5;
  } else if (isWheelPeripheral && gp.axes.length >= 4) {
    // Most racing wheels expose brake on axis 3 or axis 1 (resting at +1, pressed to -1)
    const rawB = gp.axes[3] ?? gp.axes[1] ?? 1;
    brake = settings.invertPedals ? (rawB + 1) * 0.5 : (1 - rawB) * 0.5;
  } else {
    // Standard gamepad LT (button 6) or X/Square (button 2)
    brake = Math.max(gp.buttons[6]?.value ?? 0, gp.buttons[2]?.pressed ? 1 : 0);
  }

  // Handbrake on B / Circle (button 1) or wheel paddle/handbrake (button 4/5)
  const handbrake = Boolean(gp.buttons[1]?.pressed || gp.buttons[5]?.pressed);

  return {
    throttle: Math.max(0, Math.min(1, throttle)),
    brake: Math.max(0, Math.min(1, brake)),
    steer,
    handbrake,
    source: 'wheel',
  };
}

export class InputManager {
  private keys = new Set<string>();
  private lastFfbMs = 0;
  public wheelSettings: WheelSettings;
  public connectedGamepadName = '';
  public wheelConnected = false;
  public lastControlInput: ControlInput = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    source: 'keyboard',
  };

  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onBlurBound: () => void;
  private onVisibilityBound: () => void;
  private onGamepadConnectedBound: (e: GamepadEvent) => void;
  private onGamepadDisconnectedBound: () => void;
  private onAction?: (action: string) => void;

  constructor(settings: WheelSettings, onAction?: (action: string) => void) {
    this.wheelSettings = { ...settings };
    this.onAction = onAction;

    this.onKeyDownBound = (e) => {
      // Do not hijack typing in text inputs
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const code = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
        e.preventDefault();
      }
      if (!this.keys.has(code)) {
        // Edge-triggered one-shot hotkeys
        if (code === 'KeyC') this.onAction?.('camera');
        else if (code === 'KeyT') this.onAction?.('tuning');
        else if (code === 'KeyW' && e.shiftKey) this.onAction?.('weather');
        else if (code === 'KeyL') this.onAction?.('lighting');
        else if (code === 'KeyM') this.onAction?.('mute');
        else if (code === 'KeyR') this.onAction?.('reset');
        else if (code === 'Escape' || code === 'KeyP') this.onAction?.('pause');
      }
      this.keys.add(code);
    };

    this.onKeyUpBound = (e) => {
      this.keys.delete(e.code);
    };

    this.onBlurBound = () => {
      this.keys.clear();
    };

    this.onVisibilityBound = () => {
      if (document.hidden) this.keys.clear();
    };

    this.onGamepadConnectedBound = (e) => {
      this.wheelConnected = true;
      this.connectedGamepadName = e.gamepad.id;
    };

    this.onGamepadDisconnectedBound = () => {
      this.refreshGamepadStatus();
    };
  }

  public attach(): void {
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('blur', this.onBlurBound);
    document.addEventListener('visibilitychange', this.onVisibilityBound);
    window.addEventListener('gamepadconnected', this.onGamepadConnectedBound);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnectedBound);
    this.refreshGamepadStatus();
  }

  public detach(): void {
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('blur', this.onBlurBound);
    document.removeEventListener('visibilitychange', this.onVisibilityBound);
    window.removeEventListener('gamepadconnected', this.onGamepadConnectedBound);
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnectedBound);
    this.keys.clear();
  }

  public clearHeld(): void {
    this.keys.clear();
  }

  private getActiveGamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) {
      if (p && p.connected) return p;
    }
    return null;
  }

  public refreshGamepadStatus(): void {
    const gp = this.getActiveGamepad();
    this.wheelConnected = Boolean(gp);
    this.connectedGamepadName = gp ? gp.id : '';
  }

  public sample(): ControlInput {
    const kbThrottle = this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0;
    const kbBrake = this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0;
    const kbLeft = this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0;
    const kbRight = this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0;
    const kbHandbrake = this.keys.has('Space');
    const kbSteer = kbRight - kbLeft;

    const kbActive = kbThrottle > 0 || kbBrake > 0 || kbSteer !== 0 || kbHandbrake;

    const gp = this.wheelSettings.enabled ? this.getActiveGamepad() : null;
    if (gp) {
      this.wheelConnected = true;
      this.connectedGamepadName = gp.id;
      const gpInput = mapGamepadToControlInput(gp as unknown as GamepadLike, this.wheelSettings);
      const gpActive =
        gpInput.throttle > 0.04 ||
        gpInput.brake > 0.04 ||
        Math.abs(gpInput.steer) > 0.02 ||
        gpInput.handbrake;

      if (gpActive || !kbActive) {
        this.lastControlInput = gpInput;
        return gpInput;
      }
    } else {
      this.wheelConnected = false;
      this.connectedGamepadName = '';
    }

    this.lastControlInput = {
      throttle: kbThrottle,
      brake: kbBrake,
      steer: kbSteer,
      handbrake: kbHandbrake,
      source: 'keyboard',
    };
    return this.lastControlInput;
  }

  public triggerForceFeedback(intensity: number, durationMs = 90): void {
    if (!this.wheelSettings.enabled || this.wheelSettings.ffbStrength <= 0.01) return;
    const now = performance.now();
    if (now - this.lastFfbMs < 75) return;
    const gp = this.getActiveGamepad() as (Gamepad & GamepadLike) | null;
    if (!gp?.vibrationActuator?.playEffect) return;
    const scaled = Math.max(0, Math.min(1, intensity * this.wheelSettings.ffbStrength));
    if (scaled < 0.05) return;
    this.lastFfbMs = now;
    gp.vibrationActuator
      .playEffect('dual-rumble', {
        duration: durationMs,
        strongMagnitude: scaled,
        weakMagnitude: Math.min(1, scaled * 0.75),
      })
      .catch(() => {});
  }
}
