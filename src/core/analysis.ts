import { fmtMac } from './mac';
import { METRICS, STATUS } from './metrics';
import { bandSig, findDevice, sigOf, TYPE_LABEL } from './model';
import { avg, esc, stripTags } from './util';
import type { Device, Floor, Point } from './types';

export interface RoomStat {
  room: string;
  ps: Point[];
  n: number;
  avg: number | null;
  min: number | null;
  mavg: number | null;
  mmin: number | null;
  s: 0 | 1 | 2 | 3 | null;
  devs: Device[];
}

/** Per-room aggregates, worst rooms first. */
export function roomStats(f: Floor, devices: Device[]): RoomStat[] {
  const g: Record<string, Point[]> = {};
  f.points.forEach((p) => {
    const k = p.room || 'Ohne Raum';
    (g[k] = g[k] || []).push(p);
  });
  return Object.entries(g)
    .map(([room, ps]) => {
      const db = ps.map((p) => p.dbm).filter((v): v is number => v != null);
      const mb = ps.map((p) => p.mbps).filter((v): v is number => v != null);
      const min = db.length ? Math.min(...db) : null;
      const mmin = mb.length ? Math.min(...mb) : null;
      const cnt: Record<string, number> = {};
      ps.forEach((p) => {
        if (p.dev) cnt[p.dev] = (cnt[p.dev] || 0) + 1;
      });
      const devs = Object.keys(cnt)
        .sort((a, b) => cnt[b] - cnt[a])
        .map((id) => findDevice(devices, id))
        .filter((d): d is Device => !!d);
      const s = min != null ? METRICS.dbm.cls(min) : mmin != null ? METRICS.mbps.cls(mmin) : null;
      return { room, ps, n: ps.length, avg: avg(db), min, mavg: avg(mb), mmin, s, devs };
    })
    .sort((a, b) => (a.s ?? 9) - (b.s ?? 9) || (a.min ?? 0) - (b.min ?? 0));
}

export type Prio = 'h' | 'm' | 'l';
export const PRIO_LABEL: Record<Prio, string> = { h: 'Hoch', m: 'Mittel', l: 'Info' };

export interface Recommendation {
  p: Prio;
  t: string; // HTML (escaped)
  txt: string; // plain text
}

export interface Suggestion {
  pt: Point;
  rooms: string[];
  n: number;
  sev: Prio;
  worst: number;
}

export interface DeviceStat {
  d: Device;
  n: number;
  avg: number | null;
  min: number | null;
  mavg: number | null;
  uavg: number | null;
  reach: number;
  seen: number;
}

export interface Analysis {
  rooms: RoomStat[];
  cov: [number, number, number, number]; // kritisch, schwach, gut, sehr gut
  recs: Recommendation[];
  suggestions: Suggestion[];
  devStats: DeviceStat[];
  floorDevs: Device[];
  dbPts: Point[];
  weak: RoomStat[];
}

/** Distance from the router at which we look for the measurement next to a repeater. */
const NEAR_SCAN = 0.15;
const NEAR_POINT = 0.12;

/**
 * Analyse one floor and derive recommendations.
 * `ar` is plan height/width, used for isotropic distances.
 */
export function analyse(f: Floor, devices: Device[], ar: number): Analysis {
  const dist = (a: { x: number; y: number }, b: { x: number | null; y: number | null }) =>
    Math.hypot(a.x - (b.x ?? 0), (a.y - (b.y ?? 0)) * ar);
  const rooms = roomStats(f, devices);
  const pts = f.points;
  const dbPts = pts.filter((p) => p.dbm != null);
  const floorDevs = devices.filter((d) => d.floor === f.id && d.x != null);
  const usedIds = new Set(pts.map((p) => p.dev).filter(Boolean));
  const devs = devices.filter((d) => usedIds.has(d.id) || floorDevs.includes(d));
  const cov: Analysis['cov'] = [0, 0, 0, 0];
  dbPts.forEach((p) => cov[METRICS.dbm.cls(p.dbm!)]++);
  const recs: Recommendation[] = [];
  const suggestions: Suggestion[] = [];
  const weak = rooms.filter((r) => r.s != null && r.s <= 1 && r.min != null);
  const center = (ps: Point[]) => ({
    x: avg(ps.map((p) => p.x)) ?? 0,
    y: avg(ps.map((p) => p.y)) ?? 0,
  });

  const router = devices.find((d) => d.type === 'router') || null;
  const rSig = (p: Point): number | null => (router ? sigOf(p, router.id, devices) : null);

  // Repeater uplink check: a repeater can only pass on what it receives.
  floorDevs
    .filter((d) => d.type !== 'router')
    .forEach((d) => {
      const ns = router
        ? pts
            .filter((p) => p.scan && dist(p, d) < NEAR_SCAN && sigOf(p, router.id, devices) != null)
            .sort((a, b) => dist(a, d) - dist(b, d))[0]
        : undefined;
      if (ns && router) {
        const v = sigOf(ns, router.id, devices)!;
        if (v < -67)
          recs.push({
            p: 'h',
            t: `<b>${esc(d.name)}</b> steht im schwachen Bereich des Routers: am nächsten Messpunkt kommt der Router nur mit ${v} dBm an. Ein Repeater gibt nur weiter, was er empfängt: näher zum Router stellen, per LAN anbinden oder einen Mesh-Knoten mit LAN-Backhaul nutzen.`,
            txt: `${d.name}: Router am Standort nur ${v} dBm. Näher zum Router oder per LAN anbinden.`,
          });
        return;
      }
      const near = dbPts
        .filter((p) => {
          const dv = findDevice(devices, p.dev);
          return dv && dv.type === 'router' && dist(p, d) < NEAR_POINT;
        })
        .sort((a, b) => dist(a, d) - dist(b, d))[0];
      if (near && near.dbm! < -67)
        recs.push({
          p: 'h',
          t: `<b>${esc(d.name)}</b> steht selbst im schwachen Router-Bereich (${near.dbm} dBm am Standort). Ein Repeater gibt nur weiter, was er empfängt: näher zum Router stellen, per LAN anbinden oder einen Mesh-Knoten mit LAN-Backhaul nutzen.`,
          txt: `${d.name} steht selbst im schwachen Router-Bereich (${near.dbm} dBm). Näher zum Router stellen oder per LAN anbinden.`,
        });
      else if (!near)
        recs.push({
          p: 'l',
          t: `Prüfe den Empfang von <b>${esc(d.name)}</b>: Miss direkt daneben, verbunden mit dem Router. Mindestens −65 dBm sollten es sein, sonst bremst der Repeater.`,
          txt: `${d.name}: direkt daneben mit Router-Verbindung messen, Ziel ≥ −65 dBm.`,
        });
    });

  weak.forEach((r) => {
    const main = r.devs[0] || null;
    const c = center(r.ps.filter((p) => p.dbm != null));
    const sev: Prio = r.s === 0 ? 'h' : 'm';
    const worst = r.min!;
    if (main && main.type !== 'router') {
      recs.push({
        p: sev,
        t: `<b>${esc(r.room)}</b> hängt an <b>${esc(main.name)}</b> und erreicht nur ${worst} dBm (ø ${Math.round(r.avg!)}). Den ${TYPE_LABEL[main.type]} näher Richtung ${esc(r.room)} stellen, solange er selbst noch mindestens −65 dBm vom Router bekommt.`,
        txt: `${r.room}: über ${main.name} nur ${worst} dBm. ${TYPE_LABEL[main.type]} näher Richtung ${r.room} stellen.`,
      });
      return;
    }
    const rt = floorDevs.find((x) => x.type === 'router');
    const closerRep = floorDevs
      .filter((d) => d.type !== 'router')
      .map((d) => ({ d, dd: dist(c, d) }))
      .filter((o) => !rt || o.dd < dist(c, rt))
      .sort((a, b) => a.dd - b.dd)[0];
    if (main && closerRep) {
      recs.push({
        p: sev,
        t: `<b>${esc(r.room)}</b> hängt am <b>${esc(main.name)}</b> (${worst} dBm), obwohl <b>${esc(closerRep.d.name)}</b> näher ist. Das iPhone wechselt nicht von selbst (Sticky Client). Im Router Band-Steering bzw. Mesh-Roaming (802.11k/v) aktivieren und dem Repeater denselben Netznamen geben. Danach hier neu messen.`,
        txt: `${r.room}: am ${main.name} (${worst} dBm), obwohl ${closerRep.d.name} näher ist. Mesh-Roaming/Band-Steering aktivieren, neu messen.`,
      });
      return;
    }
    // Suggest a new repeater location: a well-covered point closest to the weak room.
    const rv = (p: Point) => rSig(p) ?? p.dbm;
    const cand =
      dbPts
        .filter((p) => {
          const v = rv(p);
          return v != null && v >= -67 && v <= -55 && (p.room || '') !== r.room;
        })
        .sort((a, b) => dist(a, c) - dist(b, c))[0] ||
      dbPts
        .filter((p) => {
          const v = rv(p);
          return v != null && v >= -67;
        })
        .sort((a, b) => dist(a, c) - dist(b, c))[0];
    if (cand) {
      let s = suggestions.find((x) => x.pt === cand);
      if (!s) {
        s = { pt: cand, rooms: [], n: suggestions.length + 1, sev, worst: 0 };
        suggestions.push(s);
      }
      s.rooms.push(r.room);
      s.sev = s.sev === 'h' ? 'h' : sev;
      s.worst = Math.min(s.worst, worst);
    } else {
      recs.push({
        p: sev,
        t: `<b>${esc(r.room)}</b> erreicht nur ${worst} dBm. Zwischen Router und ${esc(r.room)} fehlen gute Messpunkte. Miss auf dem Weg dorthin, bis du eine Stelle mit etwa −60 bis −65 dBm findest. Dort gehört der Repeater hin.`,
        txt: `${r.room}: nur ${worst} dBm. Auf dem Weg dorthin eine Stelle mit −60 bis −65 dBm suchen und dort einen Repeater aufstellen.`,
      });
    }
  });

  suggestions.forEach((s) => {
    const where = (s.pt.room || 'Messpunkt') + (s.pt.label ? ' (' + s.pt.label + ')' : '');
    const at = rSig(s.pt) ?? s.pt.dbm;
    recs.push({
      p: s.sev,
      t: `<b>Neuer Repeater V${s.n}</b> für ${s.rooms.map(esc).join(', ')} (schwächster Wert ${s.worst} dBm). Empfohlener Standort: <b>${esc(where)}</b>. Dort kommt der Router mit ${at} dBm an, der Repeater bekommt also noch genug Signal und strahlt in die schwache Zone. Besser ist ein Mesh-System oder ein Access Point mit LAN-Kabel.`,
      txt: `Neuer Repeater V${s.n} für ${s.rooms.join(', ')} (min ${s.worst} dBm). Standort: ${where}, dort Router ${at} dBm.`,
    });
  });

  // 5 GHz too weak, phone falls back to 2.4 GHz.
  rooms.forEach((r) => {
    const sc = r.ps.filter((p) => p.scan && p.dev);
    const v5 = sc.map((p) => bandSig(p, p.dev!, '5', devices)).filter((v): v is number => v != null);
    const v24 = sc.map((p) => bandSig(p, p.dev!, '2.4', devices)).filter((v): v is number => v != null);
    if (v5.length && v24.length) {
      const m5 = Math.min(...v5);
      const m24 = Math.min(...v24);
      if (m5 < -72 && m24 >= -70 && m24 - m5 >= 6)
        recs.push({
          p: 'm',
          t: `In <b>${esc(r.room)}</b> kommt 5 GHz nur noch mit ${m5} dBm an, 2,4 GHz mit ${m24} dBm. Das iPhone fällt dort auf das langsamere 2,4-GHz-Band zurück. Für volle Geschwindigkeit fehlt hier ein näherer Sender.`,
          txt: `${r.room}: 5 GHz nur ${m5} dBm, 2,4 GHz ${m24} dBm, Rückfall auf 2,4 GHz.`,
        });
    }
  });

  const slow = rooms.filter((r) => r.mmin != null && r.mmin < 10 && !(r.s != null && r.s <= 1));
  slow.forEach((r) =>
    recs.push({
      p: 'm',
      t: `<b>${esc(r.room)}</b> hat ein ordentliches Signal, aber nur ${METRICS.mbps.fmt(r.mmin!)} Mbit/s. Ursache sind eher Störungen oder ein überlasteter Kanal: im Router einen freien Kanal wählen oder auf 5 GHz wechseln.`,
      txt: `${r.room}: Signal ok, aber nur ${METRICS.mbps.fmt(r.mmin!)} Mbit/s. Kanal/Band im Router prüfen.`,
    }),
  );

  const noDev = pts.filter((p) => !p.dev).length;
  if (noDev)
    recs.push({
      p: 'l',
      t: `${noDev} Messpunkt${noDev === 1 ? '' : 'e'} ohne Gerätezuordnung. Ordne sie zu, dann werden die Empfehlungen genauer.`,
      txt: `${noDev} Messpunkte ohne Gerätezuordnung.`,
    });
  if (!weak.length && !slow.length)
    recs.unshift({
      p: 'l',
      t: 'Alle gemessenen Räume liegen im guten Bereich. Auf dieser Etage ist kein zusätzlicher Repeater nötig.',
      txt: 'Alle Räume im guten Bereich, kein zusätzlicher Repeater nötig.',
    });
  const order: Record<Prio, number> = { h: 0, m: 1, l: 2 };
  recs.sort((a, b) => order[a.p] - order[b.p]);

  const devStats: DeviceStat[] = devs.map((d) => {
    const ps = pts.filter((p) => p.dev === d.id);
    const db = ps.map((p) => p.dbm).filter((v): v is number => v != null);
    const mb = ps.map((p) => p.mbps).filter((v): v is number => v != null);
    const ub = ps.map((p) => p.up ?? null).filter((v): v is number => v != null);
    const sv = pts.map((p) => sigOf(p, d.id, devices)).filter((v): v is number => v != null);
    return {
      d,
      n: ps.length,
      avg: avg(db),
      min: db.length ? Math.min(...db) : null,
      mavg: avg(mb),
      uavg: avg(ub),
      reach: sv.filter((v) => v >= -67).length,
      seen: pts.length,
    };
  });
  return { rooms, cov, recs, suggestions, devStats, floorDevs, dbPts, weak };
}

/** Summary numbers shown at the top of the report. */
export function kpis(f: Floor, a: Analysis) {
  const allDb = a.dbPts.map((p) => p.dbm!);
  const av = avg(allDb);
  return {
    points: f.points.length,
    rooms: a.rooms.length,
    avgDbm: av == null ? null : Math.round(av),
    goodSharePct: allDb.length ? Math.round(((a.cov[2] + a.cov[3]) / allDb.length) * 100) : null,
  };
}

const r0 = (v: number | null) => (v == null ? null : Math.round(v));
const dash = (v: number | null | undefined) => (v == null ? '–' : String(v));

export function reportText(f: Floor, a: Analysis, dateStr: string): string {
  const k = kpis(f, a);
  const L: string[] = [];
  L.push(`WLAN-Report ${f.name} – ${dateStr}`, '');
  L.push(
    `Messpunkte: ${k.points} | Räume: ${k.rooms} | ø ${dash(k.avgDbm)} dBm | gut abgedeckt: ${k.goodSharePct == null ? '–' : k.goodSharePct + ' %'}`,
  );
  L.push(`Abdeckung: sehr gut ${a.cov[3]}, gut ${a.cov[2]}, schwach ${a.cov[1]}, kritisch ${a.cov[0]}`, '');
  L.push('EMPFEHLUNGEN');
  a.recs.forEach((r, i) => L.push(`${i + 1}. [${PRIO_LABEL[r.p]}] ${r.txt}`));
  L.push('');
  L.push('GERÄTE');
  a.devStats.forEach((s) =>
    L.push(
      `- ${s.d.name} (${TYPE_LABEL[s.d.type]}): ${s.n} Pkt., ø ${dash(r0(s.avg))} dBm, min ${dash(s.min)} dBm, gut empfangbar an ${s.reach}/${s.seen} Punkten${s.mavg != null ? ', ø ' + Math.round(s.mavg) + ' Mbit/s down' : ''}${s.uavg != null ? ', ø ' + Math.round(s.uavg) + ' Mbit/s up' : ''}`,
    ),
  );
  L.push('');
  L.push('RÄUME');
  a.rooms.forEach((r) =>
    L.push(
      `- ${r.room}: ${r.n} Pkt., ø ${dash(r0(r.avg))} dBm, min ${dash(r.min)} dBm, ${r.devs.map((d) => d.name).join('/') || 'Gerät unbekannt'}, ${r.s == null ? '' : STATUS[r.s]}`,
    ),
  );
  return L.join('\n');
}

/** Structured report, e.g. for a smart-home handbook. */
export function reportData(f: Floor, a: Analysis, created: Date, text: string) {
  return {
    floorId: f.id,
    floor: f.name,
    createdAt: created.toISOString(),
    kpis: kpis(f, a),
    coverage: { sehrGut: a.cov[3], gut: a.cov[2], schwach: a.cov[1], kritisch: a.cov[0] },
    recommendations: a.recs.map((r) => ({ prio: PRIO_LABEL[r.p], text: stripTags(r.t) })),
    rooms: a.rooms.map((r) => ({
      room: r.room,
      points: r.n,
      avgDbm: r0(r.avg),
      minDbm: r.min,
      devices: r.devs.map((d) => d.name),
      status: r.s == null ? null : STATUS[r.s],
      avgDown: r0(r.mavg),
    })),
    devices: a.devStats.map((s) => ({
      name: s.d.name,
      type: TYPE_LABEL[s.d.type],
      macs: s.d.macs.map((m) => fmtMac(m.mac)),
      connectedPoints: s.n,
      avgDbm: r0(s.avg),
      minDbm: s.min,
      goodReach: s.reach + '/' + s.seen,
      avgDown: r0(s.mavg),
      avgUp: r0(s.uavg),
    })),
    text,
  };
}
