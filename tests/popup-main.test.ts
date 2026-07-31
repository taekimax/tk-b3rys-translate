import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { setupChromeMock } from './helpers/chrome-mock';
import { SELECTED_MODEL_KEY } from '@/utils/models';

const popupHtml = readFileSync(resolve(__dirname, '../entrypoints/popup/index.html'), 'utf-8')
  .replace(/<link[\s\S]*?>/g, '')
  .replace(/<script[\s\S]*?<\/script>/g, '');
describe('popup local model wiring', () => {
  beforeEach(() => {
    vi.resetModules();
    document.documentElement.innerHTML = popupHtml;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.innerHTML = '';
  });
  it('restores and persists the selected local model', async () => {
    const mock = setupChromeMock({ localStorage: { selectedModel: 'hy-mt2-7b-q4' } });
    await import('@/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const select = document.getElementById('model-select') as HTMLSelectElement;
    await vi.waitFor(() => {
      expect(select.options).toHaveLength(6);
      expect(select.value).toBe('hy-mt2-7b-q4');
    });
    select.value = 'gemma4-e4b-q4';
    select.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(mock.local._data.get(SELECTED_MODEL_KEY)).toBe('gemma4-e4b-q4'));
  });

  it('shows a guided install command when the selected model is missing', async () => {
    const mock = setupChromeMock({ localStorage: { selectedModel: 'hy-mt2-1.8b-q4' } });
    mock.sendMessage.mockResolvedValue({
      success: true,
      modelRoot: '/Users/test/Library/Application Support/b3rys-translate/models',
      models: [
        {
          id: 'hy-mt2-1.8b-q4',
          path: '/Users/test/Library/Application Support/b3rys-translate/models/hy-mt2-1.8b-q4/e5c6fe56c7b3bc77fae5ae92db31f2178f1e6912',
          ready: false,
          missingFiles: ['config.json', 'tokenizer.json', 'model.safetensors'],
        },
      ],
    });
    await import('@/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.waitFor(() => {
      const guide = document.getElementById('model-install-guide') as HTMLDivElement;
      expect(guide.hidden).toBe(false);
      expect(document.getElementById('model-install-command')?.textContent).toContain(
        'hf download mlx-community/Hy-MT2-1.8B-4bit',
      );
    });
  });

  it('shows active lazy-download progress for the selected model', async () => {
    const mock = setupChromeMock({
      localStorage: {
        selectedModel: 'hy-mt2-1.8b-q4',
        localModelDownloadState: {
          requestId: 'local-download-1',
          modelId: 'hy-mt2-1.8b-q4',
          fraction: 0.42,
          updatedAt: Date.now(),
        },
      },
    });
    mock.sendMessage.mockResolvedValue({
      success: true,
      modelRoot: '/Users/test/Library/Application Support/b3rys-translate/models',
      models: [
        {
          id: 'hy-mt2-1.8b-q4',
          path: '/Users/test/Library/Application Support/b3rys-translate/models/hy-mt2-1.8b-q4/e5c6fe56c7b3bc77fae5ae92db31f2178f1e6912',
          ready: false,
          missingFiles: ['config.json', 'tokenizer.json', 'model.safetensors'],
        },
      ],
    });
    await import('@/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.waitFor(() => {
      expect(document.getElementById('local-host-status')?.textContent).toContain(
        'Downloading Hy-MT2 1.8B (Q4)… 42%',
      );
    });
  });

  it('shows stored download progress before a queued model-status request resolves', async () => {
    const mock = setupChromeMock({
      localStorage: {
        selectedModel: 'hy-mt2-1.8b-q4',
        localModelDownloadState: {
          requestId: 'local-download-queued',
          modelId: 'hy-mt2-1.8b-q4',
          fraction: 0.07,
          updatedAt: Date.now(),
        },
      },
    });
    mock.sendMessage.mockReturnValue(new Promise(() => undefined));
    await import('@/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.waitFor(() => {
      expect(document.getElementById('local-host-status')?.textContent).toContain(
        'Downloading Hy-MT2 1.8B (Q4)… 7%',
      );
    });
  });
});
