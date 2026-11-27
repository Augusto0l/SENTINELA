export const themeStorageKey = "sentinela-theme";
export const themeSystemQuery = "(prefers-color-scheme: dark)";
export const themeChoices = ["claro", "escuro", "sistema"] as const;
export type Theme = (typeof themeChoices)[number];
export type ResolvedTheme = Exclude<Theme, "sistema">;
export const defaultTheme = "escuro" satisfies ResolvedTheme;

export function isTheme(value: unknown): value is Theme {
  return themeChoices.some(theme => theme === value);
}

export function resolveTheme(preference: Theme, systemDark: boolean): ResolvedTheme {
  return preference === "sistema" ? (systemDark ? "escuro" : "claro") : preference;
}

// Apply the saved preference before the first paint, including before React has hydrated.
export const themeInitializationScript = `(function(){
  var preference = ${JSON.stringify(defaultTheme)};
  try {
    var saved = localStorage.getItem(${JSON.stringify(themeStorageKey)});
    if (${JSON.stringify(themeChoices)}.includes(saved)) preference = saved;
  } catch {}
  var dataset = document.documentElement.dataset;
  dataset.themePreference = preference;
  dataset.theme = preference === "sistema"
    ? (matchMedia(${JSON.stringify(themeSystemQuery)}).matches ? "escuro" : "claro")
    : preference;
})()`;
