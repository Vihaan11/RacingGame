export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TrackSample {
  t: number; // 0..1
  x: number;
  y: number;
  z: number;
  tx: number; // unit tangent X
  ty: number;
  tz: number; // unit tangent Z
  rx: number; // unit right vector X (perpendicular to tangent in XZ)
  rz: number; // unit right vector Z
  curvature: number; // signed curvature rad/m
  distance: number; // cumulative arc length from start (m)
}

export interface TrackProjection {
  t: number;
  sample: TrackSample;
  lateralOffset: number; // positive = right of centerline, negative = left
  distanceSq: number;
}

export const TRACK_HALF_WIDTH = 8.0; // 16m asphalt road
export const KERB_OUTER_EDGE = 9.5;
export const GRAVEL_OUTER_EDGE = 15.2;
export const BARRIER_LIMIT = 16.4;

// Closed Alpine GP circuit control points (clockwise/flowing loop, starts heading along -Z from (0,0,0))
const CONTROL_POINTS: Vec3[] = [
  { x: 0, y: 0.0, z: 60 },
  { x: 0, y: 0.0, z: -40 },
  { x: 0, y: 0.4, z: -155 }, // End of main straight -> Turn 1 braking zone
  { x: 48, y: 2.8, z: -225 }, // Turn 1 sweeping right uphill
  { x: 135, y: 5.2, z: -215 }, // Turn 2 crest
  { x: 182, y: 6.4, z: -145 }, // Turn 3 Alpine Esses entry
  { x: 140, y: 5.8, z: -72 }, // Esses left flick
  { x: 205, y: 4.2, z: -5 }, // Fast right sweeper descending
  { x: 242, y: 1.8, z: 85 }, // Lakeside fast straight
  { x: 195, y: 0.8, z: 175 }, // Turn 6 Lakeside Hairpin entry
  { x: 105, y: 0.6, z: 202 }, // Hairpin apex
  { x: 42, y: 1.2, z: 152 }, // Chicane entry
  { x: -18, y: 0.5, z: 148 }, // Parabolica exit onto main straight
];

function catmullRom(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * u +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
  );
}

export class RaceTrack {
  public readonly samples: TrackSample[] = [];
  public readonly totalLength: number;
  public readonly sampleCount: number;
  public readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };

  constructor(sampleCount = 420) {
    this.sampleCount = sampleCount;
    const n = CONTROL_POINTS.length;
    const raw: Vec3[] = [];

    for (let i = 0; i < sampleCount; i++) {
      const globalT = (i / sampleCount) * n;
      const seg = Math.floor(globalT) % n;
      const u = globalT - Math.floor(globalT);

      const p0 = CONTROL_POINTS[(seg - 1 + n) % n];
      const p1 = CONTROL_POINTS[seg];
      const p2 = CONTROL_POINTS[(seg + 1) % n];
      const p3 = CONTROL_POINTS[(seg + 2) % n];

      raw.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, u),
        y: catmullRom(p0.y, p1.y, p2.y, p3.y, u),
        z: catmullRom(p0.z, p1.z, p2.z, p3.z, u),
      });
    }

    let cumDist = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < sampleCount; i++) {
      const prev = raw[(i - 1 + sampleCount) % sampleCount];
      const curr = raw[i];
      const next = raw[(i + 1) % sampleCount];

      if (i > 0) {
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const dz = curr.z - prev.z;
        cumDist += Math.hypot(dx, dy, dz);
      }

      const txRaw = next.x - prev.x;
      const tyRaw = next.y - prev.y;
      const tzRaw = next.z - prev.z;
      const tLen = Math.hypot(txRaw, tyRaw, tzRaw) || 1;
      const tx = txRaw / tLen;
      const ty = tyRaw / tLen;
      const tz = tzRaw / tLen;

      // Right vector in XZ plane: tangent x up(0,1,0) = (-tz, 0, tx) normalized
      const xzLen = Math.hypot(tx, tz) || 1;
      const rx = -tz / xzLen;
      const rz = tx / xzLen;

      // Curvature estimate via angle between prev->curr and curr->next
      const v1x = curr.x - prev.x;
      const v1z = curr.z - prev.z;
      const v2x = next.x - curr.x;
      const v2z = next.z - curr.z;
      const len1 = Math.hypot(v1x, v1z) || 1;
      const len2 = Math.hypot(v2x, v2z) || 1;
      const cross = (v1x * v2z - v1z * v2x) / (len1 * len2);
      const curvature = Math.asin(Math.max(-1, Math.min(1, cross))) / ((len1 + len2) * 0.5);

      if (curr.x < minX) minX = curr.x;
      if (curr.x > maxX) maxX = curr.x;
      if (curr.z < minZ) minZ = curr.z;
      if (curr.z > maxZ) maxZ = curr.z;

      this.samples.push({
        t: i / sampleCount,
        x: curr.x,
        y: curr.y,
        z: curr.z,
        tx,
        ty,
        tz,
        rx,
        rz,
        curvature,
        distance: cumDist,
      });
    }

    const last = raw[sampleCount - 1];
    const first = raw[0];
    this.totalLength = cumDist + Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z);
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  public sampleAt(t: number): TrackSample {
    const wrapped = ((t % 1) + 1) % 1;
    const fIdx = wrapped * this.sampleCount;
    const i0 = Math.floor(fIdx) % this.sampleCount;
    const i1 = (i0 + 1) % this.sampleCount;
    const alpha = fIdx - Math.floor(fIdx);

    const a = this.samples[i0];
    const b = this.samples[i1];

    const tx = a.tx + (b.tx - a.tx) * alpha;
    const ty = a.ty + (b.ty - a.ty) * alpha;
    const tz = a.tz + (b.tz - a.tz) * alpha;
    const tLen = Math.hypot(tx, ty, tz) || 1;

    const rx = a.rx + (b.rx - a.rx) * alpha;
    const rz = a.rz + (b.rz - a.rz) * alpha;
    const rLen = Math.hypot(rx, rz) || 1;

    return {
      t: wrapped,
      x: a.x + (b.x - a.x) * alpha,
      y: a.y + (b.y - a.y) * alpha,
      z: a.z + (b.z - a.z) * alpha,
      tx: tx / tLen,
      ty: ty / tLen,
      tz: tz / tLen,
      rx: rx / rLen,
      rz: rz / rLen,
      curvature: a.curvature + (b.curvature - a.curvature) * alpha,
      distance: a.distance + (b.distance - a.distance) * alpha,
    };
  }

  public getHeadingAt(t: number): number {
    const s = this.sampleAt(t);
    // Vehicle forward vector when yaw=0 is (0, 0, -1).
    // Rotating (0, 0, -1) by yaw around +Y gives (-sin(yaw), 0, -cos(yaw)).
    return Math.atan2(-s.tx, -s.tz);
  }

  public project(x: number, z: number, hintT?: number): TrackProjection {
    let bestIdx = 0;
    let bestDistSq = Infinity;

    if (hintT !== undefined) {
      const centerIdx = Math.floor((((hintT % 1) + 1) % 1) * this.sampleCount);
      const windowRadius = 22;
      for (let offset = -windowRadius; offset <= windowRadius; offset++) {
        const idx = (centerIdx + offset + this.sampleCount) % this.sampleCount;
        const s = this.samples[idx];
        const dx = x - s.x;
        const dz = z - s.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
    }

    // Fallback full scan if far from hint or no hint given
    if (hintT === undefined || bestDistSq > 900) {
      bestDistSq = Infinity;
      for (let i = 0; i < this.sampleCount; i++) {
        const s = this.samples[i];
        const dx = x - s.x;
        const dz = z - s.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }

    // Refine along the segment around bestIdx
    const s = this.samples[bestIdx];
    const next = this.samples[(bestIdx + 1) % this.sampleCount];
    const segLen = Math.hypot(next.x - s.x, next.z - s.z) || 1;
    const dx = x - s.x;
    const dz = z - s.z;
    const along = (dx * s.tx + dz * s.tz) / segLen;
    const refinedT = (((bestIdx + Math.max(-0.5, Math.min(1.0, along))) / this.sampleCount) % 1 + 1) % 1;
    const sample = this.sampleAt(refinedT);
    const rdx = x - sample.x;
    const rdz = z - sample.z;
    const lateralOffset = rdx * sample.rx + rdz * sample.rz;

    return {
      t: refinedT,
      sample,
      lateralOffset,
      distanceSq: rdx * rdx + rdz * rdz,
    };
  }

  public getSurfaceAtOffset(lateralOffset: number): 'asphalt' | 'kerb' | 'gravel' | 'grass' {
    const absLat = Math.abs(lateralOffset);
    if (absLat <= TRACK_HALF_WIDTH) return 'asphalt';
    if (absLat <= KERB_OUTER_EDGE) return 'kerb';
    if (absLat <= GRAVEL_OUTER_EDGE) return 'gravel';
    return 'grass';
  }

  /**
   * Computes ground elevation seamlessly blending the track surface into surrounding Alpine terrain.
   */
  public groundHeightAt(x: number, z: number): number {
    const proj = this.project(x, z);
    const absLat = Math.abs(proj.lateralOffset);
    const trackY = proj.sample.y;

    // Flat across track + kerbs + gravel apron
    if (absLat <= GRAVEL_OUTER_EDGE + 2) {
      return trackY;
    }

    // Smoothly blend into rolling alpine hills outside the track corridor
    const distOut = absLat - (GRAVEL_OUTER_EDGE + 2);
    const blend = Math.min(1, distOut / 36);
    const smoothBlend = blend * blend * (3 - 2 * blend);

    // Alpine lake depression to the southeast (x > 160, z > 120)
    const lakeDist = Math.hypot(x - 270, z - 195);
    const lakeDip = lakeDist < 120 ? -3.2 * (1 - lakeDist / 120) : 0;

    // Gentle hills + outer mountain rim
    const rolling =
      Math.sin(x * 0.014) * Math.cos(z * 0.013) * 6.5 +
      Math.sin(x * 0.032 + 1.1) * Math.sin(z * 0.028) * 2.4;

    // Outer mountain ring
    const centerDist = Math.hypot(x - 95, z - 0);
    const rimRise = centerDist > 235 ? Math.pow((centerDist - 235) * 0.14, 1.55) : 0;

    const naturalHeight = Math.max(-2.6, rolling + rimRise + lakeDip);
    return trackY * (1 - smoothBlend) + (trackY * 0.4 + naturalHeight) * smoothBlend;
  }

  /**
   * Returns a grid spawn position slightly behind the start/finish line (t around 0.04..0.06),
   * aligned cleanly along the straight facing -Z.
   */
  public getGridSlot(slotIndex: number): { x: number; y: number; z: number; yaw: number; t: number } {
    // Place grid near t = 0.03 (just past the first straight entry, facing straight down main straight)
    const startT = 0.055;
    const rowSpacingT = 0.0062; // ~9m between rows
    const row = Math.floor(slotIndex / 2);
    const side = slotIndex % 2 === 0 ? -3.2 : 3.2;
    const t = (((startT - row * rowSpacingT) % 1) + 1) % 1;
    const s = this.sampleAt(t);
    return {
      x: s.x + s.rx * side,
      y: s.y,
      z: s.z + s.rz * side,
      yaw: this.getHeadingAt(t),
      t,
    };
  }

  public getMinimapSvgPoints(width = 160, height = 130, pad = 14): {
    pathD: string;
    mapPoint: (x: number, z: number) => { mx: number; my: number };
  } {
    const spanX = Math.max(1, this.bounds.maxX - this.bounds.minX);
    const spanZ = Math.max(1, this.bounds.maxZ - this.bounds.minZ);
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanZ);
    const offsetX = (width - spanX * scale) * 0.5 - this.bounds.minX * scale;
    const offsetY = (height - spanZ * scale) * 0.5 - this.bounds.minZ * scale;

    const mapPoint = (x: number, z: number) => ({
      mx: x * scale + offsetX,
      my: z * scale + offsetY,
    });

    const parts: string[] = [];
    for (let i = 0; i < this.sampleCount; i += 3) {
      const s = this.samples[i];
      const { mx, my } = mapPoint(s.x, s.z);
      parts.push(`${i === 0 ? 'M' : 'L'}${mx.toFixed(1)},${my.toFixed(1)}`);
    }
    parts.push('Z');
    return { pathD: parts.join(' '), mapPoint };
  }
}

/**
 * Computes lap increment cleanly when crossing t = 0.075 (start/finish gantry line).
 * Prevents reverse-crossing exploits by requiring a forward delta.
 */
export const START_FINISH_T = 0.075;

export function advanceLapProgress(
  prevT: number,
  currT: number,
  currentLap: number,
): { lap: number; crossedFinish: boolean; normalizedLapProgress: number } {
  // Shift coordinates so start/finish line is at 0.0
  const pPrev = (((prevT - START_FINISH_T) % 1) + 1) % 1;
  const pCurr = (((currT - START_FINISH_T) % 1) + 1) % 1;

  // Forward crossing: prev was near 1.0 (> 0.8) and curr wrapped to near 0.0 (< 0.2)
  if (pPrev > 0.8 && pCurr < 0.2) {
    return { lap: currentLap + 1, crossedFinish: true, normalizedLapProgress: pCurr };
  }
  return { lap: currentLap, crossedFinish: false, normalizedLapProgress: pCurr };
}

export const ALPINE_TRACK = new RaceTrack(420);
