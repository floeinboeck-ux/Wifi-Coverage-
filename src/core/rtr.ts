export interface RtrResult {
  mbps: number | null;
  up: number | null;
  ping: number | null;
  at: string | null;
  net: string | null;
}

/** Parse the shared result text of the RTR-Netztest app. */
export function parseRtr(t: string): RtrResult {
  const numDec = (re: RegExp): number | null => {
    const m = t.match(re);
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  };
  const r: RtrResult = {
    mbps: numDec(/Download\s*:?\s*([\d.,]+)/i) ?? numDec(/\bDown\s*:?\s*([\d.,]+)/i),
    up: numDec(/Upload\s*:?\s*([\d.,]+)/i) ?? numDec(/\bUp\s*:?\s*([\d.,]+)/i),
    ping: numDec(/Ping\s*:?\s*([\d.,]+)/i),
    at: (t.match(/Testzeitpunkt\s*:?\s*([^\n\r]+)/i) || [])[1]?.trim() || null,
    net: (t.match(/Netztyp\s*:?\s*([^\n\r]+)/i) || [])[1]?.trim() || null,
  };
  if (r.at) r.at = r.at.replace(/:\d\d$/, '');
  return r;
}

export const rtrHasValues = (r: RtrResult): boolean =>
  r.mbps != null || r.up != null || r.ping != null;

export const rtrIsWifi = (r: RtrResult): boolean => !r.net || /wlan|wifi|wi-fi/i.test(r.net);
