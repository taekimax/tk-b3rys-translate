import type { ModelId } from './models';
import type { TranslationRequestMode } from './translation-types';

// Bump when local-SLM prompt or output-normalization behavior changes so old
// incomplete/wrong-language translations cannot be reused.
export const TRANSLATION_CONTEXT_VERSION = 4;

export interface TranslationContext {
  version: number;
  sourceLang: string;
  targetLang: string;
  mode: TranslationRequestMode;
  modelId: ModelId;
  fingerprint: string;
}

export function buildTranslationContext(
  sourceLang: string,
  targetLang: string,
  mode: TranslationRequestMode,
  modelId: ModelId,
): TranslationContext {
  const fingerprint = [TRANSLATION_CONTEXT_VERSION, sourceLang, targetLang, mode, modelId].join(
    '|',
  );
  return {
    version: TRANSLATION_CONTEXT_VERSION,
    sourceLang,
    targetLang,
    mode,
    modelId,
    fingerprint,
  };
}

export function buildTranslationCachePrefix(
  sourceLang: string,
  targetLang: string,
  mode: TranslationRequestMode | undefined,
  modelId: ModelId,
): string {
  return `${TRANSLATION_CONTEXT_VERSION}:${sourceLang}:${targetLang}:${mode ?? 'page'}:${modelId}:`;
}
