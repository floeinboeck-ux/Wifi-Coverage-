import { findDevice } from './model';
import { sampleState } from './sample';
import type { Device, State } from './types';

export const EXPORT_FORMAT = 'wlan-abdeckungskarte';
export const EXPORT_VERSION = 1;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/**
 * Validate and upgrade stored or imported data.
 * Accepts the prototype's localStorage format as well as this app's export file.
 * Returns null when the data is not usable.
 */
export function normalizeState(raw: unknown): State | null {
  if (isObj(raw) && raw.format === EXPORT_FORMAT && isObj(raw.state)) raw = raw.state;
  if (!isObj(raw) || !Array.isArray(raw.floors)) return null;
  const s = raw as unknown as State;
  if (!Array.isArray(s.devices)) s.devices = [];
  s.devices.forEach((d: Device & { mac?: string }) => {
    if (!Array.isArray(d.macs)) {
      d.macs = d.mac ? [{ mac: d.mac, band: '' }] : [];
      delete d.mac;
    }
  });
  s.floors = s.floors.filter((f) => isObj(f) && typeof f.id === 'string');
  s.floors.forEach((f) => {
    if (!Array.isArray(f.points)) f.points = [];
  });
  if (!s.floors.some((f) => f.id === s.active)) s.active = s.floors[0]?.id ?? null;
  return s;
}

export function loadOrSample(raw: unknown): State {
  return normalizeState(raw) ?? sampleState();
}

export function exportFile(state: State) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
}

/** Remove the example floor and devices. */
export function removeDemo(state: State): void {
  state.floors = state.floors.filter((f) => !f.demo);
  state.devices = state.devices.filter((d) => !d.demo);
  state.floors.forEach((f) =>
    f.points.forEach((p) => {
      if (p.dev && !findDevice(state.devices, p.dev)) p.dev = null;
    }),
  );
  if (state.lastDev && !findDevice(state.devices, state.lastDev)) state.lastDev = null;
  state.active = state.floors[0]?.id ?? null;
}

/** Delete a device and unlink it from all points. */
export function removeDevice(state: State, id: string): void {
  state.devices = state.devices.filter((d) => d.id !== id);
  state.floors.forEach((f) =>
    f.points.forEach((p) => {
      if (p.dev === id) p.dev = null;
    }),
  );
  if (state.lastDev === id) state.lastDev = null;
}

/** Delete a floor; devices placed on it lose their position. */
export function removeFloor(state: State, id: string): void {
  state.floors = state.floors.filter((f) => f.id !== id);
  state.devices.forEach((d) => {
    if (d.floor === id) {
      d.floor = null;
      d.x = null;
      d.y = null;
    }
  });
  state.active = state.floors[0]?.id ?? null;
}
