import { hex } from './mac';
import { median } from './util';
import type { Ap } from './types';

export interface ScanRow {
  ssid: string;
  mac: string;
  rssi: number;
  ch: number;
  t: number | null; // seconds since midnight
}

export interface ParsedScan {
  rows: ScanRow[];
  blocks: number;
  from: string;
  to: string;
  dur: number | null;
  ssids: string[]; // sorted by strongest RSSI
}

/** Gap in seconds that separates two measurement blocks in one log. */
const BLOCK_GAP = 20;

export function fmtT(s: number | null): string {
  if (s == null) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  return [h, m, x].map((v) => String(v).padStart(2, '0')).join(':');
}

/**
 * Parse the log of Apple's "AirPort Utility" Wi-Fi scanner.
 * Lines look like: "SSID", "BSS", "RSSI", "Channel", "Time".
 * When the log has several blocks (pauses > 20 s), only the last block is used.
 */
export function parseScan(text: string): ParsedScan | null {
  const rows: ScanRow[] = [];
  text.split(/\r?\n/).forEach((line) => {
    const q = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    const f = q.length >= 5 ? q : line.split(/[,;\t]/).map((x) => x.trim().replace(/^"|"$/g, ''));
    if (f.length < 5) return;
    const mac = hex(f[1]);
    const rssi = parseInt(f[2], 10);
    const ch = parseInt(f[3], 10);
    if (mac.length !== 12 || isNaN(rssi) || rssi >= 0) return;
    const tm = String(f[4]).match(/(\d{1,2}):(\d{2}):(\d{2})/);
    rows.push({
      ssid: f[0],
      mac,
      rssi,
      ch: isNaN(ch) ? 0 : ch,
      t: tm ? +tm[1] * 3600 + +tm[2] * 60 + +tm[3] : null,
    });
  });
  if (!rows.length) return null;

  const times = [...new Set(rows.map((r) => r.t).filter((t): t is number => t != null))].sort(
    (a, b) => a - b,
  );
  let start: number | null = times.length ? times[0] : null;
  let blocks = 1;
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] > BLOCK_GAP) {
      start = times[i];
      blocks++;
    }
  }
  const end = times.length ? times[times.length - 1] : null;
  const use = rows.filter((r) => r.t == null || start == null || r.t >= start);
  const best: Record<string, number> = {};
  use.forEach((r) => {
    best[r.ssid] = Math.max(best[r.ssid] ?? -999, r.rssi);
  });
  return {
    rows: use,
    blocks,
    from: fmtT(start),
    to: fmtT(end),
    dur: start != null && end != null ? end - start : null,
    ssids: Object.keys(best).sort((a, b) => best[b] - best[a]),
  };
}

/** Access points of one network, median RSSI each, strongest first. */
export function scanAps(sc: ParsedScan, ssid: string): Ap[] {
  const g: Record<string, { mac: string; ch: number; v: number[] }> = {};
  sc.rows
    .filter((r) => r.ssid === ssid)
    .forEach((r) => {
      (g[r.mac] = g[r.mac] || { mac: r.mac, ch: r.ch, v: [] }).v.push(r.rssi);
    });
  return Object.values(g)
    .map((a) => ({
      mac: a.mac,
      ch: a.ch,
      band: (a.ch > 14 ? '5' : '2.4') as Ap['band'],
      med: median(a.v),
      n: a.v.length,
    }))
    .sort((a, b) => b.med - a.med);
}

/** Pick the network to evaluate: the remembered one, else the strongest non-guest one. */
export function pickSsid(ssids: string[], remembered?: string): string {
  if (remembered && ssids.includes(remembered)) return remembered;
  const guest = /gast|guest/i;
  return ssids.find((x) => !guest.test(x)) || ssids[0];
}
