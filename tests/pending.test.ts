import { describe, expect, it } from 'vitest';
import { buildPending } from '../src/core/pending';
import type { Ap, Device } from '../src/core/types';

const ap = (mac: string, med: number, band: Ap['band'] = '5'): Ap => ({ mac, med, band, ch: band === '5' ? 36 : 6, n: 5 });

describe('buildPending', () => {
  it('clusters neighbouring BSSIDs into devices, strongest becomes the router', () => {
    const r = buildPending(
      [ap('0C7274F08820', -50), ap('0C7274F0881F', -55, '2.4'), ap('D424DD88A210', -70)],
      [],
    );
    expect(r.attach).toEqual([]);
    expect(r.pending).toHaveLength(2);
    expect(r.pending[0]).toMatchObject({ type: 'router', name: 'Router' });
    expect(r.pending[0].macs.map((m) => m.mac)).toEqual(['0C:72:74:F0:88:1F', '0C:72:74:F0:88:20']);
    expect(r.pending[1]).toMatchObject({ type: 'repeater', name: 'Repeater 1' });
    expect(r.pending[0].color).not.toBe(r.pending[1].color);
  });

  it('attaches extra bands to known devices', () => {
    const known: Device = {
      id: 'r', name: 'FRITZ!Box', type: 'router', macs: [{ mac: '0C:72:74:F0:88:20', band: '5' }],
      color: '#2b4fd8', floor: null, x: null, y: null,
    };
    const extra = ap('0C7274F08822', -60, '2.4');
    const r = buildPending([ap('0C7274F08820', -50), extra], [known]);
    expect(r.pending).toEqual([]);
    expect(r.attach).toEqual([{ d: known, a: extra }]);
  });
});
