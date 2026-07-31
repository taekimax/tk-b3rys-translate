import { describe, expect, it } from 'vitest';
import { MAX_SENTENCES_PER_TRANSLATION, splitIntoSentenceChunks } from '@/utils/sentence-chunks';

describe('splitIntoSentenceChunks', () => {
  it('keeps a five-sentence request intact', () => {
    const text = 'One. Two. Three. Four. Five.';

    expect(splitIntoSentenceChunks(text)).toEqual([text]);
  });

  it('splits a long block into five-sentence model requests', () => {
    const text = 'One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten. Eleven.';

    expect(splitIntoSentenceChunks(text)).toEqual([
      'One. Two. Three. Four. Five.',
      'Six. Seven. Eight. Nine. Ten.',
      'Eleven.',
    ]);
  });

  it('handles CJK sentence punctuation without requiring spaces', () => {
    expect(
      splitIntoSentenceChunks(
        '첫째입니다.둘째입니다!셋째인가요?넷째입니다。다섯째입니다！여섯째입니다？',
      ),
    ).toEqual([
      '첫째입니다. 둘째입니다! 셋째인가요? 넷째입니다。 다섯째입니다！',
      '여섯째입니다？',
    ]);
  });

  it('treats unpunctuated text as one sentence', () => {
    expect(splitIntoSentenceChunks('A heading without terminal punctuation')).toEqual([
      'A heading without terminal punctuation',
    ]);
  });

  it('rejects an invalid sentence limit', () => {
    expect(() => splitIntoSentenceChunks('One.', 0)).toThrow('positive integer');
    expect(MAX_SENTENCES_PER_TRANSLATION).toBe(5);
  });
});
