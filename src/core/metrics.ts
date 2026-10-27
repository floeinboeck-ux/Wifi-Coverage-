import { clamp } from './util';
import type { MetricKey } from './types';

export interface MetricDef {
  norm: (v: number) => number; // 0 (bad) .. 1 (good)
  fmt: (v: number) => string;
  ticks: string[];
  cls: (v: number) => 0 | 1 | 2 | 3;
  unit: string;
}

const fmtRate = (v: number): string => (v >= 100 ? String(Math.round(v)) : v.toFixed(v < 10 ? 1 : 0));
const rateCls = (v: number): 0 | 1 | 2 | 3 => (v >= 100 ? 3 : v >= 40 ? 2 : v >= 10 ? 1 : 0);
const rateNorm = (v: number): number => clamp(Math.log10(v + 1) / Math.log10(301));

export const METRICS: Record<MetricKey, MetricDef> = {
  dbm: {
    norm: (v) => clamp((v + 85) / 40),
    fmt: (v) => String(Math.round(v)),
    ticks: ['−85', '−75', '−67', '−55', '−45'],
    cls: (v) => (v >= -55 ? 3 : v >= -67 ? 2 : v >= -75 ? 1 : 0),
    unit: 'dBm',
  },
  mbps: { norm: rateNorm, fmt: fmtRate, ticks: ['0', '5', '30', '100', '300'], cls: rateCls, unit: 'Mbit/s' },
  up: { norm: rateNorm, fmt: fmtRate, ticks: ['0', '5', '30', '100', '300'], cls: rateCls, unit: 'Mbit/s' },
  ping: {
    norm: (v) => clamp(1 - (v - 5) / 145),
    fmt: (v) => String(Math.round(v)),
    ticks: ['150', '110', '60', '30', '5'],
    cls: (v) => (v <= 20 ? 3 : v <= 50 ? 2 : v <= 100 ? 1 : 0),
    unit: 'ms',
  },
};

export const STATUS = ['kritisch', 'schwach', 'gut', 'sehr gut'] as const;
export const STATUS_COLOR = ['var(--bad)', 'var(--weak)', 'var(--ok)', 'var(--good)'];

type Rgb = [number, number, number];
const STOPS: [number, Rgb][] = [
  [0, [198, 40, 40]],
  [0.35, [239, 108, 0]],
  [0.6, [249, 200, 14]],
  [1, [31, 166, 90]],
];

/** Red → orange → yellow → green colour ramp. */
export function ramp(t: number): Rgb {
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1];
      const [b, cb] = STOPS[i];
      const k = (t - a) / (b - a);
      return ca.map((c, j) => Math.round(c + (cb[j] - c) * k)) as Rgb;
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export function rgb(t: number): string {
  const c = ramp(t);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
