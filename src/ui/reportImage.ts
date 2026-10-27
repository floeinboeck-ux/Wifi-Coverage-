import type { Analysis } from '../core/analysis';
import { heatGrid } from '../core/heatmap';
import { METRICS, rgb } from '../core/metrics';
import { devShort, findDevice } from '../core/model';
import type { Device, Floor } from '../core/types';

const GRID_W = 140;
const SUGGESTION_COLOR = '#1f45c4';

/** Render plan + dBm heatmap + points + devices + suggested repeater spots to a canvas. */
export function drawReportCanvas(
  f: Floor,
  a: Analysis,
  plan: HTMLImageElement,
  devices: Device[],
): HTMLCanvasElement | null {
  if (!plan.naturalWidth) return null;
  const W = Math.min(1100, plan.naturalWidth);
  const H = Math.round((W * plan.naturalHeight) / plan.naturalWidth);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);
  x.drawImage(plan, 0, 0, W, H);

  const gh = Math.max(1, Math.round((GRID_W * H) / W));
  const samples = f.points
    .filter((p) => p.dbm != null)
    .map((p) => ({ x: p.x, y: p.y, t: METRICS.dbm.norm(p.dbm!) }));
  const g = heatGrid(samples, H / W, GRID_W, gh);
  if (g) {
    const t = document.createElement('canvas');
    t.width = GRID_W;
    t.height = gh;
    t.getContext('2d')!.putImageData(new ImageData(g, GRID_W, gh), 0, 0);
    x.save();
    x.globalCompositeOperation = 'multiply';
    x.imageSmoothingEnabled = true;
    x.drawImage(t, 0, 0, W, H);
    x.restore();
  }

  const R = Math.max(9, W / 70);
  f.points.forEach((p) => {
    const d = findDevice(devices, p.dev);
    x.beginPath();
    x.arc(p.x * W, p.y * H, R, 0, Math.PI * 2);
    x.fillStyle = p.dbm != null ? rgb(METRICS.dbm.norm(p.dbm)) : '#7a8592';
    x.fill();
    x.lineWidth = R * 0.35;
    x.strokeStyle = d ? d.color : '#fff';
    x.stroke();
    if (p.dbm != null) {
      x.fillStyle = '#111';
      x.font = `600 ${Math.round(R * 0.95)}px sans-serif`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(String(-p.dbm), p.x * W, p.y * H + 1);
    }
  });

  a.floorDevs.forEach((d) => {
    const s = R * 2.4;
    const dx = d.x! * W;
    const dy = d.y! * H;
    x.fillStyle = d.color;
    x.strokeStyle = '#fff';
    x.lineWidth = 3;
    x.beginPath();
    if (x.roundRect) x.roundRect(dx - s / 2, dy - s / 2, s, s, 5);
    else x.rect(dx - s / 2, dy - s / 2, s, s);
    x.fill();
    x.stroke();
    x.fillStyle = '#fff';
    x.font = `700 ${Math.round(R * 0.95)}px sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(devShort(d, devices), dx, dy + 1);
  });

  a.suggestions.forEach((s) => {
    const cx = s.pt.x * W;
    const cy = s.pt.y * H;
    x.save();
    x.setLineDash([8, 6]);
    x.lineWidth = 4;
    x.strokeStyle = SUGGESTION_COLOR;
    x.beginPath();
    x.arc(cx, cy, R * 3, 0, Math.PI * 2);
    x.stroke();
    x.restore();
    x.fillStyle = SUGGESTION_COLOR;
    x.font = `700 ${Math.round(R * 1.2)}px sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'bottom';
    x.fillText('V' + s.n, cx, cy - R * 3.2);
  });
  return c;
}
