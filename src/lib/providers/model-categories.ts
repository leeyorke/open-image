import type { ModelCategory } from "./types";

// Model category definitions for categorized dropdowns
export const MODEL_CATEGORIES: Record<string, ModelCategory> = {
  "google": { name: "Google", iconId: "google" },
  "black-forest-labs": { name: "Black Forest Labs", iconId: "bfl" },
  "openai": { name: "OpenAI", iconId: "openai" },
  "bytedance-seed": { name: "ByteDance", iconId: "bytedance" },
  "ideogram-ai": { name: "Ideogram", iconId: "ideogram" },
  "recraft-ai": { name: "Recraft", iconId: "recraft" },
  "fal-ai": { name: "fal.ai", iconId: "fal" },
  "sourceful": { name: "Other", iconId: "other" },
};

export type CategoryInfo = ModelCategory;

const OTHER: CategoryInfo = { name: "Other", iconId: "other" };

// Get category info from model ID (e.g., "google/gemini-2.5-flash" -> { name: "Google", iconId: "google" })
export function getModelCategory(modelId: string): CategoryInfo {
  const prefix = modelId.split("/")[0];
  return MODEL_CATEGORIES[prefix] || OTHER;
}

// Extract display price from model description (e.g., "~$0.039/img" -> "$0.04" or "$0.003")
export function extractPriceFromDescription(description?: string): string | null {
  if (!description) return null;

  // Match patterns like ~$0.039/img, $0.03/img, ~$0.134/img, ~$0.003
  const match = description.match(/~?\$(\d+\.?\d*)/);
  if (match) {
    const price = parseFloat(match[1]);

    // If the price is very small (less than a cent), show up to 4 decimal places without trailing zeros
    if (price > 0 && price < 0.01) {
      return `$${parseFloat(price.toFixed(4))}`;
    }

    // Otherwise round to 2 decimal places for display
    return `$${price.toFixed(2)}`;
  }
  return null;
}

// Check if model is free tier
export function isFreeModel(modelId: string): boolean {
  return modelId.includes(":free");
}

export interface ModelWithCategory {
  id: string;
  name: string;
  description?: string;
  capabilities?: {
    textToImage?: boolean;
    imageToImage?: boolean;
  };
  /**
   * Grouping override. Providers that do not namespace model IDs with a
   * "/vendor/" prefix (the custom OpenAI-compatible endpoint, for example)
   * set this so their models land in one named group instead of "Other".
   */
  category?: ModelCategory;
  /** Group key. Defaults to the segment before the first "/". */
  categoryId?: string;
}

export interface GroupedCategory {
  categoryId: string;
  categoryInfo: CategoryInfo;
  models: ModelWithCategory[];
}

/** Group key for a model: explicit override, else the ID prefix. */
export function getModelCategoryId(model: Pick<ModelWithCategory, "id" | "categoryId">): string {
  return model.categoryId ?? model.id.split("/")[0];
}

/** Category info for a model, honouring an explicit override. */
export function getModelCategoryInfo(
  model: Pick<ModelWithCategory, "id" | "categoryId" | "category">
): CategoryInfo {
  if (model.category) return model.category;

  const categoryId = getModelCategoryId(model);
  return MODEL_CATEGORIES[categoryId] || OTHER;
}

// Group models by their category prefix
export function groupModelsByCategory<T extends ModelWithCategory>(models: T[]): GroupedCategory[] {
  const groups = new Map<string, { categoryInfo: CategoryInfo; models: T[] }>();

  for (const model of models) {
    const categoryId = getModelCategoryId(model);
    const categoryInfo = getModelCategoryInfo(model);

    if (!groups.has(categoryId)) {
      groups.set(categoryId, { categoryInfo, models: [] });
    }
    groups.get(categoryId)!.models.push(model);
  }

  // Convert to array and maintain order based on MODEL_CATEGORIES keys
  const categoryOrder = Object.keys(MODEL_CATEGORIES);
  const result: GroupedCategory[] = [];

  // First add categories in defined order
  for (const categoryId of categoryOrder) {
    const group = groups.get(categoryId);
    if (group) {
      result.push({
        categoryId,
        categoryInfo: group.categoryInfo,
        models: group.models,
      });
      groups.delete(categoryId);
    }
  }

  // Then add any remaining categories (not in MODEL_CATEGORIES)
  for (const [categoryId, group] of groups) {
    result.push({
      categoryId,
      categoryInfo: group.categoryInfo,
      models: group.models,
    });
  }

  return result;
}