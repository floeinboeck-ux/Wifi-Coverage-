import { describe, expect, it } from 'vitest';
import { analyse, kpis, reportData, reportText, roomStats } from '../src/core/analysis';
import { sampleState } from '../src/core/sample';

describe('analysis on the example floor', () => {
  const s = sampleState();
  const f = s.floors[0];
  const a = analyse(f, s.devices, 560 / 800);

  it('sorts rooms worst first', () => {
    const rooms = roomStats(f, s.devices);
    expect(rooms[0].room).toBe('Büro');
    expect(rooms[0].s).toBe(0);
    expect(rooms[0].min).toBe(-80);
    expect(rooms[0].devs.map((d) => d.id)).toEqual(['demo-r']);
  });

  it('counts coverage classes', () => {
    expect(a.cov.reduce((x, y) => x + y, 0)).toBe(19);
    expect(kpis(f, a)).toMatchObject({ points: 19, rooms: 5 });
  });

  it('suggests a repeater for the weak office', () => {
    expect(a.suggestions).toHaveLength(1);
    expect(a.suggestions[0].rooms).toEqual(['Büro']);
    expect(a.recs[0].p).toBe('h');
    expect(a.recs.some((r) => r.txt.startsWith('Neuer Repeater V1 für Büro'))).toBe(true);
  });

  it('builds text and data exports', () => {
    const txt = reportText(f, a, '27.10.2026');
    expect(txt).toContain('WLAN-Report Beispiel EG – 27.10.2026');
    expect(txt).toContain('EMPFEHLUNGEN');
    const data = reportData(f, a, new Date('2026-10-27T10:00:00Z'), txt);
    expect(data.rooms).toHaveLength(5);
    expect(data.recommendations.every((r) => !/<b>/.test(r.text))).toBe(true);
  });

  it('reports all good when nothing is weak', () => {
    const good = { ...f, points: f.points.filter((p) => p.room !== 'Büro') };
    const g = analyse(good, s.devices, 0.7);
    expect(g.recs[0].txt).toContain('kein zusätzlicher Repeater');
  });
});
