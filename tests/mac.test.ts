import { expect, it } from 'vitest';
import { fmtMac, hex, matchBssid } from '../src/core/mac';
import type { Device } from '../src/core/types';

it('normalises MACs', () => {
  expect(hex('0c-72:74 f0.88:20')).toBe('0C7274F08820');
  expect(fmtMac('0c7274f08820')).toBe('0C:72:74:F0:88:20');
  expect(fmtMac('0c72')).toBe('0C72');
});

it('matches BSSID suffixes', () => {
  const d = (id: string, mac: string): Device => ({
    id, name: id, type: 'router', macs: [{ mac, band: '5' }], color: '', floor: null, x: null, y: null,
  });
  const devs = [d('a', '3C:A6:2F:12:34:56'), d('b', 'E0:28:6D:AB:34:56')];
  expect(matchBssid(devs, '5')).toEqual([]);
  expect(matchBssid(devs, '34:56').map((h) => h.d.id)).toEqual(['a', 'b']);
  expect(matchBssid(devs, '12:34:56').map((h) => h.d.id)).toEqual(['a']);
});
