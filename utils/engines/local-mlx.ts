import type { TranslateResult, TranslationEngine } from './types';

const HOST_NAME = 'com.b3rys.translate.local_mlx';

interface NativeTranslationResponse {
  requestId: string;
  translations?: { id: string; translatedText: string }[];
  error?: { code: string; message: string };
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
  { resolve: (value: TranslateResult) => void; reject: (reason: Error) => void }
>();

function connect(): chrome.runtime.Port {
  if (port) return port;
  port = chrome.runtime.connectNative(HOST_NAME);
  port.onMessage.addListener((message: NativeTranslationResponse) => {
    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId);
    if (message.error)
      request.reject(new NativeTranslationError(message.error.code, message.error.message));
    else request.resolve({ translations: message.translations ?? [] });
  });
  port.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message || 'Local MLX host disconnected.';
    for (const request of pending.values()) request.reject(new Error(reason));
    pending.clear();
    port = null;
  });
  return port;
}

export const localMlxEngine: TranslationEngine = {
  translate(paragraphs, mode, subtitleContext, lang, modelId) {
    const requestId = `local-${Date.now()}-${++nextRequestId}`;
    return new Promise<TranslateResult>((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      try {
        connect().postMessage({
          type: 'translate',
          requestId,
          modelId,
          paragraphs,
          mode,
          subtitleContext,
          sourceLang: lang.sourceLang,
          targetLang: lang.targetLang,
        });
      } catch (error) {
        pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  },
};
