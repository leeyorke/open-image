/**
 * Persistent application configuration stored at `~/.openllmpix/config.json`.
 *
 * Why a file rather than localStorage:
 *
 *   - Settings survive across browsers and across `npm run dev` restarts.
 *   - A user can configure several providers at once instead of one slot.
 *   - It can be inspected and edited by hand.
 *
 * The trade-off is explicit: API keys are stored **unencrypted** on disk with
 * owner-only permissions, matching how `.env`, `.netrc` and
 * `~/.docker/config.json` are handled. They no longer stay inside the browser,
 * so any process running as this OS user can read them. Both routes refuse
 * non-local requests so a deployed instance cannot hand its operator's keys
 * to the internet.
 */

import { promises as fs } from "fs";
import os from "os";
import path from "path";

import { APP_CONFIG_VERSION, type AppConfig, type ProviderEntry } from "./providers/types";

export const CONFIG_DIR_NAME = ".openllmpix";
export const CONFIG_FILE_NAME = "config.json";

export function getConfigDir(): string {
  // OPENLLMPIX_CONFIG_DIR lets tests and sandboxes point somewhere writable.
  const override = process.env.OPENLLMPIX_CONFIG_DIR;

  return override && override.trim()
    ? path.resolve(override.trim())
    : path.join(os.homedir(), CONFIG_DIR_NAME);
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), CONFIG_FILE_NAME);
}

/**
 * Only allow requests that came from this machine.
 *
 * The file holds plaintext API keys, so a deployed instance must never expose
 * them. Checking the Host header is sufficient here because the route is only
 * meant to be reachable over localhost.
 */
export function isLocalRequest(request: Request): boolean {
  const host = (request.headers.get("host") || "").split(":")[0].trim().toLowerCase();

  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1" ||
    host === ""
  );
}

function isProviderEntry(value: unknown): value is ProviderEntry {
  if (!value || typeof value !== "object") return false;

  const entry = value as Partial<ProviderEntry>;

  return (
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    typeof entry.provider === "string" &&
    typeof entry.apiKey === "string"
  );
}

/**
 * Validate an untrusted config payload.
 *
 * Everything is kept plain in `AppConfig` so unknown fields are simply
 * preserved rather than silently dropped on the next save.
 */
export function sanitizeAppConfig(value: unknown): AppConfig {
  const raw = (value ?? {}) as Partial<AppConfig>;
  const providers = Array.isArray(raw.providers) ? raw.providers.filter(isProviderEntry) : [];

  const activeProviderId =
    typeof raw.activeProviderId === "string" && providers.some((p) => p.id === raw.activeProviderId)
      ? raw.activeProviderId
      : (providers[0]?.id ?? null);

  return {
    version: APP_CONFIG_VERSION,
    activeProviderId,
    providers: providers.map((entry) => ({
      ...entry,
      label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : undefined,
    })),
  };
}

export function emptyAppConfig(): AppConfig {
  return { version: APP_CONFIG_VERSION, activeProviderId: null, providers: [] };
}

/** Read the config file. Returns an empty config when it does not exist yet. */
export async function readAppConfig(): Promise<AppConfig> {
  try {
    const text = await fs.readFile(getConfigPath(), "utf8");
    return sanitizeAppConfig(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyAppConfig();

    // A corrupt file should not break the app, but the user needs to know.
    console.warn(`[config] could not read ${getConfigPath()}:`, error);
    return emptyAppConfig();
  }
}

/**
 * Write the config file with owner-only permissions where the platform
 * supports it.
 *
 * `mode` is a POSIX guarantee: on Linux/macOS the directory becomes 0700 and
 * the file 0600, readable only by this OS user. Node maps `chmod` onto the
 * read-only attribute on Windows, which is *not* an ACL - there the file
 * inherits the ACL of the user profile directory, which is already restricted
 * to that account. Either way the practical result is "not world readable",
 * but only the POSIX path is enforced by this code.
 */
export async function writeAppConfig(config: AppConfig): Promise<void> {
  const dir = getConfigDir();
  const file = getConfigPath();

  await fs.mkdir(dir, { recursive: true, mode: 0o700 });

  const payload = `${JSON.stringify(config, null, 2)}\n`;

  await fs.writeFile(file, payload, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(file, 0o600).catch(() => undefined);
}