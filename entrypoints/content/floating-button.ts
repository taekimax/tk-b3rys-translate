import type { FloatingButtonState, TranslationMode } from '@/types';
import type { UiLanguage } from '@/utils/constants';
import { getActiveUiLanguage, uiText } from '@/utils/ui-language';
import css from './floating-button.css?raw';

const ICONS = {
  loading: `<svg viewBox="0 0 20 20" fill="none" class="icon icon-loading">
    <path d="M10 3a7 7 0 0 1 7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,
  done: `<svg viewBox="0 0 20 20" fill="none" class="icon icon-done">
    <path d="M5 10.5l3.5 3.5L15 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  error: `<svg viewBox="0 0 20 20" fill="none" class="icon icon-error">
    <circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="1.5"/>
    <path d="M10 7v4M10 13h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,
};

function translateIcon(): string {
  return `<img class="icon icon-translate app-button-icon" src="${chrome.runtime.getURL('app-button-icon.png')}" alt="" />`;
}

export interface FloatingButton {
  setState: (state: FloatingButtonState) => void;
  setProgress: (ratio: number) => void;
  setUsageGauge: (ratio: number) => void;
  setMode: (mode: TranslationMode) => void;
  setLanguage: (language: UiLanguage) => void;
  onModeToggle: (callback: (mode: TranslationMode) => void) => void;
  showToast: (text: string) => void;
  show: () => void;
  hide: () => void;
  destroy: () => void;
}

export function createFloatingButton(
  onClick: () => void,
  language: UiLanguage = getActiveUiLanguage(),
): FloatingButton {
  let currentLanguage = language;
  let currentMode: TranslationMode = 'parallel';
  const host = document.createElement('div');
  host.id = 'web-translate-root';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = css;
  shadow.appendChild(style);

  // Wrapper (close + fab)
  const wrap = document.createElement('div');
  wrap.className = 'web-translate-wrap';

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'web-translate-close';
  closeBtn.innerHTML = `<svg viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    host.style.display = 'none';
    chrome.storage.local.set({ floatingButtonVisible: false }).catch(() => {});
  });

  // FAB
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.setAttribute('aria-label', uiText('translatePage', currentLanguage));
  fab.title = uiText('translatePage', currentLanguage);
  fab.className = 'web-translate-fab';
  fab.setAttribute('data-state', 'idle');
  fab.innerHTML = `
    ${translateIcon()}
    ${ICONS.loading}
    ${ICONS.done}
    ${ICONS.error}
    <svg class="web-translate-progress" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="19"/>
    </svg>
    <div class="web-translate-usage-gauge"></div>
  `;

  // Mode toggle button
  const modeBtn = document.createElement('button');
  modeBtn.className = 'web-translate-mode-toggle';
  modeBtn.type = 'button';
  modeBtn.setAttribute('aria-label', uiText('toggleMode', currentLanguage));
  modeBtn.title = uiText('toggleMode', currentLanguage);
  modeBtn.textContent = 'A+가';
  let modeToggleCallback: ((mode: TranslationMode) => void) | null = null;
  modeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const newMode: TranslationMode = currentMode === 'parallel' ? 'replace' : 'parallel';
    currentMode = newMode;
    modeBtn.textContent = newMode === 'parallel' ? 'A+가' : '가';
    modeToggleCallback?.(newMode);
  });

  wrap.appendChild(closeBtn);
  wrap.appendChild(fab);
  wrap.appendChild(modeBtn);
  shadow.appendChild(wrap);
  document.body.appendChild(host);

  // Draggable vertically
  let isDragging = false;
  let startY = 0;
  let startTop = 0;

  fab.addEventListener('mousedown', (e) => {
    isDragging = false;
    startY = e.clientY;
    const rect = wrap.getBoundingClientRect();
    startTop = rect.top + rect.height / 2;

    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientY - startY) > 4) {
        isDragging = true;
        const newTop = startTop + (ev.clientY - startY);
        const clampedTop = Math.max(40, Math.min(window.innerHeight - 40, newTop));
        wrap.style.top = `${clampedTop}px`;
        wrap.style.transform = 'translateY(-50%)';
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (isDragging) {
        setTimeout(() => {
          isDragging = false;
        }, 0);
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  fab.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!isDragging) onClick();
  });

  const progressCircle = shadow.querySelector(
    '.web-translate-progress circle',
  ) as SVGCircleElement | null;
  const usageGauge = shadow.querySelector('.web-translate-usage-gauge') as HTMLElement;

  return {
    setState(state: FloatingButtonState) {
      fab.setAttribute('data-state', state);
    },

    setProgress(ratio: number) {
      if (!progressCircle) return;
      const circumference = 2 * Math.PI * 19; // r=19
      const offset = circumference * (1 - ratio);
      progressCircle.style.strokeDasharray = `${circumference}`;
      progressCircle.style.strokeDashoffset = `${offset}`;
    },

    setUsageGauge(ratio: number) {
      if (!usageGauge) return;
      // ratio < 0 means no limit set — hide gauge
      if (ratio < 0) {
        usageGauge.style.display = 'none';
        return;
      }
      usageGauge.style.display = '';
      const clamped = Math.max(0, Math.min(1, ratio));
      usageGauge.style.height = `${clamped * 100}%`;
      // Color: green (0-50%) → yellow (50-80%) → red (80-100%)
      let color: string;
      if (clamped <= 0.5) color = '#7ee787';
      else if (clamped <= 0.8) color = '#d29922';
      else color = '#f85149';
      usageGauge.style.backgroundColor = color;
    },

    setMode(mode: TranslationMode) {
      currentMode = mode;
      modeBtn.textContent = mode === 'parallel' ? 'A+가' : '가';
    },

    setLanguage(language: UiLanguage) {
      currentLanguage = language;
      const label = uiText('translatePage', currentLanguage);
      fab.setAttribute('aria-label', label);
      fab.title = label;
      const modeLabel = uiText('toggleMode', currentLanguage);
      modeBtn.setAttribute('aria-label', modeLabel);
      modeBtn.title = modeLabel;
    },

    onModeToggle(callback: (mode: TranslationMode) => void) {
      modeToggleCallback = callback;
    },

    showToast(text: string) {
      const existing = shadow.querySelector('.web-translate-toast');
      // Same message already on screen → leave it running. Re-creating the
      // element restarts the fade-in animation, which reads as flicker when
      // showToast fires repeatedly (e.g. an invalidated context on every click).
      if (existing) {
        if (existing.textContent === text) return;
        existing.remove();
      }

      const toast = document.createElement('div');
      toast.className = 'web-translate-toast';
      toast.textContent = text;
      fab.appendChild(toast);

      // Let the CSS fade it in and out quietly (toastOut starts at 2.5s); just
      // clean up the node afterward. No mouseleave removal — that yanked it out
      // abruptly mid-fade.
      setTimeout(() => toast.remove(), 3000);
    },

    show() {
      host.style.display = '';
    },

    hide() {
      host.style.display = 'none';
    },

    destroy() {
      host.remove();
    },
  };
}
