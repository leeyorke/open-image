/**
 * Helpers for talking to an arbitrary OpenAI-compatible endpoint.
 *
 * Kept free of DOM-only assumptions so both the browser adapter and the
 * server routes can reuse the normalization rules.
 */

import type { CustomProviderSettings } from "./types";

/**
 * Turn whatever the user pasted into a usable base URL.
 *
 * Accepts:
 *   https://api.example.com/v1
 *   https://api.example.com/v1/
 *   https://api.example.com/v1/chat/completions   (endpoint pasted by mistake)
 *   api.example.com/v1                            (missing scheme)
 */
export function normalizeBaseUrl(input: string): string {
  let url = (input || "").trim();

  if (!url) return "";

  // Strip a pasted endpoint path back to the version root. DashScope's native
  // generation path is included because it is long enough to get pasted by
  // accident when copying a curl example.
  url = url.replace(
    /\/(chat\/completions|images\/(generations|edits)|services\/aigc\/multimodal-generation\/generation)\/?$/i,
    ""
  );

  // Default to https when no scheme was provided.
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  // Drop trailing slashes and whitespace.
  return url.replace(/\/+$/, "").trim();
}

/** Validate a base URL well enough to fail fast before a network round-trip. */
export function isValidBaseUrl(input: string): boolean {
  const normalized = normalizeBaseUrl(input);
  if (!normalized) return false;

  try {
    const url = new URL(normalized);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Aspect ratio -> pixel size used by OpenAI-compatible image endpoints. */
const ASPECT_TO_SIZE: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1792x1024",
  "9:16": "1024x1792",
  "4:3": "1152x864",
  "3:4": "864x1152",
};

/**
 * Resolve the `size` parameter for a request.
 *
 * An explicit, non-"auto" override always wins so users can target providers
 * that only accept a fixed set of sizes (or none at all).
 */
export function resolveImageSize(
  aspectRatio: string,
  override?: string
): string | undefined {
  const explicit = (override || "").trim();

  if (explicit && explicit.toLowerCase() !== "auto") {
    return explicit;
  }

  return ASPECT_TO_SIZE[aspectRatio] ?? ASPECT_TO_SIZE["1:1"];
}

/**
 * Build the header set for an OpenAI-compatible request.
 *
 * Pass `{ json: false }` for multipart uploads, where the browser has to set
 * Content-Type itself so it can add the form boundary.
 */
export function buildAuthHeaders(
  apiKey: string,
  extraHeaders?: Record<string, string>,
  options?: { json?: boolean }
): Record<string, string> {
  const headers: Record<string, string> = { ...(extraHeaders ?? {}) };

  if (options?.json !== false) {
    headers["Content-Type"] = "application/json";
  }

  const key = (apiKey || "").trim();
  if (key) {
    headers["Authorization"] = `Bearer ${key}`;
  }

  return headers;
}

/** Build the endpoint URL for a given mode. */
export function buildEndpointUrl(
  baseUrl: string,
  mode: "images" | "chat",
  operation: "generate" | "edit"
): string {
  const base = normalizeBaseUrl(baseUrl);

  if (mode === "chat") return `${base}/chat/completions`;
  if (operation === "edit") return `${base}/images/edits`;

  return `${base}/images/generations`;
}

/** Polling cadence used when a provider returns a task handle instead of images. */
export const DEFAULT_POLL_INTERVAL_MS = 2500;
export const DEFAULT_POLL_TIMEOUT_MS = 55_000;

/**
 * URL of the task-status endpoint for an asynchronous provider.
 * ModelScope and friends expose it at `{baseUrl}/tasks/{task_id}`.
 */
export function buildTaskUrl(baseUrl: string, taskId: string): string {
  return `${normalizeBaseUrl(baseUrl)}/tasks/${encodeURIComponent(taskId)}`;
}

/** Path appended for Alibaba Cloud DashScope's native generation endpoint. */
const DASHSCOPE_GENERATION_PATH = "/services/aigc/multimodal-generation/generation";

/**
 * URL of DashScope's native multimodal generation endpoint.
 *
 * The China region only serves `/chat/completions` and `/embeddings` under
 * `/compatible-mode/v1`; images must go to `/api/v1/services/aigc/...`.
 */
export function buildDashScopeUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}${DASHSCOPE_GENERATION_PATH}`;
}

/**
 * Convert `1024x1024` to DashScope's `1024*1024`.
 *
 * The OpenAI-compatible mode uses `x`; the native one uses `*`. Left alone,
 * the native endpoint answers "size format should be W*H".
 */
export function toDashScopeSize(size: string | undefined): string | undefined {
  if (!size) return undefined;
  if (!size.includes("x")) return size;

  return size.replace(/x/gi, "*");
}

/** DashScope's async switch, sent on both create and poll requests. */
export const DASHSCOPE_ASYNC_HEADER = "X-DashScope-Async";
export const DASHSCOPE_ASYNC_VALUE = "enable";

/** ModelScope's task-type header, applied by default for that mode. */
export const MODELSCOPE_TASK_HEADER = "X-ModelScope-Task-Type";
export const MODELSCOPE_TASK_VALUE = "image_generation";

/**
 * Polling quirks that are the endpoint's fault, not the user's.
 *
 * ModelScope keys its task store by type and needs `X-ModelScope-Task-Type`
 * on the lookup; without it a perfectly valid task handle comes back as
 * "task not found". Keyed by host so it stays greppable and overridable.
 */
const TASK_HEADER_DEFAULTS: Record<string, Record<string, string>> = {
  "api-inference.modelscope.cn": {
    [MODELSCOPE_TASK_HEADER]: MODELSCOPE_TASK_VALUE,
  },
  "api-inference-sgp.modelscope.cn": {
    [MODELSCOPE_TASK_HEADER]: MODELSCOPE_TASK_VALUE,
  },
};

/**
 * Extra headers an endpoint needs for task polling, keyed by api mode.
 *
 * Keyed by mode as well as host so a gateway proxying ModelScope or
 * DashScope still gets the right protocol handling.
 */
const MODE_TASK_HEADERS: Record<string, Record<string, string>> = {
  modelscope: { [MODELSCOPE_TASK_HEADER]: MODELSCOPE_TASK_VALUE },
  dashscope: { [DASHSCOPE_ASYNC_HEADER]: DASHSCOPE_ASYNC_VALUE },
};

/**
 * Headers for the task-polling request: the endpoint's known requirements
 * first, then whatever the user configured in Settings (which wins).
 */
export function taskHeadersFor(
  baseUrl: string,
  override?: Record<string, string>,
  apiMode?: string
): Record<string, string> {
  let host = "";

  try {
    host = new URL(normalizeBaseUrl(baseUrl)).host.toLowerCase();
  } catch {
    /* an invalid base URL is reported elsewhere */
  }

  return {
    ...(TASK_HEADER_DEFAULTS[host] ?? {}),
    ...(apiMode ? MODE_TASK_HEADERS[apiMode] ?? {} : {}),
    ...(override ?? {}),
  };
}

/**
 * Vendor headers for the request that *creates* the task.
 *
 * Deliberately mode-based only, not host-based: ModelScope's task-type header
 * is only needed on the poll, so sending it on create would be noise, whereas
 * DashScope's async switch has to be on both.
 */
export function createHeadersFor(
  apiMode?: string,
  extraHeaders?: Record<string, string>
): Record<string, string> {
  return { ...(MODE_TASK_HEADERS[apiMode ?? ""] ?? {}), ...(extraHeaders ?? {}) };
}

/**
 * Parse a `Header-Name: value` / `Header-Name=value` textarea into a record.
 * Blank lines are ignored; the first separator wins so values may contain
 * a colon.
 */
export function parseHeaderLines(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:=]+?)\s*[:=]\s*(.*)$/);

    if (match) {
      const name = match[1].trim();
      if (name) headers[name] = match[2].trim();
    }
  }

  return headers;
}

/** Validate the user-entered custom provider settings. */
export function validateCustomSettings(
  settings: CustomProviderSettings | undefined
): string | null {
  if (!settings) return "Custom provider is not configured";
  if (!isValidBaseUrl(settings.baseUrl)) {
    return "Enter a valid base URL (e.g. https://api.example.com/v1)";
  }
  if (!settings.models || settings.models.length === 0) {
    return "Add at least one model ID";
  }

  return null;
}