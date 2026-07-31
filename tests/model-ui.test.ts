import { beforeEach, describe, expect, it } from 'vitest';
import {
  modelDownloadUrl,
  populateModelSelect,
  renderModelInfoTable,
} from '@/entrypoints/popup/model-ui';

describe('popup local model UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '<select id="models"></select><div id="info"></div>';
  });
  it('renders exactly the six local model choices', () => {
    const select = document.getElementById('models') as HTMLSelectElement;
    populateModelSelect(select);
    expect(select.options).toHaveLength(6);
    expect(select.textContent).toContain('TranslateGemma 12B');
  });
  it('renders model family information without cloud pricing', () => {
    const info = document.getElementById('info') as HTMLElement;
    renderModelInfoTable(info);
    expect(info.textContent).toContain('Hy-MT2');
    expect(info.textContent).not.toContain('$');
  });
  it('links to the pinned model revision without exposing a Terminal command', () => {
    expect(modelDownloadUrl('hy-mt2-1.8b-q4')).toContain(
      'huggingface.co/mlx-community/Hy-MT2-1.8B-4bit/tree/e5c6fe56c7b3',
    );
  });
});
