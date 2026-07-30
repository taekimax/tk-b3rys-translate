import type { TranslationRequestMode } from './translation-types';
import type { TranslationContext } from './translation-context';

export interface GetTranslationContextRequest {
  type: 'GET_TRANSLATION_CONTEXT';
  mode?: 'page';
}

export interface TranslateBatchRequest {
  type: 'TRANSLATE_BATCH';
  paragraphs: { id: string; text: string }[];
  mode?: TranslationRequestMode;
  subtitleContext?: { original: string; translated: string }[];
  sourceLang?: string;
  targetLang?: string;
  context?: TranslationContext;
}

export interface TranslateBatchResponse {
  translations: { id: string; translatedText: string }[];
  error?: string;
  errorCode?: string;
  invalidOutputs?: { id: string; reason: string }[];
  localHostError?: boolean;
}

export interface ToggleTranslationMessage {
  type: 'TOGGLE_TRANSLATION';
  enabled: boolean;
}

export interface ToggleFloatingButtonMessage {
  type: 'TOGGLE_FLOATING_BUTTON';
  visible: boolean;
}

export interface ToggleYtButtonMessage {
  type: 'TOGGLE_YT_BUTTON';
  visible: boolean;
}

export interface ToggleTranslationModeMessage {
  type: 'TOGGLE_TRANSLATION_MODE';
  mode: 'parallel' | 'replace';
}

export interface ToggleAutoTranslateMessage {
  type: 'TOGGLE_AUTO_TRANSLATE';
  enabled: boolean;
}

/**
 * Pure cache read — no API call, no rate-limit slot, no usage stats.
 * Lets the content script paint cached paragraphs instantly and send
 * only the misses through TRANSLATE_BATCH.
 */
export interface CacheLookupRequest {
  type: 'CACHE_LOOKUP';
  paragraphs: { id: string; text: string }[];
  targetLang?: string;
  context?: TranslationContext;
}

export interface CacheLookupResponse {
  translations: { id: string; translatedText: string }[];
}

export interface OpenPopupRequest {
  type: 'OPEN_POPUP';
}

export interface ClearCacheRequest {
  type: 'CLEAR_CACHE';
}

export interface ClearCacheResponse {
  success: boolean;
}

export type BackgroundMessage =
  | TranslateBatchRequest
  | CacheLookupRequest
  | GetTranslationContextRequest
  | OpenPopupRequest
  | ClearCacheRequest;
export type ContentMessage =
  | ToggleTranslationMessage
  | ToggleFloatingButtonMessage
  | ToggleYtButtonMessage
  | ToggleTranslationModeMessage
  | ToggleAutoTranslateMessage;
