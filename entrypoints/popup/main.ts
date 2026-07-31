import {
  getModelConfig,
  resolveSelectedModel,
  SELECTED_MODEL_KEY,
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
  status.textContent = '모델 파일을 확인하고 있습니다…';

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
      downloadTitle.textContent = `${label} 다운로드 대기 중`;
      downloadPercent.textContent = '대기 중';
      downloadDetail.textContent = '현재 작업이 끝나면 이 모델의 다운로드를 시작합니다.';
    } else if (active.phase === 'preparing') {
      downloadTitle.textContent = `${label} 다운로드 시작 중`;
      downloadPercent.textContent = '시작 중';
      downloadDetail.textContent = '다운로드 요청을 로컬 번역 엔진에 전달하고 있습니다.';
    } else {
      downloadTitle.textContent = `${label} 다운로드 중`;
      downloadPercent.textContent = `${percent}%`;
      downloadDetail.textContent = transferSpeed
        ? `현재 대용량 파일을 받고 있습니다 · ${transferSpeed}. 진행률은 파일을 마칠 때 다음 단계로 갱신될 수 있습니다.`
        : '현재 모델 파일을 받고 있습니다. 진행률은 파일을 마칠 때 다음 단계로 갱신될 수 있습니다.';
    }
    downloadTrack.setAttribute('aria-valuenow', String(percent));
    downloadTrack.setAttribute(
      'aria-valuetext',
      active.phase === 'downloading'
        ? `${percent}% · ${transferSpeed ? `현재 전송 속도 ${transferSpeed}` : '현재 파일 다운로드 중'}`
        : (downloadPercent.textContent ?? ''),
    );
    downloadBar.style.width = active.phase === 'downloading' ? `${percent}%` : '0%';
    downloadProgress.classList.toggle('is-transferring', active.phase === 'downloading');
    downloadQueue.hidden = queued.length === 0;
    downloadQueue.textContent =
      queued.length === 0
        ? ''
        : `대기열: ${queued.map((item) => getModelConfig(item.modelId).label).join(', ')}`;
    downloadProgress.hidden = false;
  }
  function renderSelectedModelStatus(): void {
    const model = resolveSelectedModel(modelSelect.value);
    const currentDownload = downloadFor(model);
    if (currentDownload) {
      const position = downloads().findIndex((item) => item.modelId === model) + 1;
      const percent = Math.round(Math.min(Math.max(currentDownload.fraction, 0), 1) * 100);
      const transferSpeed = formatTransferSpeed(currentDownload.bytesPerSecond);
      status.textContent =
        currentDownload.phase === 'queued'
          ? `${getModelConfig(model).label} 다운로드 대기 중 · 대기열 ${position}번째`
          : currentDownload.phase === 'preparing'
            ? `${getModelConfig(model).label} 다운로드 시작 중`
            : `${getModelConfig(model).label} 다운로드 중 · ${percent}%${transferSpeed ? ` · ${transferSpeed}` : ''}`;
      installGuide.hidden = true;
      showDownloadProgress();
      return;
    }
    if (requestedDownloads.has(model)) {
      status.textContent = `${getModelConfig(model).label} 다운로드 요청을 보내는 중입니다.`;
      installGuide.hidden = true;
      showDownloadProgress();
      return;
    }
    showDownloadProgress();
    if (!modelStatus) {
      status.textContent = '로컬 번역 엔진에 연결할 수 없습니다.';
      installGuide.hidden = true;
      return;
    }
    const current = findModelStatus(modelStatus.models, model);
    if (!current) {
      status.textContent = '모델 상태를 확인할 수 없습니다.';
      installGuide.hidden = true;
      return;
    }
    if (current.ready) {
      status.textContent = `준비됨 · ${getModelConfig(model).label}`;
      installGuide.hidden = true;
      return;
    }
    const modelName = getModelConfig(model).label;
    status.textContent = `${modelName} 모델을 다운로드해야 합니다.`;
    installTitle.textContent = `${modelName} 모델을 다운로드할까요?`;
    installPath.textContent =
      '아직 이 Mac에 저장되지 않았습니다. 다운로드가 완료되면 이 모델로 번역할 수 있습니다.';
    downloadSelectedModel.textContent = `${modelName} 다운로드 시작`;
    downloadSelectedModel.disabled = false;
    modelPage.href = modelDownloadUrl(model);
    installGuide.hidden = false;
  }

  async function refreshModelStatus(): Promise<void> {
    checkModels.disabled = true;
    if (!downloadFor(resolveSelectedModel(modelSelect.value))) {
      status.textContent = '모델 파일을 확인하고 있습니다…';
    }
    try {
      const result = (await chrome.runtime.sendMessage({ type: 'GET_MODEL_STATUS' })) as
        | (ModelStatusResponse & { success: true })
        | { success: false; error?: string };
      if (!result?.success)
        throw new Error(result?.error || '로컬 번역 엔진에 연결할 수 없습니다.');
      modelStatus = result;
      renderSelectedModelStatus();
    } catch {
      modelStatus = undefined;
      status.textContent = '로컬 번역 엔진에 연결할 수 없습니다.';
      errorMessage.textContent =
        '모델 상태를 확인할 수 없습니다. 확장 프로그램을 새로고침한 뒤 다시 시도해 주세요.';
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
    downloadState = normalizeDownloadState(nextState);
    renderSelectedModelStatus();
  });
  downloadSelectedModel.addEventListener('click', async () => {
    const model = resolveSelectedModel(modelSelect.value);
    requestedDownloads.add(model);
    downloadSelectedModel.disabled = true;
    renderSelectedModelStatus();
    try {
      const result = (await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_MODEL',
        modelId: model,
      })) as (ModelStatusResponse & { success: true }) | { success: false; error?: string };
      if (!result?.success) throw new Error(result?.error || '모델 다운로드를 시작할 수 없습니다.');
      modelStatus = result;
    } catch {
      errorMessage.textContent =
        '모델 다운로드가 중단되었습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
      errorBanner.style.display = 'flex';
    } finally {
      requestedDownloads.delete(model);
      renderSelectedModelStatus();
      void refreshModelStatus();
    }
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
    void refreshModelStatus();
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
    status.textContent = result?.success
      ? '번역 캐시를 지웠습니다.'
      : '번역 캐시를 지우지 못했습니다.';
  });
});
