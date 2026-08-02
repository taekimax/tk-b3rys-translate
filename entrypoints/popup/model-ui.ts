import { getModelConfig, MODEL_CATALOG, type ModelId } from '@/utils/models';
import type { LocalModelStatus } from '@/utils/messaging';
import type { UiLanguage } from '@/utils/constants';
import { uiText } from '@/utils/ui-language';

export function populateModelSelect(select: HTMLSelectElement): void {
  select.replaceChildren();
  for (const model of MODEL_CATALOG) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.label;
    select.appendChild(option);
  }
}

export function renderModelInfoTable(container: HTMLElement, language: UiLanguage = 'ko'): void {
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const heading = document.createElement('tr');
  for (const key of [
    'tableModel',
    'tableFamily',
    'tableSize',
    'tableSource',
    'tableLicense',
  ] as const) {
    const cell = document.createElement('th');
    cell.textContent = uiText(key, language);
    heading.appendChild(cell);
  }
  head.appendChild(heading);
  const body = document.createElement('tbody');
  for (const model of MODEL_CATALOG) {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = model.label;
    const family = document.createElement('td');
    family.textContent = model.family;
    const size = document.createElement('td');
    size.textContent = model.approximateSize;
    size.title = model.copyright;
    const source = document.createElement('td');
    const sourceLink = document.createElement('a');
    sourceLink.href = modelDownloadUrl(model.id);
    sourceLink.target = '_blank';
    sourceLink.rel = 'noreferrer';
    sourceLink.textContent = `${model.repository.split('/')[1]} @ ${model.revision.slice(0, 7)}`;
    sourceLink.title = `${model.repository}@${model.revision}`;
    source.appendChild(sourceLink);
    const license = document.createElement('td');
    const licenseLink = document.createElement('a');
    licenseLink.href = model.licenseUrl;
    licenseLink.target = '_blank';
    licenseLink.rel = 'noreferrer';
    licenseLink.textContent = model.license;
    licenseLink.title = `${model.copyright} · ${model.approximateSize}`;
    license.appendChild(licenseLink);
    row.append(name, family, size, source, license);
    body.appendChild(row);
  }
  table.append(head, body);
  container.replaceChildren(table);
}

export function modelDownloadUrl(modelId: ModelId): string {
  const model = getModelConfig(modelId);
  return `https://huggingface.co/${model.repository}/tree/${model.revision}`;
}

export function findModelStatus(
  models: readonly LocalModelStatus[] | undefined,
  modelId: ModelId,
): LocalModelStatus | undefined {
  return models?.find((model) => model.id === modelId);
}
