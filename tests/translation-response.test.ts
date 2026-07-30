import { describe, expect, it } from 'vitest';
import { interpretTranslationResponse } from '@/utils/translation-response';

describe('local translation response interpreter', () => {
  it('accepts plain text and preserves punctuation and bullets', () => {
    const result = interpretTranslationResponse(
      'The first point is important.\nThe second point is useful.',
      '첫 번째 요점은 중요합니다.\n두 번째 요점은 유용합니다.',
      'ko',
      'hy-mt2-1.8b-q4',
    );

    expect(result).toEqual({
      accepted: true,
      text: '첫 번째 요점은 중요합니다.\n두 번째 요점은 유용합니다.',
      repairs: [],
    });
  });

  it('repairs outer whitespace, line endings, and a standalone label line', () => {
    const result = interpretTranslationResponse(
      'A short source sentence.',
      '\uFEFF\r\nTranslation:\r\n짧은 원문 문장입니다.\r\n',
      'ko',
      'hy-mt2-1.8b-q4',
    );

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.text).toBe('짧은 원문 문장입니다.');
      expect(result.repairs).toEqual(['line_endings', 'outer_whitespace', 'label_line']);
    }
  });

  it('repairs escaped newlines only when they match the source structure', () => {
    const result = interpretTranslationResponse(
      'First line.\nSecond line.',
      '첫 번째 줄입니다.\\n두 번째 줄입니다.',
      'ko',
      'translategemma-4b-it-q4',
    );

    expect(result).toEqual({
      accepted: true,
      text: '첫 번째 줄입니다.\n두 번째 줄입니다.',
      repairs: ['literal_newlines'],
    });
  });

  it('strips an exact terminal marker but rejects interior markers', () => {
    const accepted = interpretTranslationResponse(
      'A source sentence.',
      '원문을 번역했습니다.<end_of_turn>',
      'ko',
      'translategemma-4b-it-q4',
    );
    const rejected = interpretTranslationResponse(
      'A source sentence.',
      '원문<end_of_turn>을 번역했습니다.',
      'ko',
      'translategemma-4b-it-q4',
    );

    expect(accepted).toEqual({
      accepted: true,
      text: '원문을 번역했습니다.',
      repairs: ['terminal_marker'],
    });
    expect(rejected).toEqual({ accepted: false, reason: 'interior_control_marker' });
  });

  it('rejects ambiguous wrappers, same-line labels, source echo, and wrong scripts', () => {
    expect(
      interpretTranslationResponse('A source sentence.', 'Translation: 번역문입니다.', 'ko'),
    ).toEqual({ accepted: false, reason: 'same_line_label' });
    expect(
      interpretTranslationResponse(
        'This is a sufficiently long source sentence.',
        '{"text":"번역"}',
        'ko',
      ),
    ).toEqual({ accepted: false, reason: 'json_wrapper' });
    expect(
      interpretTranslationResponse(
        'This is a sufficiently long source sentence.',
        '```번역```',
        'ko',
      ),
    ).toEqual({ accepted: false, reason: 'markup_wrapper' });
    expect(
      interpretTranslationResponse(
        'This is a sufficiently long source sentence.',
        'This is a sufficiently long source sentence.',
        'ko',
      ),
    ).toEqual({ accepted: false, reason: 'source_echo' });
    expect(
      interpretTranslationResponse(
        'This is a sufficiently long source sentence.',
        'This is still mostly English text.',
        'ko',
      ),
    ).toEqual({ accepted: false, reason: 'wrong_target_script' });
  });

  it('rejects a line-break mismatch instead of inventing structure', () => {
    expect(
      interpretTranslationResponse('First line.\nSecond line.', '한 줄로 합쳐졌습니다.', 'ko'),
    ).toEqual({ accepted: false, reason: 'line_break_mismatch' });
  });
});
