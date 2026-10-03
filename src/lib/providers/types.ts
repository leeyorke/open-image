// Provider IDs - only CORS-enabled providers for client-side execution
export type ProviderId =
  | "openrouter"
  | "google-ai-studio"
  | "fal"
  | "custom";

/**
 * Which OpenAI-compatible endpoint a custom provider exposes.
 *
 * - "images": POST {baseUrl}/images/generations (text-to-image)
 *             POST {baseUrl}/images/edits      (image-to-image, multipart)
 * - "chat":   POST {baseUrl}/chat/completions  with multimodal content parts,
 *             used by image-capable chat models (Gemini / GPT-image style).
 */
/**
 * Which wire protocol the endpoint speaks.
 *
 * "images" / "chat" are the generic OpenAI-compatible shapes. "dashscope"
 * and "modelscope" exist because those vendors do not fit either one:
 * DashScope's China region has no /images/generations at all, and ModelScope
 * answers with a task handle that has to be polled.
 */
export type CustomApiMode = "images" | "chat" | "dashscope" | "modelscope";

// Model capabilities
export interface ModelCapabilities {
  textToImage: boolean;
  imageToImage: boolean;
  aspectRatios?: string[];
  maxImages?: number;
}

/** Grouping label used by the categorized model dropdown. */
export interface ModelCategory {
  name: string;
  iconId: string;
}

// Model definition
export interface ProviderModel {
  id: string;
  name: string;
  description?: string;
  capabilities: ModelCapabilities;
  /**
   * Grouping override for providers that do not namespace model IDs with a
   * "/vendor/" prefix - keeps their models in one named group.
   */
  category?: ModelCategory;
  /** Group key. Defaults to the segment before the first "/". */
  categoryId?: string;
  /**
   * Which `ProviderEntry` this model came from. Set when the selector merges
   * models from every configured provider; combined with the model id it
   * forms the selector value.
   */
  providerEntryId?: string;
  pricing?: {
    perImage?: number;
    perRequest?: number;
  };
}

// Provider configuration
export interface ProviderConfig {
  id: ProviderId;
  name: string;
  description: string;
  category: "image" | "video" | "both";
  apiKeyPlaceholder: string;
  apiKeyPrefix?: string;
  helpUrl: string;
  helpText: string;
  baseUrl: string;
  supportsModelListing: boolean;
  defaultModel?: string;
  models: ProviderModel[];
  comingSoon?: boolean;
}

/**
 * Where a custom provider request is sent from.
 *
 * - "direct": straight from the browser to the endpoint. The API key never
 *   leaves the browser, but the endpoint must pass CORS (including the
 *   preflight for Authorization / Content-Type).
 * - "server": through this app's /api/generate route. Works with any endpoint
 *   regardless of CORS, at the cost of the key transiting the app server.
 */
export type CustomTransport = "direct" | "server";

// A single model entry configured by the user for a custom provider.
export interface CustomModelEntry {
  id: string;
  name?: string;
  /** Whether the model accepts reference images (image-to-image). */
  imageToImage?: boolean;
}

/**
 * User-supplied configuration for an OpenAI-compatible endpoint.
 * Stored (encrypted) inside the API config in localStorage.
 */
/** How image-to-image passes the reference image(s) in "images" mode. */
export type CustomEditStyle =
  /**
   * Top-level `image` field on /images/generations (default). This is what
   * OpenAI-compatible gateways - including Alibaba Cloud DashScope
   * workspaces - actually implement.
   */
  | "inline"
  /** multipart/form-data to /images/edits, the true OpenAI shape. */
  | "multipart";

export interface CustomProviderSettings {
  /** Friendly label shown in the UI, e.g. "My Local LLM". */
  displayName?: string;
  /** Base URL including the version segment, e.g. "https://api.example.com/v1". */
  baseUrl: string;
  /** Which endpoint shape the server speaks. Defaults to "images". */
  apiMode: CustomApiMode;
  /** Where requests are sent from. Defaults to "direct". */
  transport?: CustomTransport;
  /**
   * Reference-image transport for image-to-image. Defaults to "inline",
   * which is what OpenAI-compatible endpoints actually accept.
   */
  editStyle?: CustomEditStyle;
  /** Models offered in the model selector. */
  models: CustomModelEntry[];
  /**
   * Image size sent to the API. "auto" (or empty) derives a size from the
   * selected aspect ratio. Any other value is passed through verbatim,
   * e.g. "1024x1024".
   */
  size?: string;
  /** Additional headers, e.g. { "api-key": "..." } for Azure-style gateways. */
  extraHeaders?: Record<string, string>;
  /**
   * Extra headers sent only when polling an asynchronous task. Known endpoint
   * requirements are applied automatically; these take precedence.
   */
  taskHeaders?: Record<string, string>;
  /**
   * Milliseconds between polls when the endpoint answers with a task handle
   * instead of images. Defaults to 2500.
   */
  pollIntervalMs?: number;
  /**
   * How long to wait for an asynchronous task before giving up. Defaults to
   * 55000, which fits inside the /api/generate maxDuration.
   */
  pollTimeoutMs?: number;
}

// API Key configuration stored in localStorage
export interface ApiKeyConfig {
  provider: ProviderId;
  apiKey: string;
  selectedModel?: string;
  /** Only set when `provider` is "custom". */
  custom?: CustomProviderSettings;
}

/**
 * One configured provider.
 *
 * A user can configure any number of these - several OpenRouter keys, several
 * custom endpoints, or a mix. `id` is stable and unique within the config so
 * the model selector can route a selected model back to the right entry.
 */
export interface ProviderEntry {
  id: string;
  provider: ProviderId;
  /** Label shown in the UI. Falls back to the provider's own name. */
  label?: string;
  apiKey: string;
  /** Only present when `provider` is "custom". */
  custom?: CustomProviderSettings;
}

/** The whole persisted application configuration. */
export interface AppConfig {
  version: number;
  /** Entry used for generation. Null when nothing is configured yet. */
  activeProviderId: string | null;
  providers: ProviderEntry[];
}

/** Current config schema version written to disk. */
export const APP_CONFIG_VERSION = 1;

/** Separator between a provider entry id and a model id in the model selector. */
export const MODEL_REF_SEPARATOR = "::";

// Generation request
export interface GenerateRequest {
  prompt: string;
  aspectRatio: string;
  model: string;
  apiKey: string;
  provider: ProviderId;
  mode: "text-to-image" | "image-to-image";
  referenceImages?: string[];
  numberOfImages?: number;
  /** Custom endpoint settings, required when `provider` is "custom". */
  custom?: CustomProviderSettings;
}

// Generation result
export interface GenerateResult {
  images: string[];
  model: string;
  provider: ProviderId;
}

// Models API response
export interface ModelsResponse {
  models: ProviderModel[];
  source: "live" | "static";
}