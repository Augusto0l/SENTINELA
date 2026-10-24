import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.env.SENTINELA_TEST_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const ready = async route => {
  assert.equal((await page.goto(base + route)).status(), 200);
  await page.locator(".system-topbar").waitFor();
};
try {
  for (const theme of ["claro", "escuro"]) {
    await ready("/ocorrencias");
    await page.evaluate(theme => { localStorage.setItem("sentinela-theme", theme); }, theme);
    await page.reload();
    const search = page.getByRole("textbox", { name: "Buscar ID, RA, natureza ou localização" });
    await search.waitFor();
    assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
    const count = async () => Number((await page.locator("p").filter({ hasText: "registros demonstrativos" }).innerText()).match(/[\d.]+/)[0].replaceAll(".", ""));
    const total = await count();
    assert.equal(await page.locator("tbody tr").count(), 25);
    await page.getByRole("button", { name: "Próxima página", exact: true }).click();
    await page.getByText(/^Página 2 de/).waitFor();
    await page.getByRole("button", { name: "Ordenar por Data em ordem crescente", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByText(/^Página 1 de/).waitFor();
    assert.equal((await page.locator('th[aria-sort="ascending"]').innerText()).toLocaleLowerCase("pt-BR"), "data ↑");
    await page.getByRole("button", { name: "Ordenar por Data em ordem decrescente", exact: true }).click();
    assert.equal(await page.locator('th[aria-sort="descending"]').count(), 1);
    const row = page.locator("tbody tr").first();
    const values = (await row.locator("td").allTextContents()).slice(0, 6);
    const trigger = row.getByRole("button", { name: /^Ver detalhes/ });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Detalhes da ocorrência", exact: true });
    await dialog.waitFor();
    for (const value of values) assert.ok((await dialog.innerText()).includes(value));
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)));
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.ok(await trigger.evaluate(el => el === document.activeElement));
    await trigger.click();
    await dialog.getByRole("button", { name: "Fechar detalhes" }).click();
    assert.ok(await trigger.evaluate(el => el === document.activeElement));
    const ra = await page.getByRole("combobox", { name: "Filtrar por Região Administrativa" }).locator("option").nth(1).getAttribute("value");
    await page.getByRole("combobox", { name: "Filtrar por Região Administrativa" }).selectOption(ra);
    const nature = await page.locator("tbody tr td").nth(3).innerText();
    const local = await page.locator("tbody tr td").nth(5).innerText();
    await page.getByRole("combobox", { name: "Filtrar por natureza" }).selectOption(nature);
    await search.fill(`  ${local.toUpperCase().replaceAll(" ", "   ")}  `);
    assert.equal(await count(), 1);
    await search.fill("REGISTRO-INEXISTENTE");
    await page.getByText("Nenhum registro encontrado com os filtros aplicados.").waitFor();
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    assert.equal(await search.inputValue(), "");
    assert.equal(await count(), total);
    for (const viewport of [{ width: 1366, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.locator("tbody tr").first().getByRole("button", { name: /^Ver detalhes/ }).click();
      const box = await dialog.boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
      await page.keyboard.press("Escape");
    }
    console.log(`Ocorrências: ${theme}, ${total} registros; filtros, ordenação, paginação, modal, foco e três resoluções aprovados.`);
    await ready("/dashboard");
    const dashboard = Number((await page.locator(".kpi-grid > div").first().innerText()).match(/\n([\d.]+)\n/)[1].replaceAll(".", ""));
    assert.equal(dashboard, total);
    await ready("/mapa-criminal");
    await page.locator('svg path[aria-label$="ocorrências demonstrativas"]').first().waitFor();
    const mapTotal = await page.locator('svg path[aria-label$="ocorrências demonstrativas"]').evaluateAll(elements => elements.reduce((sum, el) => sum + Number(el.getAttribute("aria-label").match(/: (\d+) ocorrências/)[1]), 0));
    assert.equal(mapTotal, total);
  }
  assert.deepEqual(errors, []);
  console.log("Dashboard e Mapa mantêm os quantitativos; nenhum erro JavaScript de página.");
} finally {
  await browser.close();
}
