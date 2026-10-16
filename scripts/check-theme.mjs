import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.env.SENTINELA_TEST_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const activeTheme = () => page.locator("html").getAttribute("data-theme");
const ready = async route => {
  assert.equal((await page.goto(base + route, { waitUntil: "networkidle", timeout: 120000 })).status(), 200);
  await page.locator(route === "/login" ? "h1" : ".system-topbar").waitFor();
  assert.equal(await page.locator(".demo-banner, .topbar-search").count(), 0);
};

try {
  await ready("/configuracoes");
  await page.getByRole("button", { name: "Ativar tema claro", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "claro");
  assert.equal(await activeTheme(), "claro");
  assert.equal(await page.getByRole("button", { name: "Claro", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await page.evaluate(() => localStorage.getItem("sentinela-theme")), "claro");
  await page.reload();
  await page.getByRole("button", { name: "Ativar tema escuro", exact: true }).waitFor();
  assert.equal(await activeTheme(), "claro");
  await page.getByRole("button", { name: "Escuro", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "escuro");
  assert.equal(await activeTheme(), "escuro");
  await page.getByRole("button", { name: "Ativar tema claro", exact: true }).waitFor();
  await page.getByRole("button", { name: "Sistema", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "claro");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "escuro");
  mkdirSync(".next/theme-evidence", { recursive: true });
  for (const theme of ["claro", "escuro"]) {
    await ready("/configuracoes");
    await page.getByRole("button", { name: theme === "claro" ? "Claro" : "Escuro", exact: true }).click();
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    for (const route of ["/login", "/dashboard", "/mapa-criminal", "/ocorrencias", "/ocorrencias/nova", "/importar", "/usuarios", "/configuracoes"]) {
      await ready(route);
      assert.equal(await activeTheme(), theme);
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 600)));
      await page.screenshot({ path: `.next/theme-evidence/${theme}-${route.slice(1).replaceAll("/", "-")}.png`, fullPage: true });
      if (route === "/ocorrencias") {
        await page.getByPlaceholder(/Buscar ID, RA ou natureza/).fill("DEMO-000001");
        await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
        assert.match(await page.locator("tbody").innerText(), /DEMO-000001/);
      }
      if (route === "/usuarios") {
        await page.getByPlaceholder("Buscar por nome ou e-mail").fill("Pedro Augusto");
        await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
        assert.match(await page.locator("tbody").innerText(), /Pedro Augusto/);
      }
      console.log(`PASS ${theme} ${route}`);
    }
  }
  // Theme restoration precedes hydration, including when JavaScript bundles cannot run.
  const early = await browser.newContext();
  await early.addInitScript(() => localStorage.setItem("sentinela-theme", "claro"));
  await early.route("**/*.js*", route => route.abort());
  const earlyPage = await early.newPage();
  await earlyPage.goto(base + "/login", { waitUntil: "domcontentloaded" });
  assert.equal(await earlyPage.locator("html").getAttribute("data-theme"), "claro");
  await early.close();
  assert.deepEqual(errors, []);
  console.log("PASS controles, sincronizacao, persistencia, sistema e inicializacao anterior a hidratacao");
} finally {
  await browser.close();
}
