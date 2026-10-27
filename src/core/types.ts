export type Band = '2.4' | '5' | '6' | '';
export type DeviceType = 'router' | 'repeater' | 'mesh';
export type MetricKey = 'dbm' | 'mbps' | 'up' | 'ping';

export interface Mac {
  mac: string;
  band: Band;
}

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  macs: Mac[];
  color: string;
  floor: string | null;
  x: number | null;
  y: number | null;
  demo?: boolean;
  pending?: boolean;
}

/** One access point (BSSID) of the chosen network, aggregated over a scan. */
export interface Ap {
  mac: string; // 12 hex chars, upper case, no separators
  ch: number;
  band: '2.4' | '5';
  med: number; // median RSSI in dBm
  n: number; // number of samples
}

export interface PointScan {
  ssid: string;
  from: string;
  to: string;
  aps: Ap[];
}

export interface Point {
  id: string;
  x: number; // 0..1 relative to plan width
  y: number; // 0..1 relative to plan height
  room: string;
  label: string;
  dev: string | null;
  dbm: number | null;
  mbps: number | null;
  up?: number | null;
  ping: number | null;
  scan?: PointScan | null;
  bssid?: string;
  band?: Band | null;
  rtrAt?: string | null;
}

export interface Floor {
  id: string;
  name: string;
  img: string; // data URL
  points: Point[];
  demo?: boolean;
  reportAt?: string;
}

export interface State {
  active: string | null;
  devices: Device[];
  floors: Floor[];
  ssid?: string;
  lastRoom?: string;
  lastDev?: string | null;
}
