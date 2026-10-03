/**
 * Client-side adapter for a user-supplied OpenAI-compatible endpoint.
 *
 * Supports the two shapes image APIs commonly expose:
 *
 *   "images" -> POST /images/generations  (text-to-image)
 *               POST /images/edits       (image-to-image, multipart/form-data)
 *   "chat"   -> POST /chat/completions   (multimodal content parts)
 *
 * As with every adapter in this folder the request is made straight from the
 * browser, so the user's key never passes through the application server.
 */

import { ClientProviderAdapter } from "./base";
import { GenerateRequest, GenerateResult, CustomProviderSettings } from "../types";
import {
  buildAuthHeaders,
  buildDashScopeUrl,
  buildEndpointUrl,
  buildTaskUrl,
  createHeadersFor,
  normalizeBaseUrl,
  resolveImageSize,
  toDashScopeSize,
  validateCustomSettings,
  taskHeadersFor,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POLL_TIMEOUT_MS,
} from "../custom-utils";

/** Convert a data URL into a Blob for multipart uploads.
 *
 * Deliberately decodes with `atob` instead of `fetch(dataUrl)`: a `data:` URL
 * needs no network request, and routing it through fetch would trip the
 * Content Security Policy's `connect-src` list (which has no `data:` entry).
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]*)((?:;[^;,]*)*),([\s\S]*)$/.exec(dataUrl);

  if (!match) {
    throw new Error("Reference image is not a valid data URL");
  }

  const mimeType = match[1] || "application/octet-stream";
  const parameters = match[2] || "";
  const payload = match[3];

  // Non-base64 data URLs are percent-encoded plain text.
  if (!parameters.includes(";base64")) {
    return new Blob([decodeURIComponent(payload)], { type: mimeType });
  }

  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

/**
 * An error that carries the upstream endpoint's own HTTP status.
 *
 * The /api/generate route pattern-matches error text to map provider failures
 * to friendly wording. That mapping is lossy for a user-supplied endpoint, so
 * the status is preserved here and the route passes the message straight
 * through for `provider: "custom"`.
 */
export class CustomApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CustomApiError";
    this.status = status;
  }
}

/** Read a property from an unknown value. */
function read(source: unknown, key: string): unknown {
  return source && typeof source === "object"
    ? (source as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Pull a human-readable message out of a parsed error payload.
 * Vendors disagree on the shape: OpenAI uses `error`, ModelScope uses
 * `errors`, some use a bare `message`.
 */
function payloadMessage(payload: unknown): string {
  const errorField = read(payload, "error") ?? read(payload, "errors");
  const message =
    (typeof errorField === "string" ? errorField : read(errorField, "message")) ??
    read(payload, "message");

  return typeof message === "string" ? message : "";
}

/** Best-effort extraction of an upstream error message from a response body. */
function extractErrorMessage(text: string, status: number): string {
  const fallback = `Custom API error: ${status}`;

  try {
    return payloadMessage(JSON.parse(text)) || text || fallback;
  } catch {
    return text || fallback;
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// Status vocabularies differ per vendor, so accept the common spellings.
const TASK_DONE = new Set([
  "succeed", "succeeds", "succeeded", "success", "successed",
  "completed", "complete", "done", "finished", "ok",
]);
const TASK_FAILED = new Set([
  "failed", "fail", "failure", "error", "canceled", "cancelled", "aborted",
]);

function taskStatus(data: unknown): string {
  const status = read(data, "task_status") ?? read(data, "taskStatus") ?? read(data, "status");
  return typeof status === "string" ? status.toLowerCase() : "";
}

/**
 * Some OpenAI-compatible endpoints are asynchronous: the POST only returns a
 * task handle and the image shows up at a separate polling URL (ModelScope,
 * for example, answers with `{ task_status, task_id }` and requires
 * `GET {baseUrl}/tasks/{id}`). Detected from the response rather than
 * configured, so synchronous providers are unaffected.
 */
function taskIdOf(data: unknown): string | null {
  const candidate =
    read(data, "task_id") ??
    read(data, "taskId") ??
    read(read(data, "output"), "task_id");

  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

export class ClientCustomAdapter extends ClientProviderAdapter {
  readonly providerId = "custom" as const;
  readonly name = "Custom";
  readonly supportsCORS = true;

  /**
   * `fetch` that turns the opaque "Failed to fetch" TypeError into something
   * actionable - by far the most common failure for a user-supplied endpoint.
   *
   * A browser only rejects a fetch like this for two reasons: the connection
   * failed, or a CORS check (including the preflight) failed. Both are invisible
   * from JS, so the message says exactly that and names the full URL.
   *
   * Keep the wording free of "blocked"/"rate"/"invalid key"/"not found": the
   * /api/generate route pattern-matches on those to map provider errors.
   */
  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);

      throw new Error(
        `Request to ${url} failed at the network level (${detail}). From a ` +
          "browser this is almost always CORS: the endpoint must answer the " +
          "preflight OPTIONS request and return Access-Control-Allow-Origin " +
          "plus Access-Control-Allow-Headers for Authorization and " +
          "Content-Type. Setting the custom provider to 'Via app server' in " +
          "Settings routes around CORS entirely."
      );
    }
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const settings = request.custom;
    const invalid = validateCustomSettings(settings);
    if (invalid) {
      throw new Error(invalid);
    }

    const custom = settings!;
    const mode = custom.apiMode || "images";

    const result =
      custom.transport === "server"
        ? await this.generateViaAppServer(request)
        : mode === "dashscope"
          ? await this.generateViaDashScope(request)
          : mode === "chat"
            ? await this.generateViaChat(request)
            : await this.generateViaImages(request);

    if (result.images.length === 0) {
      throw new Error(
        `No images were returned by ${normalizeBaseUrl(custom.baseUrl)}. ` +
          "Check the API format (Images vs Chat) and the model ID in Settings."
      );
    }

    return { ...result, model: request.model, provider: "custom" };
  }

  // ===== "via app server" transport =====

  /**
   * Delegate the whole request to this app's /api/generate route, which runs
   * the same adapter server-side. Bypasses CORS entirely - which is the only
   * way to reach endpoints that do not send browser-friendly headers.
   */
  private async generateViaAppServer(
    request: GenerateRequest
  ): Promise<{ images: string[] }> {
    let response: Response;

    try {
      response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, numberOfImages: 1 }),
      });
    } catch {
      throw new Error(
        "Could not reach this app's own /api/generate route. If you are " +
          "running a static export there is no server to proxy through - " +
          "switch the custom provider back to 'Direct (browser)'."
      );
    }

    const text = await response.text();

    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`App server returned a non-JSON response: ${text.slice(0, 200)}`);
    }

    if (!response.ok) {
      const record = data as { error?: unknown };
      const message =
        typeof record?.error === "string"
          ? record.error
          : `HTTP ${response.status}`;
      throw new Error(message);
    }

    const record = data as { images?: unknown };
    const images = Array.isArray(record.images)
      ? record.images.filter((image): image is string => typeof image === "string")
      : [];

    return { images };
  }

  // ===== Asynchronous task polling =====

  /**
   * Resolve a response that may only carry a task handle.
   *
   * When the payload already contains images it is returned untouched;
   * otherwise the task URL is polled until the provider reports a terminal
   * state or the budget runs out.
   */
  private async resolveTask(
    data: unknown,
    settings: CustomProviderSettings,
    apiKey: string
  ): Promise<unknown> {
    if (this.extractImages(data).length > 0) return data;

    const taskId = taskIdOf(data);
    if (!taskId) return data;

    const timeoutMs = settings.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    const intervalMs = Math.max(500, settings.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
    const deadline = Date.now() + timeoutMs;

    const url = buildTaskUrl(settings.baseUrl, taskId);

    const taskTypeHeaders = taskHeadersFor(
      settings.baseUrl,
      settings.taskHeaders,
      settings.apiMode
    );

    // Vendors need their own header to identify which task namespace to look
    // the handle up in; without it the lookup can fail outright.
    const headers = {
      ...buildAuthHeaders(apiKey, settings.extraHeaders, { json: false }),
      ...taskTypeHeaders,
    };

    while (Date.now() < deadline) {
      await sleep(intervalMs);

      let response: Response;

      try {
        response = await this.request(url, { method: "GET", headers });
      } catch (cause) {
        // A vendor-required task header is very often missing from the
        // endpoint's Access-Control-Allow-Headers list, which makes the whole
        // poll impossible from a browser. Say so, instead of leaving the user
        // with a generic CORS complaint they cannot act on.
        const headerNames = Object.keys(taskTypeHeaders).join(", ");

        if (headerNames) {
          throw new CustomApiError(
            `Task created successfully, but polling ${url} failed at the network ` +
              `level: this endpoint requires the header(s) ${headerNames} on the ` +
              "task-status request, and its CORS policy does not allow a browser " +
              "to send them. Set this provider's 'Send requests' to " +
              "'Via app server' - polling can then happen server-side.",
            502
          );
        }

        throw cause;
      }

      if (!response.ok) continue; // transient poll failures are not fatal

      const payload = await this.parseResponse(response);
      const status = taskStatus(payload);

      if (status && TASK_FAILED.has(status)) {
        const detail = payloadMessage(payload);

        throw new CustomApiError(
          `Task ${taskId} failed${detail ? `: ${detail}` : ""}`,
          502
        );
      }

      if (this.extractImages(payload).length > 0) return payload;
      if (status && TASK_DONE.has(status)) return payload;
    }

    throw new CustomApiError(
      `Task ${taskId} did not finish within ${Math.round(timeoutMs / 1000)}s. ` +
        "Raise the poll timeout in Settings, or use an endpoint that returns " +
        "images synchronously.",
      504
    );
  }

  // ===== "images" mode =====

  private async generateViaImages(
    request: GenerateRequest
  ): Promise<{ images: string[] }> {
    const settings = request.custom!;
    const apiKey = request.apiKey || "";
    const aspectInstruction = this.buildAspectRatioInstruction(request.aspectRatio);
    const promptText =
      request.mode === "image-to-image"
        ? `Using the provided image(s), ${request.prompt}.${aspectInstruction}`
        : `${request.prompt}${aspectInstruction}`;

    const size = resolveImageSize(request.aspectRatio, settings.size);
    const references = request.referenceImages ?? [];

    const isEdit = request.mode === "image-to-image" && references.length > 0;

    // Most OpenAI-compatible image endpoints - DashScope workspaces included -
    // take the reference image as a top-level `image` field on the *same*
    // /images/generations route. Their /images/edits does not exist, so the
    // multipart variant is opt-in for gateways that genuinely need it.
    const useMultipartEdits = settings.editStyle === "multipart";

    if (isEdit && useMultipartEdits) {
      const form = new FormData();
      form.append("model", request.model);
      form.append("prompt", promptText);
      form.append("n", String(request.numberOfImages ?? 1));
      if (size) form.append("size", size);

      for (const dataUrl of references) {
        const blob = dataUrlToBlob(dataUrl);
        form.append("image", blob, "reference.png");
      }

      // Content-Type is left to the browser so it can set the multipart boundary.
      const extra = buildAuthHeaders(apiKey, settings.extraHeaders, { json: false });

      const response = await this.request(
        buildEndpointUrl(settings.baseUrl, "images", "edit"),
        {
          method: "POST",
          headers: extra,
          body: form,
        }
      );

      const data = await this.parseResponse(response);
      const resolved = await this.resolveTask(data, settings, apiKey);
      return { images: this.extractImages(resolved) };
    }

    const body: Record<string, unknown> = {
      model: request.model,
      prompt: promptText,
      n: request.numberOfImages ?? 1,
    };
    if (size) body.size = size;

    // One reference goes as a string, several as an array - the endpoint
    // distinguishes them, and an empty array is rejected with a 400.
    if (isEdit) {
      body.image = references.length === 1 ? references[0] : references;
    }

    const response = await this.request(
      buildEndpointUrl(settings.baseUrl, "images", "generate"),
      {
        method: "POST",
        headers: buildAuthHeaders(apiKey, settings.extraHeaders),
        body: JSON.stringify(body),
      }
    );

    const data = await this.parseResponse(response);
    const resolved = await this.resolveTask(data, settings, apiKey);
    return { images: this.extractImages(resolved) };
  }

  // ===== "dashscope" mode (Alibaba Cloud native protocol) =====

  /**
   * Alibaba Cloud DashScope, native protocol.
   *
   * The China region's `/compatible-mode/v1` serves only `/chat/completions`
   * and `/embeddings` - `POST .../images/generations` there answers 404, which
   * is not a model-name or key problem. Images must go to the native
   * multimodal-generation endpoint, with reference images inlined into the
   * message content and the size written `W*H`.
   */
  private async generateViaDashScope(
    request: GenerateRequest
  ): Promise<{ images: string[] }> {
    const settings = request.custom!;
    const apiKey = request.apiKey || "";

    const aspectInstruction = this.buildAspectRatioInstruction(request.aspectRatio);
    const promptText =
      request.mode === "image-to-image"
        ? `Using the provided image(s), ${request.prompt}.${aspectInstruction}`
        : `${request.prompt}${aspectInstruction}`;

    // DashScope takes reference images as leading `{ image }` parts.
    const content: Array<Record<string, unknown>> = [];

    if (request.mode === "image-to-image") {
      for (const image of request.referenceImages ?? []) {
        content.push({ image });
      }
    }

    content.push({ text: promptText });

    const size = toDashScopeSize(resolveImageSize(request.aspectRatio, settings.size));

    const parameters: Record<string, unknown> = {
      n: request.numberOfImages ?? 1,
      watermark: false,
    };
    if (size) parameters.size = size;

    const body = {
      model: request.model,
      input: { messages: [{ role: "user", content }] },
      parameters,
    };

    const response = await this.request(buildDashScopeUrl(settings.baseUrl), {
      method: "POST",
      headers: buildAuthHeaders(
        apiKey,
        { ...createHeadersFor(settings.apiMode), ...settings.extraHeaders }
      ),
      body: JSON.stringify(body),
    });

    const data = await this.parseResponse(response);
    const resolved = await this.resolveTask(data, settings, apiKey);

    return { images: this.extractImages(resolved) };
  }

  // ===== "chat" mode =====

  private async generateViaChat(
    request: GenerateRequest
  ): Promise<{ images: string[] }> {
    const settings = request.custom!;
    const apiKey = request.apiKey || "";
    const content: Array<
      | { type: string; text?: string; image_url?: { url: string } }
    > = [];

    if (request.mode === "image-to-image" && request.referenceImages?.length) {
      for (const imageData of request.referenceImages) {
        content.push({ type: "image_url", image_url: { url: imageData } });
      }
    }

    const aspectInstruction = this.buildAspectRatioInstruction(request.aspectRatio);
    const promptText =
      request.mode === "image-to-image"
        ? `Using the provided image(s), ${request.prompt}. Maintain the original style and quality unless otherwise specified.${aspectInstruction}`
        : `${request.prompt}${aspectInstruction}`;

    content.push({ type: "text", text: promptText });

    const response = await this.request(
      buildEndpointUrl(settings.baseUrl, "chat", "generate"),
      {
        method: "POST",
        headers: buildAuthHeaders(apiKey, settings.extraHeaders),
        body: JSON.stringify({
          model: request.model,
          modalities: ["text", "image"],
          messages: [{ role: "user", content }],
        }),
      }
    );

    const data = await this.parseResponse(response);
    const resolved = await this.resolveTask(data, settings, apiKey);
    return { images: this.extractImages(resolved) };
  }

  // ===== Response handling =====

  /** Parse a response body, raising a readable error for non-2xx replies. */
  private async parseResponse(response: Response): Promise<unknown> {
    const text = await response.text();

    if (!response.ok) {
      throw new CustomApiError(extractErrorMessage(text, response.status), response.status);
    }

    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Custom API returned a non-JSON response");
    }
  }

  /**
   * Pull image URLs / base64 payloads out of whichever response shape the
   * endpoint returned. Covers the OpenAI images format, the OpenAI-compatible
   * chat format, and a few common vendor variations (e.g. DashScope's
   * `output.results[]`).
   */
  private extractImages(data: unknown): string[] {
    const images: string[] = [];

    const push = (value: unknown) => {
      if (typeof value !== "string" || value.length === 0) return;

      const trimmed = value.trim();

      // Already a data: URL, or an actual link - hand it through untouched.
      if (trimmed.startsWith("data:")) {
        images.push(value);
        return;
      }

      // Only a raw base64 payload needs wrapping; a URL wrapped as base64
      // produces a broken image.
      if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith("/")) {
        images.push(value);
        return;
      }

      images.push(`data:image/png;base64,${value}`);
    };

    /** Read a property from an unknown value without widening to `any`. */
    const get = (source: unknown, key: string): unknown =>
      source && typeof source === "object"
        ? (source as Record<string, unknown>)[key]
        : undefined;

    const pushImageLike = (item: unknown) => {
      push(get(item, "b64_json"));
      push(get(item, "url"));
      // `image_url` is either a URL string or a `{ url }` wrapper.
      const imageUrl = get(item, "image_url");
      push(typeof imageUrl === "string" ? imageUrl : get(imageUrl, "url"));
    };

    const root = data;
    if (!root || typeof root !== "object") return images;

    // Format 1: { data: [{ url | b64_json | image_url }] } (images endpoints)
    const dataItems = get(root, "data");
    if (Array.isArray(dataItems)) {
      for (const item of dataItems) {
        if (typeof item === "string") push(item);
        else pushImageLike(item);
      }
    }

    // Format 2: { images: [{ url | b64_json }] }
    const imageItems = get(root, "images");
    if (Array.isArray(imageItems)) {
      for (const item of imageItems) {
        if (typeof item === "string") push(item);
        else pushImageLike(item);
      }
    }

    // Format 2b: { output_images: ["url", ...] } (ModelScope task results)
    const outputImages = get(root, "output_images");
    if (Array.isArray(outputImages)) {
      for (const item of outputImages) {
        if (typeof item === "string") push(item);
        else pushImageLike(item);
      }
    }

    // Format 3: { output: { results: [{ url }] } } - DashScope / Wan and
    // other gateways that wrap the OpenAI payload in their own envelope.
    const results = get(get(root, "output"), "results");
    if (Array.isArray(results)) {
      for (const item of results) {
        if (typeof item === "string") push(item);
        else pushImageLike(item);
      }
    }

    // Format 4: chat completions - { choices: [{ message: { images | content } }] }
    const choices = get(root, "choices");
    if (Array.isArray(choices)) {
      for (const choice of choices) {
        const message = get(choice, "message") ?? get(choice, "delta");

        const messageImages = get(message, "images");
        if (Array.isArray(messageImages)) {
          for (const img of messageImages) {
            if (typeof img === "string") push(img);
            else pushImageLike(img);
          }
        }

        const content = get(message, "content");
        if (Array.isArray(content)) {
          for (const part of content) {
            const imageUrl = get(part, "image_url");
            if (get(part, "type") === "image_url") {
              push(typeof imageUrl === "string" ? imageUrl : get(imageUrl, "url"));
            } else if (get(part, "type") === "image") {
              push(get(part, "data"));
            }
          }
        } else if (typeof content === "string" && content.startsWith("data:image")) {
          push(content);
        }
      }
    }

    // Format 5: DashScope native multimodal generation -
    // { output: { choices: [{ message: { content: [{ image }] } }] } }
    const nativeChoices = get(get(root, "output"), "choices");
    if (Array.isArray(nativeChoices)) {
      for (const choice of nativeChoices) {
        const content = get(get(choice, "message"), "content");
        if (!Array.isArray(content)) continue;

        for (const part of content) {
          push(get(part, "image"));
        }
      }
    }

    // De-duplicate while preserving order.
    return Array.from(new Set(images));
  }
}