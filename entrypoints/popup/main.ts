import {
  getModelConfig,
  resolveSelectedModel,
  SELECTED_MODEL_KEY,
  type ModelId,
} from '@/utils/models';
import { populateModelSelect, renderModelInfoTable } from './model-ui';
import { LANGUAGES, LANG_STORAGE_KEY, DEFAULT_TARGET_LANG } from '@/utils/constants';

document.addEventListener('DOMContentLoaded', async () => {
  const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
  const status = document.getElementById('local-host-status') as HTMLSpanElement;
  const errorBanner = document.getElementById('local-error-banner') as HTMLDivElement;
  const errorMessage = document.getElementById('local-error-message') as HTMLSpanElement;
  const badgeModel = document.querySelector('.badge-model') as HTMLSpanElement;
  const targetLang = document.getElementById('target-lang') as HTMLSelectElement;
  const fabToggle = document.getElementById('fab-toggle') as HTMLInputElement;
  const ytToggle = document.getElementById('yt-btn-toggle') as HTMLInputElement;
  const autoToggle = document.getElementById('auto-toggle') as HTMLInputElement;

  const data = await chrome.storage.local.get([
    SELECTED_MODEL_KEY,
    'floatingButtonVisible',
    'ytButtonVisible',
    'autoTranslate',
    LANG_STORAGE_KEY,
    'localHostErrorMessage',
  ]);
  const selected = resolveSelectedModel(data[SELECTED_MODEL_KEY] as string | undefined);
  populateModelSelect(modelSelect);
  renderModelInfoTable(document.getElementById('model-tooltip') as HTMLElement);
  modelSelect.value = selected;
  badgeModel.textContent = getModelConfig(selected).label;
  status.textContent = 'Native host required';

  if (data.localHostErrorMessage) {
    errorMessage.textContent = data.localHostErrorMessage as string;
    errorBanner.style.display = 'flex';
    await chrome.storage.local.remove('localHostErrorMessage');
  }
  document.getElementById('dismiss-error')?.addEventListener('click', () => {
    errorBanner.style.display = 'none';
  });

  modelSelect.addEventListener('change', async () => {
    const model = resolveSelectedModel(modelSelect.value) as ModelId;
    await chrome.storage.local.set({ [SELECTED_MODEL_KEY]: model });
    badgeModel.textContent = getModelConfig(model).label;
  });

  for (const [code, info] of Object.entries(LANGUAGES)) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = `${info.nativeName} (${info.name})`;
    targetLang.appendChild(option);
  }
  targetLang.value =
    (data[LANG_STORAGE_KEY] as { target?: string } | undefined)?.target || DEFAULT_TARGET_LANG;
  targetLang.addEventListener(
    'change',
    () => void chrome.storage.local.set({ [LANG_STORAGE_KEY]: { target: targetLang.value } }),
  );

  const toggles: Array<[HTMLInputElement, string, string]> = [
    [fabToggle, 'floatingButtonVisible', 'TOGGLE_FLOATING_BUTTON'],
    [ytToggle, 'ytButtonVisible', 'TOGGLE_YT_BUTTON'],
    [autoToggle, 'autoTranslate', 'TOGGLE_AUTO_TRANSLATE'],
  ];
  for (const [toggle, key, type] of toggles) {
    toggle.checked = data[key] === true || (key !== 'autoTranslate' && data[key] !== false);
    toggle.addEventListener('change', async () => {
      await chrome.storage.local.set({ [key]: toggle.checked });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id)
        void chrome.tabs.sendMessage(
          tab.id,
          type === 'TOGGLE_AUTO_TRANSLATE'
            ? { type, enabled: toggle.checked }
            : { type, visible: toggle.checked },
        );
    });
  }

  const clear = document.getElementById('cache-clear') as HTMLButtonElement;
  clear.addEventListener('click', async () => {
    const result = await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
    status.textContent = result?.success ? 'Cache cleared' : 'Could not clear cache';
  });
});
