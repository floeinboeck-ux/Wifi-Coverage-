import { analyse, kpis, PRIO_LABEL, reportData, reportText, roomStats, type Analysis, type RoomStat } from '../core/analysis';
import { heatGrid } from '../core/heatmap';
import { fmtMac, hex, matchBssid, pairs } from '../core/mac';
import { METRICS, rgb, STATUS, STATUS_COLOR } from '../core/metrics';
import {
  BAND_LABEL,
  deviceByMac,
  devShort,
  findDevice,
  metricValue,
  nextColor,
  TYPE_LABEL,
} from '../core/model';
import { buildPending } from '../core/pending';
import { parseRtr, rtrHasValues, rtrIsWifi } from '../core/rtr';
import { parseScan, pickSsid, scanAps, type ParsedScan } from '../core/scan';
import { exportFile, normalizeState, removeDemo, removeDevice, removeFloor } from '../core/state';
import type { Ap, Band, Device, DeviceType, Floor, Mac, MetricKey, Point, PointScan, State } from '../core/types';
import { avg, esc, uid, clamp } from '../core/util';
import { getPref, saveRaw, setPref } from '../storage';
import { $, $in, armOnce, copyText, fileSafe, resetArm, setMsg, shareOrDownload } from './dom';
import { drawReportCanvas } from './reportImage';

type TapMode = 'pt' | 'dev' | 'off';
interface Pos {
  x: number;
  y: number;
}
interface ScanState {
  sc: ParsedScan | null; // null when showing a stored scan
  ssid: string;
  aps: Ap[];
  attach: { d: Device; a: Ap }[];
}
interface TestRes {
  mbps: number | null;
  up: number | null;
  ping: number | null;
  at: string | null;
}

const HEAT_GRID_W = 140;
const MAX_PLAN_PX = 1400;
const PLAN_JPEG_QUALITY = 0.72;

export function startApp(initial: State): void {
  let state = initial;

  /* ---------- UI state ---------- */
  let metric: MetricKey = (['dbm', 'mbps', 'up', 'ping'] as const).find((m) => m === getPref('metric')) ?? 'dbm';
  let tapMode: TapMode = 'pt';
  let sigSrc = '';
  let draft: Pos | null = null; // new point position
  let devDraft: Pos | null = null; // new device position
  let editing: Point | null = null;
  let testRes: TestRes | null = null;
  let floorEdit: Floor | null = null;
  let newImg: string | null = null;
  let devEdit: Device | null = null;
  let ptDevSel: string | null = null;
  let ptBand: Band | null = null;
  let dvTypeSel: DeviceType = 'router';
  let macDraft: Mac[] = [];
  let pendingDevs: Device[] = [];
  let scanState: ScanState | null = null;
  let placingDev: Device | null = null;

  let planEl: HTMLElement | null = null;
  let planImg: HTMLImageElement | null = null;
  let heat: HTMLCanvasElement | null = null;

  const allDevs = () => state.devices.concat(pendingDevs);
  const devById = (id: string | null | undefined) => findDevice(allDevs(), id);
  const cur = (): Floor | null => state.floors.find((f) => f.id === state.active) || state.floors[0] || null;
  const floorName = (id: string | null) => state.floors.find((x) => x.id === id)?.name ?? '';
  const valueAt = (p: Point) => metricValue(metric, p, sigSrc, allDevs());

  /* ---------- persistence ---------- */
  let saving: Promise<void> = Promise.resolve();
  function save(): void {
    const snapshot = state;
    saving = saving
      .then(() => saveRaw(snapshot))
      .then(
        () => {
          $('storeWarn').hidden = true;
        },
        () => {
          $('storeWarn').hidden = false;
        },
      );
  }

  /* ---------- render ---------- */
  function render(): void {
    renderFloors();
    renderMetric();
    renderTap();
    renderDevices();
    const f = cur();
    const box = $('planBox');
    $('demoBanner').hidden = !(f && f.demo);
    $('repBtn').hidden = !f;
    if (!f) {
      box.innerHTML =
        '<div class="plan"><div class="empty">Noch keine Etage angelegt.<br>Tippe auf „+ Etage“ und wähle ein Foto deines Grundrisses.</div></div>';
      planEl = planImg = heat = null;
      $('hint').textContent = '';
      renderRooms();
      $('stat').textContent = '';
      return;
    }
    box.innerHTML = '<div class="plan" id="plan"><img alt=""><canvas></canvas></div>';
    planEl = $('plan');
    planImg = planEl.querySelector('img')!;
    planImg.alt = 'Grundriss ' + f.name;
    heat = planEl.querySelector('canvas')!;
    planImg.onload = drawHeat;
    planImg.src = f.img;
    if (planImg.complete) drawHeat();
    planEl.addEventListener('click', onPlanClick);
    renderMarkers();
    renderRooms();
    renderHint();
  }

  function renderFloors(): void {
    const el = $('floors');
    el.innerHTML = '';
    const act = cur();
    state.floors.forEach((f) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = f.name + (f.reportAt ? ' ✓' : '');
      b.setAttribute('aria-pressed', String(!!act && f.id === act.id));
      b.onclick = () => {
        if (act && f.id === act.id) openFloor(f);
        else {
          state.active = f.id;
          save();
          render();
        }
      };
      el.appendChild(b);
    });
    const a = document.createElement('button');
    a.className = 'chip add';
    a.textContent = '+ Etage';
    a.onclick = () => openFloor(null);
    el.appendChild(a);
  }

  function renderMetric(): void {
    document
      .querySelectorAll<HTMLButtonElement>('#metric button')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === metric)));
    const ss = $<HTMLSelectElement>('sigSrc');
    if (sigSrc && !devById(sigSrc)) sigSrc = '';
    ss.innerHTML =
      '<option value="">Signal: verbundenes Gerät</option>' +
      state.devices.map((d) => `<option value="${esc(d.id)}">Signal von ${esc(d.name)}</option>`).join('');
    ss.value = sigSrc;
    ss.hidden = metric !== 'dbm' || !state.devices.length;
    const m = METRICS[metric];
    $('ticks').innerHTML = m.ticks
      .map((t, i) => '<span>' + t + (i === m.ticks.length - 1 ? ' ' + m.unit : '') + '</span>')
      .join('');
  }

  function renderTap(): void {
    document
      .querySelectorAll<HTMLButtonElement>('#tap button')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === tapMode)));
  }

  function renderMarkers(): void {
    if (!planEl) return;
    planEl.querySelectorAll('.mk').forEach((m) => m.remove());
    const f = cur();
    if (!f) return;
    const m = METRICS[metric];
    f.points.forEach((p) => {
      const v = valueAt(p);
      const b = document.createElement('button');
      const d = devById(p.dev);
      b.className = 'mk';
      b.style.left = p.x * 100 + '%';
      b.style.top = p.y * 100 + '%';
      b.textContent = v == null ? '–' : m.fmt(v);
      if (v != null) {
        const t = m.norm(v);
        b.style.background = rgb(t);
        b.style.color = t > 0.45 && t < 0.8 ? '#1a1a1a' : '#fff';
      } else b.style.background = '#7a8592';
      b.style.borderColor = d ? d.color : '#fff';
      b.setAttribute(
        'aria-label',
        (p.room || 'Messpunkt') + ': ' + b.textContent + ' ' + m.unit + (d ? ', verbunden mit ' + d.name : ''),
      );
      b.onclick = (e) => {
        e.stopPropagation();
        openPoint(p);
      };
      planEl!.appendChild(b);
    });
    state.devices
      .filter((d) => d.floor === f.id && d.x != null)
      .forEach((d) => {
        const b = document.createElement('button');
        b.className = 'mk dev';
        b.style.left = d.x! * 100 + '%';
        b.style.top = d.y! * 100 + '%';
        b.style.background = d.color;
        b.textContent = devShort(d, state.devices);
        b.setAttribute('aria-label', TYPE_LABEL[d.type] + ' ' + d.name);
        b.onclick = (e) => {
          e.stopPropagation();
          openDevice(d);
        };
        planEl!.appendChild(b);
      });
    const pos = draft || devDraft;
    if (pos) {
      const d = document.createElement('div');
      d.className = 'mk draft';
      d.style.left = pos.x * 100 + '%';
      d.style.top = pos.y * 100 + '%';
      d.textContent = '+';
      planEl.appendChild(d);
    }
    const n = f.points.length;
    $('stat').textContent = n + ' Messpunkt' + (n === 1 ? '' : 'e');
  }

  function drawHeat(): void {
    const f = cur();
    if (!f || !heat || !planImg || !planImg.naturalWidth) return;
    const ar = planImg.naturalHeight / planImg.naturalWidth;
    const W = HEAT_GRID_W;
    const H = Math.max(1, Math.round(W * ar));
    heat.width = W;
    heat.height = H;
    const ctx = heat.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const m = METRICS[metric];
    const samples = f.points
      .map((p) => ({ p, v: valueAt(p) }))
      .filter((o): o is { p: Point; v: number } => o.v != null)
      .map(({ p, v }) => ({ x: p.x, y: p.y, t: m.norm(v) }));
    const g = heatGrid(samples, ar, W, H);
    if (g) ctx.putImageData(new ImageData(g, W, H), 0, 0);
  }

  function renderHint(): void {
    const f = cur();
    const h = $('hint');
    if (!f) {
      h.textContent = '';
      return;
    }
    if (placingDev) {
      h.textContent = 'Tippe auf den Standort von „' + placingDev.name + '“.';
      return;
    }
    h.textContent =
      tapMode === 'pt'
        ? 'Tippe auf deinen Standort, um einen Messpunkt zu setzen. Miss so viele Punkte wie nötig, dichter dort, wo das Signal schwankt. Der farbige Rand zeigt das verbundene Gerät.'
        : tapMode === 'dev'
          ? 'Tippe auf die Stelle, an der dein Router oder Repeater steht.'
          : 'Tippe auf einen Punkt oder ein Gerät, um es zu bearbeiten.';
  }

  function devChip(d: Device): string {
    return `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:6px;white-space:nowrap"><i class="dot" style="background:${d.color}"></i>${esc(d.name)}</span>`;
  }

  function roomRowsHTML(rows: RoomStat[]): string {
    return rows
      .map(
        (r) =>
          `<tr><td>${esc(r.room)}</td><td class="r num">${r.n}</td><td class="r num">${r.avg == null ? '–' : Math.round(r.avg)}</td><td class="r num">${r.min == null ? '–' : r.min}</td><td>${r.devs.length ? r.devs.map(devChip).join('') : '<span style="color:var(--muted)">–</span>'}</td><td>${r.s == null ? '' : `<span class="pill s${r.s}">${STATUS[r.s]}</span>`}</td></tr>`,
      )
      .join('');
  }

  function renderRooms(): void {
    const f = cur();
    const tb = $('rooms');
    if (!f || !f.points.length) {
      tb.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">Noch keine Messpunkte.</td></tr>';
      return;
    }
    tb.innerHTML = roomRowsHTML(roomStats(f, state.devices));
  }

  function renderDevices(): void {
    const el = $('devList');
    if (!state.devices.length) {
      el.innerHTML =
        '<p class="note">Noch kein Gerät. Wähle oben „Tippen setzt: Gerät“ und tippe auf den Standort deines Routers im Plan, oder lege es über „+ Gerät“ ohne Position an.</p>';
      return;
    }
    el.innerHTML = '';
    state.devices.forEach((d) => {
      const b = document.createElement('button');
      b.className = 'devrow';
      const where = d.floor && d.x != null ? floorName(d.floor) : 'ohne Position';
      const macs = d.macs
        .map((m) => '<span class="num">' + esc(fmtMac(m.mac)) + '</span>' + (m.band ? ' (' + BAND_LABEL[m.band] + ')' : ''))
        .join(', ');
      b.innerHTML = `<i class="dot" style="background:${d.color};width:14px;height:14px"></i><span class="meta"><span>${esc(d.name)}</span><small>${TYPE_LABEL[d.type]} · ${esc(where)}</small><small>${macs || 'Keine MAC hinterlegt'}</small></span>`;
      b.onclick = () => openDevice(d);
      el.appendChild(b);
    });
  }

  /* ---------- plan interaction ---------- */
  function onPlanClick(e: MouseEvent): void {
    if (!planEl) return;
    const r = planEl.getBoundingClientRect();
    const pos = { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
    if (placingDev) {
      const f = cur()!;
      Object.assign(placingDev, { floor: f.id, x: pos.x, y: pos.y });
      placingDev = null;
      save();
      renderMarkers();
      renderDevices();
      renderHint();
      return;
    }
    if (tapMode === 'off') return;
    if (tapMode === 'pt') {
      draft = pos;
      openPoint(null);
    } else {
      devDraft = pos;
      openDevice(null);
    }
  }

  /* ---------- sheets ---------- */
  function show(id: string): void {
    $('scrim').hidden = false;
    $(id).hidden = false;
  }

  function closeSheets(): void {
    pendingDevs = [];
    scanState = null;
    $('scrim').hidden = true;
    ['ptSheet', 'flSheet', 'dvSheet'].forEach((i) => ($(i).hidden = true));
    draft = null;
    editing = null;
    devDraft = null;
    devEdit = null;
    renderMarkers();
  }

  /* ---------- point sheet ---------- */
  function renderDevPick(): void {
    const el = $('ptDev');
    el.innerHTML = '';
    const opts: { id: string | null; name: string; color: string | null }[] = [
      ...allDevs().map((d) => ({ id: d.id, name: d.name, color: d.color })),
      { id: null, name: 'Unbekannt', color: null },
    ];
    opts.forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = (o.color ? `<i class="dot" style="background:${o.color}"></i>` : '') + esc(o.name);
      b.setAttribute('aria-pressed', String(o.id === ptDevSel));
      b.onclick = () => {
        if (o.id !== ptDevSel) ptBand = null;
        ptDevSel = o.id;
        renderDevPick();
      };
      el.appendChild(b);
    });
    const h = $('ptDevHint');
    if (!allDevs().length) {
      h.textContent = 'Füge oben ein Scan-Protokoll ein, dann werden Router und Repeater automatisch angelegt.';
      h.hidden = false;
    } else h.hidden = true;
  }

  function onBssid(): void {
    const q = hex($in('ptBssid').value);
    const el = $('ptMatch');
    if (q.length < 2) {
      el.hidden = true;
      return;
    }
    const hits = matchBssid(state.devices, q);
    const devs = [...new Set(hits.map((x) => x.d))];
    if (!hits.length)
      setMsg(el, 'Keine hinterlegte MAC endet auf ' + pairs(q) + '. Prüfe die Eingabe oder ergänze die MAC beim Gerät.', 'warn');
    else if (devs.length > 1) setMsg(el, 'Passt zu ' + devs.map((d) => d.name).join(' und ') + '. Gib mehr Zeichen ein.', 'warn');
    else {
      ptDevSel = devs[0].id;
      const bands = [...new Set(hits.map((x) => x.m.band).filter(Boolean))];
      ptBand = bands.length === 1 ? bands[0] : null;
      setMsg(el, 'Erkannt: ' + devs[0].name + (ptBand ? ' · ' + BAND_LABEL[ptBand] : ''), 'ok');
      renderDevPick();
    }
  }
  $in('ptBssid').addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    t.value = t.value.toUpperCase().replace(/[^0-9A-F:]/g, '');
    onBssid();
  });

  function renderPending(): void {
    const el = $('ptNew');
    const attach = scanState?.attach ?? [];
    if (!pendingDevs.length && !attach.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.innerHTML = '';
    if (pendingDevs.length) {
      const h = document.createElement('h4');
      h.textContent =
        pendingDevs.length === 1
          ? 'Neues Gerät erkannt: bitte benennen'
          : pendingDevs.length + ' neue Geräte erkannt: bitte benennen';
      el.appendChild(h);
      pendingDevs.forEach((d) => {
        const row = document.createElement('div');
        row.className = 'ndrow';
        row.innerHTML = `<i class="dot" style="background:${d.color};width:14px;height:14px"></i><input type="text" aria-label="Name"><select aria-label="Typ"><option value="router">Router</option><option value="repeater">Repeater</option><option value="mesh">Mesh</option></select><small>${d.macs.map((m) => esc(fmtMac(m.mac)) + ' (' + BAND_LABEL[m.band] + ')').join(', ')}</small>`;
        const inp = row.querySelector('input')!;
        const sel = row.querySelector('select')!;
        inp.value = d.name;
        sel.value = d.type;
        inp.oninput = () => {
          d.name = inp.value || d.name;
          renderDevPick();
          renderScanTbl();
        };
        sel.onchange = () => {
          d.type = sel.value as DeviceType;
        };
        el.appendChild(row);
      });
      const n = document.createElement('p');
      n.className = 'note';
      n.textContent = 'Die Geräte werden beim Speichern angelegt. Den Standort setzt du danach unter „Router & Repeater“.';
      el.appendChild(n);
    }
    if (attach.length) {
      const n = document.createElement('p');
      n.className = 'note';
      n.textContent =
        'Weitere Bänder erkannt und zugeordnet: ' + attach.map((x) => fmtMac(x.a.mac) + ' → ' + x.d.name).join(', ') + '.';
      el.appendChild(n);
    }
    el.hidden = false;
  }

  function renderScanTbl(): void {
    const el = $('ptScanTbl');
    const aps = scanState?.aps;
    if (!scanState || !aps || !aps.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    const ss = scanState;
    const groups = new Map<string, { d: Device | null; mac: string; b: Record<string, number> }>();
    aps.forEach((a) => {
      const att = ss.attach.find((x) => x.a === a);
      const d = att ? att.d : deviceByMac(allDevs(), a.mac);
      const k = d ? d.id : a.mac;
      if (!groups.has(k)) groups.set(k, { d, mac: a.mac, b: {} });
      const g = groups.get(k)!;
      g.b[a.band] = Math.max(g.b[a.band] ?? -999, a.med);
    });
    const conn = aps[0];
    const rows = [...groups.values()]
      .map((g) => {
        const isC = g.d
          ? g.d.macs.some((m) => hex(m.mac) === conn.mac) || ss.attach.some((x) => x.a === conn && x.d === g.d)
          : g.mac === conn.mac;
        const name = g.d
          ? `<span style="display:inline-flex;align-items:center;gap:5px"><i class="dot" style="background:${g.d.color}"></i>${esc(g.d.name)}</span>`
          : '<span class="num">' + fmtMac(g.mac) + '</span>';
        return `<tr><td class="${isC ? 'on' : ''}">${name}${isC ? '<span class="conn">verbunden</span>' : ''}</td><td class="r num">${g.b['2.4'] ?? '–'}</td><td class="r num">${g.b['5'] ?? '–'}</td></tr>`;
      })
      .join('');
    el.innerHTML = `<table class="scanTbl"><thead><tr><th>Sender</th><th class="r">2,4 GHz</th><th class="r">5 GHz</th></tr></thead><tbody>${rows}</tbody></table>`;
    el.hidden = false;
  }

  function applyScan(sc: ParsedScan, ssid: string): void {
    const aps = scanAps(sc, ssid);
    const { pending, attach } = buildPending(aps, state.devices);
    pendingDevs = pending;
    scanState = { sc, ssid, aps, attach };
    const ch = $('ptSsid');
    if (sc.ssids.length > 1) {
      ch.innerHTML = '';
      sc.ssids.forEach((x) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = x;
        b.setAttribute('aria-pressed', String(x === ssid));
        b.onclick = () => applyScan(sc, x);
        ch.appendChild(b);
      });
      ch.hidden = false;
    } else ch.hidden = true;
    const a = aps[0];
    const el = $('ptScanMsg');
    if (a) {
      $in('ptDbm').value = String(Math.abs(a.med));
      ptBand = a.band;
      const d = deviceByMac(allDevs(), a.mac) || attach.find((x) => x.a === a)?.d || null;
      ptDevSel = d ? d.id : null;
      const per = Math.round(avg(aps.map((x) => x.n)) ?? 0);
      let msg =
        `Netz „${ssid}“: ${aps.length} Sender, ca. ${per} Messungen je Sender` +
        (sc.dur != null ? `, ${sc.from}–${sc.to} (${sc.dur} s)` : '') +
        '.';
      let warn = false;
      if (sc.blocks > 1) {
        msg += ' Das Protokoll enthält ' + sc.blocks + ' Messblöcke mit Pause dazwischen; verwendet wird nur der letzte.';
        warn = true;
      }
      if (sc.dur != null && sc.dur < 15) {
        msg += ' Kurze Messung: 20 bis 30 Sekunden liefern stabilere Werte.';
        warn = true;
      }
      setMsg(el, msg, warn ? 'warn' : 'ok');
    } else setMsg(el, 'Im Protokoll gibt es keine Einträge für „' + ssid + '“.', 'warn');
    renderPending();
    renderScanTbl();
    renderDevPick();
  }

  function clearScan(): void {
    scanState = null;
    pendingDevs = [];
    renderPending();
    renderScanTbl();
    $('ptSsid').hidden = true;
  }

  $in('ptScan').addEventListener('input', () => {
    const t = $<HTMLTextAreaElement>('ptScan').value;
    const el = $('ptScanMsg');
    if (!t.trim()) {
      clearScan();
      el.hidden = true;
      renderDevPick();
      return;
    }
    const sc = parseScan(t);
    if (!sc) {
      clearScan();
      setMsg(el, 'Kein Scan-Protokoll erkannt. Erwartet werden Zeilen wie "SSID", "BSS", "RSSI", "Kanal", "Zeit".', 'warn');
      return;
    }
    applyScan(sc, pickSsid(sc.ssids, state.ssid));
  });

  function openPoint(p: Point | null): void {
    pendingDevs = [];
    scanState = null;
    $<HTMLTextAreaElement>('ptScan').value = '';
    $('ptScanMsg').hidden = true;
    $('ptSsid').hidden = true;
    if (p && p.scan) {
      scanState = { sc: null, ssid: p.scan.ssid, aps: p.scan.aps, attach: [] };
      setMsg(
        $('ptScanMsg'),
        'Gespeicherter Scan „' +
          p.scan.ssid +
          '“' +
          (p.scan.from ? ', ' + p.scan.from + '–' + p.scan.to : '') +
          '. Neues Protokoll einfügen, um ihn zu ersetzen.',
        'ok',
      );
    }
    renderPending();
    editing = p;
    testRes = p ? { ping: p.ping, mbps: p.mbps, up: p.up ?? null, at: p.rtrAt || null } : null;
    $<HTMLTextAreaElement>('ptRtr').value = '';
    $('ptRtrMsg').hidden = true;
    const f = cur()!;
    $('roomList').innerHTML = [...new Set(f.points.map((q) => q.room).filter(Boolean))]
      .map((r) => `<option value="${esc(r)}">`)
      .join('');
    $('ptTitle').textContent = p ? 'Messpunkt bearbeiten' : 'Neuer Messpunkt';
    $in('ptRoom').value = p ? p.room : state.lastRoom || '';
    $in('ptLabel').value = p ? p.label || '' : '';
    $in('ptDbm').value = p && p.dbm != null ? String(Math.abs(p.dbm)) : '';
    ptDevSel = p
      ? p.dev || null
      : devById(state.lastDev)
        ? state.lastDev!
        : state.devices[0]
          ? state.devices[0].id
          : null;
    ptBand = p ? p.band || null : null;
    $in('ptBssid').value = p && p.bssid ? pairs(p.bssid) : '';
    $('ptMatch').hidden = true;
    renderDevPick();
    renderScanTbl();
    if (p && p.bssid && !p.scan) {
      const keep = p.dev;
      onBssid();
      if (keep) ptDevSel = keep;
      renderDevPick();
    }
    showRes();
    $('ptErr').hidden = true;
    const del = $('ptDel');
    del.hidden = !p;
    resetArm(del, 'Löschen');
    renderMarkers();
    show('ptSheet');
  }

  function showRes(): void {
    const r = testRes;
    $('ptMbps').textContent = r?.mbps != null ? METRICS.mbps.fmt(r.mbps) + ' Mbit/s' : '–';
    $('ptUp').textContent = r?.up != null ? METRICS.up.fmt(r.up) + ' Mbit/s' : '–';
    $('ptPing').textContent = r?.ping != null ? Math.round(r.ping) + ' ms' : '–';
    $('ptAt').textContent = r?.at || '–';
  }

  $<HTMLTextAreaElement>('ptRtr').addEventListener('input', () => {
    const t = $<HTMLTextAreaElement>('ptRtr').value;
    const el = $('ptRtrMsg');
    if (!t.trim()) {
      el.hidden = true;
      return;
    }
    const r = parseRtr(t);
    if (!rtrHasValues(r)) {
      setMsg(el, 'Keine Werte erkannt. Füge den Text aus „Ergebnis teilen“ im RTR-Netztest ein.', 'warn');
      return;
    }
    testRes = { mbps: r.mbps, up: r.up, ping: r.ping, at: r.at };
    showRes();
    if (!rtrIsWifi(r))
      setMsg(
        el,
        'Achtung: Netztyp „' + r.net + '“. Der Test lief nicht über WLAN, bitte mobile Daten ausschalten und neu messen.',
        'warn',
      );
    else setMsg(el, 'RTR-Ergebnis übernommen.', 'ok');
  });

  $in('ptDbm').addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    t.value = t.value.replace(/\D/g, '').slice(0, 3);
  });

  $('ptSave').onclick = () => {
    const raw = $in('ptDbm').value.trim();
    const n = raw ? -Math.abs(parseInt(raw, 10)) : null;
    const err = $('ptErr');
    if (n != null && (n < -100 || n > -10)) {
      err.textContent = 'Der dBm-Wert liegt üblicherweise zwischen 20 und 95. Bitte prüfen.';
      err.hidden = false;
      return;
    }
    if (n == null && !(testRes && (testRes.mbps != null || testRes.up != null || testRes.ping != null))) {
      err.textContent = 'Füge ein Scan-Protokoll oder ein RTR-Ergebnis ein, oder gib einen dBm-Wert ein.';
      err.hidden = false;
      return;
    }
    const f = cur()!;
    const room = $in('ptRoom').value.trim();
    if (scanState && scanState.sc) {
      pendingDevs.forEach((d) => {
        delete d.pending;
        const id = uid();
        if (ptDevSel === d.id) ptDevSel = id;
        d.id = id;
        state.devices.push(d);
      });
      scanState.attach.forEach((x) => {
        if (!x.d.macs.some((m) => hex(m.mac) === x.a.mac)) x.d.macs.push({ mac: fmtMac(x.a.mac), band: x.a.band });
      });
      state.ssid = scanState.ssid;
      pendingDevs = [];
    }
    let scan: PointScan | null = editing?.scan ?? null;
    if (scanState && scanState.aps.length) {
      scan = {
        ssid: scanState.ssid,
        from: scanState.sc ? scanState.sc.from : editing?.scan?.from ?? '',
        to: scanState.sc ? scanState.sc.to : editing?.scan?.to ?? '',
        aps: scanState.aps,
      };
    }
    const data = {
      room,
      label: $in('ptLabel').value.trim(),
      dev: ptDevSel,
      scan,
      bssid: hex($in('ptBssid').value),
      band: ptBand,
      dbm: n,
      mbps: testRes?.mbps ?? null,
      up: testRes?.up ?? null,
      ping: testRes?.ping ?? null,
      rtrAt: testRes?.at ?? null,
    };
    if (editing) Object.assign(editing, data);
    else if (draft) f.points.push({ id: uid(), x: draft.x, y: draft.y, ...data });
    if (room) state.lastRoom = room;
    state.lastDev = ptDevSel;
    save();
    closeSheets();
    renderMetric();
    renderDevices();
    drawHeat();
    renderRooms();
  };

  $('ptDel').onclick = () => {
    if (!armOnce($('ptDel'), 'Wirklich löschen?')) return;
    const f = cur()!;
    f.points = f.points.filter((p) => p !== editing);
    save();
    closeSheets();
    drawHeat();
    renderRooms();
  };
  $('ptCancel').onclick = closeSheets;

  /* ---------- device sheet ---------- */
  function renderTypePick(): void {
    document
      .querySelectorAll<HTMLButtonElement>('#dvType button')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === dvTypeSel)));
  }
  document.querySelectorAll<HTMLButtonElement>('#dvType button').forEach(
    (b) =>
      (b.onclick = () => {
        dvTypeSel = b.dataset.v as DeviceType;
        renderTypePick();
      }),
  );

  function openDevice(d: Device | null): void {
    devEdit = d;
    $('dvErr').hidden = true;
    $('dvTitle').textContent = d ? 'Gerät bearbeiten' : 'Neues Gerät';
    dvTypeSel = d ? d.type : state.devices.some((x) => x.type === 'router') ? 'repeater' : 'router';
    renderTypePick();
    $in('dvName').value = d ? d.name : '';
    macDraft = d && d.macs.length ? d.macs.map((m) => ({ mac: fmtMac(m.mac), band: m.band || '' })) : [{ mac: '', band: '5' }];
    renderMacs();
    const f = cur();
    $('dvPos').textContent = devDraft
      ? 'Position: hier auf „' + (f ? f.name : '') + '“'
      : d && d.x != null
        ? 'Position: ' + floorName(d.floor) + '.'
        : 'Noch ohne Position im Plan.';
    const place = $('dvPlace');
    place.hidden = !d || !f;
    place.textContent = d && d.x != null ? 'Position neu setzen' : 'Position im Plan setzen';
    const del = $('dvDel');
    del.hidden = !d;
    resetArm(del, 'Löschen');
    renderMarkers();
    show('dvSheet');
  }

  function renderMacs(): void {
    const el = $('dvMacs');
    el.innerHTML = '';
    macDraft.forEach((m, i) => {
      const row = document.createElement('div');
      row.className = 'macrow';
      row.innerHTML = `<input type="text" id="mac${i}" placeholder="3C:A6:2F:12:34:56" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="17" aria-label="MAC-Adresse ${i + 1}">
      <select aria-label="Band"><option value="">Band?</option><option value="2.4">2,4 GHz</option><option value="5">5 GHz</option><option value="6">6 GHz</option></select>
      <button type="button" class="x" aria-label="MAC entfernen">×</button>`;
      const inp = row.querySelector('input')!;
      const sel = row.querySelector('select')!;
      inp.value = m.mac;
      sel.value = m.band;
      inp.oninput = () => {
        inp.value = inp.value.toUpperCase().replace(/[^0-9A-F:-]/g, '');
        m.mac = inp.value;
      };
      inp.onblur = () => {
        if (hex(inp.value).length === 12) {
          inp.value = fmtMac(inp.value);
          m.mac = inp.value;
        }
      };
      sel.onchange = () => {
        m.band = sel.value as Band;
      };
      row.querySelector<HTMLButtonElement>('.x')!.onclick = () => {
        macDraft.splice(i, 1);
        renderMacs();
      };
      el.appendChild(row);
    });
  }

  $('dvMacAdd').onclick = () => {
    const bands = macDraft.map((m) => m.band);
    macDraft.push({ mac: '', band: bands.includes('2.4') ? (bands.includes('5') ? '6' : '5') : '2.4' });
    renderMacs();
    $('mac' + (macDraft.length - 1)).focus();
  };

  $('dvSave').onclick = () => {
    const name =
      $in('dvName').value.trim() ||
      TYPE_LABEL[dvTypeSel] + ' ' + (state.devices.filter((x) => x.type === dvTypeSel).length + (devEdit ? 0 : 1));
    const f = cur();
    const macs = macDraft.filter((m) => hex(m.mac).length).map((m) => ({ mac: fmtMac(m.mac), band: m.band }));
    const err = $('dvErr');
    const bad = macs.find((m) => hex(m.mac).length !== 12);
    if (bad) {
      err.textContent = bad.mac + ' ist unvollständig. Eine MAC-Adresse hat 12 Zeichen, z. B. 3C:A6:2F:12:34:56.';
      err.hidden = false;
      return;
    }
    const dup = macs.find((m) => state.devices.some((d) => d !== devEdit && d.macs.some((x) => hex(x.mac) === hex(m.mac))));
    if (dup) {
      err.textContent = dup.mac + ' ist bereits bei einem anderen Gerät hinterlegt.';
      err.hidden = false;
      return;
    }
    if (devEdit) Object.assign(devEdit, { name, type: dvTypeSel, macs });
    else {
      const color = nextColor(
        state.devices.map((x) => x.color),
        state.devices.length,
      );
      const d: Device = {
        id: uid(),
        name,
        type: dvTypeSel,
        macs,
        color,
        floor: devDraft && f ? f.id : null,
        x: devDraft ? devDraft.x : null,
        y: devDraft ? devDraft.y : null,
      };
      state.devices.push(d);
      if (!state.lastDev) state.lastDev = d.id;
    }
    save();
    closeSheets();
    renderMetric();
    renderDevices();
    renderRooms();
  };

  $('dvDel').onclick = () => {
    if (!armOnce($('dvDel'), 'Wirklich löschen?') || !devEdit) return;
    removeDevice(state, devEdit.id);
    save();
    closeSheets();
    renderMetric();
    renderDevices();
    renderRooms();
    drawHeat();
  };
  $('dvCancel').onclick = closeSheets;
  $('dvPlace').onclick = () => {
    const d = devEdit;
    closeSheets();
    placingDev = d;
    renderHint();
    $('planBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  $('devAdd').onclick = () => {
    devDraft = null;
    openDevice(null);
  };

  /* ---------- floor sheet ---------- */
  function openFloor(f: Floor | null): void {
    floorEdit = f;
    newImg = null;
    $('flTitle').textContent = f ? 'Etage bearbeiten' : 'Neue Etage';
    $in('flName').value = f ? f.name : '';
    $in('flFile').value = '';
    $('flErr').hidden = true;
    const d = $('flDel');
    d.hidden = !f;
    resetArm(d, 'Etage löschen');
    show('flSheet');
  }

  $in('flFile').addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      const im = new Image();
      im.onload = () => {
        const s = Math.min(1, MAX_PLAN_PX / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * s);
        c.height = Math.round(im.height * s);
        const x = c.getContext('2d')!;
        x.fillStyle = '#fff';
        x.fillRect(0, 0, c.width, c.height);
        x.drawImage(im, 0, 0, c.width, c.height);
        newImg = c.toDataURL('image/jpeg', PLAN_JPEG_QUALITY);
        $('flErr').hidden = true;
      };
      im.onerror = () => {
        $('flErr').textContent = 'Dieses Bildformat lässt sich nicht öffnen. Wähle ein JPG- oder PNG-Bild.';
        $('flErr').hidden = false;
      };
      im.src = rd.result as string;
    };
    rd.readAsDataURL(file);
  });

  $('flSave').onclick = () => {
    const name = $in('flName').value.trim() || 'Etage ' + (state.floors.length + (floorEdit ? 0 : 1));
    if (!floorEdit && !newImg) {
      $('flErr').textContent = 'Wähle ein Foto oder Bild deines Grundrisses.';
      $('flErr').hidden = false;
      return;
    }
    if (floorEdit) {
      floorEdit.name = name;
      if (newImg) {
        floorEdit.img = newImg;
        floorEdit.demo = false;
      }
    } else {
      const f: Floor = { id: uid(), name, img: newImg!, points: [] };
      state.floors.push(f);
      state.active = f.id;
    }
    save();
    closeSheets();
    render();
  };

  $('flDel').onclick = () => {
    if (!armOnce($('flDel'), 'Mit allen Punkten löschen?') || !floorEdit) return;
    removeFloor(state, floorEdit.id);
    save();
    closeSheets();
    render();
  };
  $('flCancel').onclick = closeSheets;

  /* ---------- report ---------- */
  let lastRep: { f: Floor; a: Analysis; now: Date; text: string; canvas: HTMLCanvasElement | null } | null = null;

  function openReport(): void {
    const f = cur();
    if (!f) return;
    const ar = planImg && planImg.naturalWidth ? planImg.naturalHeight / planImg.naturalWidth : 0.7;
    const a = analyse(f, state.devices, ar);
    const now = new Date();
    f.reportAt = now.toISOString();
    save();
    renderFloors();
    const dstr = now.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    $('repTitle').textContent = 'Report ' + f.name;
    $('repDate').textContent = 'Erstellt am ' + dstr;
    const k = kpis(f, a);
    $('repKpis').innerHTML = (
      [
        [k.points, 'Messpunkte'],
        [k.rooms, 'Räume'],
        [k.avgDbm ?? '–', 'ø dBm'],
        [k.goodSharePct == null ? '–' : k.goodSharePct + ' %', 'gut abgedeckt'],
      ] as [string | number, string][]
    )
      .map(([v, l]) => `<div class="kpi"><b>${v}</b><small>${l}</small></div>`)
      .join('');
    const tot = a.dbPts.length || 1;
    $('repCov').innerHTML =
      [0, 1, 2, 3]
        .map((i) => (a.cov[i] ? `<div style="width:${(a.cov[i] / tot) * 100}%;background:${STATUS_COLOR[i]}"></div>` : ''))
        .join('') || '<div style="width:100%;background:var(--line)"></div>';
    $('repCovLeg').innerHTML = [3, 2, 1, 0]
      .map(
        (i) =>
          `<span><i class="dot" style="background:${STATUS_COLOR[i]}"></i>${STATUS[i]} <span class="num">${a.cov[i]}</span></span>`,
      )
      .join('');
    $('repRecs').innerHTML = a.recs.map((r) => `<li><span class="prio ${r.p}">${PRIO_LABEL[r.p]}</span>${r.t}</li>`).join('');

    const box = $('repImg');
    box.innerHTML = '';
    const canvas = planImg ? drawReportCanvas(f, a, planImg, state.devices) : null;
    if (canvas) {
      try {
        const img = document.createElement('img');
        img.className = 'repimg';
        img.alt = 'Heatmap ' + f.name;
        img.src = canvas.toDataURL('image/jpeg', 0.85);
        box.appendChild(img);
      } catch {
        canvas.className = 'repimg';
        box.appendChild(canvas);
      }
    }
    $('repImgSave').hidden = !canvas;

    $('repDevs').innerHTML = a.devStats.length
      ? a.devStats
          .map(
            (s) =>
              `<tr><td><span style="display:inline-flex;align-items:center;gap:6px"><i class="dot" style="background:${s.d.color}"></i>${esc(s.d.name)}</span></td><td>${TYPE_LABEL[s.d.type]}</td><td class="r num">${s.n}</td><td class="r num">${s.avg == null ? '–' : Math.round(s.avg)}</td><td class="r num">${s.min == null ? '–' : s.min}</td><td class="r num">${s.reach}/${s.seen}</td><td class="r num">${s.mavg == null ? '–' : Math.round(s.mavg)}</td><td class="r num">${s.uavg == null ? '–' : Math.round(s.uavg)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="8" style="color:var(--muted)">Keine Geräte zugeordnet.</td></tr>';
    $('repRooms').innerHTML = a.rooms.length
      ? roomRowsHTML(a.rooms)
      : '<tr><td colspan="6" style="color:var(--muted)">Noch keine Messpunkte.</td></tr>';

    lastRep = { f, a, now, text: reportText(f, a, dstr), canvas };
    $('repText').hidden = true;
    $('repCopyMsg').hidden = true;
    $('report').hidden = false;
    $('report').scrollTop = 0;
  }

  const repFileBase = () =>
    lastRep ? 'wlan-report-' + fileSafe(lastRep.f.name) + '-' + lastRep.now.toISOString().slice(0, 10) : 'wlan-report';

  $('repBtn').onclick = openReport;
  $('repClose').onclick = () => {
    $('report').hidden = true;
  };
  $('repCopy').onclick = async () => {
    if (!lastRep) return;
    const msg = $('repCopyMsg');
    if (await copyText(lastRep.text)) {
      msg.textContent = 'Report kopiert.';
    } else {
      const t = $<HTMLTextAreaElement>('repText');
      t.value = lastRep.text;
      t.hidden = false;
      t.focus();
      t.select();
      msg.textContent = 'Kopieren wurde blockiert. Der Text ist unten markiert, kopiere ihn manuell.';
    }
    msg.hidden = false;
  };
  $('repJson').onclick = () => {
    if (!lastRep) return;
    const data = reportData(lastRep.f, lastRep.a, lastRep.now, lastRep.text);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    void shareOrDownload(blob, repFileBase() + '.json');
  };
  $('repImgSave').onclick = () => {
    const c = lastRep?.canvas;
    if (!c) return;
    c.toBlob(
      (blob) => {
        if (blob) void shareOrDownload(blob, repFileBase() + '.jpg');
      },
      'image/jpeg',
      0.88,
    );
  };

  /* ---------- data export / import ---------- */
  $('dataExport').onclick = () => {
    const blob = new Blob([JSON.stringify(exportFile(state))], { type: 'application/json' });
    void shareOrDownload(blob, 'wlan-abdeckungskarte-' + new Date().toISOString().slice(0, 10) + '.json');
  };
  $('dataImportBtn').onclick = () => $in('dataImport').click();
  $in('dataImport').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const msg = $('dataMsg');
    let next: State | null = null;
    try {
      next = normalizeState(JSON.parse(await file.text()));
    } catch {
      next = null;
    }
    if (!next) {
      msg.textContent = 'Die Datei enthält keine gültigen Daten der WLAN-Abdeckungskarte.';
      msg.hidden = false;
      return;
    }
    const pts = next.floors.reduce((n, f) => n + f.points.length, 0);
    if (
      !confirm(
        `Alle aktuellen Daten durch die Datei ersetzen? Sie enthält ${next.floors.length} Etage(n), ${next.devices.length} Gerät(e) und ${pts} Messpunkt(e).`,
      )
    )
      return;
    state = next;
    sigSrc = '';
    placingDev = null;
    save();
    render();
    msg.textContent = 'Daten importiert.';
    msg.hidden = false;
  });

  /* ---------- misc ---------- */
  $('scrim').onclick = closeSheets;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSheets();
      $('report').hidden = true;
    }
  });
  document.querySelectorAll<HTMLButtonElement>('#metric button').forEach(
    (b) =>
      (b.onclick = () => {
        metric = b.dataset.m as MetricKey;
        setPref('metric', metric);
        renderMetric();
        renderMarkers();
        drawHeat();
      }),
  );
  $<HTMLSelectElement>('sigSrc').onchange = (e) => {
    sigSrc = (e.target as HTMLSelectElement).value;
    renderMarkers();
    drawHeat();
  };
  document.querySelectorAll<HTMLButtonElement>('#tap button').forEach(
    (b) =>
      (b.onclick = () => {
        tapMode = b.dataset.t as TapMode;
        renderTap();
        renderHint();
      }),
  );
  $('demoDel').onclick = () => {
    removeDemo(state);
    save();
    render();
    openFloor(null);
  };

  render();
}
