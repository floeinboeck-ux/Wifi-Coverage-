import { expect, it } from 'vitest';
import { heatGrid } from '../src/core/heatmap';
import { METRICS, ramp } from '../src/core/metrics';

it('ramp goes from red to green', () => {
  expect(ramp(0)).toEqual([198, 40, 40]);
  expect(ramp(1)).toEqual([31, 166, 90]);
});

it('heatGrid fades out far from samples', () => {
  expect(heatGrid([], 1, 4, 4)).toBeNull();
  const g = heatGrid([{ x: 0.05, y: 0.05, t: 1 }], 1, 20, 20)!;
  expect(g[3]).toBe(150); // near the sample: full alpha
  expect(g[(19 * 20 + 19) * 4 + 3]).toBe(0); // far corner: transparent
});

it('dBm classes follow the rules of thumb', () => {
  expect([-50, -60, -70, -80].map(METRICS.dbm.cls)).toEqual([3, 2, 1, 0]);
});
