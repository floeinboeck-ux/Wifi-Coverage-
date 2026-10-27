export const uid = (): string => Math.random().toString(36).slice(2, 10);

export const clamp = (v: number): number => Math.max(0, Math.min(1, v));

export const avg = (a: number[]): number | null =>
  a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

export function median(v: number[]): number {
  const a = [...v].sort((x, y) => x - y);
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2] : Math.round((a[n / 2 - 1] + a[n / 2]) / 2);
}

export function esc(s: unknown): string {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
}

export const stripTags = (h: string): string => h.replace(/<[^>]+>/g, '');
