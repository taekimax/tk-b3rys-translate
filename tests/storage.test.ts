import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_STORAGE_KEY, LANG_STORAGE_KEY } from '@/utils/constants';
import { migrateStorage } from '@/utils/storage';
import { setupChromeMock } from './helpers/chrome-mock';

describe('storage namespace migration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('copies legacy cache and language settings before removing old keys', async () => {
    const mock = setupChromeMock({
      localStorage: {
        b3rys_translation_cache: {
          entries: [['source', { translatedText: '번역', timestamp: 1 }]],
        },
        b3rys_language_pair: { source: 'en', target: 'ko' },
        b3rys_usage_stats: { requests: 1 },
      },
      syncStorage: { legacySetting: true },
    });

    await migrateStorage();

    expect(mock.local._data.get(CACHE_STORAGE_KEY)).toEqual({
      entries: [['source', { translatedText: '번역', timestamp: 1 }]],
    });
    expect(mock.local._data.get(LANG_STORAGE_KEY)).toEqual({ source: 'en', target: 'ko' });
    expect(mock.local._data.has('b3rys_translation_cache')).toBe(false);
    expect(mock.local._data.has('b3rys_language_pair')).toBe(false);
    expect(mock.local._data.has('b3rys_usage_stats')).toBe(false);
    expect(mock.sync._data.size).toBe(0);
  });
});
