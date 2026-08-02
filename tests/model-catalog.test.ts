import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_ID,
  isPublicModel,
  MODEL_CATALOG,
  getModelConfig,
  resolveSelectedModel,
  requiresModelTermsAcceptance,
} from '@/utils/models';

describe('local model catalog', () => {
  it('exposes Hy-MT2 and terms-gated TranslateGemma Q4 models publicly', () => {
    expect(MODEL_CATALOG.map((model) => model.id)).toEqual([
      'translategemma-4b-it-q4',
      'translategemma-12b-it-q4',
      'hy-mt2-1.8b-q4',
      'hy-mt2-7b-q4',
    ]);
  });
  it('falls back to a local model when saved storage is invalid', () => {
    expect(resolveSelectedModel()).toBe(DEFAULT_MODEL_ID);
    expect(resolveSelectedModel('gpt-5.4-nano')).toBe(DEFAULT_MODEL_ID);
    expect(resolveSelectedModel('gemma4-e4b-q4')).toBe(DEFAULT_MODEL_ID);
    expect(getModelConfig('hy-mt2-7b-q4').family).toBe('Hy-MT2');
    expect(getModelConfig('hy-mt2-7b-q4').license).toBe('Apache-2.0');
    expect(getModelConfig('hy-mt2-7b-q4').copyright).toContain('Tencent');
    expect(isPublicModel('hy-mt2-7b-q4')).toBe(true);
    expect(isPublicModel('translategemma-4b-it-q4')).toBe(true);
    expect(requiresModelTermsAcceptance('translategemma-4b-it-q4')).toBe(true);
    expect(requiresModelTermsAcceptance('hy-mt2-7b-q4')).toBe(false);
    expect(isPublicModel('gemma4-e4b-q4')).toBe(false);
  });
});
