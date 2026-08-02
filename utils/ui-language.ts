import { DEFAULT_UI_LANGUAGE, UI_LANGUAGE_STORAGE_KEY, type UiLanguage } from './constants';

const KO = {
  language: '언어',
  preparing: '준비 중',
  queued: '대기 중',
  starting: '시작 중',
  localModel: '로컬 모델',
  checkStatus: '상태 확인',
  gemmaTermsTitle: 'TranslateGemma 사용 조건을 확인해 주세요',
  gemmaTermsDescription:
    '이 모델을 다운로드하거나 사용하려면 Google Gemma Terms of Use와 사용 제한을 확인해야 합니다.',
  openGemmaTerms: 'Google Gemma Terms of Use 열기',
  agreeGemmaTerms: '약관과 사용 제한을 확인했으며 이에 동의합니다.',
  agreeAndDownload: '동의하고 자동 다운로드',
  modelDownloadQuestion: '모델을 다운로드할까요?',
  modelDownloadQuestionWithLabel: '{label} 모델을 다운로드할까요?',
  downloadStart: '다운로드 시작',
  modelInfo: '모델 정보',
  downloadReadyHint: '다운로드가 완료되면 선택한 모델로 바로 번역할 수 있습니다.',
  modelDownloadPreparing: '모델 다운로드 준비 중',
  targetLanguage: '번역 언어',
  displayButtons: '표시 버튼',
  floatingButton: '플로팅',
  youtubeButton: 'YouTube',
  autoTranslate: '자동',
  localProcessing: '번역은 이 Mac에서 처리됩니다. 텍스트는 외부 번역 서비스로 전송되지 않습니다.',
  translationCache: '번역 캐시',
  clear: '지우기',
  basedOn: '기반',
  downloadWaiting: '{label} 다운로드 대기 중',
  downloadWaitingDetail: '현재 작업이 끝나면 이 모델의 다운로드를 시작합니다.',
  downloadStarting: '{label} 다운로드 시작 중',
  downloadStartingDetail: '다운로드 요청을 로컬 번역 엔진에 전달하고 있습니다.',
  downloadProgress: '{label} 다운로드 중',
  downloadTransferDetail:
    '현재 대용량 파일을 받고 있습니다 · {speed}. 진행률은 파일을 마칠 때 다음 단계로 갱신될 수 있습니다.',
  downloadFileDetail:
    '현재 모델 파일을 받고 있습니다. 진행률은 파일을 마칠 때 다음 단계로 갱신될 수 있습니다.',
  currentTransferSpeed: '현재 전송 속도 {speed}',
  currentFileDownload: '현재 파일 다운로드 중',
  queue: '대기열: {models}',
  termsBeforeDownload: 'TranslateGemma 약관을 확인하면 다운로드가 시작됩니다.',
  queuedStatus: '{label} 다운로드 대기 중 · 대기열 {position}번째',
  requestedStatus: '{label} 다운로드 요청을 보내는 중입니다.',
  engineUnavailable: '로컬 번역 엔진에 연결할 수 없습니다.',
  modelStatusUnavailable: '모델 상태를 확인할 수 없습니다.',
  ready: '준비됨 · {label}',
  modelNeedsDownload: '{label} 모델을 다운로드해야 합니다.',
  modelNotStored:
    '아직 이 Mac에 저장되지 않았습니다. 다운로드가 완료되면 이 모델로 번역할 수 있습니다.',
  downloadModel: '{label} 다운로드 시작',
  downloadStartFailed: '모델 다운로드를 시작할 수 없습니다.',
  termsDownloadAvailable: 'TranslateGemma 약관을 확인하면 다운로드를 시작할 수 있습니다.',
  downloadInterrupted:
    '모델 다운로드가 중단되었습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  statusRefreshFailed:
    '모델 상태를 확인할 수 없습니다. 확장 프로그램을 새로고침한 뒤 다시 시도해 주세요.',
  cacheCleared: '번역 캐시를 지웠습니다.',
  cacheClearFailed: '번역 캐시를 지우지 못했습니다.',
  standaloneInstallTitle: 'Standalone 패키지 설치 안내',
  standaloneInstallMessage:
    '마운트된 패키지에서 Install.command를 실행한 뒤 Chrome에 설치된 확장 프로그램을 로드하세요.',
  standaloneInstallStep1: 'DMG에서 Install.command를 실행합니다.',
  standaloneInstallStep2: 'chrome://extensions를 열고 개발자 모드를 켭니다.',
  standaloneInstallStep3:
    '압축해제된 확장 프로그램 로드를 선택하고 web-translate 폴더를 지정합니다.',
  standaloneInstallStep4: '확장 프로그램을 새로고침하고 페이지도 새로고침합니다.',
  standaloneInstallUnsigned:
    '서명되지 않은 private preview입니다. Gatekeeper를 전체 해제하지 마세요.',
  tableModel: '모델',
  tableFamily: '계열',
  tableSize: '크기',
  tableSource: '소스',
  tableLicense: '라이선스',
  refreshPage: '새로고침하세요.',
  translatePage: '페이지 번역',
  selectionLoading: '번역 중...',
  selectionHostUnavailable: '로컬 MLX 호스트를 확인해주세요.',
  selectionFailed: '번역 실패: {error}',
  selectionNoResult: '번역 결과가 없습니다.',
  selectionRequestFailed: '번역 요청 중 오류가 발생했습니다.',
  copy: '복사',
  speak: '발음 듣기',
  translationNotDisplayed: '번역을 표시하지 않았습니다. {message}',
  retryParagraph: '이 문단 다시 번역',
  longParagraphProgress: '긴 문단을 나누어 번역 중 · {completed}/{total}',
  languageCheckFailed: '번역 언어가 맞는지 확인하지 못했습니다.',
  sourceReturned: '원문이 그대로 반환되어 번역으로 표시하지 않았습니다.',
  modelResultFailed: '모델의 번역 결과를 확인하지 못했습니다.',
  paragraphTooLong: '문단이 너무 길어 번역하지 못했습니다.',
  translationFailed: '번역을 완료하지 못했습니다.',
  toggleMode: '표시 모드 전환',
  ytIdleTitle: 'web-translate 번역 자막',
  ytLoading: '번역 중...',
  ytActive: '원문+번역 (클릭: 원문만)',
  ytError: '번역 실패 (클릭: 재시도)',
  ytInfo: '자막 번역 불가',
  ytModeBoth: '원문+번역 (클릭: 원문만)',
  ytModeOriginal: '원문만 (클릭: 번역만)',
  ytModeTranslation: '번역만 (클릭: 끄기)',
  ytNoCaptions: '이 영상에는 자막이 없습니다',
  ytOriginalOnly: '원문 자막 ({language}) · 번역 없음',
  ytOriginalOnlyTitle: '원문 자막 ({language}) · 클릭: 끄기',
} as const;

export type UiTextKey = keyof typeof KO;

const MESSAGES: Record<UiLanguage, Record<UiTextKey, string>> = {
  ko: KO,
  en: {
    language: 'Language',
    preparing: 'Preparing',
    queued: 'Queued',
    starting: 'Starting',
    localModel: 'Local model',
    checkStatus: 'Check status',
    gemmaTermsTitle: 'Review the TranslateGemma terms',
    gemmaTermsDescription:
      'You must review the Google Gemma Terms of Use and use restrictions before downloading or using this model.',
    openGemmaTerms: 'Open Google Gemma Terms of Use',
    agreeGemmaTerms: 'I have reviewed and agree to the terms and use restrictions.',
    agreeAndDownload: 'Agree and download automatically',
    modelDownloadQuestion: 'Download this model?',
    modelDownloadQuestionWithLabel: 'Download {label}?',
    downloadStart: 'Start download',
    modelInfo: 'Model info',
    downloadReadyHint: 'You can translate with this model as soon as the download finishes.',
    modelDownloadPreparing: 'Preparing model download',
    targetLanguage: 'Translation language',
    displayButtons: 'Display controls',
    floatingButton: 'Floating',
    youtubeButton: 'YouTube',
    autoTranslate: 'Auto',
    localProcessing:
      'Translation is processed on this Mac. Text is not sent to an external translation service.',
    translationCache: 'Translation cache',
    clear: 'Clear',
    basedOn: 'Based on',
    downloadWaiting: '{label} download queued',
    downloadWaitingDetail: 'This model will start downloading when the current task finishes.',
    downloadStarting: 'Starting {label} download',
    downloadStartingDetail: 'Sending the download request to the local translation engine.',
    downloadProgress: 'Downloading {label}',
    downloadTransferDetail:
      'A large file is downloading · {speed}. Progress may update when the current file finishes.',
    downloadFileDetail:
      'The model files are downloading. Progress may update when the current file finishes.',
    currentTransferSpeed: 'Current transfer speed: {speed}',
    currentFileDownload: 'Downloading current file',
    queue: 'Queue: {models}',
    termsBeforeDownload: 'Review the TranslateGemma terms to start the download.',
    queuedStatus: '{label} queued · position {position}',
    requestedStatus: 'Requesting the {label} download.',
    engineUnavailable: 'Cannot connect to the local translation engine.',
    modelStatusUnavailable: 'Cannot check the model status.',
    ready: 'Ready · {label}',
    modelNeedsDownload: '{label} needs to be downloaded.',
    modelNotStored:
      'This model is not stored on this Mac yet. You can translate with it after the download finishes.',
    downloadModel: 'Start {label} download',
    downloadStartFailed: 'Could not start the model download.',
    termsDownloadAvailable: 'Review the TranslateGemma terms to start the download.',
    downloadInterrupted:
      'The model download stopped. Check your internet connection and try again.',
    statusRefreshFailed: 'Could not check model status. Reload the extension and try again.',
    cacheCleared: 'Translation cache cleared.',
    cacheClearFailed: 'Could not clear the translation cache.',
    standaloneInstallTitle: 'Standalone package installation',
    standaloneInstallMessage:
      'Run Install.command from the mounted package, then load the installed extension in Chrome.',
    standaloneInstallStep1: 'Run Install.command from the DMG.',
    standaloneInstallStep2: 'Open chrome://extensions and enable Developer mode.',
    standaloneInstallStep3: 'Choose Load unpacked and select the web-translate extension folder.',
    standaloneInstallStep4: 'Reload the extension and refresh the page.',
    standaloneInstallUnsigned:
      'This is an unsigned private preview; do not disable Gatekeeper globally.',
    tableModel: 'Model',
    tableFamily: 'Family',
    tableSize: 'Size',
    tableSource: 'Source',
    tableLicense: 'License',
    refreshPage: 'Please refresh this page.',
    translatePage: 'Translate page',
    selectionLoading: 'Translating...',
    selectionHostUnavailable: 'Check the local MLX host.',
    selectionFailed: 'Translation failed: {error}',
    selectionNoResult: 'No translation result was returned.',
    selectionRequestFailed: 'The translation request failed.',
    copy: 'Copy',
    speak: 'Listen to pronunciation',
    translationNotDisplayed: 'Translation was not displayed. {message}',
    retryParagraph: 'Translate this paragraph again',
    longParagraphProgress: 'Translating a long paragraph in chunks · {completed}/{total}',
    languageCheckFailed: 'Could not verify the translation language.',
    sourceReturned: 'The source was returned unchanged, so it was not shown as a translation.',
    modelResultFailed: 'Could not validate the model translation result.',
    paragraphTooLong: 'This paragraph is too long to translate.',
    translationFailed: 'Translation could not be completed.',
    toggleMode: 'Toggle display mode',
    ytIdleTitle: 'web-translate subtitles',
    ytLoading: 'Translating...',
    ytActive: 'Original + translation (click: original only)',
    ytError: 'Translation failed (click: retry)',
    ytInfo: 'Subtitles cannot be translated',
    ytModeBoth: 'Original + translation (click: original only)',
    ytModeOriginal: 'Original only (click: translation only)',
    ytModeTranslation: 'Translation only (click: turn off)',
    ytNoCaptions: 'This video has no captions',
    ytOriginalOnly: 'Original captions ({language}) · no translation',
    ytOriginalOnlyTitle: 'Original captions ({language}) · click: turn off',
  },
};

let activeUiLanguage: UiLanguage = DEFAULT_UI_LANGUAGE;

export function resolveUiLanguage(value: unknown): UiLanguage {
  return value === 'en' ? 'en' : DEFAULT_UI_LANGUAGE;
}

export function getActiveUiLanguage(): UiLanguage {
  return activeUiLanguage;
}

export function setActiveUiLanguage(language: UiLanguage): void {
  activeUiLanguage = language;
}

export async function loadUiLanguage(): Promise<UiLanguage> {
  try {
    const data = await chrome.storage.local.get(UI_LANGUAGE_STORAGE_KEY);
    activeUiLanguage = resolveUiLanguage(data[UI_LANGUAGE_STORAGE_KEY]);
  } catch {
    activeUiLanguage = DEFAULT_UI_LANGUAGE;
  }
  return activeUiLanguage;
}

export async function saveUiLanguage(language: UiLanguage): Promise<void> {
  activeUiLanguage = language;
  await chrome.storage.local.set({ [UI_LANGUAGE_STORAGE_KEY]: language });
}

export function uiText(
  key: UiTextKey,
  languageOrParams: UiLanguage | Record<string, string | number> = activeUiLanguage,
  params: Record<string, string | number> = {},
): string {
  const language = typeof languageOrParams === 'string' ? languageOrParams : activeUiLanguage;
  const replacements = typeof languageOrParams === 'string' ? params : languageOrParams;
  const dictionary = MESSAGES[language] ?? MESSAGES[DEFAULT_UI_LANGUAGE];
  const template = dictionary[key] ?? MESSAGES[DEFAULT_UI_LANGUAGE][key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(replacements, name) ? String(replacements[name]) : match,
  );
}

export function applyUiText(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n as UiTextKey | undefined;
    if (key) element.textContent = uiText(key);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((element) => {
    const key = element.dataset.i18nAriaLabel as UiTextKey | undefined;
    if (key) element.setAttribute('aria-label', uiText(key));
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((element) => {
    const key = element.dataset.i18nTitle as UiTextKey | undefined;
    if (key) element.title = uiText(key);
  });
}
