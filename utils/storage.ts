import { CACHE_STORAGE_KEY, LANG_STORAGE_KEY } from './constants';
import { DEFAULT_MODEL_ID, SELECTED_MODEL_KEY, resolveSelectedModel, type ModelId } from './models';

// These keys were used by the b3rys translate build. Keep the one-time
// migration so a display-name/runtime-namespace rename does not discard a
// reader's cache or language selection on upgrade.
const LEGACY_CACHE_STORAGE_KEY = 'b3rys_translation_cache';
const LEGACY_LANG_STORAGE_KEY = 'b3rys_language_pair';

export interface ExtensionSettings {
  selectedModel: ModelId;
  translationEnabled: boolean;
}

export async function getSettings(): Promise<ExtensionSettings> {
  const data = await chrome.storage.local.get([SELECTED_MODEL_KEY, 'translationEnabled']);
  return {
    selectedModel: resolveSelectedModel(data[SELECTED_MODEL_KEY] as string | undefined),
    translationEnabled: data.translationEnabled !== false,
  };
}

export async function setSelectedModel(model: ModelId): Promise<void> {
  await chrome.storage.local.set({ [SELECTED_MODEL_KEY]: model });
}

export async function setTranslationEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ translationEnabled: enabled });
}

/** Remove every cloud credential, provider setting, and paid-usage remnant. */
export async function migrateStorage(): Promise<void> {
  const local = await chrome.storage.local.get([
    SELECTED_MODEL_KEY,
    CACHE_STORAGE_KEY,
    LANG_STORAGE_KEY,
    LEGACY_CACHE_STORAGE_KEY,
    LEGACY_LANG_STORAGE_KEY,
  ]);
  const selectedModel = resolveSelectedModel(local[SELECTED_MODEL_KEY] as string | undefined);
  const migrated: Record<string, unknown> = {
    [SELECTED_MODEL_KEY]: selectedModel || DEFAULT_MODEL_ID,
  };
  if (local[CACHE_STORAGE_KEY] === undefined && local[LEGACY_CACHE_STORAGE_KEY] !== undefined) {
    migrated[CACHE_STORAGE_KEY] = local[LEGACY_CACHE_STORAGE_KEY];
  }
  if (local[LANG_STORAGE_KEY] === undefined && local[LEGACY_LANG_STORAGE_KEY] !== undefined) {
    migrated[LANG_STORAGE_KEY] = local[LEGACY_LANG_STORAGE_KEY];
  }
  const remove = [
    'engineApiKeys',
    'geminiApiKey',
    'selectedEngine',
    'selectedModels',
    'b3rys_usage_stats',
    'b3rys_cost_limit',
    'b3rys_usage_ratio',
    'web_translate_usage_stats',
    'web_translate_cost_limit',
    'web_translate_usage_ratio',
    'apiKeyErrorMessage',
    'onboardingNotice',
    LEGACY_CACHE_STORAGE_KEY,
    LEGACY_LANG_STORAGE_KEY,
  ];
  await chrome.storage.local.set(migrated);
  await chrome.storage.local.remove(remove);
  const sync = await chrome.storage.sync.get(null);
  if (Object.keys(sync).length) await chrome.storage.sync.clear();
}
