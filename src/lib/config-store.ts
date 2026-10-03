"use client";

/**
 * Client-side access to the persisted application configuration.
 *
 * The source of truth is `~/.openllmpix/config.json` via `/api/config`.
 * localStorage is only used to migrate an existing single-provider setup, and
 * as a fallback when the route is unavailable (e.g. a static export).
 */

import {
  APP_CONFIG_VERSION,
  type ApiKeyConfig,
  type AppConfig,
  type ProviderEntry,
  type ProviderId,
} from "./providers/types";

const LEGACY_STORAGE_KEY = "api_config_v2";
const LEGACY_STORAGE_KEY_V1 = "api_config";
const FALLBACK_STORAGE_KEY = "openllmpix_config_v1";

export interface LoadResult {
  config: AppConfig | null;
  /** True when the config came from (or fell back to) the browser. */
  localOnly: boolean;
}

/** Stable id for a new entry. */
export function createEntryId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `p_${Date.now().toString(36)}${random}`;
}

/** Human-readable label for an entry, falling back to the provider name. */
export function entryLabel(
  entry: ProviderEntry,
  providerName?: string
): string {
  const explicit = entry.label?.trim();
  if (explicit) return explicit;

  if (entry.provider === "custom") {
    return entry.custom?.displayName?.trim() || "Custom endpoint";
  }

  return providerName || entry.provider;
}

/** Find the entry currently selected for generation. */
export function getActiveEntry(config: AppConfig | null): ProviderEntry | null {
  if (!config || config.providers.length === 0) return null;

  return (
    config.providers.find((p) => p.id === config.activeProviderId) ??
    config.providers[0] ??
    null
  );
}

/** Convert a legacy single-slot config into the new list shape. */
export function migrateLegacyConfig(legacy: ApiKeyConfig): AppConfig {
  const entry: ProviderEntry = {
    id: createEntryId(),
    provider: legacy.provider,
    apiKey: legacy.apiKey ?? "",
  };

  if (legacy.custom) entry.custom = legacy.custom;
  if (legacy.provider === "custom" && !entry.label && legacy.custom?.displayName) {
    entry.label = legacy.custom.displayName;
  }

  return {
    version: APP_CONFIG_VERSION,
    activeProviderId: entry.id,
    providers: [entry],
  };
}

/** Read the pre-existing encrypted localStorage config, if any. */
async function readLegacyFromStorage(): Promise<ApiKeyConfig | null> {
  if (typeof window === "undefined") return null;

  try {
    for (const key of [LEGACY_STORAGE_KEY, LEGACY_STORAGE_KEY_V1]) {
      const stored = localStorage.getItem(key);
      if (!stored) continue;

      const parsed = JSON.parse(stored);

      if (parsed?.encrypted && parsed.data) {
        const { decrypt, isCryptoAvailable } = await import("./crypto");
        if (!isCryptoAvailable()) return null;

        return JSON.parse(await decrypt(parsed.data)) as ApiKeyConfig;
      }

      if (parsed && typeof parsed === "object") return parsed as ApiKeyConfig;
    }
  } catch {
    /* unreadable legacy data is not fatal */
  }

  return null;
}

function readFallback(): AppConfig | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(FALLBACK_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as AppConfig) : null;
  } catch {
    return null;
  }
}

/**
 * Load the configuration, migrating the old single-provider setup on first run.
 */
export async function loadAppConfig(): Promise<LoadResult> {
  let config: AppConfig | null = null;

  try {
    const response = await fetch("/api/config", { cache: "no-store" });

    if (response.ok) {
      const data = (await response.json()) as { config?: AppConfig };
      config = data.config ?? null;
    }
  } catch {
    /* no server route - fall through to the browser copy */
  }

  if (config && config.providers.length > 0) {
    return { config, localOnly: false };
  }

  // Nothing on disk yet: import the old localStorage setup, if any.
  const legacy = await readLegacyFromStorage();

  if (legacy?.provider) {
    const migrated = migrateLegacyConfig(legacy);

    await saveAppConfig(migrated);

    return { config: migrated, localOnly: false };
  }

  const fallback = readFallback();

  return {
    config: fallback ?? config ?? null,
    localOnly: Boolean(fallback),
  };
}

/**
 * Persist the configuration.
 *
 * Prefers the config file. If that is unreachable the config is kept in
 * localStorage so the app still works as a static export.
 */
export async function saveAppConfig(config: AppConfig): Promise<{ localOnly: boolean }> {
  try {
    const response = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });

    if (response.ok) {
      if (typeof window !== "undefined") {
        localStorage.removeItem(FALLBACK_STORAGE_KEY);
        // The migrated source is no longer needed.
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY_V1);
      }

      return { localOnly: false };
    }
  } catch {
    /* fall through to the browser copy */
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(config));
  }

  return { localOnly: true };
}

/** Apply an update to the provider list, keeping `activeProviderId` valid. */
export function withProviders(
  config: AppConfig,
  providers: ProviderEntry[],
  activeProviderId?: string | null
): AppConfig {
  const nextActive =
    activeProviderId !== undefined
      ? activeProviderId
      : providers.some((p) => p.id === config.activeProviderId)
        ? config.activeProviderId
        : (providers[0]?.id ?? null);

  return { version: APP_CONFIG_VERSION, activeProviderId: nextActive, providers };
}

/** Convert the active entry back to the legacy shape used by helpers. */
export function toLegacyConfig(entry: ProviderEntry | null): ApiKeyConfig | null {
  if (!entry) return null;

  const legacy: ApiKeyConfig = {
    provider: entry.provider as ProviderId,
    apiKey: entry.apiKey,
  };

  if (entry.custom) legacy.custom = entry.custom;

  return legacy;
}