/**
 * Model references that stay unique when several providers are merged into a
 * single dropdown.
 *
 * A plain model id is not enough: two configured endpoints can both offer
 * `qwen-image`, and the selector has to know which one is meant. Selector
 * values are therefore `entryId::modelId`.
 */

import {
  MODEL_REF_SEPARATOR,
  type AppConfig,
  type ProviderEntry,
  type ProviderModel,
} from "./types";

/** Build the selector value for a model belonging to a provider entry. */
export function modelRef(entryId: string, modelId: string): string {
  return `${entryId}${MODEL_REF_SEPARATOR}${modelId}`;
}

/** Split a selector value back into its provider entry id and model id. */
export function parseModelRef(ref: string): {
  entryId: string | null;
  modelId: string;
} {
  const index = ref.indexOf(MODEL_REF_SEPARATOR);

  if (index === -1) return { entryId: null, modelId: ref };

  const entryId = ref.slice(0, index);
  const modelId = ref.slice(index + MODEL_REF_SEPARATOR.length);

  return entryId && modelId ? { entryId, modelId } : { entryId: null, modelId: ref };
}

/** Find the provider entry a selector value belongs to. */
export function findEntryForRef(
  config: AppConfig | null,
  ref: string
): { entry: ProviderEntry; modelId: string } | null {
  const { entryId, modelId } = parseModelRef(ref);

  if (!entryId || !config) return null;

  const entry = config.providers.find((p) => p.id === entryId);
  return entry ? { entry, modelId } : null;
}

/**
 * Tag a model list with the entry it came from, group it under that entry's
 * name, and rewrite its id into a globally unique `entryId::modelId` reference.
 */
export function attributeModelsToEntry(
  models: ProviderModel[],
  entry: ProviderEntry,
  groupName: string,
  iconId: string
): ProviderModel[] {
  return models.map((model) => ({
    ...model,
    id: modelRef(entry.id, model.id),
    providerEntryId: entry.id,
    category: { name: groupName, iconId },
    categoryId: entry.id,
  }));
}