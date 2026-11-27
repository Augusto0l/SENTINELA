import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = process.env.SENTINELA_TEST_URL ?? "http://127.0.0.1:3000";
const output = "tmp/analytics-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce" });
page.setDefaultTimeout(20000);
await page.route("https://fonts.googleapis.com/**", route => route.abort());
await page.route("https://fonts.gstatic.com/**", route => route.abort());
const errors = [], checks = [], samples = [];
page.on("pageerror", error => errors.push(error.message));
const check = message => { checks.push(message); console.log(message); };
const total = async () => Number(await page.getByTestId("analytics-total").getAttribute("data-count"));
const period = () => page.getByLabel("Período da base fictícia", { exact: true });
const heat = () => page.getByTestId("crime-heatmap");
const geometry = () => page.locator('svg:has(path[role="button"]) path[role="button"]').evaluateAll(paths => paths.map(path => [path.id, path.getAttribute("d")]));
const complementaryFilters = async (open) => {
  const summary = page.getByRole("form", { name: "Filtros analíticos" }).locator("details > summary").filter({ hasText: /^Filtros\b/ });
  if (await summary.count() && (await summary.evaluate(element => element.parentElement.open)) !== open) await summary.click();
};
const range = async (start, end) => {
  await period().selectOption("custom");
  await page.getByLabel("Data inicial", { exact: true }).fill(start);
  await page.getByLabel("Data final", { exact: true }).fill(end);
  await page.getByRole("button", { name: "Aplicar período", exact: true }).click();
};
const clear = async () => {
  await complementaryFilters(true);
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await complementaryFilters(false);
  await page.waitForFunction(() => document.querySelector('[data-testid="analytics-total"]')?.getAttribute("data-count") === "790");
};
const goto = async route => {
  assert.equal((await page.goto(base + route, { waitUntil: "networkidle" })).status(), 200);
  await page.getByTestId("analytics-total").waitFor();
  await heat().waitFor();
};
try {
  for (const route of ["/dashboard", "/mapa-criminal"]) {
    await goto(route);
    assert.equal(await total(), 790);
    const initialGeometry = await geometry();
    const reference = await heat().getAttribute("data-reference-peak");
    await range("2026-01-01", "2026-08-25");
    assert.equal(await total(), 790);
    assert.deepEqual(await geometry(), initialGeometry);
    await period().selectOption("7d");
    const quickTotal = await total();
    assert.ok(quickTotal > 0 && quickTotal < 790);
    await range("2026-08-19", "2026-08-25");
    assert.equal(await total(), quickTotal);
    assert.equal(Number(await heat().getAttribute("data-point-count")), quickTotal);
    assert.equal(await heat().getAttribute("data-reference-peak"), reference);
    await range("2026-08-26", "2026-08-25");
    await page.getByRole("alert").filter({ hasText: "posterior" }).waitFor();
    assert.equal(await total(), quickTotal);
    assert.equal(await page.getByLabel("Data inicial", { exact: true }).getAttribute("aria-invalid"), "true");
    await range("", "2026-08-25");
    await page.getByRole("alert").filter({ hasText: "válidas" }).waitFor();
    assert.equal(await total(), quickTotal);
    await range("2027-01-01", "2027-01-31");
    assert.equal(await total(), 0);
    await page.getByRole("status").filter({ hasText: /Nenhuma ocorrência.*no intervalo/ }).waitFor();
    assert.equal(await heat().getAttribute("data-point-count"), "0");
    assert.equal(await heat().getAttribute("data-reference-peak"), reference);
    assert.doesNotMatch(await page.locator("body").innerText(), /NaN|Infinity/);
    for (const mode of ["Pontos", "Clusters"]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      const layer = page.getByTestId(mode === "Pontos" ? "occurrence-points" : "occurrence-clusters");
      if (await layer.evaluate(element => element instanceof HTMLCanvasElement)) {
        assert.equal(await layer.getAttribute("data-point-count"), "0");
      } else assert.equal(await layer.locator("circle").count(), 0);
    }
    await page.getByRole("button", { name: route === "/dashboard" ? "Mapa de calor" : "Calor", exact: true }).click();
    await clear();
    assert.deepEqual(await geometry(), initialGeometry);
    assert.equal(await period().inputValue(), "all");
    assert.equal(await page.getByLabel("Data inicial", { exact: true }).count(), 0);
    samples.push({ route, base: 790, lastSevenDays: quickTotal, referencePeak: reference });
    check(`${route}: intervalo inclusivo, atalhos, validação, vazio, limpeza, geometria e referência de calor preservados.`);
  }

  await goto("/dashboard");
  await range("2026-01-01", "2026-08-25");
  await complementaryFilters(true);
  await page.getByLabel("Região Administrativa", { exact: true }).selectOption("RA-I");
  await page.getByLabel("Natureza criminal", { exact: true }).selectOption("Furto");
  await page.getByLabel("Faixa de horário", { exact: true }).selectOption("18-24");
  await complementaryFilters(false);
  const combined = await total();
  assert.ok(combined > 0 && combined < 790);
  await page.getByText("Série mensal em tabela", { exact: true }).click();
  const monthly = await page.locator("table tbody tr td").allTextContents();
  assert.equal(monthly.reduce((sum, item) => sum + Number(item), 0), combined);
  await page.locator('svg path[role="button"][aria-label^="Plano Piloto:"]').click();
  await page.waitForURL("**/mapa-criminal?**");
  await heat().waitFor();
  assert.equal(await total(), combined);
  const search = new URL(page.url()).searchParams;
  for (const [name, value] of Object.entries({ period: "custom", startDate: "2026-01-01", endDate: "2026-08-25", ra: "RA-I", nature: "Furto", hour: "18-24" })) assert.equal(search.get(name), value);
  assert.equal(Number(await heat().getAttribute("data-point-count")), combined);
  await page.getByRole("button", { name: "Satélite", exact: true }).click();
  const satellitePaths = page.getByTestId("satellite-map").locator("path[data-ra-code]");
  await satellitePaths.first().waitFor();
  assert.equal(await satellitePaths.count(), 1);
  assert.equal(await satellitePaths.first().getAttribute("data-ra-code"), "RA-I");
  assert.match(await satellitePaths.first().getAttribute("aria-label"), new RegExp(`: ${combined} ocorrências`));
  await page.getByRole("button", { name: "Calor", exact: true }).click();
  await page.getByRole("button", { name: /Voltar para visão do DF/ }).click();
  assert.equal(await period().inputValue(), "custom");
  assert.equal(await page.getByLabel("Natureza criminal", { exact: true }).inputValue(), "Furto");
  assert.equal(await page.getByLabel("Faixa de horário", { exact: true }).inputValue(), "18-24");
  assert.ok(await total() >= combined);
  await clear();
  check(`Filtros combinados: ${combined} ocorrências; série mensal, navegação Dashboard → Mapa e camada Satélite mantêm o mesmo recorte.`);

  await goto("/mapa-criminal?period=custom&startDate=2026-08-25&endDate=2026-08-19");
  await page.getByRole("alert").filter({ hasText: "período válido" }).waitFor();
  assert.equal(await total(), 0);
  await clear();
  check("URL com intervalo inválido não amplia a consulta; mensagem orienta a recuperação por limpeza.");

  for (const route of ["/dashboard", "/mapa-criminal"]) {
    await goto(route);
    await range("2026-07-01", "2026-08-25");
    for (const theme of ["claro", "escuro"]) {
      const toggle = page.getByRole("button", { name: `Ativar tema ${theme}`, exact: true });
      if (await toggle.count()) await toggle.click();
      for (const width of [1366, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const form = page.getByRole("form", { name: "Filtros analíticos" });
        await form.scrollIntoViewIfNeeded();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} ${theme} ${width}: overflow horizontal`);
        for (const label of ["Data inicial", "Data final"]) {
          const bounds = await page.getByLabel(label, { exact: true }).boundingBox();
          assert.ok(bounds.width > 50 && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `${label}: fora da tela`);
        }
        if (route === "/dashboard") {
          const details = page.getByText("Série mensal em tabela", { exact: true });
          if (!await details.evaluate(element => element.parentElement.open)) await details.click();
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Tabela mensal acessível sem overflow");
          await form.scrollIntoViewIfNeeded();
        }
        await page.locator(".map-side-panel").evaluateAll(panels => panels.forEach(panel => { panel.scrollTop = 0; }));
        await page.screenshot({ path: `${output}/${route.slice(1)}-${theme}-${width}.png` });
        await heat().scrollIntoViewIfNeeded();
        assert.ok((await heat().boundingBox()).height > 100, "Mapa continua acessível após o formulário");
        await page.screenshot({ path: `${output}/${route.slice(1)}-${theme}-${width}-map.png` });
      }
    }
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.getByLabel("Data inicial", { exact: true }).focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => document.activeElement.matches(":focus-visible") && getComputedStyle(document.activeElement).outlineStyle !== "none"));
    await page.getByLabel("Data final", { exact: true }).fill("2026-08-24");
    await page.getByLabel("Data final", { exact: true }).press("Enter");
    assert.match(await page.getByRole("status").filter({ hasText: "Período aplicado:" }).innerText(), /24\/08\/2026/);
    check(`${route}: temas claro/escuro, larguras 1366/768/390/320 px, campos acessíveis, foco visível e aplicação por Enter.`);
  }
  assert.deepEqual(errors, []);
  check("Nenhum erro JavaScript não tratado durante o roteiro.");
  await writeFile(`${output}/results.json`, JSON.stringify({ base, checkedAt: new Date().toISOString(), checks, samples, errors, limitations: ["Fonte Google bloqueada para evitar dependência de rede externa.", "Tiles do modo Satélite não são exercitados por este roteiro; usar check-satellite.mjs."] }, null, 2) + "\n");
} finally {
  await browser.close();
}
