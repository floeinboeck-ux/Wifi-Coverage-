import { ramp } from './metrics';

export interface HeatSample {
  x: number; // 0..1
  y: number; // 0..1
  t: number; // normalised value 0..1
}

/** Full opacity up to R0, fading out until R1 (fractions of plan width). */
const R0 = 0.14;
const R1 = 0.3;
const MAX_ALPHA = 150;

/**
 * Inverse-distance-weighted interpolation of the samples onto a W×H RGBA grid.
 * `ar` is height/width of the plan so distances are isotropic.
 */
export function heatGrid(
  samples: HeatSample[],
  ar: number,
  W: number,
  H: number,
): Uint8ClampedArray<ArrayBuffer> | null {
  const pts = samples.map((p) => ({ x: p.x, y: p.y * ar, t: p.t }));
  if (!pts.length) return null;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = (x + 0.5) / W;
      const py = ((y + 0.5) / H) * ar;
      let num = 0;
      let den = 0;
      let dmin = 9;
      let hit = -1;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const dx = px - p.x;
        const dy = py - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1e-7) {
          hit = i;
          break;
        }
        const w = 1 / d2;
        num += w * p.t;
        den += w;
        const dd = Math.sqrt(d2);
        if (dd < dmin) dmin = dd;
      }
      const t = hit >= 0 ? pts[hit].t : num / den;
      if (hit >= 0) dmin = 0;
      const a = dmin < R0 ? 1 : dmin > R1 ? 0 : 1 - (dmin - R0) / (R1 - R0);
      const c = ramp(t);
      const o = (y * W + x) * 4;
      out[o] = c[0];
      out[o + 1] = c[1];
      out[o + 2] = c[2];
      out[o + 3] = Math.round(a * MAX_ALPHA);
    }
  }
  return out;
}
