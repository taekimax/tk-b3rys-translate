import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const popupCss = readFileSync(resolve(__dirname, '../entrypoints/popup/style.css'), 'utf-8');

describe('popup model download visibility', () => {
  it('does not let flex layout override hidden model panels', () => {
    expect(popupCss).toContain('.install-guide[hidden],\n.download-progress[hidden]');
    expect(popupCss).toContain('display: none;');
  });

  it('animates an active download without moving its measured progress value', () => {
    expect(popupCss).toContain('.download-progress.is-transferring .download-progress-bar::after');
    expect(popupCss).toContain('@keyframes download-transfer');
    expect(popupCss).toContain('prefers-reduced-motion: reduce');
  });
});
