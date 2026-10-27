import { DEVICE_COLORS } from './model';
import { uid } from './util';
import type { Point, State } from './types';

function samplePlan(): string {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560">
  <rect width="800" height="560" fill="#ffffff"/>
  <g stroke="#2b333d" stroke-width="8" fill="none" stroke-linecap="square">
    <rect x="20" y="20" width="760" height="520"/>
    <path d="M470 20V120M470 180V330M470 330H520M580 330H780M20 330H120M180 330H330M300 330V540M470 330V540M470 230H600M660 230H780"/>
  </g>
  <g font-family="Helvetica,Arial,sans-serif" font-size="20" fill="#8a96a3">
    <text x="190" y="130">Wohnen / Essen</text><text x="585" y="110">Küche</text>
    <text x="600" y="290">Flur</text><text x="120" y="440">Büro</text>
    <text x="360" y="440">Bad</text><text x="570" y="440">Schlafen</text>
  </g></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}

/** Example floor plan with example values, shown on first start. */
export function sampleState(): State {
  const R = 'demo-r';
  const W = 'demo-w';
  const P = (
    x: number,
    y: number,
    room: string,
    dev: string,
    dbm: number,
    mbps: number,
    ping: number,
    label = '',
  ): Point => ({ id: uid(), x: x / 800, y: y / 560, room, label, dev, dbm, mbps, ping });
  return {
    active: 'demo',
    devices: [
      {
        id: R,
        name: 'Router Flur',
        type: 'router',
        macs: [
          { mac: '3C:A6:2F:12:34:56', band: '5' },
          { mac: '3C:A6:2F:12:34:55', band: '2.4' },
        ],
        color: DEVICE_COLORS[0],
        floor: 'demo',
        x: 640 / 800,
        y: 300 / 560,
        demo: true,
      },
      {
        id: W,
        name: 'Repeater Schlafen',
        type: 'repeater',
        macs: [{ mac: 'E0:28:6D:AB:CD:EF', band: '5' }],
        color: DEVICE_COLORS[1],
        floor: 'demo',
        x: 740 / 800,
        y: 505 / 560,
        demo: true,
      },
    ],
    floors: [
      {
        id: 'demo',
        name: 'Beispiel EG',
        demo: true,
        img: samplePlan(),
        points: [
          P(600, 275, 'Flur', R, -41, 212, 9),
          P(45, 45, 'Wohnen', R, -63, 88, 18),
          P(445, 45, 'Wohnen', R, -58, 121, 14),
          P(445, 305, 'Wohnen', R, -54, 150, 12),
          P(45, 305, 'Wohnen', R, -66, 71, 21, 'Sofa'),
          P(245, 175, 'Wohnen', R, -57, 130, 13),
          P(495, 45, 'Küche', R, -51, 180, 11),
          P(755, 45, 'Küche', R, -49, 190, 10),
          P(630, 130, 'Küche', R, -46, 205, 9),
          P(45, 355, 'Büro', R, -71, 34, 38),
          P(275, 355, 'Büro', R, -68, 46, 30),
          P(275, 515, 'Büro', R, -76, 12, 64, 'Schreibtisch'),
          P(45, 515, 'Büro', R, -80, 6, 92),
          P(160, 435, 'Büro', R, -74, 18, 55),
          P(495, 355, 'Schlafen', R, -56, 140, 13),
          P(755, 355, 'Schlafen', W, -52, 95, 16),
          P(755, 520, 'Schlafen', W, -47, 110, 15),
          P(495, 515, 'Schlafen', W, -55, 92, 17),
          P(625, 435, 'Schlafen', W, -50, 105, 15),
        ],
      },
    ],
  };
}
