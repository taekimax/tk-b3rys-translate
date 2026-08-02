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
import {
  DEFAULT_MODEL_ID,
  isPublicModel,
  requiresModelTermsAcceptance,
  SELECTED_MODEL_KEY,
  resolveSelectedModel,
  TRANSLATEGEMMA_TERMS_ACCEPTED_KEY,
  TRANSLATEGEMMA_TERMS_VERSION,
  type ModelId,
} from '@/utils/models';
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
import { splitIntoSentenceChunks } from '@/utils/sentence-chunks';
import { SerialPriorityQueue, type QueuePriority } from '@/utils/serial-priority-queue';

// Native MLX generation is intentionally single-file: a host owns one resident
// model and every extension request is ordered through this queue. This avoids
// duplicate model loads and Metal memory spikes from page + selection + YouTube.
// A reader's explicit retry is the only priority lane; it still never overlaps
// the request that is currently using the resident model.
const nativeQueue = new SerialPriorityQueue();
let downloadManagerReady: Promise<void> = Promise.resolve();
let processingDownloadQueue = false;
const downloadStatePublishIntervalMs = 5_000;
let downloadStatePublishTimer: ReturnType<typeof setTimeout> | undefined;
let downloadStatePublishing = false;
let downloadStatePublishQueued = false;
let downloadStatePublishedAt = 0;
let downloadStatePublishWaiters: Array<() => void> = [];
const downloadItems: ModelDownloadItem[] = [];
const downloadJobs = new Map<
  ModelDownloadItem['modelId'],
  {
    promise: Promise<ModelStatusResponse>;
    resolve: (status: ModelStatusResponse) => void;
    reject: (error: Error) => void;
  }
>();
function enqueueNative<T>(work: () => Promise<T>, priority: QueuePriority = 'normal'): Promise<T> {
  return nativeQueue.enqueue(work, priority);
}

function currentDownloadQueueState(): ModelDownloadState {
  return {
    downloads: downloadItems.map((item) => ({ ...item })),
    updatedAt: Date.now(),
  };
}

function resolveDownloadStatePublishWaiters(waiters: Array<() => void>): void {
  for (const resolve of waiters) resolve();
}

function scheduleDownloadQueuePublish(): void {
  if (downloadStatePublishing || downloadStatePublishTimer !== undefined) return;
  const delay = Math.max(
    0,
    downloadStatePublishIntervalMs - (Date.now() - downloadStatePublishedAt),
  );
  downloadStatePublishTimer = setTimeout(() => {
    downloadStatePublishTimer = undefined;
    void flushDownloadQueuePublish();
  }, delay);
}

async function flushDownloadQueuePublish(): Promise<void> {
  if (downloadStatePublishing || !downloadStatePublishQueued) return;
  downloadStatePublishQueued = false;
  downloadStatePublishing = true;
  const waiters = downloadStatePublishWaiters;
  downloadStatePublishWaiters = [];
  const state: ModelDownloadState = {
    ...currentDownloadQueueState(),
  };
  try {
    await chrome.storage.local.set({ [LOCAL_MODEL_DOWNLOAD_STATE_KEY]: state });
  } catch {
    // The popup treats a missing transient state as inactive and will refresh.
  } finally {
    downloadStatePublishedAt = Date.now();
    downloadStatePublishing = false;
    resolveDownloadStatePublishWaiters(waiters);
  }
  if (downloadStatePublishQueued) scheduleDownloadQueuePublish();
}

/**
 * The native downloader can report byte progress every 100ms. Persist only the
 * newest state at most once every five seconds so Chrome storage never accumulates
 * an old progress backlog that makes the popup lag behind the actual transfer.
 */
function publishDownloadQueue(): Promise<void> {
  downloadStatePublishQueued = true;
  const published = new Promise<void>((resolve) => downloadStatePublishWaiters.push(resolve));
  scheduleDownloadQueuePublish();
  return published;
}

async function clearPersistedDownloadQueue(): Promise<void> {
  if (downloadStatePublishTimer !== undefined) {
    clearTimeout(downloadStatePublishTimer);
    downloadStatePublishTimer = undefined;
  }
  downloadStatePublishQueued = false;
  resolveDownloadStatePublishWaiters(downloadStatePublishWaiters);
  downloadStatePublishWaiters = [];
  try {
    await chrome.storage.local.remove(LOCAL_MODEL_DOWNLOAD_STATE_KEY);
  } catch {
    // A storage failure must not block the native-host queue.
  }
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
  // Complete the namespace migration before loading the cache so an existing
  // installation does not race the copy and start with an empty in-memory map.
  void migrateStorage().then(
    () => loadCache(),
    () => loadCache(),
  );
  // A reload interrupts native messaging. Clear the old transient queue so it
  // cannot be rendered as active work by the newly started extension.
  downloadManagerReady = clearPersistedDownloadQueue();

  chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
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
      if (!isPublicModel(message.modelId)) {
        sendResponse({
          success: false,
          error: 'This model is not enabled in the public catalog.',
          errorCode: 'model_not_available',
        });
        return false;
      }
      void downloadManagerReady
        .then(async () => {
          if (!(await hasModelAccess(message.modelId))) {
            sendResponse({
              success: false,
              error: 'Accept the TranslateGemma terms before downloading this model.',
              errorCode: 'terms_required',
            });
            return undefined;
          }
          return requestModelDownload(message.modelId);
        })
        .then(
          (status) => {
            if (status) sendResponse({ success: true, ...status });
          },
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
      void enqueueNative(
        () =>
          handleTranslateBatch(
            message.paragraphs,
            message.mode,
            message.subtitleContext,
            message.sourceLang,
            message.targetLang,
            message.context,
            createProgressReporter(sender),
          ),
        message.priority === 'user' ? 'user' : 'normal',
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

function createProgressReporter(
  sender: chrome.runtime.MessageSender,
): (progress: {
  blockId: string;
  completedChunks: number;
  totalChunks: number;
  translatedText: string;
}) => void {
  const tabId = sender.tab?.id;
  const frameId = sender.frameId;
  if (tabId === undefined) return () => {};

  return (progress) => {
    if (progress.totalChunks < 2) return;
    void chrome.tabs
      .sendMessage(tabId, { type: 'TRANSLATION_PROGRESS', ...progress }, { frameId })
      .catch(() => {});
  };
}

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
  const model = resolveSelectedModel(data[SELECTED_MODEL_KEY] as string | undefined);
  return (await hasModelAccess(model)) ? model : DEFAULT_MODEL_ID;
}

async function hasModelAccess(modelId: ModelId | string | undefined): Promise<boolean> {
  if (!isPublicModel(modelId)) return false;
  if (!requiresModelTermsAcceptance(modelId)) return true;
  const data = await chrome.storage.local.get(TRANSLATEGEMMA_TERMS_ACCEPTED_KEY);
  return data[TRANSLATEGEMMA_TERMS_ACCEPTED_KEY] === TRANSLATEGEMMA_TERMS_VERSION;
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
  if (!(await hasModelAccess(effectiveContext.modelId))) return { translations: [] };
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
  onProgress?: (progress: {
    blockId: string;
    completedChunks: number;
    totalChunks: number;
    translatedText: string;
  }) => void,
): Promise<TranslateBatchResponse> {
  const effectiveMode = mode ?? 'page';
  const pageContext = effectiveMode === 'page' && isValidPageContext(context) ? context : null;
  const modelId = pageContext?.modelId ?? (await selectedModel());
  const effectiveTarget = pageContext?.targetLang ?? (await resolveTargetLang(targetLang));
  const effectiveSource = pageContext?.sourceLang ?? sourceLang ?? DEFAULT_SOURCE_LANG;
  const lang = { sourceLang: effectiveSource, targetLang: effectiveTarget };

  if (!(await hasModelAccess(modelId))) {
    return {
      translations: [],
      error: 'Accept the TranslateGemma terms before using this model.',
      errorCode: 'terms_required',
    };
  }

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

  const result = await translateInSentenceChunks(
    uncached,
    effectiveMode,
    subtitleContext,
    lang,
    modelId,
    effectiveTarget,
    onProgress,
  );
  const acceptedTranslations: { id: string; translatedText: string }[] = [];
  for (const translated of result.translations) {
    const original = uncached.find((paragraph) => paragraph.id === translated.id)!;
    acceptedTranslations.push(translated);
    setCached(prefix + original.text, translated.translatedText);
  }
  void persistCache();
  return {
    translations: [...cached, ...acceptedTranslations],
    invalidOutputs: result.invalidOutputs,
  };
}

async function translateInSentenceChunks(
  paragraphs: { id: string; text: string }[],
  mode: TranslationRequestMode,
  subtitleContext: { original: string; translated: string }[] | undefined,
  lang: { sourceLang: string; targetLang: string },
  modelId: ReturnType<typeof resolveSelectedModel>,
  targetLang: string,
  onProgress?: (progress: {
    blockId: string;
    completedChunks: number;
    totalChunks: number;
    translatedText: string;
  }) => void,
): Promise<{
  translations: { id: string; translatedText: string }[];
  invalidOutputs: { id: string; reason: string }[];
}> {
  const translations: { id: string; translatedText: string }[] = [];
  const invalidOutputs: { id: string; reason: string }[] = [];

  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    const chunks = splitIntoSentenceChunks(paragraph.text);
    if (!chunks.length) {
      invalidOutputs.push({ id: paragraph.id, reason: 'empty_input' });
      continue;
    }

    const translatedChunks: string[] = [];
    let invalidReason: string | undefined;
    for (const [chunkIndex, text] of chunks.entries()) {
      const chunkId = `__web_translate_chunk_${paragraphIndex}_${chunkIndex}`;
      const result = await getEngine().translate(
        [{ id: chunkId, text }],
        mode,
        subtitleContext,
        lang,
        modelId,
      );
      const translated = result.translations.find((item) => item.id === chunkId);
      if (!translated) {
        invalidReason = 'missing_output';
        break;
      }
      const interpreted = interpretTranslationResponse(
        text,
        translated.translatedText,
        targetLang,
        modelId,
      );
      if (!interpreted.accepted) {
        invalidReason = interpreted.reason;
        break;
      }
      translatedChunks.push(interpreted.text);
      onProgress?.({
        blockId: paragraph.id,
        completedChunks: translatedChunks.length,
        totalChunks: chunks.length,
        translatedText: translatedChunks.join(' '),
      });
    }

    if (invalidReason) {
      invalidOutputs.push({ id: paragraph.id, reason: invalidReason });
      continue;
    }
    translations.push({ id: paragraph.id, translatedText: translatedChunks.join(' ') });
  }
  return { translations, invalidOutputs };
}

function isValidPageContext(
  context: TranslationContext | undefined,
): context is TranslationContext {
  if (
    !context ||
    !isPublicModel(context.modelId) ||
    context.version !== TRANSLATION_CONTEXT_VERSION ||
    context.mode !== 'page'
  ) {
    return false;
  }
  return (
    context.fingerprint ===
    buildTranslationContext(context.sourceLang, context.targetLang, context.mode, context.modelId)
      .fingerprint
  );
}
