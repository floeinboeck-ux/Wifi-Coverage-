import type { Device, Mac } from './types';

/** Keep only hex digits, upper case. */
export const hex = (s: unknown): string =>
  String(s || '').toUpperCase().replace(/[^0-9A-F]/g, '');

/** "AABBCC" -> "AA:BB:CC" */
export const pairs = (h: string): string => h.match(/.{1,2}/g)?.join(':') || '';

export function fmtMac(m: string): string {
  const h = hex(m);
  return h.length === 12 ? pairs(h) : String(m).toUpperCase();
}

export const macNum = (m: string): number => parseInt(m, 16);

/** Devices whose MAC ends with the typed suffix. */
export function matchBssid(devices: Device[], query: string): { d: Device; m: Mac }[] {
  const q = hex(query);
  const hits: { d: Device; m: Mac }[] = [];
  if (q.length < 2) return hits;
  devices.forEach((d) =>
    d.macs.forEach((m) => {
      const h = hex(m.mac);
      if (h.length >= q.length && h.endsWith(q)) hits.push({ d, m });
    }),
  );
  return hits;
}
