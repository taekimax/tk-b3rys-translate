import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TextBlock } from '@/types';
import {
  purgeAllTranslations,
  sortBlocksByPagePriority,
  translatePage,
} from '@/entrypoints/content/translator';
import { DATA_ATTRS } from '@/utils/constants';
import { buildTranslationContext } from '@/utils/translation-context';

function block(element: HTMLElement, id: string, text: string): TextBlock {
  element.setAttribute(DATA_ATTRS.BLOCK_ID, id);
  return { id, element, text, html: text };
}

function rect(top: number, height = 30): DOMRect {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 400,
    width: 400,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('page translation scheduling', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    purgeAllTranslations();
  });

  it('prioritizes visible main-content blocks without excluding peripheral blocks', () => {
    const main = document.createElement('main');
    const article = document.createElement('p');
    article.textContent = 'Article paragraph';
    const side = document.createElement('p');
    side.textContent = 'Sidebar paragraph';
    main.appendChild(article);
    document.body.append(main, side);

    vi.spyOn(article, 'getBoundingClientRect').mockReturnValue(rect(100));
    vi.spyOn(side, 'getBoundingClientRect').mockReturnValue(rect(80));

    const ordered = sortBlocksByPagePriority([
      block(side, 'side', 'Sidebar paragraph'),
      block(article, 'article', 'Article paragraph'),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(['article', 'side']);
    expect(ordered).toHaveLength(2);
  });

  it('dispatches and injects one page block at a time', async () => {
    const main = document.createElement('main');
    const first = document.createElement('p');
    first.textContent = 'First article paragraph contains enough words.';
    const second = document.createElement('p');
    second.textContent = 'Second article paragraph contains enough words.';
    main.append(first, second);
    document.body.appendChild(main);

    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(rect(100));
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(rect(180));

    const context = buildTranslationContext('en', 'ko', 'page', 'gemma4-e4b-q4');
    const sendMessage = vi.fn();
    const responses: ((response: unknown) => void)[] = [];
    sendMessage.mockImplementation((message: { type: string; paragraphs?: TextBlock[] }) => {
      if (message.type === 'GET_TRANSLATION_CONTEXT') return Promise.resolve(context);
      if (message.type === 'CACHE_LOOKUP') return Promise.resolve({ translations: [] });
      if (message.type === 'TRANSLATE_BATCH') {
        return new Promise((resolve) => responses.push(resolve));
      }
      return Promise.resolve(undefined);
    });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: { local: { get: vi.fn(), set: vi.fn() } },
    });

    const progress: number[] = [];
    const pass = translatePage((completed) => progress.push(completed));
    await vi.waitFor(() => expect(responses).toHaveLength(1));
    expect(
      sendMessage.mock.calls.filter(([message]) => message.type === 'TRANSLATE_BATCH'),
    ).toHaveLength(1);
    expect(first.querySelector(`[${DATA_ATTRS.TRANSLATED}]`)).toBeNull();

    responses.shift()!({
      translations: [{ id: first.getAttribute(DATA_ATTRS.BLOCK_ID), translatedText: '첫 문단' }],
    });
    await vi.waitFor(() =>
      expect(first.querySelector(`[${DATA_ATTRS.TRANSLATED}]`)).not.toBeNull(),
    );
    await vi.waitFor(() => expect(responses).toHaveLength(1));
    expect(second.querySelector(`[${DATA_ATTRS.TRANSLATED}]`)).toBeNull();

    responses.shift()!({
      translations: [{ id: second.getAttribute(DATA_ATTRS.BLOCK_ID), translatedText: '둘째 문단' }],
    });
    await expect(pass).resolves.toBe('done');
    expect(second.querySelector(`[${DATA_ATTRS.TRANSLATED}]`)).not.toBeNull();
    expect(progress).toEqual([1, 2]);
  });
});
