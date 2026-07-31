import type { TranslateResult, TranslationEngine } from './types';
import type { ModelDownloadState, ModelStatusResponse, LocalModelStatus } from '../messaging';

const HOST_NAME = 'com.b3rys.translate.local_mlx';

interface NativeTranslationResponse {
  requestId: string;
  translations?: { id: string; translatedText: string }[];
  error?: { code: string; message: string };
  modelRoot?: string;
  models?: LocalModelStatus[];
  event?: string;
  download?: { modelId: string; fraction: number };
}

export class NativeTranslationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'NativeTranslationError';
    this.code = code;
  }
}

let port: chrome.runtime.Port | null = null;
let nextRequestId = 0;
const pending = new Map<
  string,
  { resolve: (value: NativeTranslationResponse) => void; reject: (reason: Error) => void }
>();
const downloadProgressListeners = new Set<(progress: ModelDownloadState) => void>();

function connect(): chrome.runtime.Port {
  if (port) return port;
  port = chrome.runtime.connectNative(HOST_NAME);
  port.onMessage.addListener((message: NativeTranslationResponse) => {
    if (message.event === 'model_download_progress' && message.download) {
      const progress = message.download;
      for (const listener of downloadProgressListeners) {
        listener({
          requestId: message.requestId,
          modelId: progress.modelId as ModelDownloadState['modelId'],
          fraction: progress.fraction,
          updatedAt: Date.now(),
        });
      }
      return;
    }
    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId);
    request.resolve(message);
  });
  port.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message || 'Local MLX host disconnected.';
    for (const request of pending.values()) request.reject(new Error(reason));
    pending.clear();
    port = null;
  });
  return port;
}

export function onModelDownloadProgress(
  listener: (progress: ModelDownloadState) => void,
): () => void {
  downloadProgressListeners.add(listener);
  return () => downloadProgressListeners.delete(listener);
}

function sendNative(message: Record<string, unknown>): Promise<NativeTranslationResponse> {
  const requestId = String(message.requestId);
  return new Promise<NativeTranslationResponse>((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    try {
      connect().postMessage(message);
    } catch (error) {
      pending.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export const localMlxEngine: TranslationEngine = {
  translate(paragraphs, mode, subtitleContext, lang, modelId) {
    const requestId = `local-${Date.now()}-${++nextRequestId}`;
    return sendNative({
      type: 'translate',
      requestId,
      modelId,
      paragraphs,
      mode,
      subtitleContext,
      sourceLang: lang.sourceLang,
      targetLang: lang.targetLang,
    }).then((response): TranslateResult => {
      if (response.error)
        throw new NativeTranslationError(response.error.code, response.error.message);
      return { translations: response.translations ?? [] };
    });
  },
};

export async function getModelStatus(): Promise<ModelStatusResponse> {
  const requestId = `model-status-${Date.now()}-${++nextRequestId}`;
  const response = await sendNative({ type: 'model_status', requestId });
  if (response.error) throw new NativeTranslationError(response.error.code, response.error.message);
  if (!response.modelRoot || !response.models) {
    throw new NativeTranslationError('invalid_response', 'Local host returned no model status.');
  }
  return { modelRoot: response.modelRoot, models: response.models };
}
