import { getEngine } from '@/utils/engines';
import type {
  CacheLookupResponse,
  BackgroundMessage,
  ModelDownloadItem,
  ModelDownloadState,
  ModelStatusResponse,
  TranslateBatchResponse,
} from '@/utils/messaging';
import {
  loadCache,
  getCached,
  setCached,
  persistCache,
  clearCache,
} from '@/utils/translation-cache';
import { migrateStorage } from '@/utils/storage';
import { DEFAULT_SOURCE_LANG, DEFAULT_TARGET_LANG, LANG_STORAGE_KEY } from '@/utils/constants';
import { SELECTED_MODEL_KEY, resolveSelectedModel } from '@/utils/models';
import {
  buildTranslationCachePrefix,
  buildTranslationContext,
  TRANSLATION_CONTEXT_VERSION,
  type TranslationContext,
} from '@/utils/translation-context';
import type { TranslationRequestMode } from '@/utils/translation-types';
import { interpretTranslationResponse } from '@/utils/translation-response';
import { downloadModel, getModelStatus, NativeTranslationError } from '@/utils/engines/local-mlx';
import { LOCAL_MODEL_DOWNLOAD_STATE_KEY } from '@/utils/messaging';

// Native MLX generation is intentionally single-file: a host owns one resident
// model and every extension request is ordered through this queue. This avoids
// duplicate model loads and Metal memory spikes from page + selection + YouTube.
let nativeQueue: Promise<unknown> = Promise.resolve();
let downloadStateWrite: Promise<void> = Promise.resolve();
let downloadManagerReady: Promise<void> = Promise.resolve();
let processingDownloadQueue = false;
const downloadItems: ModelDownloadItem[] = [];
const downloadJobs = new Map<
  ModelDownloadItem['modelId'],
  {
    promise: Promise<ModelStatusResponse>;
    resolve: (status: ModelStatusResponse) => void;
    reject: (error: Error) => void;
  }
>();
function enqueueNative<T>(work: () => Promise<T>): Promise<T> {
  const result = nativeQueue.then(work, work);
  nativeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function publishDownloadQueue(): Promise<void> {
  const state: ModelDownloadState = {
    downloads: downloadItems.map((item) => ({ ...item })),
    updatedAt: Date.now(),
  };
  downloadStateWrite = downloadStateWrite
    .then(() => chrome.storage.local.set({ [LOCAL_MODEL_DOWNLOAD_STATE_KEY]: state }))
    .catch(() => undefined);
  return downloadStateWrite;
}

function clearPersistedDownloadQueue(): Promise<void> {
  downloadStateWrite = downloadStateWrite
    .then(() => chrome.storage.local.remove(LOCAL_MODEL_DOWNLOAD_STATE_KEY))
    .catch(() => undefined);
  return downloadStateWrite;
}

function requestModelDownload(modelId: ModelDownloadItem['modelId']): Promise<ModelStatusResponse> {
  const existing = downloadJobs.get(modelId);
  if (existing) return existing.promise;

  let resolveJob!: (status: ModelStatusResponse) => void;
  let rejectJob!: (error: Error) => void;
  const promise = new Promise<ModelStatusResponse>((resolve, reject) => {
    resolveJob = resolve;
    rejectJob = reject;
  });
  downloadJobs.set(modelId, { promise, resolve: resolveJob, reject: rejectJob });
  downloadItems.push({
    requestId: `queued-${Date.now()}-${downloadItems.length + 1}`,
    modelId,
    phase: 'queued',
    fraction: 0,
    updatedAt: Date.now(),
  });
  void publishDownloadQueue();
  void processDownloadQueue();
  return promise;
}

async function processDownloadQueue(): Promise<void> {
  if (processingDownloadQueue) return;
  processingDownloadQueue = true;
  try {
    while (true) {
      const item = downloadItems.find((candidate) => candidate.phase === 'queued');
      if (!item) return;
      const job = downloadJobs.get(item.modelId);
      if (!job) {
        downloadItems.splice(downloadItems.indexOf(item), 1);
        await publishDownloadQueue();
        continue;
      }
      try {
        const status = await enqueueNative(() =>
          downloadModel(
            item.modelId,
            async (started) => {
              Object.assign(item, started);
              await publishDownloadQueue();
            },
            (progress) => {
              if (progress.requestId !== item.requestId) return;
              Object.assign(item, progress);
              void publishDownloadQueue();
            },
          ),
        );
        job.resolve(status);
      } catch (error) {
        job.reject(error instanceof Error ? error : new Error(String(error)));
      } finally {
        downloadJobs.delete(item.modelId);
        downloadItems.splice(downloadItems.indexOf(item), 1);
        await publishDownloadQueue();
      }
    }
  } finally {
    processingDownloadQueue = false;
  }
}

export default defineBackground(() => {
  void loadCache();
  void migrateStorage();
  // A reload interrupts native messaging. Clear the old transient queue so it
  // cannot be rendered as active work by the newly started extension.
  downloadManagerReady = clearPersistedDownloadQueue();

  chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
    if (message.type === 'OPEN_POPUP') {
      chrome.action.openPopup().catch(() => undefined);
      return false;
    }
    if (message.type === 'GET_TRANSLATION_CONTEXT') {
      resolvePageContext().then(sendResponse, () => sendResponse(undefined));
      return true;
    }
    if (message.type === 'CLEAR_CACHE') {
      clearCache().then(
        () => sendResponse({ success: true }),
        () => sendResponse({ success: false }),
      );
      return true;
    }
    if (message.type === 'GET_MODEL_STATUS') {
      getModelStatus().then(
        (status) => sendResponse({ success: true, ...status }),
        (error) =>
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            errorCode: error instanceof NativeTranslationError ? error.code : 'runtime_error',
          }),
      );
      return true;
    }
    if (message.type === 'DOWNLOAD_MODEL') {
      void downloadManagerReady
        .then(() => requestModelDownload(message.modelId))
        .then(
          (status) => sendResponse({ success: true, ...status }),
          (error) => {
            const code = error instanceof NativeTranslationError ? error.code : 'runtime_error';
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              errorCode: code,
            });
          },
        );
      return true;
    }
    if (message.type === 'CACHE_LOOKUP') {
      handleCacheLookup(message.paragraphs, message.targetLang, message.context).then(
        sendResponse,
        () => sendResponse({ translations: [] }),
      );
      return true;
    }
    if (message.type === 'TRANSLATE_BATCH') {
      void enqueueNative(() =>
        handleTranslateBatch(
          message.paragraphs,
          message.mode,
          message.subtitleContext,
          message.sourceLang,
          message.targetLang,
          message.context,
        ),
      ).then(sendResponse, (error) => {
        const code = error instanceof NativeTranslationError ? error.code : 'runtime_error';
        sendResponse({
          translations: [],
          error: error instanceof Error ? error.message : String(error),
          errorCode: code,
          localHostError: !['invalid_output', 'input_too_long'].includes(code),
        });
      });
      return true;
    }
    return false;
  });
});

async function resolveTargetLang(messageTargetLang?: string): Promise<string> {
  if (messageTargetLang) return messageTargetLang;
  const data = await chrome.storage.local.get(LANG_STORAGE_KEY);
  return (data[LANG_STORAGE_KEY] as { target?: string } | undefined)?.target || DEFAULT_TARGET_LANG;
}

async function resolveSourceLang(): Promise<string> {
  const data = await chrome.storage.local.get(LANG_STORAGE_KEY);
  return (data[LANG_STORAGE_KEY] as { source?: string } | undefined)?.source || DEFAULT_SOURCE_LANG;
}

async function selectedModel(): Promise<ReturnType<typeof resolveSelectedModel>> {
  const data = await chrome.storage.local.get(SELECTED_MODEL_KEY);
  return resolveSelectedModel(data[SELECTED_MODEL_KEY] as string | undefined);
}

async function resolvePageContext(): Promise<TranslationContext> {
  const [sourceLang, targetLang, modelId] = await Promise.all([
    resolveSourceLang(),
    resolveTargetLang(),
    selectedModel(),
  ]);
  return buildTranslationContext(sourceLang, targetLang, 'page', modelId);
}

async function handleCacheLookup(
  paragraphs: { id: string; text: string }[],
  target?: string,
  context?: TranslationContext,
): Promise<CacheLookupResponse> {
  await loadCache();
  const effectiveContext = isValidPageContext(context) ? context : await resolvePageContext();
  const effectiveTarget = isValidPageContext(context)
    ? effectiveContext.targetLang
    : (target ?? effectiveContext.targetLang);
  const prefix = buildTranslationCachePrefix(
    effectiveContext.sourceLang,
    effectiveTarget,
    'page',
    effectiveContext.modelId,
  );
  return {
    translations: paragraphs.flatMap((paragraph) => {
      const translatedText = getCached(prefix + paragraph.text);
      return translatedText === null ? [] : [{ id: paragraph.id, translatedText }];
    }),
  };
}

async function handleTranslateBatch(
  paragraphs: { id: string; text: string }[],
  mode: TranslationRequestMode | undefined,
  subtitleContext: { original: string; translated: string }[] | undefined,
  sourceLang: string | undefined,
  targetLang: string | undefined,
  context?: TranslationContext,
): Promise<TranslateBatchResponse> {
  const effectiveMode = mode ?? 'page';
  const pageContext = effectiveMode === 'page' && isValidPageContext(context) ? context : null;
  const modelId = pageContext?.modelId ?? (await selectedModel());
  const effectiveTarget = pageContext?.targetLang ?? (await resolveTargetLang(targetLang));
  const effectiveSource = pageContext?.sourceLang ?? sourceLang ?? DEFAULT_SOURCE_LANG;
  const lang = { sourceLang: effectiveSource, targetLang: effectiveTarget };

  // Segment output includes positional context and is intentionally not shared
  // through the page cache; every other mode preserves the established cache.
  if (effectiveMode === 'segment') {
    return getEngine().translate(paragraphs, effectiveMode, subtitleContext, lang, modelId);
  }

  await loadCache();
  const prefix = buildTranslationCachePrefix(
    effectiveSource,
    effectiveTarget,
    effectiveMode,
    modelId,
  );
  const cached: { id: string; translatedText: string }[] = [];
  const uncached: { id: string; text: string }[] = [];
  for (const paragraph of paragraphs) {
    const hit = getCached(prefix + paragraph.text);
    if (hit === null) uncached.push(paragraph);
    else cached.push({ id: paragraph.id, translatedText: hit });
  }
  if (!uncached.length) return { translations: cached };

  const result = await getEngine().translate(
    uncached,
    effectiveMode,
    subtitleContext,
    lang,
    modelId,
  );
  const acceptedTranslations: { id: string; translatedText: string }[] = [];
  const invalidOutputs: { id: string; reason: string }[] = [];
  for (const translated of result.translations) {
    const original = uncached.find((paragraph) => paragraph.id === translated.id);
    if (!original) continue;
    const interpreted = interpretTranslationResponse(
      original.text,
      translated.translatedText,
      effectiveTarget,
      modelId,
    );
    if (!interpreted.accepted) {
      invalidOutputs.push({ id: translated.id, reason: interpreted.reason });
      continue;
    }
    const normalized = { id: translated.id, translatedText: interpreted.text };
    acceptedTranslations.push(normalized);
    setCached(prefix + original.text, normalized.translatedText);
  }
  void persistCache();
  return { translations: [...cached, ...acceptedTranslations], invalidOutputs };
}

function isValidPageContext(
  context: TranslationContext | undefined,
): context is TranslationContext {
  if (!context || context.version !== TRANSLATION_CONTEXT_VERSION || context.mode !== 'page') {
    return false;
  }
  return (
    context.fingerprint ===
    buildTranslationContext(context.sourceLang, context.targetLang, context.mode, context.modelId)
      .fingerprint
  );
}
