export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error('Element #' + id + ' fehlt');
  return el as T;
};

export const $in = (id: string) => $<HTMLInputElement>(id);

/** Show a status line with ok/warn colouring. */
export function setMsg(el: HTMLElement, text: string, kind: 'ok' | 'warn' | 'plain' = 'plain'): void {
  if (kind !== 'plain') el.className = 'match ' + kind;
  el.textContent = text;
  el.hidden = false;
}

/** Two-step delete button: first tap arms, second tap confirms. */
export function armOnce(btn: HTMLElement, armedText: string): boolean {
  if (!btn.classList.contains('armed')) {
    btn.classList.add('armed');
    btn.textContent = armedText;
    return false;
  }
  return true;
}

export function resetArm(btn: HTMLElement, text: string): void {
  btn.classList.remove('armed');
  btn.textContent = text;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Prefer the share sheet on phones (lets iOS save to Files/Photos), fall back to a download. */
export async function shareOrDownload(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return;
    }
  }
  download(blob, filename);
}

export const fileSafe = (s: string): string =>
  s.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'export';
