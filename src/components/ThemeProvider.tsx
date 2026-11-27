"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { defaultTheme, isTheme, resolveTheme, themeStorageKey, themeSystemQuery, type ResolvedTheme, type Theme } from "@/data/theme";

type ThemeState = { theme: Theme; resolvedTheme: ResolvedTheme };
const ThemeContext = createContext<(ThemeState & { setTheme: (theme: Theme) => void }) | null>(null);
const themeChange = "sentinela-theme-change";
const manualStates = {
  claro: { theme: "claro", resolvedTheme: "claro" },
  escuro: { theme: "escuro", resolvedTheme: "escuro" },
} as const;
const systemStates = {
  claro: { theme: "sistema", resolvedTheme: "claro" },
  escuro: { theme: "sistema", resolvedTheme: "escuro" },
} as const;

function readTheme() {
  const { dataset } = document.documentElement;
  if (dataset.themePreference === "sistema") {
    return systemStates[dataset.theme === "claro" ? "claro" : "escuro"];
  }
  return manualStates[dataset.themePreference === "claro" ? "claro" : "escuro"];
}

function applyTheme(theme: Theme, systemDark: boolean) {
  const { dataset } = document.documentElement;
  const resolvedTheme = resolveTheme(theme, systemDark);
  if (dataset.themePreference === theme && dataset.theme === resolvedTheme) return;
  dataset.themePreference = theme;
  dataset.theme = resolvedTheme;
  window.dispatchEvent(new Event(themeChange));
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(themeSystemQuery);
  const onSystemChange = () => {
    if (document.documentElement.dataset.themePreference === "sistema") applyTheme("sistema", media.matches);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === themeStorageKey || event.key === null) {
      applyTheme(isTheme(event.newValue) ? event.newValue : defaultTheme, media.matches);
    }
  };
  window.addEventListener(themeChange, onChange);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onSystemChange);
  onSystemChange();
  return () => {
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(themeChange, onChange);
  };
}

function setTheme(preference: Theme) {
  applyTheme(preference, window.matchMedia(themeSystemQuery).matches);
  try { localStorage.setItem(themeStorageKey, preference); } catch { /* Theme still works for this session. */ }
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const themeState = useSyncExternalStore(subscribe, readTheme, () => manualStates[defaultTheme]);
  return <ThemeContext.Provider value={{ ...themeState, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme requires ThemeProvider");
  return context;
}
