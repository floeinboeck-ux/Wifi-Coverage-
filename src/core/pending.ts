import { fmtMac, hex, macNum } from './mac';
import { nextColor } from './model';
import { uid } from './util';
import type { Ap, Device } from './types';

/** BSSIDs of one device usually differ only in the last digits. */
const SAME_DEVICE_DISTANCE = 4;

export interface PendingResult {
  pending: Device[]; // new devices to create on save
  attach: { d: Device; a: Ap }[]; // new bands of known devices
}

/**
 * Turn unknown BSSIDs of a scan into new devices (clustering neighbouring MACs)
 * or extra bands of existing devices.
 */
export function buildPending(aps: Ap[], devices: Device[]): PendingResult {
  const pending: Device[] = [];
  const attach: PendingResult['attach'] = [];
  const unknown = aps.filter((a) => !devices.some((d) => d.macs.some((m) => hex(m.mac) === a.mac)));
  const rest: Ap[] = [];
  unknown.forEach((a) => {
    const d = devices.find((d) =>
      d.macs.some((m) => Math.abs(macNum(hex(m.mac)) - macNum(a.mac)) <= SAME_DEVICE_DISTANCE),
    );
    if (d) attach.push({ d, a });
    else rest.push(a);
  });
  rest.sort((a, b) => macNum(a.mac) - macNum(b.mac));
  const clusters: Ap[][] = [];
  rest.forEach((a) => {
    const c = clusters[clusters.length - 1];
    if (c && macNum(a.mac) - macNum(c[c.length - 1].mac) <= SAME_DEVICE_DISTANCE) c.push(a);
    else clusters.push([a]);
  });
  clusters.sort((a, b) => Math.max(...b.map((x) => x.med)) - Math.max(...a.map((x) => x.med)));

  const used = new Set(devices.map((x) => x.color));
  let hasRouter = devices.some((d) => d.type === 'router');
  let rep = devices.filter((d) => d.type !== 'router').length;
  clusters.forEach((c) => {
    const color = nextColor(used, devices.length + pending.length);
    used.add(color);
    const type = hasRouter ? 'repeater' : 'router';
    hasRouter = true;
    if (type !== 'router') rep++;
    pending.push({
      id: 'new-' + uid(),
      pending: true,
      name: type === 'router' ? 'Router' : 'Repeater ' + rep,
      type,
      color,
      floor: null,
      x: null,
      y: null,
      macs: c.map((a) => ({ mac: fmtMac(a.mac), band: a.band })),
    });
  });
  return { pending, attach };
}
