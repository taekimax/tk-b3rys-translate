import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_UI_LANGUAGE } from '@/utils/constants';
import { applyUiText, resolveUiLanguage, setActiveUiLanguage, uiText } from '@/utils/ui-language';

describe('UI language', () => {
  afterEach(() => {
    setActiveUiLanguage(DEFAULT_UI_LANGUAGE);
    document.body.replaceChildren();
  });

  it('defaults to Korean and rejects unsupported values', () => {
    expect(resolveUiLanguage(undefined)).toBe('ko');
    expect(resolveUiLanguage('ja')).toBe('ko');
    expect(uiText('localModel')).toBe('로컬 모델');
  });

  it('provides English text with interpolation', () => {
    setActiveUiLanguage('en');
    expect(uiText('localModel')).toBe('Local model');
    expect(uiText('ready', { label: 'Hy-MT2 7B' })).toBe('Ready · Hy-MT2 7B');
  });

  it('applies translated static labels and accessibility text', () => {
    setActiveUiLanguage('en');
    document.body.innerHTML =
      '<span data-i18n="translationCache"></span><button data-i18n-aria-label="clear"></button>';

    applyUiText(document);

    expect(document.querySelector('[data-i18n]')?.textContent).toBe('Translation cache');
    expect(document.querySelector('button')?.getAttribute('aria-label')).toBe('Clear');
  });
});
