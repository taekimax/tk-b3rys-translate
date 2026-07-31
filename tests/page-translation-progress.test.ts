import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TextBlock } from '@/types';
import {
  applyTranslationProgress,
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

  it('shows verified partial output, then lets only an invalid block retry', async () => {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'One. Two. Three. Four. Five. Six.';
    document.body.appendChild(paragraph);
    vi.spyOn(paragraph, 'getBoundingClientRect').mockReturnValue(rect(100));

    const context = buildTranslationContext('en', 'ko', 'page', 'gemma4-e4b-q4');
    const sendMessage = vi.fn((message: { type: string }) => {
      if (message.type === 'GET_TRANSLATION_CONTEXT') return Promise.resolve(context);
      if (message.type === 'CACHE_LOOKUP') return Promise.resolve({ translations: [] });
      if (message.type === 'TRANSLATE_BATCH') {
        return Promise.resolve({
          translations: [],
          invalidOutputs: [
            { id: paragraph.getAttribute(DATA_ATTRS.BLOCK_ID), reason: 'source_echo' },
          ],
        });
      }
      return Promise.resolve(undefined);
    });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: { local: { get: vi.fn(), set: vi.fn() } },
    });

    const pass = translatePage();
    await vi.waitFor(() => expect(paragraph.querySelector('.b3rys-error-retry')).not.toBeNull());
    expect(paragraph.textContent).toContain('원문이 그대로 반환되어');

    (paragraph.querySelector('.b3rys-error-retry') as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(
        sendMessage.mock.calls.filter(([message]) => message.type === 'TRANSLATE_BATCH'),
      ).toHaveLength(2),
    );
    expect(sendMessage.mock.calls.at(-1)?.[0]).toMatchObject({ priority: 'user' });
    await expect(pass).resolves.toBe('done');
  });

  it('renders verified partial output and still accepts the merged final result', async () => {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'One. Two. Three. Four. Five. Six.';
    document.body.appendChild(paragraph);
    vi.spyOn(paragraph, 'getBoundingClientRect').mockReturnValue(rect(100));

    const context = buildTranslationContext('en', 'ko', 'page', 'gemma4-e4b-q4');
    let resolveTranslation!: (response: unknown) => void;
    const sendMessage = vi.fn((message: { type: string }) => {
      if (message.type === 'GET_TRANSLATION_CONTEXT') return Promise.resolve(context);
      if (message.type === 'CACHE_LOOKUP') return Promise.resolve({ translations: [] });
      if (message.type === 'TRANSLATE_BATCH') {
        return new Promise((resolve) => {
          resolveTranslation = resolve;
        });
      }
      return Promise.resolve(undefined);
    });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: { local: { get: vi.fn(), set: vi.fn() } },
    });

    const pass = translatePage();
    await vi.waitFor(() =>
      expect(
        sendMessage.mock.calls.filter(([message]) => message.type === 'TRANSLATE_BATCH'),
      ).toHaveLength(1),
    );
    const blockId = paragraph.getAttribute(DATA_ATTRS.BLOCK_ID)!;

    applyTranslationProgress({
      blockId,
      completedChunks: 1,
      totalChunks: 2,
      translatedText: '하나. 둘. 셋. 넷. 다섯.',
    });
    expect(paragraph.querySelector(`[${DATA_ATTRS.TRANSLATED}]`)?.textContent).toContain(
      '하나. 둘',
    );
    expect(paragraph.querySelector('[data-b3rys-loader-label]')?.textContent).toContain('1/2');

    resolveTranslation({ translations: [{ id: blockId, translatedText: '완성된 번역입니다.' }] });
    await expect(pass).resolves.toBe('done');
    expect(paragraph.querySelector(`[${DATA_ATTRS.TRANSLATED}]`)?.textContent).toContain(
      '완성된 번역입니다.',
    );
  });
});
