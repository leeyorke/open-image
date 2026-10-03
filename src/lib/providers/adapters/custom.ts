/**
 * Server-side adapter for user-supplied OpenAI-compatible endpoints.
 *
 * The request/response handling is identical to the browser adapter, so the
 * implementation is reused rather than duplicated.
 */

import { ClientCustomAdapter } from "../client-adapters/custom";
import { CustomProviderSettings, GenerateRequest, GenerateResult } from "../types";

export class CustomAdapter extends ClientCustomAdapter {
  // `custom` requests carry their own base URL and model list, so there is
  // nothing to list server-side.
  async listModels() {
    return [];
  }

  supportsModelListing(): boolean {
    return false;
  }

  /**
   * Always talk to the upstream endpoint directly.
   *
   * `transport: "server"` means "delegate to this app's /api/generate route",
   * which is the *client's* instruction. On the server that would recurse into
   * this very route - and fail immediately, because `fetch("/api/generate")`
   * is not a resolvable URL outside a browser. Running server-side, the
   * request is already being proxied, so the setting is ignored here.
   */
  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const custom: CustomProviderSettings = {
      ...(request.custom as CustomProviderSettings),
      transport: "direct",
    };

    return super.generate({ ...request, custom });
  }
}