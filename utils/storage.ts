import { DEFAULT_MODEL_ID, SELECTED_MODEL_KEY, resolveSelectedModel, type ModelId } from './models';

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
  const local = await chrome.storage.local.get(SELECTED_MODEL_KEY);
  const selectedModel = resolveSelectedModel(local[SELECTED_MODEL_KEY] as string | undefined);
  const remove = [
    'engineApiKeys',
    'geminiApiKey',
    'selectedEngine',
    'selectedModels',
    'b3rys_usage_stats',
    'b3rys_cost_limit',
    'b3rys_usage_ratio',
    'apiKeyErrorMessage',
    'onboardingNotice',
  ];
  await chrome.storage.local.set({ [SELECTED_MODEL_KEY]: selectedModel || DEFAULT_MODEL_ID });
  await chrome.storage.local.remove(remove);
  const sync = await chrome.storage.sync.get(null);
  if (Object.keys(sync).length) await chrome.storage.sync.clear();
}
