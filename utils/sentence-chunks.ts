export const MAX_SENTENCES_PER_TRANSLATION = 5;

type SentenceSegmenter = {
  segment(text: string): Iterable<{ segment: string }>;
};

type SentenceSegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: 'sentence' },
) => SentenceSegmenter;

function sentenceSegments(text: string): string[] {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: SentenceSegmenterConstructor }).Segmenter;
  if (Segmenter) {
    return Array.from(
      new Segmenter(undefined, { granularity: 'sentence' }).segment(text),
      ({ segment }) => segment.trim(),
    ).filter(Boolean);
  }

  // Chrome has Intl.Segmenter, but retain a conservative fallback for older
  // runtimes. It keeps terminal punctuation with its sentence and also works
  // for CJK text without an intervening space.
  return (
    text.match(
      /[^.!?\u2026\u3002\uFF01\uFF1F]+[.!?\u2026\u3002\uFF01\uFF1F]*|[.!?\u2026\u3002\uFF01\uFF1F]+/gu,
    ) ?? []
  )
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Produce model-safe text units containing no more than `maximum` sentences.
 * Whitespace between source sentences is normalized only at the request
 * boundary; the page's original DOM is never modified.
 */
export function splitIntoSentenceChunks(
  text: string,
  maximum = MAX_SENTENCES_PER_TRANSLATION,
): string[] {
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new Error('maximum must be a positive integer');
  }

  const sentences = sentenceSegments(text);
  if (!sentences.length) return text.trim() ? [text.trim()] : [];

  const chunks: string[] = [];
  for (let index = 0; index < sentences.length; index += maximum) {
    chunks.push(sentences.slice(index, index + maximum).join(' '));
  }
  return chunks;
}
