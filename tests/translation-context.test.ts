import { describe, expect, it } from 'vitest';
import { buildTranslationCachePrefix } from '@/utils/translation-context';
describe('translation context', () => {
  it('isolates cache entries by target language, mode, and local model', () => {
    const e4b = buildTranslationCachePrefix('en', 'ko', 'page', 'gemma4-e4b-q4');
    const hy = buildTranslationCachePrefix('en', 'ko', 'page', 'hy-mt2-7b-q4');
    const subtitle = buildTranslationCachePrefix('en', 'ko', 'subtitle', 'gemma4-e4b-q4');
    expect(e4b).not.toBe(hy);
    expect(e4b).not.toBe(subtitle);
    expect(e4b).toBe('4:en:ko:page:gemma4-e4b-q4:');
  });
});
