import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { defaultTheme, isTheme, resolveTheme, themeChoices, themeInitializationScript, themeStorageKey, themeSystemQuery } from "../src/data/theme.ts";

function initializeTheme(saved, systemDark, storageAvailable = true) {
  const dataset = {};
  runInNewContext(themeInitializationScript, {
    document: { documentElement: { dataset } },
    localStorage: {
      getItem(key) {
        assert.equal(key, themeStorageKey);
        if (!storageAvailable) throw new Error("Storage unavailable");
        return saved;
      },
    },
    matchMedia(query) {
      assert.equal(query, themeSystemQuery);
      return { matches: systemDark };
    },
  });
  return dataset;
}

test("o tema da primeira pintura coincide com o resolvido após a hidratação", () => {
  for (const preference of themeChoices) {
    for (const systemDark of [false, true]) {
      assert.equal(isTheme(preference), true);
      assert.deepEqual(initializeTheme(preference, systemDark), {
        themePreference: preference,
        theme: resolveTheme(preference, systemDark),
      });
    }
  }
  assert.equal(resolveTheme("sistema", false), "claro");
  assert.equal(resolveTheme("sistema", true), "escuro");
  assert.equal(resolveTheme("claro", true), "claro");
  assert.equal(resolveTheme("escuro", false), "escuro");
});

test("a inicialização preserva o padrão quando a preferência está ausente, inválida ou inacessível", () => {
  const expected = { themePreference: defaultTheme, theme: defaultTheme };
  assert.equal(isTheme("light"), false);
  assert.deepEqual(initializeTheme(null, false), expected);
  assert.deepEqual(initializeTheme("light", true), expected);
  assert.deepEqual(initializeTheme("claro", false, false), expected);
});
