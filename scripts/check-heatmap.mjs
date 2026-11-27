import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.env.SENTINELA_TEST_URL ?? "http://localhost:3000";
const output = "tmp/heatmap-evidence";
const before = process.argv.includes("--baseline");
mkdirSync(output, { recursive: true });
const baselineFile = `${output}/browser-before.json`;
const baseline = !before && existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, "utf8")) : {};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const map = () => page.locator('svg:has(path[role="button"])');
const ready = async route => {
  assert.equal((await page.goto(base + route, { waitUntil: "networkidle", timeout: 120000 })).status(), 200);
  await map().waitFor();
};
const snapshot = () => map().evaluate(svg => ({
  viewBox: svg.getAttribute("viewBox"),
  paths: [...svg.querySelectorAll('path[role="button"]')].map(p => ({ id: p.id, d: p.getAttribute("d"), fill: p.getAttribute("fill"), opacity: p.getAttribute("fill-opacity"), stroke: p.getAttribute("stroke"), strokeWidth: p.getAttribute("stroke-width") })),
  labels: [...svg.querySelectorAll("text")].map(p => ({ text: p.textContent, x: p.getAttribute("x"), y: p.getAttribute("y"), fill: p.getAttribute("fill") })),
  circles: [...svg.querySelectorAll("circle")].map(p => p.outerHTML),
  size: { width: svg.getBoundingClientRect().width, height: svg.getBoundingClientRect().height },
}));

const circlePositions = (circles) => circles.map(circle => ["cx", "cy"].map(name => circle.match(new RegExp(`${name}="([^"]+)"`))[1]));

const heatMetrics = () => page.locator('canvas[data-testid="crime-heatmap"]').evaluate(canvas => {
  const svg = canvas.closest("svg");
  const context = canvas.getContext("2d");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const paths = new Path2D();
  for (const path of svg.querySelectorAll('path[role="button"]')) paths.addPath(new Path2D(path.getAttribute("d")));
  const matrix = svg.getScreenCTM().inverse();
  const bounds = canvas.getBoundingClientRect();
  let alpha = 0;
  let painted = 0;
  let outside = 0;
  for (let y = 0; y < canvas.height; y += 3) {
    for (let x = 0; x < canvas.width; x += 3) {
      const value = pixels[(y * canvas.width + x) * 4 + 3];
      alpha += value;
      if (value > 0) painted++;
      if (value > 32) {
        const screenX = bounds.left + (x + 0.5) * bounds.width / canvas.width;
        const screenY = bounds.top + (y + 0.5) * bounds.height / canvas.height;
        const point = new DOMPoint(screenX, screenY).matrixTransform(matrix);
        // Permit the one-pixel antialias edge; reject heat outside the actual paths.
        const tolerance = Math.abs(matrix.a) + Math.abs(matrix.d);
        if (!context.isPointInPath(paths, point.x, point.y, "evenodd") && ![-tolerance, tolerance].some(dx => [-tolerance, tolerance].some(dy => context.isPointInPath(paths, point.x + dx, point.y + dy, "evenodd")))) outside++;
      }
    }
  }
  return { alpha, painted, outside, points: Number(canvas.dataset.pointCount), reference: Number(canvas.dataset.referencePeak), width: canvas.width, height: canvas.height };
});

try {
  await page.goto(base + "/login", { waitUntil: "networkidle", timeout: 120000 });
  for (const theme of ["escuro", "claro"]) {
    await page.evaluate(theme => localStorage.setItem("sentinela-theme", theme), theme);
    for (const route of ["/dashboard", "/mapa-criminal"]) {
      await ready(route);
      let heatPointCount = 0;
      for (const mode of ["heat", "points", "clusters"]) {
        const label = mode === "heat" ? (route === "/dashboard" ? "Mapa de calor" : "Calor") : mode === "points" ? "Pontos" : "Clusters";
        await page.getByRole("button", { name: label, exact: true }).click();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const key = `${theme}-${route.slice(1)}-${mode}`;
        const state = await snapshot();
        if (before) baseline[key] = state;
        else {
          if (baseline[key]) {
            const previous = baseline[key];
            assert.equal(state.viewBox, previous.viewBox);
            assert.deepEqual(state.paths.map(({ id, d }) => ({ id, d })), previous.paths.map(({ id, d }) => ({ id, d })));
            if (route !== "/dashboard") assert.deepEqual(state.size, previous.size);
            if (mode === "heat") {
              assert.deepEqual(state.labels.map(({ text, x, y }) => ({ text, x, y })), baseline[key].labels.map(({ text, x, y }) => ({ text, x, y })));
            } else if (mode === "points") {
              const oldPoints = previous.circles.filter(circle => circle.includes(' r="2.2"') || circle.includes(' r="2.4"'));
              assert.deepEqual(circlePositions(state.circles), circlePositions(oldPoints), "Coordenadas dos pontos preservadas");
            } else {
              // The previous style had two circles per cluster; the new style has one.
              const oldClusters = previous.circles.length === state.circles.length ? previous.circles : previous.circles.filter((_, index) => index % 2 === 1);
              assert.deepEqual(circlePositions(state.circles), circlePositions(oldClusters), "Centros dos clusters preservados");
            }
          }
          assert.equal(new Set(state.paths.map(p => p.fill)).size, 1, "Base neutra em todos os modos");
          assert.equal(await map().evaluate(svg => getComputedStyle(svg).backgroundColor), route === "/dashboard" ? "rgb(9, 23, 41)" : "rgb(7, 17, 31)");
          assert.equal(await map().locator('path[role="button"]').first().evaluate(path => getComputedStyle(path).fill), route === "/dashboard" ? "rgb(17, 42, 64)" : "rgb(17, 36, 58)");
          if (mode === "heat") {
            assert.equal(new Set(state.paths.map(p => p.fill)).size, 1);
            assert.equal(await page.locator('canvas[data-testid="crime-heatmap"]').count(), 1);
            const metrics = await heatMetrics();
            heatPointCount = metrics.points;
            assert.ok(metrics.painted > 0);
            assert.ok(metrics.reference > 1);
            assert.equal(metrics.outside, 0);
            console.log(`HEAT ${key} ${JSON.stringify(metrics)}`);
          }
          if (mode === "points") {
            assert.equal(state.circles.length, heatPointCount);
            assert.ok(state.circles.every(circle => circle.includes('fill="#ef4444"')));
            assert.equal(state.labels.length, 0);
            assert.equal(await map().getByTestId("ra-count-labels").count(), 0);
          }
          if (mode === "clusters") {
            const clusteredCount = await map().evaluate(svg => [...new Set([...svg.querySelectorAll("circle")].map(circle => circle.parentElement))].reduce((total, group) => total + Number(group.querySelector("text")?.textContent ?? 0), 0));
            assert.equal(clusteredCount, heatPointCount);
            assert.ok(state.circles.every(circle => circle.includes('fill="#2563eb"')));
            assert.equal(state.labels.length, state.circles.length, "Apenas contagens de clusters");
            assert.equal(await map().getByTestId("ra-count-labels").count(), 0);
            assert.ok(await map().getByTestId("occurrence-clusters").locator("text").evaluateAll(elements => elements.every(element => Number(element.getAttribute("font-size")) * Math.hypot(element.getScreenCTM().a, element.getScreenCTM().b) >= 8.99)));
          }
        }
        await page.screenshot({ path: `${output}/${before ? "before" : "after"}-${key}.png`, fullPage: true });
        console.log(`PASS ${before ? "baseline" : baseline[key] ? "comparison" : "render"} ${key}`);
      }
    }
  }
  if (before) writeFileSync(baselineFile, JSON.stringify(baseline, null, 2));
  if (!before) {
    await ready("/mapa-criminal");
    const full = await heatMetrics();
    await page.getByRole("combobox", { name: "Natureza criminal", exact: true }).selectOption({ label: "Furto" });
    await page.waitForFunction(count => Number(document.querySelector('canvas[data-testid="crime-heatmap"]').dataset.pointCount) < count, full.points);
    const filtered = await heatMetrics();
    assert.ok(filtered.points > 0 && filtered.points < full.points);
    assert.equal(filtered.reference, full.reference);
    assert.ok(filtered.alpha < full.alpha);
    assert.equal(filtered.outside, 0);
    for (const label of ["Pontos", "Clusters"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      assert.equal(await map().getByTestId("ra-count-labels").count(), 0);
      const shown = label === "Pontos" ? await map().locator("circle").count() : await map().getByTestId("occurrence-clusters").locator("text").evaluateAll(elements => elements.reduce((sum, element) => sum + Number(element.textContent), 0));
      assert.equal(shown, filtered.points, `Filtro preservado em ${label}`);
      if (label === "Pontos") {
        await map().locator("circle").first().hover({ force: true });
        await page.getByText(/^DEMO-\d+$/).waitFor();
        await page.mouse.move(1, 1);
        const ra = map().locator('path[role="button"]').first();
        await ra.dispatchEvent("mouseover");
        await ra.dispatchEvent("mousemove", { clientX: 500, clientY: 350 });
        await page.getByText("RA-I", { exact: true }).waitFor();
        await ra.dispatchEvent("mouseout");
      }
    }
    await page.getByRole("button", { name: "Calor", exact: true }).click();
    console.log("PASS filtros e quantitativos em Pontos/Clusters; tooltips de ocorrência e RA preservados");
    await page.getByRole("combobox", { name: "Região Administrativa", exact: true }).selectOption("RA-I");
    await page.waitForFunction(() => document.querySelectorAll('svg path[role="button"]').length === 1);
    const selected = await snapshot();
    const selectedHeat = await heatMetrics();
    assert.equal(selectedHeat.outside, 0);
    assert.equal(selectedHeat.reference, full.reference);
    const canvas = page.getByTestId("crime-heatmap");
    const canvasWidth = await canvas.evaluate(node => node.getBoundingClientRect().width);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForFunction(width => document.querySelector('canvas[data-testid="crime-heatmap"]').getBoundingClientRect().width !== width, canvasWidth);
    const resized = await snapshot();
    assert.equal(resized.viewBox, selected.viewBox);
    assert.deepEqual(resized.paths.map(p => p.d), selected.paths.map(p => p.d));
    assert.equal((await heatMetrics()).outside, 0);
    await page.screenshot({ path: `${output}/after-selected-ra-resized.png`, fullPage: true });
    console.log("PASS filtros, referencia fixa, selecao de RA, recorte e redimensionamento");
    await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
    await page.getByRole("combobox", { name: "Período da base fictícia", exact: true }).selectOption("today");
    await page.waitForFunction(() => Number(document.querySelector('canvas[data-testid="crime-heatmap"]').dataset.pointCount) === 0);
    const empty = await heatMetrics();
    assert.equal(empty.alpha, 0);
    assert.equal(empty.reference, full.reference);
    for (const label of ["Pontos", "Clusters"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      assert.equal(await map().locator("circle").count(), 0);
      assert.equal(await map().locator("text").count(), 0);
    }
    await page.getByRole("button", { name: "Calor", exact: true }).click();
    await page.getByRole("combobox", { name: "Período da base fictícia", exact: true }).selectOption("7d");
    await page.getByRole("combobox", { name: "Faixa de horário", exact: true }).selectOption("18-24");
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const combined = await heatMetrics();
    const displayedCount = await map().evaluate(svg => [...svg.querySelectorAll('path[role="button"]')].reduce((sum, path) => sum + Number(path.getAttribute("aria-label").match(/(\d+) ocorr/)[1]), 0));
    assert.equal(combined.points, displayedCount);
    assert.equal(combined.reference, full.reference);
    await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
    await page.locator('svg path[role="button"]').first().focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll('svg path[role="button"]').length === 1);
    assert.equal(await page.getByRole("combobox", { name: "Região Administrativa", exact: true }).inputValue(), "RA-I");
    console.log("PASS vazio transparente, periodo/horario e selecao de RA por teclado");
    for (const theme of ["escuro", "claro"]) {
      await page.evaluate(theme => localStorage.setItem("sentinela-theme", theme), theme);
      for (const width of [820, 390, 320]) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 1024 });
        for (const route of ["/dashboard", "/mapa-criminal"]) {
          await ready(route);
          for (const label of [route === "/dashboard" ? "Mapa de calor" : "Calor", "Pontos", "Clusters"]) {
            await page.getByRole("button", { name: label, exact: true }).click();
            await map().scrollIntoViewIfNeeded();
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            if (label === "Clusters") assert.ok(await map().getByTestId("occurrence-clusters").locator("text").evaluateAll(elements => elements.every(element => Number(element.getAttribute("font-size")) * Math.hypot(element.getScreenCTM().a, element.getScreenCTM().b) >= 8.99)), "Texto dos clusters com mínimo de 9 px");
            const box = await map().boundingBox();
            assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
            const legendText = label === "Clusters" ? /^Quantidade de ocorrências agrupadas$/ : label === "Pontos" ? /^Ocorrência individual$/ : /^(Densidade de ocorrências)?Menor densidadeMaior densidadeBaixaMédiaAlta$/;
            const legend = await map().locator("..").locator('div').filter({ hasText: legendText }).last().boundingBox();
            assert.ok(legend && legend.x >= box.x && legend.x + legend.width <= box.x + box.width + 1, "Legenda cabe no mapa");
            await page.screenshot({ path: `${output}/responsive-${theme}-${route.slice(1)}-${width}-${label === "Clusters" ? "clusters" : label === "Pontos" ? "points" : "heat"}.png` });
          }
        }
      }
    }
    await page.setViewportSize({ width: 1366, height: 900 });
    for (const label of ["Mapa de calor", "Pontos", "Clusters"]) {
      await ready("/dashboard");
      await page.getByRole("button", { name: label, exact: true }).click();
      await map().locator('path[role="button"]').first().dispatchEvent("click");
      await page.waitForURL(/mapa-criminal\?ra=RA-I/);
      await map().waitFor();
      assert.equal(await page.getByRole("combobox", { name: "Região Administrativa", exact: true }).inputValue(), "RA-I");
      assert.notEqual(await map().getAttribute("viewBox"), baseline["escuro-dashboard-heat"]?.viewBox ?? "0 0 1200 717.6");
    }
    console.log("PASS responsividade 820/390/320 nos dois temas e mapas; navegação e enquadramento da RA nos três modos");
    const preservedFile = `${output}/cartography-preserved.json`;
    if (existsSync(preservedFile)) {
      const preserved = JSON.parse(readFileSync(preservedFile, "utf8"));
      for (const [file, hash] of Object.entries(preserved)) {
        // The dashboard and satellite panel now represent loading and failed counts.
        if (["src/features/Dashboard.tsx", "src/components/map/SatelliteMap.tsx"].includes(file)) continue;
        const source = file === "clusterAlgorithm" ? readFileSync("src/components/map/MapaDF.tsx", "utf8") : null;
        const content = source ? source.slice(source.indexOf("function buildClusters("), source.indexOf("function svgToLatLon(")) : readFileSync(file);
        assert.equal(createHash("sha256").update(content).digest("hex"), hash, `Preservado: ${file}`);
      }
      console.log("PASS hashes dos arquivos preservados de satélite, telas, dados, geometrias, permissões e algoritmo de clusters");
    }
    const hashesFile = `${output}/baseline-hashes.json`;
    if (existsSync(hashesFile)) {
      const hashes = JSON.parse(readFileSync(hashesFile, "utf8"));
      for (const [file, hash] of Object.entries(hashes)) {
        // Both screen selectors now include Satélite. The SVG comparisons above
        // still cover the existing modes; geometry, mocks and analysis stay immutable.
        if (["src/components/map/MapaDF.tsx", "src/index.css", "src/features/CrimeMap.tsx", "src/features/Dashboard.tsx"].includes(file)) continue;
        assert.equal(createHash("sha256").update(readFileSync(file)).digest("hex"), hash, `Arquivo preservado: ${file}`);
      }
      console.log("PASS hashes da geometria, GeoJSON, mocks e filtros preservados");
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
