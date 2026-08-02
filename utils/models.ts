/** The native host accepts only this fixed, audited local model set. */
export type ModelId =
  | 'translategemma-4b-it-q4'
  | 'translategemma-12b-it-q4'
  | 'hy-mt2-1.8b-q4'
  | 'hy-mt2-7b-q4';

export interface ModelConfig {
  id: ModelId;
  label: string;
  family: 'TranslateGemma' | 'Hy-MT2';
  repository: string;
  revision: string;
  license: 'Apache-2.0' | 'Gemma Terms of Use';
  licenseUrl: string;
  approximateSize: string;
  copyright: string;
  publicDistribution: 'allowed' | 'requires-terms';
}

export const SELECTED_MODEL_KEY = 'selectedModel';
export const TRANSLATEGEMMA_TERMS_ACCEPTED_KEY = 'translateGemmaTermsAcceptedVersion';
export const TRANSLATEGEMMA_TERMS_VERSION = 'gemma-terms-2026-04-01';
export const TRANSLATEGEMMA_TERMS_URL = 'https://ai.google.dev/gemma/terms';

/** All model IDs understood by the native host and exposed by the public app. */
export const ALL_MODEL_CATALOG: readonly ModelConfig[] = [
  {
    id: 'translategemma-4b-it-q4',
    label: 'TranslateGemma 4B (Q4)',
    family: 'TranslateGemma',
    repository: 'mlx-community/translategemma-4b-it-4bit',
    revision: '5788ec08c047f3f2e17808101b8d9566ac930d58',
    license: 'Gemma Terms of Use',
    licenseUrl: 'https://ai.google.dev/gemma/terms',
    approximateSize: 'about 2.18 GiB',
    copyright: 'Google / Gemma; MLX conversion by mlx-community',
    publicDistribution: 'requires-terms',
  },
  {
    id: 'translategemma-12b-it-q4',
    label: 'TranslateGemma 12B (Q4)',
    family: 'TranslateGemma',
    repository: 'mlx-community/translategemma-12b-it-4bit',
    revision: 'f3dcfd54df14672fbcf0731086fb47a797a943ae',
    license: 'Gemma Terms of Use',
    licenseUrl: 'https://ai.google.dev/gemma/terms',
    approximateSize: 'about 6.21 GiB',
    copyright: 'Google / Gemma; MLX conversion by mlx-community',
    publicDistribution: 'requires-terms',
  },
  {
    id: 'hy-mt2-1.8b-q4',
    label: 'Hy-MT2 1.8B (Q4)',
    family: 'Hy-MT2',
    repository: 'mlx-community/Hy-MT2-1.8B-4bit',
    revision: 'e5c6fe56c7b3bc77fae5ae92db31f2178f1e6912',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/tencent/Hy-MT2-1.8B/blob/main/LICENSE.txt',
    approximateSize: 'about 0.95 GiB',
    copyright: 'Tencent Hunyuan',
    publicDistribution: 'allowed',
  },
  {
    id: 'hy-mt2-7b-q4',
    label: 'Hy-MT2 7B (Q4)',
    family: 'Hy-MT2',
    repository: 'mlx-community/Hy-MT2-7B-4bit',
    revision: '9b7204bdb161490a8ce49ce607c1310cc3fd03ad',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/tencent/Hy-MT2-7B/blob/main/LICENSE.txt',
    approximateSize: 'about 3.95 GiB',
    copyright: 'Tencent Hunyuan',
    publicDistribution: 'allowed',
  },
] as const;

/** The public catalog includes permissive models and terms-gated models. */
export const MODEL_CATALOG: readonly ModelConfig[] = ALL_MODEL_CATALOG;

const modelsById = new Map(ALL_MODEL_CATALOG.map((model) => [model.id, model]));
const publicModelIds = new Set(MODEL_CATALOG.map((model) => model.id));

export const DEFAULT_MODEL_ID: ModelId = 'hy-mt2-7b-q4';

export function getModelConfig(modelId: ModelId): ModelConfig {
  const model = modelsById.get(modelId);
  if (!model) throw new Error(`Unknown local model: ${modelId}`);
  return model;
}

export function resolveSelectedModel(savedModel?: string): ModelId {
  return publicModelIds.has(savedModel as ModelId) ? (savedModel as ModelId) : DEFAULT_MODEL_ID;
}

export function isPublicModel(modelId: string | undefined): modelId is ModelId {
  return publicModelIds.has(modelId as ModelId);
}

export function requiresModelTermsAcceptance(modelId: ModelId): boolean {
  return getModelConfig(modelId).publicDistribution === 'requires-terms';
}
