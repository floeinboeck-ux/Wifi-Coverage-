import { describe, expect, it } from 'vitest';
import { fmtT, parseScan, pickSsid, scanAps } from '../src/core/scan';

const LOG = `SSID, BSS, RSSI, Channel, Time
"Mein WLAN", "0C:72:74:F0:88:20", "-57", "36", "13:18:47"
"Mein WLAN", "0C:72:74:F0:88:20", "-59", "36", "13:18:52"
"Mein WLAN", "0C:72:74:F0:88:20", "-61", "36", "13:19:05"
"Mein WLAN", "0C:72:74:F0:88:1F", "-50", "6", "13:18:47"
"Mein WLAN", "D4:24:DD:88:A2:10", "-72", "44", "13:18:50"
"Gast", "0C:72:74:F0:88:21", "-45", "36", "13:18:50"
"Nachbar", "AA:BB:CC:DD:EE:FF", "-80", "1", "13:18:51"`;

describe('parseScan', () => {
  it('parses AirPort scanner lines', () => {
    const sc = parseScan(LOG)!;
    expect(sc.rows).toHaveLength(7);
    expect(sc.blocks).toBe(1);
    expect(sc.from).toBe('13:18:47');
    expect(sc.to).toBe('13:19:05');
    expect(sc.dur).toBe(18);
    expect(sc.ssids[0]).toBe('Gast');
  });

  it('returns null for unrelated text', () => {
    expect(parseScan('hello world')).toBeNull();
    expect(parseScan('')).toBeNull();
  });

  it('ignores invalid MACs and positive RSSI', () => {
    const sc = parseScan(`"A", "XX", "-50", "1", "10:00:00"\n"A", "0C:72:74:F0:88:20", "5", "1", "10:00:00"`);
    expect(sc).toBeNull();
  });

  it('accepts unquoted, semicolon separated lines', () => {
    const sc = parseScan('Net;0C:72:74:F0:88:20;-60;1;10:00:00')!;
    expect(sc.rows[0]).toMatchObject({ ssid: 'Net', mac: '0C7274F08820', rssi: -60, ch: 1, t: 36000 });
  });

  it('keeps only the last block when the log has pauses', () => {
    const sc = parseScan(
      `"N", "0C:72:74:F0:88:20", "-80", "1", "10:00:00"\n"N", "0C:72:74:F0:88:20", "-50", "1", "10:05:00"\n"N", "0C:72:74:F0:88:20", "-52", "1", "10:05:10"`,
    )!;
    expect(sc.blocks).toBe(2);
    expect(sc.rows.map((r) => r.rssi)).toEqual([-50, -52]);
    expect(sc.dur).toBe(10);
  });
});

describe('scanAps', () => {
  it('groups by BSSID with median and band', () => {
    const aps = scanAps(parseScan(LOG)!, 'Mein WLAN');
    expect(aps.map((a) => a.mac)).toEqual(['0C7274F0881F', '0C7274F08820', 'D424DD88A210']);
    expect(aps[1]).toMatchObject({ med: -59, n: 3, band: '5' });
    expect(aps[0].band).toBe('2.4');
  });
});

describe('pickSsid', () => {
  it('prefers the remembered network, then the strongest non-guest one', () => {
    expect(pickSsid(['Gast', 'Mein WLAN'], 'Mein WLAN')).toBe('Mein WLAN');
    expect(pickSsid(['Gast', 'Mein WLAN'])).toBe('Mein WLAN');
    expect(pickSsid(['Guest'])).toBe('Guest');
  });
});

it('fmtT formats seconds', () => {
  expect(fmtT(3661)).toBe('01:01:01');
  expect(fmtT(null)).toBe('');
});
