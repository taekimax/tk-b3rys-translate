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

  it('explicitly notices a missing selected model and offers automatic download', async () => {
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
      expect(document.getElementById('model-install-title')?.textContent).toContain(
        'Hy-MT2 1.8B (Q4) 모델을 다운로드할까요?',
      );
      expect(document.getElementById('download-selected-model')?.textContent).toContain(
        '다운로드 시작',
      );
      expect(document.getElementById('model-install-command')).toBeNull();
    });
  });

  it('starts a native automatic download only after the user clicks Download model', async () => {
    const status = {
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
    };
    const mock = setupChromeMock({ localStorage: { selectedModel: 'hy-mt2-1.8b-q4' } });
    mock.sendMessage.mockResolvedValue(status);
    await import('@/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const button = document.getElementById('download-selected-model') as HTMLButtonElement;
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    button.click();
    await vi.waitFor(() => {
      expect(mock.sendMessage).toHaveBeenCalledWith({
        type: 'DOWNLOAD_MODEL',
        modelId: 'hy-mt2-1.8b-q4',
      });
    });
  });

  it('lets the user queue another missing model while a download is pending', async () => {
    const status = {
      success: true,
      modelRoot: '/Users/test/Library/Application Support/b3rys-translate/models',
      models: [
        {
          id: 'hy-mt2-1.8b-q4',
          path: '/Users/test/Library/Application Support/b3rys-translate/models/hy-mt2-1.8b-q4/e5c6fe56c7b3bc77fae5ae92db31f2178f1e6912',
          ready: false,
          missingFiles: ['config.json', 'tokenizer.json', 'model.safetensors'],
        },
        {
          id: 'gemma4-e4b-q4',
          path: '/Users/test/Library/Application Support/b3rys-translate/models/gemma4-e4b-q4/475b9088d29754a3379866cf5aeb6b41acd313c2',
          ready: false,
          missingFiles: ['config.json', 'tokenizer.json', 'model.safetensors'],
        },
      ],
    };
    let finishDownload: (value: typeof status) => void = () => undefined;
    const pendingDownload = new Promise<typeof status>((resolve) => {
      finishDownload = resolve;
    });
    const mock = setupChromeMock({ localStorage: { selectedModel: 'hy-mt2-1.8b-q4' } });
    mock.sendMessage.mockImplementation((message) =>
      message.type === 'DOWNLOAD_MODEL' ? pendingDownload : Promise.resolve(status),
    );
    await import('@/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const select = document.getElementById('model-select') as HTMLSelectElement;
    const button = document.getElementById('download-selected-model') as HTMLButtonElement;
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    button.click();
    await vi.waitFor(() =>
      expect(mock.sendMessage).toHaveBeenCalledWith({
        type: 'DOWNLOAD_MODEL',
        modelId: 'hy-mt2-1.8b-q4',
      }),
    );
    expect(select.disabled).toBe(false);
    select.value = 'gemma4-e4b-q4';
    select.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(select.value).toBe('gemma4-e4b-q4'));
    expect(document.getElementById('model-install-title')?.textContent).toContain(
      'Gemma 4 E4B (Q4) 모델을 다운로드할까요?',
    );
    button.click();
    expect(mock.sendMessage).toHaveBeenCalledWith({
      type: 'DOWNLOAD_MODEL',
      modelId: 'gemma4-e4b-q4',
    });
    expect(mock.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'TRANSLATE_BATCH' }),
    );
    finishDownload(status);
  });

  it('shows active lazy-download progress for the selected model', async () => {
    const mock = setupChromeMock({
      localStorage: {
        selectedModel: 'hy-mt2-1.8b-q4',
        localModelDownloadState: {
          downloads: [
            {
              requestId: 'local-download-1',
              modelId: 'hy-mt2-1.8b-q4',
              phase: 'downloading',
              fraction: 0.42,
              bytesPerSecond: 1.5 * 1024 * 1024,
              updatedAt: Date.now(),
            },
          ],
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
        'Hy-MT2 1.8B (Q4) 다운로드 중 · 42%',
      );
      expect(document.getElementById('model-download-progress')?.hidden).toBe(false);
      expect((document.getElementById('model-download-bar') as HTMLElement).style.width).toBe(
        '42%',
      );
      expect(document.getElementById('local-host-status')?.textContent).toContain('1.5 MB/s');
      expect(document.getElementById('model-download-detail')?.textContent).toContain(
        '현재 대용량 파일을 받고 있습니다 · 1.5 MB/s',
      );
      expect(document.getElementById('model-download-progress')?.classList).toContain(
        'is-transferring',
      );
    });
  });

  it('shows stored download progress before a queued model-status request resolves', async () => {
    const mock = setupChromeMock({
      localStorage: {
        selectedModel: 'hy-mt2-1.8b-q4',
        localModelDownloadState: {
          downloads: [
            {
              requestId: 'local-download-queued',
              modelId: 'hy-mt2-1.8b-q4',
              phase: 'queued',
              fraction: 0,
              updatedAt: Date.now(),
            },
          ],
          updatedAt: Date.now(),
        },
      },
    });
    mock.sendMessage.mockReturnValue(new Promise(() => undefined));
    await import('@/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.waitFor(() => {
      expect(document.getElementById('local-host-status')?.textContent).toContain(
        'Hy-MT2 1.8B (Q4) 다운로드 대기 중 · 대기열 1번째',
      );
      const select = document.getElementById('model-select') as HTMLSelectElement;
      expect(select.disabled).toBe(false);
      expect(select.value).toBe('hy-mt2-1.8b-q4');
    });
  });

  it('does not render a stale legacy download marker for a ready model', async () => {
    const mock = setupChromeMock({
      localStorage: {
        selectedModel: 'translategemma-4b-it-q4',
        localModelDownloadState: {
          requestId: 'legacy-download',
          modelId: 'translategemma-4b-it-q4',
          fraction: 0,
          updatedAt: Date.now(),
        },
      },
    });
    mock.sendMessage.mockResolvedValue({
      success: true,
      modelRoot: '/Users/test/Library/Application Support/b3rys-translate/models',
      models: [
        {
          id: 'translategemma-4b-it-q4',
          path: '/Users/test/Library/Application Support/b3rys-translate/models/translategemma-4b-it-q4/5788ec08c047f3f2e17808101b8d9566ac930d58',
          ready: true,
          missingFiles: [],
        },
      ],
    });
    await import('@/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.waitFor(() => {
      expect(document.getElementById('local-host-status')?.textContent).toContain(
        '준비됨 · TranslateGemma 4B (Q4)',
      );
      expect((document.getElementById('model-install-guide') as HTMLDivElement).hidden).toBe(true);
      expect((document.getElementById('model-download-progress') as HTMLDivElement).hidden).toBe(
        true,
      );
    });
  });
});
