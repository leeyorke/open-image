"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  applyTheme,
  getSystemThemeSnapshot,
  getThemeServerSnapshot,
  getThemeSnapshot,
  setThemePreference,
  subscribeTheme,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

interface ThemeContextValue {
  /** The user's preference ("system" is possible). */
  theme: Theme;
  /** The theme actually applied right now. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  /** Convenience helper for simple light/dark switch buttons. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Flip between the two concrete themes, ignoring "system". */
const flip = (current: ResolvedTheme): ResolvedTheme =>
  current === "light" ? "dark" : "light";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The preference is read through an external store: the pre-paint script in
  // <head> has already applied the real theme, and this subscription keeps
  // React in sync without a hydration mismatch.
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getThemeServerSnapshot
  );

  const systemTheme = useSyncExternalStore(
    subscribeTheme,
    getSystemThemeSnapshot,
    getSystemThemeSnapshot
  );

  const resolvedTheme: ResolvedTheme =
    theme === "system" ? systemTheme : theme;

  const setTheme = useCallback((next: Theme) => {
    setThemePreference(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemePreference(flip(resolvedTheme));
  }, [resolvedTheme]);

  // Keep the document in step with whatever the store reports.
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // Keyboard shortcut: Shift + L toggles light/dark.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "L" && event.key !== "l") return;
      if (!event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      event.preventDefault();
      const preference = getThemeSnapshot();
      const current =
        preference === "system" ? getSystemThemeSnapshot() : preference;
      setThemePreference(flip(current));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}