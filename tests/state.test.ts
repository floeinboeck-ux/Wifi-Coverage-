import { describe, expect, it } from 'vitest';
import { exportFile, normalizeState, removeDemo, removeDevice, removeFloor } from '../src/core/state';
import { sampleState } from '../src/core/sample';

describe('normalizeState', () => {
  it('rejects junk', () => {
    expect(normalizeState(null)).toBeNull();
    expect(normalizeState({ foo: 1 })).toBeNull();
  });

  it('upgrades the old single-MAC device format', () => {
    const s = normalizeState({ active: 'x', floors: [], devices: [{ id: 'd', mac: 'AA:BB:CC:DD:EE:FF' }] })!;
    expect(s.devices[0].macs).toEqual([{ mac: 'AA:BB:CC:DD:EE:FF', band: '' }]);
    expect(s.active).toBeNull();
  });

  it('round-trips the export file', () => {
    const s = sampleState();
    const back = normalizeState(JSON.parse(JSON.stringify(exportFile(s))))!;
    expect(back.floors[0].points).toHaveLength(19);
    expect(back.devices).toHaveLength(2);
  });
});

describe('mutations', () => {
  it('removeDemo clears example data', () => {
    const s = sampleState();
    removeDemo(s);
    expect(s.floors).toEqual([]);
    expect(s.devices).toEqual([]);
    expect(s.active).toBeNull();
  });

  it('removeDevice unlinks points', () => {
    const s = sampleState();
    removeDevice(s, 'demo-w');
    expect(s.floors[0].points.filter((p) => p.dev === 'demo-w')).toEqual([]);
    expect(s.floors[0].points.filter((p) => p.dev === null)).toHaveLength(4);
  });

  it('removeFloor clears device positions', () => {
    const s = sampleState();
    removeFloor(s, 'demo');
    expect(s.devices.every((d) => d.floor === null && d.x === null)).toBe(true);
  });
});
