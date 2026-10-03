"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ProviderId, ProviderModel, CustomProviderSettings } from "@/lib/providers/types";
import { getProvider, toProviderModels, getCustomProviderLabel } from "@/lib/providers/registry";
import CategorizedModelSelector from "./CategorizedModelSelector";

interface ModelSelectorProps {
  provider: ProviderId;
  apiKey: string;
  selectedModel: string;
  onModelChange: (model: string) => void;
  mode?: "text-to-image" | "image-to-image";
  /** User-supplied endpoint settings, used when `provider` is "custom". */
  custom?: CustomProviderSettings;
  /**
   * Models from every configured provider, already tagged with the entry they
   * belong to. When provided the selector shows them all instead of querying
   * just the active provider.
   */
  allModels?: ProviderModel[];
}

export default function ModelSelector({
  provider,
  apiKey,
  selectedModel,
  onModelChange,
  mode = "text-to-image",
  custom,
  allModels,
}: ModelSelectorProps) {
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  // Custom providers are configured entirely from the settings modal, so their
  // model list is local - no need to ask the (unknown) server.
  const isCustom = provider === "custom";
  const customModels = useMemo(
    () => toProviderModels(custom?.models, getCustomProviderLabel(custom)),
    [custom]
  );

  // Multi-provider mode: the page hands over the merged list.
  const unifiedModels = useMemo(() => {
    if (!allModels || allModels.length === 0) return null;

    return mode === "image-to-image"
      ? allModels.filter((m) => m.capabilities?.imageToImage !== false)
      : allModels;
  }, [allModels, mode]);

  useEffect(() => {
    if (!unifiedModels) return;

    setLoading(false);
    setError(null);
    setIsLive(false);
    setModels(unifiedModels);

    if (unifiedModels.length > 0 && !unifiedModels.some((m) => m.id === selectedModel)) {
      onModelChange(unifiedModels[0].id);
    }
  }, [unifiedModels, selectedModel, onModelChange]);

  // Load models when provider or apiKey changes
  const loadModels = useCallback(async () => {
    setError(null);

    // The merged multi-provider list is already available - nothing to fetch.
    if (unifiedModels) return;

    if (isCustom) {
      setLoading(false);
      setIsLive(false);

      let nextModels = customModels;
      if (mode === "image-to-image") {
        nextModels = nextModels.filter((m) => m.capabilities?.imageToImage !== false);
      }
      setModels(nextModels);

      if (nextModels.length > 0) {
        const currentExists = nextModels.some((m) => m.id === selectedModel);
        if (!selectedModel || !currentExists) {
          onModelChange(nextModels[0].id);
        }
      }
      return;
    }

    setLoading(true);

    try {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers["x-api-key"] = apiKey;
      }

      const res = await fetch(`/api/models?provider=${provider}`, { headers });

      if (!res.ok) {
        throw new Error("Failed to load models");
      }

      const data = await res.json();
      let fetchedModels: ProviderModel[] = data.models || [];

      // Filter models based on mode capability
      if (mode === "image-to-image") {
        fetchedModels = fetchedModels.filter((m) => m.capabilities?.imageToImage !== false);
      }

      setModels(fetchedModels);
      setIsLive(data.source === "live");

      // Auto-select default model if none selected or current not in list
      if (fetchedModels.length > 0) {
        const currentModelExists = fetchedModels.some((m) => m.id === selectedModel);
        if (!selectedModel || !currentModelExists) {
          const defaultModel = data.defaultModel || fetchedModels[0].id;
          const modelToSelect = fetchedModels.find((m) => m.id === defaultModel)?.id || fetchedModels[0].id;
          onModelChange(modelToSelect);
        }
      }
    } catch (err) {
      console.error("Failed to load models:", err);
      setError("Could not load models");

      // Fallback to static models from registry
      try {
        const config = getProvider(provider);
        let staticModels = config.models;
        if (mode === "image-to-image") {
          staticModels = staticModels.filter((m) => m.capabilities?.imageToImage !== false);
        }
        setModels(staticModels);
        if (staticModels.length > 0 && !selectedModel) {
          onModelChange(config.defaultModel || staticModels[0].id);
        }
      } catch {
        // Provider not found, leave empty
      }
    } finally {
      setLoading(false);
    }
  }, [provider, apiKey, mode, selectedModel, onModelChange, isCustom, customModels, unifiedModels]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Loading state
  if (loading) {
    return (
      <div className="space-y-2">
        <span className="block text-[11px] font-semibold tracking-wide uppercase text-[var(--text-tertiary)]">
          Model
        </span>
        <div className="h-10 rounded-xl animate-pulse bg-[var(--bg-elevated)] border border-[var(--border-default)]" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="block text-[11px] font-semibold tracking-wide uppercase text-[var(--text-tertiary)]">
            Model
          </span>
          {provider === "openrouter" && apiKey && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 uppercase tracking-widest">
              OpenRouter Active
            </span>
          )}
          {isCustom && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--brand-soft-bg)] text-[var(--brand)] border border-[var(--border-default)] uppercase tracking-widest">
              Custom Endpoint
            </span>
          )}
        </div>
        {isLive && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            Live
          </span>
        )}
      </div>

      {models.length === 0 && isCustom ? (
        <div
          className="px-3 py-2.5 rounded-xl border text-xs"
          style={{ borderColor: "var(--border-default)", color: "var(--text-tertiary)" }}
        >
          No models configured. Add model IDs in Settings → Custom provider.
        </div>
      ) : (
        <CategorizedModelSelector
          models={models}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          disabled={models.length === 0}
        />
      )}

      {error && (
        <p className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1.5 mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 opacity-70" />
          {error} - Using cached models
        </p>
      )}
    </div>
  );
}