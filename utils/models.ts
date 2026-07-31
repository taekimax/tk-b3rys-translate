/** The native host accepts only this fixed, audited local model set. */
export type ModelId =
  | 'gemma4-e4b-q4'
  | 'gemma4-12b-q4'
  | 'translategemma-4b-it-q4'
  | 'translategemma-12b-it-q4'
  | 'hy-mt2-1.8b-q4'
  | 'hy-mt2-7b-q4';

export interface ModelConfig {
  id: ModelId;
  label: string;
  family: 'Gemma 4' | 'TranslateGemma' | 'Hy-MT2';
  repository: string;
  revision: string;
}

export const SELECTED_MODEL_KEY = 'selectedModel';

export const MODEL_CATALOG: readonly ModelConfig[] = [
  {
    id: 'gemma4-e4b-q4',
    label: 'Gemma 4 E4B (Q4)',
    family: 'Gemma 4',
    repository: 'mlx-community/gemma-4-e4b-it-4bit',
    revision: '475b9088d29754a3379866cf5aeb6b41acd313c2',
  },
  {
    id: 'gemma4-12b-q4',
    label: 'Gemma 4 12B (Q4)',
    family: 'Gemma 4',
    repository: 'mlx-community/gemma-4-12B-it-4bit',
    revision: '73bcf09092aa277861d5a191b989b666f7f32e8f',
  },
  {
    id: 'translategemma-4b-it-q4',
    label: 'TranslateGemma 4B (Q4)',
    family: 'TranslateGemma',
    repository: 'mlx-community/translategemma-4b-it-4bit',
    revision: '5788ec08c047f3f2e17808101b8d9566ac930d58',
  },
  {
    id: 'translategemma-12b-it-q4',
    label: 'TranslateGemma 12B (Q4)',
    family: 'TranslateGemma',
    repository: 'mlx-community/translategemma-12b-it-4bit',
    revision: 'f3dcfd54df14672fbcf0731086fb47a797a943ae',
  },
  {
    id: 'hy-mt2-1.8b-q4',
    label: 'Hy-MT2 1.8B (Q4)',
    family: 'Hy-MT2',
    repository: 'mlx-community/Hy-MT2-1.8B-4bit',
    revision: 'e5c6fe56c7b3bc77fae5ae92db31f2178f1e6912',
  },
  {
    id: 'hy-mt2-7b-q4',
    label: 'Hy-MT2 7B (Q4)',
    family: 'Hy-MT2',
    repository: 'mlx-community/Hy-MT2-7B-4bit',
    revision: '9b7204bdb161490a8ce49ce607c1310cc3fd03ad',
  },
] as const;

const modelsById = new Map(MODEL_CATALOG.map((model) => [model.id, model]));

export const DEFAULT_MODEL_ID: ModelId = 'gemma4-e4b-q4';

export function getModelConfig(modelId: ModelId): ModelConfig {
  const model = modelsById.get(modelId);
  if (!model) throw new Error(`Unknown local model: ${modelId}`);
  return model;
}

export function resolveSelectedModel(savedModel?: string): ModelId {
  return modelsById.has(savedModel as ModelId) ? (savedModel as ModelId) : DEFAULT_MODEL_ID;
}
