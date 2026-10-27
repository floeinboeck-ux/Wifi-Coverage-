import { describe, expect, it } from 'vitest';
import { parseRtr, rtrHasValues, rtrIsWifi } from '../src/core/rtr';

describe('parseRtr', () => {
  it('reads the shared RTR-Netztest result', () => {
    const r = parseRtr('Testzeitpunkt: 25.10.2026 13:20:11\nNetztyp: WLAN\nDownload: 162,5 Mbit/s\nUpload: 193 Mbit/s\nPing: 12 ms');
    expect(r).toEqual({ mbps: 162.5, up: 193, ping: 12, at: '25.10.2026 13:20', net: 'WLAN' });
    expect(rtrHasValues(r)).toBe(true);
    expect(rtrIsWifi(r)).toBe(true);
  });

  it('flags mobile networks', () => {
    const r = parseRtr('Netztyp: 5G\nDown: 300');
    expect(r.mbps).toBe(300);
    expect(rtrIsWifi(r)).toBe(false);
  });

  it('detects missing values', () => {
    expect(rtrHasValues(parseRtr('nothing'))).toBe(false);
  });
});
