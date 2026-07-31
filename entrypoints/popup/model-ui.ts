import { getModelConfig, MODEL_CATALOG, type ModelId } from '@/utils/models';
import type { LocalModelStatus } from '@/utils/messaging';

export function populateModelSelect(select: HTMLSelectElement): void {
  select.replaceChildren();
  for (const model of MODEL_CATALOG) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.label;
    select.appendChild(option);
  }
}

export function renderModelInfoTable(container: HTMLElement): void {
  const table = document.createElement('table');
  const body = document.createElement('tbody');
  for (const model of MODEL_CATALOG) {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = model.label;
    const family = document.createElement('td');
    family.textContent = model.family;
    row.append(name, family);
    body.appendChild(row);
  }
  table.appendChild(body);
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
