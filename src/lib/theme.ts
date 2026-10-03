/**
 * Theme system: light / dark / system preference.
 *
 * The whole app is driven by CSS custom properties declared in
 * `src/app/globals.css` (`:root` = dark, `.light` = light).
 * Switching themes therefore only means toggling the `light` class on
 * <html> and updating `color-scheme` so native widgets follow along.
 *
 * The preference lives in a tiny external store so React can read it through
 * `useSyncExternalStore` - that keeps the first client render identical to the
 * server render while still reacting to changes and to the OS setting.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "openllmpix-theme";

/** Event used to notify same-tab listeners (the storage event only fires cross-tab). */
const CHANGE_EVENT = "openllmpix-theme-change";

/** Inline script injected in <head> to apply the theme before first paint. */
export const themeInitScript = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});var t=(s==="light"||s==="dark"||s==="system")?s:(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");if(t==="system"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}var r=document.documentElement;r.classList.toggle("light",t==="light");r.classList.toggle("dark",t==="dark");r.style.colorScheme=t;r.dataset.theme=t;}catch(e){}})();`;

/** Read the stored preference, guarding against private-mode storage errors. */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage unavailable - fall through to the default
  }

  return "dark";
}

/** Persist the preference, ignoring quota / privacy-mode failures. */
export function storeTheme(theme: Theme): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore - the theme still applies for this session
  }
}

/** Turn a preference into the theme that is actually rendered. */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "dark";

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/** Reflect a resolved theme onto the document root. */
export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("light", resolved === "light");
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  root.dataset.theme = resolved;
}

// ===== External store =====

let cachedTheme: Theme | null = null;
let cachedSystemTheme: ResolvedTheme | null = null;
let cachedMediaQuery: MediaQueryList | null = null;

const listeners = new Set<() => void>();

function invalidate() {
  cachedTheme = null;
  cachedSystemTheme = null;
  for (const listener of listeners) listener();
}

function getMediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;

  if (!cachedMediaQuery) {
    cachedMediaQuery = window.matchMedia("(prefers-color-scheme: light)");
  }
  return cachedMediaQuery;
}

/** Theme preference snapshot. */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);

  const media = getMediaQuery();
  media?.addEventListener("change", listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      cachedTheme = null;
      cachedSystemTheme = null;
      listener();
    }
  };

  const onLocalChange = () => {
    cachedTheme = null;
    cachedSystemTheme = null;
    listener();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onLocalChange);

  return () => {
    listeners.delete(listener);
    media?.removeEventListener("change", listener);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onLocalChange);
  };
}

export function getThemeSnapshot(): Theme {
  if (cachedTheme === null) cachedTheme = getStoredTheme();
  return cachedTheme;
}

/** Server snapshot: what the pre-paint script renders, so hydration matches. */
export function getThemeServerSnapshot(): Theme {
  return "dark";
}

/** OS preference snapshot, only consulted while the theme is "system". */
export function getSystemThemeSnapshot(): ResolvedTheme {
  if (cachedSystemTheme === null) cachedSystemTheme = resolveTheme("system");
  return cachedSystemTheme;
}

/** Update the preference and notify every subscriber. */
export function setThemePreference(theme: Theme): void {
  storeTheme(theme);
  applyTheme(resolveTheme(theme));
  invalidate();
}