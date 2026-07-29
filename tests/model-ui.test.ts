import { beforeEach, describe, expect, it } from 'vitest';
import { populateModelSelect, renderModelInfoTable } from '@/entrypoints/popup/model-ui';

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
});
