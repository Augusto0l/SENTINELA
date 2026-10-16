"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { themeStorageKey as storageKey } from "@/data/theme";

type Theme = "claro" | "escuro" | "sistema";
type ResolvedTheme = Exclude<Theme, "sistema">;
const isTheme = (value: unknown): value is Theme => value === "claro" || value === "escuro" || value === "sistema";

const ThemeContext = createContext<{ theme: Theme; resolvedTheme: ResolvedTheme; setTheme: (theme: Theme) => void } | null>(null);

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>("escuro");
  const [resolvedTheme, updateResolvedTheme] = useState<ResolvedTheme>("escuro");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (preference: Theme) => {
      const resolved = preference === "sistema" ? (media.matches ? "escuro" : "claro") : preference;
      document.documentElement.dataset.themePreference = preference;
      document.documentElement.dataset.theme = resolved;
      updateTheme(preference);
      updateResolvedTheme(resolved);
    };
    const preference = document.documentElement.dataset.themePreference;
    apply(isTheme(preference) ? preference : "escuro");
    const onSystemChange = () => {
      if (document.documentElement.dataset.themePreference === "sistema") apply("sistema");
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) apply(isTheme(event.newValue) ? event.newValue : "escuro");
    };
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setTheme = (preference: Theme) => {
    const resolved = preference === "sistema" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro") : preference;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.dataset.theme = resolved;
    updateTheme(preference);
    updateResolvedTheme(resolved);
    try { localStorage.setItem(storageKey, preference); } catch { /* Theme still works for this session. */ }
  };

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme requires ThemeProvider");
  return context;
}
