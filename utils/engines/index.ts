import { localMlxEngine } from './local-mlx';
import type { EngineType, TranslationEngine } from './types';

export type { EngineType, TranslationEngine } from './types';
export { ENGINE_DISPLAY_NAMES } from './types';

const engines: Record<EngineType, TranslationEngine> = { 'local-mlx': localMlxEngine };

export function getEngine(type: EngineType = 'local-mlx'): TranslationEngine {
  return engines[type];
}
