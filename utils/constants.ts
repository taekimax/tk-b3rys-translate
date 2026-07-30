/** Logged at content-script startup so stale bundles are identifiable. */
export const BUILD_TAG = '0.6.0-local-mlx';

// Page translation is deliberately one detected block per native request.
// The local host runs one resident SLM and serializes generation; larger page
// batches only delay the first visible result and couple failures together.
export const BATCH_SIZE = 1;
export const VIEWPORT_BATCH_SIZE = 1;
export const PIPELINE_CONCURRENCY = 1;
export const MAX_TEXT_LENGTH = 5000;
export const DEBOUNCE_DELAY = 500;
export const MAX_RETRIES = 3;
export const RETRY_DELAY_BASE = 1000;

export const TRANSLATABLE_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'TD',
  'TH',
  'BLOCKQUOTE',
  'FIGCAPTION',
  'DT',
  'DD',
  'SUMMARY',
  'CAPTION',
  'LABEL',
]);
export const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'IFRAME',
  'CODE',
  'PRE',
  'KBD',
  'SAMP',
  'VAR',
  'SVG',
  'MATH',
  'CANVAS',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'FOOTER',
]);
export const DATA_ATTRS = {
  TRANSLATED: 'data-b3rys-translated',
  BLOCK_ID: 'data-b3rys-id',
  LOADER: 'data-b3rys-loader',
  ORIGINAL: 'data-b3rys-original',
} as const;
export const SUBTITLE_BATCH_SIZE = 20;
export const SUBTITLE_LOOK_AHEAD_SEC = 120;
export const SUBTITLE_CHECK_INTERVAL = 2000;
export const YT_SELECTORS = {
  CAPTION_WINDOW: '.caption-window',
  CAPTION_SEGMENT: '.ytp-caption-segment',
  CAPTION_VISUAL_LINE: '.caption-visual-line',
  CAPTION_WINDOW_CONTAINER: '.ytp-caption-window-container',
} as const;
export const YT_TRANSLATED_ATTR = 'data-b3rys-subtitle-translated';
export const YT_TRANSLATION_CLASS = 'b3rys-subtitle-translation';
export const CACHE_MAX_ENTRIES = 4000;
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CACHE_STORAGE_KEY = 'b3rys_translation_cache';
export type LanguageCode = 'en' | 'ko' | 'ja' | 'zh' | 'de' | 'fr' | 'es' | 'pt' | 'it' | 'ru';
export const LANGUAGES: Record<
  LanguageCode,
  { name: string; nativeName: string; script: 'latin' | 'cjk' | 'cyrillic' }
> = {
  en: { name: 'English', nativeName: 'English', script: 'latin' },
  ko: { name: 'Korean', nativeName: '한국어', script: 'cjk' },
  ja: { name: 'Japanese', nativeName: '日本語', script: 'cjk' },
  zh: { name: 'Chinese', nativeName: '中文', script: 'cjk' },
  de: { name: 'German', nativeName: 'Deutsch', script: 'latin' },
  fr: { name: 'French', nativeName: 'Français', script: 'latin' },
  es: { name: 'Spanish', nativeName: 'Español', script: 'latin' },
  pt: { name: 'Portuguese', nativeName: 'Português', script: 'latin' },
  it: { name: 'Italian', nativeName: 'Italiano', script: 'latin' },
  ru: { name: 'Russian', nativeName: 'Русский', script: 'cyrillic' },
};
export const DEFAULT_SOURCE_LANG: LanguageCode = 'en';
export const DEFAULT_TARGET_LANG: LanguageCode = 'ko';
export const LANG_STORAGE_KEY = 'b3rys_language_pair';
export const SKIP_HOSTS = new Set([
  'calendar.google.com',
  'docs.google.com',
  'sheets.google.com',
  'slides.google.com',
  'drive.google.com',
]);
