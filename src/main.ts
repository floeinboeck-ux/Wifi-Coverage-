import { loadOrSample } from './core/state';
import { loadRaw, requestPersistence } from './storage';
import { startApp } from './ui/app';

async function boot(): Promise<void> {
  const state = loadOrSample(await loadRaw());
  startApp(state);
  requestPersistence();
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is optional */
    });
  }
}

void boot();
