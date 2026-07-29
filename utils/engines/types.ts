import type { ModelId } from '../models';
import type { TranslationRequestMode } from '../translation-types';

export type EngineType = 'local-mlx';

export interface TranslateResult {
  translations: { id: string; translatedText: string }[];
}

export interface TranslationEngine {
  translate(
    paragraphs: { id: string; text: string }[],
    mode: TranslationRequestMode,
    subtitleContext: { original: string; translated: string }[] | undefined,
    lang: { sourceLang: string; targetLang: string },
    modelId: ModelId,
  ): Promise<TranslateResult>;
}

export const ENGINE_DISPLAY_NAMES: Record<EngineType, string> = {
  'local-mlx': 'Local MLX',
};
