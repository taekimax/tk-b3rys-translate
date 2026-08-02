import {
  getModelConfig,
  requiresModelTermsAcceptance,
  resolveSelectedModel,
  SELECTED_MODEL_KEY,
  TRANSLATEGEMMA_TERMS_ACCEPTED_KEY,
  TRANSLATEGEMMA_TERMS_URL,
  TRANSLATEGEMMA_TERMS_VERSION,
  type ModelId,
} from '@/utils/models';
import {
  LOCAL_MODEL_DOWNLOAD_STATE_KEY,
  type ModelDownloadItem,
  type ModelDownloadState,
  type ModelStatusResponse,
} from '@/utils/messaging';
import {
  findModelStatus,
  modelDownloadUrl,
  populateModelSelect,
  renderModelInfoTable,
} from './model-ui';
import {
  LANGUAGES,
  LANG_STORAGE_KEY,
  DEFAULT_TARGET_LANG,
  UI_LANGUAGE_STORAGE_KEY,
} from '@/utils/constants';
import {
  applyUiText,
  resolveUiLanguage,
  saveUiLanguage,
  setActiveUiLanguage,
  uiText,
  type UiTextKey,
} from '@/utils/ui-language';

document.addEventListener('DOMContentLoaded', async () => {
  const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
  const status = document.getElementById('local-host-status') as HTMLSpanElement;
  const errorBanner = document.getElementById('local-error-banner') as HTMLDivElement;
  const errorMessage = document.getElementById('local-error-message') as HTMLSpanElement;
  const standaloneInstallHelp = document.getElementById(
    'standalone-install-help',
  ) as HTMLDivElement;
  const badgeModel = document.querySelector('.badge-model') as HTMLSpanElement;
  const targetLang = document.getElementById('target-lang') as HTMLSelectElement;
  const fabToggle = document.getElementById('fab-toggle') as HTMLInputElement;
  const ytToggle = document.getElementById('yt-btn-toggle') as HTMLInputElement;
  const autoToggle = document.getElementById('auto-toggle') as HTMLInputElement;
  const checkModels = document.getElementById('check-models') as HTMLButtonElement;
  const modelTermsGuide = document.getElementById('model-terms-guide') as HTMLDivElement;
  const acceptModelTerms = document.getElementById('accept-model-terms') as HTMLInputElement;
  const acceptModelTermsDownload = document.getElementById(
    'accept-model-terms-download',
  ) as HTMLButtonElement;
  const installGuide = document.getElementById('model-install-guide') as HTMLDivElement;
  const installTitle = document.getElementById('model-install-title') as HTMLElement;
  const installPath = document.getElementById('model-install-path') as HTMLElement;
  const downloadProgress = document.getElementById('model-download-progress') as HTMLDivElement;
  const downloadTitle = document.getElementById('model-download-title') as HTMLElement;
  const downloadPercent = document.getElementById('model-download-percent') as HTMLElement;
  const downloadDetail = document.getElementById('model-download-detail') as HTMLElement;
  const downloadQueue = document.getElementById('model-download-queue') as HTMLElement;
  const downloadTrack = document.getElementById('model-download-track') as HTMLElement;
  const downloadBar = document.getElementById('model-download-bar') as HTMLElement;
  const downloadSelectedModel = document.getElementById(
    'download-selected-model',
  ) as HTMLButtonElement;
  const modelPage = document.getElementById('open-model-page') as HTMLAnchorElement;
  const uiLanguageSelect = document.getElementById('ui-language') as HTMLSelectElement;

  const data = await chrome.storage.local.get([
    SELECTED_MODEL_KEY,
    'floatingButtonVisible',
    'ytButtonVisible',
    'autoTranslate',
    LANG_STORAGE_KEY,
    UI_LANGUAGE_STORAGE_KEY,
    'localHostErrorMessage',
    LOCAL_MODEL_DOWNLOAD_STATE_KEY,
    TRANSLATEGEMMA_TERMS_ACCEPTED_KEY,
  ]);
  const uiLanguage = resolveUiLanguage(data[UI_LANGUAGE_STORAGE_KEY]);
  setActiveUiLanguage(uiLanguage);
  document.documentElement.lang = uiLanguage;
  applyUiText(document);
  uiLanguageSelect.value = uiLanguage;
  uiLanguageSelect.addEventListener('change', async () => {
    await saveUiLanguage(resolveUiLanguage(uiLanguageSelect.value));
    window.location.reload();
  });
  const t = (key: UiTextKey, params: Record<string, string | number> = {}): string =>
    uiText(key, uiLanguage, params);
  const selected = resolveSelectedModel(data[SELECTED_MODEL_KEY] as string | undefined);
  let translateGemmaTermsAccepted =
    data[TRANSLATEGEMMA_TERMS_ACCEPTED_KEY] === TRANSLATEGEMMA_TERMS_VERSION;
  populateModelSelect(modelSelect);
  renderModelInfoTable(document.getElementById('model-tooltip') as HTMLElement, uiLanguage);
  modelSelect.value = selected;
  badgeModel.textContent = getModelConfig(selected).label;
  status.textContent = t('modelDownloadPreparing');
  downloadPercent.textContent = t('preparing');

  let modelStatus: ModelStatusResponse | undefined;
  let downloadState = normalizeDownloadState(data[LOCAL_MODEL_DOWNLOAD_STATE_KEY]);
  const requestedDownloads = new Set<ModelId>();
  function normalizeDownloadState(value: unknown): ModelDownloadState | undefined {
    if (
      !value ||
      typeof value !== 'object' ||
      !Array.isArray((value as ModelDownloadState).downloads)
    ) {
      return undefined;
    }
    return value as ModelDownloadState;
  }
  function downloads(): readonly ModelDownloadItem[] {
    return downloadState?.downloads ?? [];
  }
  function downloadFor(model: ModelId): ModelDownloadItem | undefined {
    return downloads().find((item) => item.modelId === model);
  }
  function hideDownloadProgress(): void {
    downloadProgress.classList.remove('is-transferring');
    downloadProgress.hidden = true;
  }
  function formatTransferSpeed(bytesPerSecond: number | undefined): string | undefined {
    if (!bytesPerSecond || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0)
      return undefined;
    if (bytesPerSecond < 1024 * 1024)
      return `${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  function showDownloadProgress(): void {
    const items = downloads();
    const active = items.find((item) => item.phase !== 'queued') ?? items[0];
    if (!active) {
      hideDownloadProgress();
      return;
    }
    const model = active.modelId;
    const label = getModelConfig(model).label;
    const percent = Math.round(Math.min(Math.max(active.fraction, 0), 1) * 100);
    const transferSpeed = formatTransferSpeed(active.bytesPerSecond);
    const queued = items.filter((item) => item.phase === 'queued');
    if (active.phase === 'queued') {
      downloadTitle.textContent = t('downloadWaiting', { label });
      downloadPercent.textContent = t('queued');
      downloadDetail.textContent = t('downloadWaitingDetail');
    } else if (active.phase === 'preparing') {
      downloadTitle.textContent = t('downloadStarting', { label });
      downloadPercent.textContent = t('starting');
      downloadDetail.textContent = t('downloadStartingDetail');
    } else {
      downloadTitle.textContent = t('downloadProgress', { label });
      downloadPercent.textContent = `${percent}%`;
      downloadDetail.textContent = transferSpeed
        ? t('downloadTransferDetail', { speed: transferSpeed })
        : t('downloadFileDetail');
    }
    downloadTrack.setAttribute('aria-valuenow', String(percent));
    downloadTrack.setAttribute(
      'aria-valuetext',
      active.phase === 'downloading'
        ? `${percent}% · ${transferSpeed ? t('currentTransferSpeed', { speed: transferSpeed }) : t('currentFileDownload')}`
        : (downloadPercent.textContent ?? ''),
    );
    downloadBar.style.width = active.phase === 'downloading' ? `${percent}%` : '0%';
    downloadProgress.classList.toggle('is-transferring', active.phase === 'downloading');
    downloadQueue.hidden = queued.length === 0;
    downloadQueue.textContent =
      queued.length === 0
        ? ''
        : t('queue', {
            models: queued.map((item) => getModelConfig(item.modelId).label).join(', '),
          });
    downloadProgress.hidden = false;
  }

  function renderModelTerms(model: ModelId): void {
    const required = requiresModelTermsAcceptance(model);
    modelTermsGuide.hidden = !required || translateGemmaTermsAccepted;
    acceptModelTerms.checked = translateGemmaTermsAccepted;
    acceptModelTermsDownload.disabled = !required || !acceptModelTerms.checked;
  }

  function renderSelectedModelStatus(): void {
    const model = resolveSelectedModel(modelSelect.value);
    renderModelTerms(model);
    if (requiresModelTermsAcceptance(model) && !translateGemmaTermsAccepted) {
      status.textContent = t('termsBeforeDownload');
      installGuide.hidden = true;
      showDownloadProgress();
      return;
    }
    const currentDownload = downloadFor(model);
    if (currentDownload) {
      const position = downloads().findIndex((item) => item.modelId === model) + 1;
      const percent = Math.round(Math.min(Math.max(currentDownload.fraction, 0), 1) * 100);
      const transferSpeed = formatTransferSpeed(currentDownload.bytesPerSecond);
      status.textContent =
        currentDownload.phase === 'queued'
          ? t('queuedStatus', { label: getModelConfig(model).label, position })
          : currentDownload.phase === 'preparing'
            ? t('downloadStarting', { label: getModelConfig(model).label })
            : `${t('downloadProgress', { label: getModelConfig(model).label })} · ${percent}%${transferSpeed ? ` · ${transferSpeed}` : ''}`;
      installGuide.hidden = true;
      showDownloadProgress();
      return;
    }
    if (requestedDownloads.has(model)) {
      status.textContent = t('requestedStatus', { label: getModelConfig(model).label });
      installGuide.hidden = true;
      showDownloadProgress();
      return;
    }
    showDownloadProgress();
    if (!modelStatus) {
      status.textContent = t('engineUnavailable');
      installGuide.hidden = true;
      standaloneInstallHelp.hidden = false;
      return;
    }
    standaloneInstallHelp.hidden = true;
    const current = findModelStatus(modelStatus.models, model);
    if (!current) {
      status.textContent = t('modelStatusUnavailable');
      installGuide.hidden = true;
      return;
    }
    if (current.ready) {
      status.textContent = t('ready', { label: getModelConfig(model).label });
      installGuide.hidden = true;
      return;
    }
    const modelName = getModelConfig(model).label;
    status.textContent = t('modelNeedsDownload', { label: modelName });
    installTitle.textContent = t('modelDownloadQuestionWithLabel', { label: modelName });
    installPath.textContent = t('modelNotStored');
    downloadSelectedModel.textContent = t('downloadModel', { label: modelName });
    downloadSelectedModel.disabled = false;
    modelPage.href = modelDownloadUrl(model);
    installGuide.hidden = false;
  }

  async function startSelectedModelDownload(model: ModelId): Promise<void> {
    if (requiresModelTermsAcceptance(model) && !translateGemmaTermsAccepted) {
      renderSelectedModelStatus();
      return;
    }
    const current = modelStatus && findModelStatus(modelStatus.models, model);
    if (current?.ready || downloadFor(model) || requestedDownloads.has(model)) return;

    requestedDownloads.add(model);
    downloadSelectedModel.disabled = true;
    renderSelectedModelStatus();
    try {
      const result = (await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_MODEL',
        modelId: model,
      })) as
        | (ModelStatusResponse & { success: true })
        | { success: false; error?: string; errorCode?: string };
      if (!result?.success) {
        if (result?.errorCode === 'terms_required') translateGemmaTermsAccepted = false;
        throw new Error(result?.error || t('downloadStartFailed'));
      }
      modelStatus = result;
    } catch {
      if (requiresModelTermsAcceptance(model) && !translateGemmaTermsAccepted) {
        status.textContent = t('termsDownloadAvailable');
      } else {
        errorMessage.textContent = t('downloadInterrupted');
        errorBanner.style.display = 'flex';
      }
    } finally {
      requestedDownloads.delete(model);
      renderSelectedModelStatus();
      void refreshModelStatus();
    }
  }

  async function refreshModelStatus(): Promise<void> {
    checkModels.disabled = true;
    if (!downloadFor(resolveSelectedModel(modelSelect.value))) {
      status.textContent = t('modelDownloadPreparing');
    }
    try {
      const result = (await chrome.runtime.sendMessage({ type: 'GET_MODEL_STATUS' })) as
        | (ModelStatusResponse & { success: true })
        | { success: false; error?: string };
      if (!result?.success) throw new Error(result?.error || t('engineUnavailable'));
      modelStatus = result;
      renderSelectedModelStatus();
    } catch {
      modelStatus = undefined;
      status.textContent = t('engineUnavailable');
      errorMessage.textContent = t('statusRefreshFailed');
      errorBanner.style.display = 'flex';
      installGuide.hidden = true;
      standaloneInstallHelp.hidden = false;
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
    downloadState = normalizeDownloadState(nextState);
    renderSelectedModelStatus();
  });
  downloadSelectedModel.addEventListener('click', () => {
    const model = resolveSelectedModel(modelSelect.value);
    void startSelectedModelDownload(model);
  });
  renderSelectedModelStatus();
  void refreshModelStatus();

  if (data.localHostErrorMessage) {
    errorMessage.textContent = data.localHostErrorMessage as string;
    errorBanner.style.display = 'flex';
    standaloneInstallHelp.hidden = false;
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
    await refreshModelStatus();
  });

  document.getElementById('open-model-terms')?.setAttribute('href', TRANSLATEGEMMA_TERMS_URL);
  acceptModelTerms.addEventListener('change', () => {
    acceptModelTermsDownload.disabled = !acceptModelTerms.checked;
  });
  acceptModelTermsDownload.addEventListener('click', async () => {
    if (!acceptModelTerms.checked) return;
    translateGemmaTermsAccepted = true;
    await chrome.storage.local.set({
      [TRANSLATEGEMMA_TERMS_ACCEPTED_KEY]: TRANSLATEGEMMA_TERMS_VERSION,
    });
    const model = resolveSelectedModel(modelSelect.value) as ModelId;
    renderSelectedModelStatus();
    await refreshModelStatus();
    void startSelectedModelDownload(model);
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
    status.textContent = result?.success ? t('cacheCleared') : t('cacheClearFailed');
  });
});
