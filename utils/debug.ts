/**
 * Debug logging — OFF by default (console stays clean for users).
 *
 * Enable in DevTools:   localStorage.web_translate_debug = '1'  → refresh
 * Disable:              delete localStorage.web_translate_debug → refresh
 *
 * When enabled, translation-pipeline logs AND the scroll-jump watcher
 * (translator.ts) report to the console — one screenshot pinpoints issues.
 */
let enabled = false;
try {
  enabled =
    localStorage.getItem('web_translate_debug') === '1' ||
    localStorage.getItem('b3rys_debug') === '1';
} catch {
  // storage unavailable (sandboxed frames) — stay silent
}

export function isDebug(): boolean {
  return enabled;
}

export function dbg(...args: unknown[]): void {
  if (enabled) console.log('[web-translate]', ...args);
}
