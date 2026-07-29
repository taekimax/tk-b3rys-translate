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
});
