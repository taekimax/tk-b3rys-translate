import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_ID,
  MODEL_CATALOG,
  getModelConfig,
  resolveSelectedModel,
} from '@/utils/models';

describe('local model catalog', () => {
  it('allows exactly the six downloaded local Q4 models', () => {
    expect(MODEL_CATALOG.map((model) => model.id)).toEqual([
      'gemma4-e4b-q4',
      'gemma4-12b-q4',
      'translategemma-4b-it-q4',
      'translategemma-12b-it-q4',
      'hy-mt2-1.8b-q4',
      'hy-mt2-7b-q4',
    ]);
  });
  it('falls back to a local model when saved storage is invalid', () => {
    expect(resolveSelectedModel()).toBe(DEFAULT_MODEL_ID);
    expect(resolveSelectedModel('gpt-5.4-nano')).toBe(DEFAULT_MODEL_ID);
    expect(getModelConfig('hy-mt2-7b-q4').family).toBe('Hy-MT2');
  });
});
