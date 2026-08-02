import type { SubtitleDisplayMode } from './subtitle-overlay';
import type { UiLanguage } from '@/utils/constants';
import { getActiveUiLanguage, uiText } from '@/utils/ui-language';

export type YtButtonState = 'idle' | 'loading' | 'active' | 'error' | 'info';

export interface YtPlayerButton {
  setState(state: YtButtonState, title?: string): void;
  setMode(mode: SubtitleDisplayMode): void;
  setLanguage(language: UiLanguage): void;
  show(): void;
  hide(): void;
  destroy(): void;
}

const LABEL_IDLE = 'A가';
const LABEL_LOADING = '···';

const MODE_LABELS: Record<SubtitleDisplayMode, string> = {
  both: 'A가',
  en: 'A',
  ko: '가',
};

function modeTitle(mode: SubtitleDisplayMode, language: UiLanguage): string {
  const key =
    mode === 'both' ? 'ytModeBoth' : mode === 'en' ? 'ytModeOriginal' : 'ytModeTranslation';
  return uiText(key, language);
}

function stateTitle(state: YtButtonState, language: UiLanguage): string {
  const key =
    state === 'idle'
      ? 'ytIdleTitle'
      : state === 'loading'
        ? 'ytLoading'
        : state === 'active'
          ? 'ytActive'
          : state === 'error'
            ? 'ytError'
            : 'ytInfo';
  return uiText(key, language);
}

/**
 * Inject a translate button into YouTube's player controls bar (.ytp-right-controls).
 * Waits for the controls to appear via MutationObserver if not yet in DOM.
 */
export function injectYtPlayerButton(
  onClick: () => void,
  language: UiLanguage = getActiveUiLanguage(),
): Promise<YtPlayerButton> {
  return new Promise((resolve) => {
    let resolved = false;

    const tryInject = (): boolean => {
      const controls = document.querySelector('.ytp-right-controls');
      if (!controls) return false;

      // Remove stale button from previous injection
      controls.querySelector('.web-translate-yt-btn')?.remove();

      const btn = document.createElement('button');
      btn.className = 'web-translate-yt-btn';
      btn.setAttribute('data-web-translate-state', 'idle');
      btn.title = stateTitle('idle', language);
      btn.textContent = LABEL_IDLE;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      });

      // Insert at the start of right controls (safe — no insertBefore pitfalls)
      controls.prepend(btn);
      console.log('[web-translate] Player translate button injected');

      if (!resolved) {
        resolved = true;
        let currentLanguage = language;
        let currentState: YtButtonState = 'idle';
        let currentMode: SubtitleDisplayMode = 'both';
        resolve({
          setState(state: YtButtonState, title?: string) {
            currentState = state;
            btn.setAttribute('data-web-translate-state', state);
            btn.title = title ?? stateTitle(state, currentLanguage);
            btn.textContent = state === 'loading' ? LABEL_LOADING : LABEL_IDLE;
          },
          setMode(mode: SubtitleDisplayMode) {
            currentMode = mode;
            btn.textContent = MODE_LABELS[mode];
            btn.title = modeTitle(mode, currentLanguage);
          },
          setLanguage(nextLanguage: UiLanguage) {
            currentLanguage = nextLanguage;
            btn.title =
              currentState === 'active' && currentMode !== 'both'
                ? modeTitle(currentMode, currentLanguage)
                : stateTitle(currentState, currentLanguage);
          },
          show() {
            btn.style.removeProperty('display');
          },
          hide() {
            btn.style.setProperty('display', 'none', 'important');
          },
          destroy() {
            btn.remove();
          },
        });
      }
      return true;
    };

    if (tryInject()) return;

    // Wait for controls to appear
    const obs = new MutationObserver(() => {
      if (tryInject()) obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      obs.disconnect();
      if (!resolved) {
        resolved = true;
        console.warn('[web-translate] Failed to inject player button (timeout)');
        resolve({
          setState() {},
          setMode() {},
          setLanguage() {},
          show() {},
          hide() {},
          destroy() {},
        });
      }
    }, 15000);
  });
}
