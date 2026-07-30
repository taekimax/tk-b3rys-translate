import type { ModelId } from './models';

export type TranslationRepair =
  | 'line_endings'
  | 'outer_whitespace'
  | 'terminal_marker'
  | 'label_line'
  | 'literal_newlines';

export type TranslationInterpretation =
  | { accepted: true; text: string; repairs: TranslationRepair[] }
  | { accepted: false; reason: string };

const TERMINAL_MARKERS = [
  '<end_of_turn>',
  '<eos>',
  '<turn|>',
  '<|turn>',
  '<|eos|>',
  '<|extra_5|>',
  '<｜hy_place▁holder▁no▁2｜>',
] as const;

const LABELS = new Set(['translation:', 'korean:', '한국어 번역:', 'translated text:']);

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function trimOuter(value: string): string {
  return value.replace(/^\uFEFF/, '').trim();
}

function lineBreakCount(value: string): number {
  return (value.match(/\n/g) ?? []).length;
}

function hasDisallowedControl(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a) || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
}

function isCompleteJsonContainer(value: string): boolean {
  if (!/^(?:\[|\{)/.test(value)) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

function hasMarkupWrapper(value: string): boolean {
  return /^```/.test(value) || /```$/.test(value) || /<\/?[A-Za-z][^>]*>/.test(value);
}

function targetScriptLooksPlausible(value: string, targetLang: string): boolean {
  const normalizedTarget = targetLang.toLowerCase().replace('_', '-');
  const letters = [...value].filter((char) => /\p{L}/u.test(char));
  if (letters.length < 12) return true;

  if (normalizedTarget === 'ko' || normalizedTarget.startsWith('ko-')) {
    const hangul = [...value].filter((char) => /[\u1100-\u11ff\uac00-\ud7ff]/u.test(char)).length;
    return hangul >= 2 && hangul / letters.length >= 0.15;
  }
  if (normalizedTarget === 'zh' || normalizedTarget.startsWith('zh-')) {
    const han = [...value].filter((char) => /[\u3400-\u9fff]/u.test(char)).length;
    return han >= 2 && han / letters.length >= 0.15;
  }
  if (normalizedTarget === 'ja' || normalizedTarget.startsWith('ja-')) {
    return [...value].some((char) => /[\u3040-\u30ff]/u.test(char));
  }
  return true;
}

function sourceWasEchoed(source: string, value: string): boolean {
  const normalizedSource = source.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const normalizedValue = value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return normalizedSource.length >= 20 && normalizedSource === normalizedValue;
}

function reject(reason: string): TranslationInterpretation {
  return { accepted: false, reason };
}

/**
 * Interpret a local model's plain-text response without another model call.
 * Repairs are deliberately allowlisted; ambiguous wrappers are rejected so
 * malformed text cannot be cached and silently reappear on later pages.
 */
export function interpretTranslationResponse(
  sourceText: string,
  rawOutput: string,
  targetLang: string,
  modelId?: ModelId,
): TranslationInterpretation {
  const source = normalizeLineEndings(sourceText);
  const original = rawOutput;
  let value = normalizeLineEndings(rawOutput);
  const repairs: TranslationRepair[] = [];
  const terminalMarkers = modelId?.startsWith('translategemma')
    ? ['<end_of_turn>', '<eos>']
    : modelId === 'hy-mt2-1.8b-q4'
      ? ['<｜hy_place▁holder▁no▁2｜>']
      : modelId === 'hy-mt2-7b-q4'
        ? ['<|eos|>', '<|extra_5|>']
        : TERMINAL_MARKERS;

  if (value !== original) repairs.push('line_endings');
  const trimmed = trimOuter(value);
  if (trimmed !== value) repairs.push('outer_whitespace');
  value = trimmed;
  if (!value) return reject('empty_output');
  if (hasDisallowedControl(value)) return reject('control_character');

  for (const marker of terminalMarkers) {
    if (value.endsWith(marker)) {
      value = trimOuter(value.slice(0, -marker.length));
      repairs.push('terminal_marker');
      break;
    }
  }
  if (!value) return reject('empty_after_terminal_marker');
  if (TERMINAL_MARKERS.some((marker) => value.includes(marker))) {
    return reject('interior_control_marker');
  }

  const firstLineEnd = value.indexOf('\n');
  const firstLine = (firstLineEnd < 0 ? value : value.slice(0, firstLineEnd)).trim();
  const normalizedFirstLine = firstLine.toLocaleLowerCase();
  if (LABELS.has(normalizedFirstLine)) {
    value = trimOuter(value.slice(firstLineEnd + 1));
    repairs.push('label_line');
  } else if ([...LABELS].some((label) => normalizedFirstLine.startsWith(`${label} `))) {
    return reject('same_line_label');
  }
  if (!value) return reject('empty_after_label');

  const sourceBreaks = lineBreakCount(source);
  const outputBreaks = lineBreakCount(value);
  const literalBreaks = (value.match(/\\n/g) ?? []).length;
  if (sourceBreaks > 0 && outputBreaks === 0 && literalBreaks === sourceBreaks) {
    value = value.replace(/\\n/g, '\n');
    repairs.push('literal_newlines');
  }
  if (sourceBreaks > 0 && lineBreakCount(value) !== sourceBreaks) {
    return reject('line_break_mismatch');
  }

  if (isCompleteJsonContainer(value)) return reject('json_wrapper');
  if (hasMarkupWrapper(value)) return reject('markup_wrapper');
  if (sourceWasEchoed(source, value)) return reject('source_echo');
  if (!targetScriptLooksPlausible(value, targetLang)) return reject('wrong_target_script');

  const maximumLength = Math.max(512, source.length * 8 + 256);
  if (value.length > maximumLength) return reject('unexpected_expansion');

  return { accepted: true, text: value, repairs };
}
