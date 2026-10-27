import { hex } from './mac';
import type { Device, MetricKey, Point } from './types';

export const DEVICE_COLORS = ['#2b4fd8', '#8e3fb0', '#00838f', '#c2185b', '#6d4c41', '#2e7d32'];
export const TYPE_LABEL = { router: 'Router', repeater: 'Repeater', mesh: 'Mesh-Knoten' } as const;
export const BAND_LABEL: Record<string, string> = { '2.4': '2,4 GHz', '5': '5 GHz', '6': '6 GHz' };

export const findDevice = (devices: Device[], id: string | null | undefined): Device | null =>
  (id && devices.find((d) => d.id === id)) || null;

export const deviceByMac = (devices: Device[], mac: string): Device | null =>
  devices.find((d) => d.macs.some((m) => hex(m.mac) === mac)) || null;

/** Signal of a specific device at a point (best of its BSSIDs), if known. */
export function sigOf(p: Point, devId: string, devices: Device[]): number | null {
  const d = findDevice(devices, devId);
  if (!d) return null;
  if (p.scan && p.scan.aps) {
    const set = new Set(d.macs.map((m) => hex(m.mac)));
    const v = p.scan.aps.filter((a) => set.has(a.mac)).map((a) => a.med);
    return v.length ? Math.max(...v) : null;
  }
  return p.dev === devId ? p.dbm : null;
}

/** Signal of a device on one band at a point (needs a stored scan). */
export function bandSig(p: Point, devId: string, band: string, devices: Device[]): number | null {
  const d = findDevice(devices, devId);
  if (!d || !p.scan) return null;
  const set = new Set(d.macs.map((m) => hex(m.mac)));
  const v = p.scan.aps.filter((a) => set.has(a.mac) && a.band === band).map((a) => a.med);
  return v.length ? Math.max(...v) : null;
}

/** Short marker label: R, Rp2, M1 … */
export function devShort(d: Device, devices: Device[]): string {
  const same = devices.filter((x) => x.type === d.type);
  const i = same.indexOf(d) + 1;
  const base = d.type === 'router' ? 'R' : d.type === 'mesh' ? 'M' : 'Rp';
  return same.length > 1 ? base + i : base;
}

export function nextColor(used: Iterable<string>, fallbackIndex: number): string {
  const u = new Set(used);
  return DEVICE_COLORS.find((c) => !u.has(c)) || DEVICE_COLORS[fallbackIndex % DEVICE_COLORS.length];
}

/** Value of a metric at a point. For dBm, `sigSrc` picks a specific device instead of the connected one. */
export function metricValue(
  metric: MetricKey,
  p: Point,
  sigSrc: string,
  devices: Device[],
): number | null {
  switch (metric) {
    case 'dbm':
      return sigSrc ? sigOf(p, sigSrc, devices) : p.dbm;
    case 'mbps':
      return p.mbps;
    case 'up':
      return p.up ?? null;
    case 'ping':
      return p.ping;
  }
}
