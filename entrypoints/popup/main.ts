import {
  getModelConfig,
  resolveSelectedModel,
  SELECTED_MODEL_KEY,
  type ModelId,
} from '@/utils/models';
import {
  LOCAL_MODEL_DOWNLOAD_STATE_KEY,
  type ModelDownloadState,
  type ModelStatusResponse,
} from '@/utils/messaging';
import {
  findModelStatus,
  modelDownloadUrl,
  modelInstallCommand,
  populateModelSelect,
  renderModelInfoTable,
} from './model-ui';
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
  const checkModels = document.getElementById('check-models') as HTMLButtonElement;
  const installGuide = document.getElementById('model-install-guide') as HTMLDivElement;
  const installTitle = document.getElementById('model-install-title') as HTMLElement;
  const installPath = document.getElementById('model-install-path') as HTMLElement;
  const installCommand = document.getElementById('model-install-command') as HTMLElement;
  const copyCommand = document.getElementById('copy-model-command') as HTMLButtonElement;
  const modelPage = document.getElementById('open-model-page') as HTMLAnchorElement;

  const data = await chrome.storage.local.get([
    SELECTED_MODEL_KEY,
    'floatingButtonVisible',
    'ytButtonVisible',
    'autoTranslate',
    LANG_STORAGE_KEY,
    'localHostErrorMessage',
    LOCAL_MODEL_DOWNLOAD_STATE_KEY,
  ]);
  const selected = resolveSelectedModel(data[SELECTED_MODEL_KEY] as string | undefined);
  populateModelSelect(modelSelect);
  renderModelInfoTable(document.getElementById('model-tooltip') as HTMLElement);
  modelSelect.value = selected;
  badgeModel.textContent = getModelConfig(selected).label;
  status.textContent = 'Checking local model files…';

  let modelStatus: ModelStatusResponse | undefined;
  let downloadState = data[LOCAL_MODEL_DOWNLOAD_STATE_KEY] as ModelDownloadState | undefined;
  let downloadExpiryTimer: number | undefined;
  function scheduleDownloadExpiry(): void {
    if (downloadExpiryTimer !== undefined) window.clearTimeout(downloadExpiryTimer);
    downloadExpiryTimer = undefined;
    const model = resolveSelectedModel(modelSelect.value);
    if (!downloadState || downloadState.modelId !== model) return;
    const remaining = Math.max(0, 60_000 - (Date.now() - downloadState.updatedAt));
    downloadExpiryTimer = window.setTimeout(() => {
      if (downloadState && Date.now() - downloadState.updatedAt >= 60_000) {
        downloadState = undefined;
        void refreshModelStatus();
      } else {
        renderSelectedModelStatus();
      }
    }, remaining + 10);
  }
  function renderSelectedModelStatus(): void {
    const model = resolveSelectedModel(modelSelect.value);
    if (downloadState?.modelId === model && Date.now() - downloadState.updatedAt < 60_000) {
      const percent = Math.round(Math.min(Math.max(downloadState.fraction, 0), 1) * 100);
      status.textContent = `Downloading ${getModelConfig(model).label}… ${percent}%`;
      installGuide.hidden = true;
      scheduleDownloadExpiry();
      return;
    }
    if (!modelStatus) {
      status.textContent = 'Local host unavailable';
      installGuide.hidden = true;
      return;
    }
    const current = findModelStatus(modelStatus.models, model);
    if (!current) {
      status.textContent = 'Model status unavailable';
      installGuide.hidden = true;
      return;
    }
    if (current.ready) {
      status.textContent = `Ready · ${model}`;
      installGuide.hidden = true;
      return;
    }
    status.textContent = `Missing files · ${current.missingFiles.join(', ')}`;
    installTitle.textContent = `Install ${getModelConfig(model).label}`;
    installPath.textContent = `Target folder: ${current.path}`;
    installCommand.textContent = modelInstallCommand(model, modelStatus.modelRoot);
    modelPage.href = modelDownloadUrl(model);
    installGuide.hidden = false;
  }

  async function refreshModelStatus(): Promise<void> {
    checkModels.disabled = true;
    const model = resolveSelectedModel(modelSelect.value);
    const hasFreshDownload =
      downloadState?.modelId === model && Date.now() - downloadState.updatedAt < 60_000;
    if (!hasFreshDownload) status.textContent = 'Checking local model files…';
    try {
      const result = (await chrome.runtime.sendMessage({ type: 'GET_MODEL_STATUS' })) as
        | (ModelStatusResponse & { success: true })
        | { success: false; error?: string };
      if (!result?.success) throw new Error(result?.error || 'Local host unavailable.');
      modelStatus = result;
      renderSelectedModelStatus();
    } catch (error) {
      modelStatus = undefined;
      status.textContent = 'Native host unavailable';
      errorMessage.textContent = error instanceof Error ? error.message : String(error);
      errorBanner.style.display = 'flex';
      installGuide.hidden = true;
    } finally {
      checkModels.disabled = false;
    }
  }

  checkModels.addEventListener('click', () => void refreshModelStatus());
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[LOCAL_MODEL_DOWNLOAD_STATE_KEY]) return;
    const nextState = changes[LOCAL_MODEL_DOWNLOAD_STATE_KEY].newValue as
      | ModelDownloadState
      | undefined;
    if (!nextState) {
      downloadState = undefined;
      void refreshModelStatus();
      return;
    }
    downloadState = nextState;
    renderSelectedModelStatus();
  });
  copyCommand.addEventListener('click', async () => {
    if (!installCommand.textContent) return;
    await navigator.clipboard.writeText(installCommand.textContent);
    copyCommand.textContent = 'Copied';
    window.setTimeout(() => {
      copyCommand.textContent = 'Copy command';
    }, 1200);
  });
  renderSelectedModelStatus();
  void refreshModelStatus();

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
    renderSelectedModelStatus();
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
