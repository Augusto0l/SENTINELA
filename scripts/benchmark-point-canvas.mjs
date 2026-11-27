import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { chromium } from "playwright-core"
import ts from "typescript"

const require = createRequire(import.meta.url)
const modules = new Map()
function bundle(id) {
  if (modules.has(id)) return id
  const dependencies = {}
  let source = readFileSync(id, "utf8")
  if (/\.tsx?$/.test(id)) source = ts.transpileModule(source, {
    fileName: id, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  if (id.endsWith(".css")) source = "module.exports=new Proxy({}, {get:(_, name)=>name==='__esModule'?undefined:name})"
  modules.set(id, { source, dependencies })
  for (const [, specifier] of source.matchAll(/\brequire\(["']([^"']+)["']\)/g)) {
    const local = specifier.startsWith("@/") ? resolve("src", specifier.slice(2)) : null
    dependencies[specifier] = bundle(local ? (local.endsWith(".css") ? local : local + ".ts") : createRequire(id).resolve(specifier))
  }
  return id
}
const react = bundle(require.resolve("react"))
const dom = bundle(require.resolve("react-dom/client"))
const canvas = bundle(resolve("src/components/map/PointCanvasLayer.tsx"))
const css = readFileSync("src/components/map/AnalyticMap.module.css", "utf8").replace(/:global\((.*?)\)/g, "$1")
const script = `const process={env:{NODE_ENV:"production"}};
const modules={${[...modules].map(([id, { source, dependencies }]) =>
    `${JSON.stringify(id)}:[(require,module,exports)=>{${source}\n},${JSON.stringify(dependencies)}]`).join(",")}};
const cached={};function load(id){if(cached[id])return cached[id].exports;
const [fn,deps]=modules[id];const m=cached[id]={exports:{}};fn(key=>load(deps[key]),m,m.exports);return m.exports}
window.React=load(${JSON.stringify(react)});window.DOM=load(${JSON.stringify(dom)});
window.PointLayer=load(${JSON.stringify(canvas)}).default;`

const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
try {
  await page.route("**/*", route => {
    const url = new URL(route.request().url())
    if (url.origin !== "http://localhost:4671") return route.abort()
    if (url.pathname === "/bundle.js") return route.fulfill({ contentType: "application/javascript; charset=utf-8", body: script })
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><style>${css}
      body{margin:0;background:#07111f;color:white}#root{position:relative;width:1440px;height:900px}
      svg{display:block}</style><div id="root"></div><script src="/bundle.js"></script>` })
  })
  await page.goto("http://localhost:4671")
  await page.evaluate(() => {
    const h = React.createElement
    const root = DOM.createRoot(document.querySelector("#root"))
    let state = 731
    const rnd = () => (state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296
    // Duas áreas urbanas densas e uma periférica, com posições coincidentes.
    const points = Array.from({ length: 100000 }, (_, i) => {
      const [cx, cy] = [[440, 390], [275, 410], [730, 580]][i % 10 < 6 ? 0 : i % 10 < 9 ? 1 : 2]
      const x = i % 4 === 0 ? cx : cx + (rnd() + rnd() - 1) * 65
      const y = i % 4 === 0 ? cy : cy + (rnd() + rnd() - 1) * 65
      return { id: String(i), occurrenceId: String(i), x, y, raName: "RA de ensaio" }
    })
    function Map({ records, canvas, focused }) {
      const ref = React.useRef(null)
      return h(React.Fragment, null,
        h("svg", { ref, width: 1440, height: 900, viewBox: "0 0 1200 750" },
          h("rect", { width: 1200, height: 750, fill: "#11243a" }),
          !canvas && h("g", { "data-layer": "svg" }, records.map(p => h("g", { key: p.id, role: "button", tabIndex: 0 },
            h("circle", { cx: p.x, cy: p.y, r: 12, fill: "transparent" }),
            h("circle", { cx: p.x, cy: p.y, r: 2.4, fill: "#ef4444", stroke: "#fecaca", strokeWidth: .6 }))))),
        canvas && h(PointLayer, { points: records, focusedPoint: focused ? { ...records[0], underReview: true } : undefined,
          svgRef: ref, fittedWidth: 1200,
          onHover: m => { window.hoveredId = m?.point.occurrenceId }, onOpen: p => { window.openedId = p.occurrenceId } }))
    }
    window.mount = (count, canvas, focused = false) => root.render(h(Map, { key: `${count}:${canvas}:${focused}`, records: points.slice(0, count), canvas, focused }))
    window.unmount = () => root.render(null)
  })
  await page.evaluate(() => window.mount(5000, true))
  const layer = page.getByTestId("occurrence-points")
  await page.waitForFunction(() => document.querySelector('[data-testid="occurrence-points"]')?.dataset.pointCount === "5000")
  assert(Number(await layer.getAttribute("data-symbol-count")) < 5000)
  // Uma posição coincidente no primeiro centro abre a lista; foco e Enter acessam a ocorrência escolhida.
  await page.mouse.click(440 * 1.2, 390 * 1.2)
  await page.getByRole("region", { name: /ocorrências no símbolo/ }).waitFor()
  await page.waitForFunction(() => !!window.hoveredId)
  await page.keyboard.press("Enter")
  assert.equal(await page.evaluate(() => window.openedId === window.hoveredId), true)
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Selecionar ocorrências" }).focus()
  await page.keyboard.press("Enter")
  await page.getByRole("region", { name: "Ocorrências no enquadramento" }).waitFor()
  assert(await page.getByRole("button", { name: "Próxima" }).isEnabled())
  await page.getByRole("button", { name: "Próxima" }).click()
  await page.getByRole("button", { name: /Ocorrência 21/ }).waitFor()
  await page.keyboard.press("Escape")
  assert(await page.getByRole("button", { name: "Selecionar ocorrências" }).evaluate(button => button === document.activeElement))
  await page.evaluate(() => window.mount(5000, true, true))
  const selected = page.getByTestId("occurrence-marker")
  await selected.waitFor()
  assert.equal(await selected.getAttribute("data-selected"), "true")
  await selected.press("Enter")
  assert.equal(await page.evaluate(() => window.openedId), "0")

  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Performance.enable")
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(metric => [metric.name, metric.value]))
  for (const count of [5000, 20000, 60000, 100000]) {
    for (const mode of ["svg", "canvas"]) {
      const samples = []
      for (let trial = 0; trial < 3; trial += 1) {
        await page.evaluate(async () => { window.unmount(); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame) })
        await cdp.send("HeapProfiler.collectGarbage")
        const before = await metrics()
        const sample = await page.evaluate(async ({ count, mode }) => {
          const frame = () => new Promise(requestAnimationFrame)
          const start = performance.now()
          window.mount(count, mode === "canvas")
          const selector = mode === "canvas" ? '[data-testid="occurrence-points"]' : '[data-layer="svg"]'
          while (mode === "canvas" ? Number(document.querySelector(selector)?.dataset.pointCount) !== count : !document.querySelector(selector)) await frame()
          await frame()
          await frame()
          const mountMs = performance.now() - start
          const element = document.querySelector(selector)
          const domNodes = element.querySelectorAll("*").length + 1
          const svg = document.querySelector("svg")
          const frames = []
          let previous = await frame()
          const begin = previous
          while (previous - begin < 750) {
            const fraction = (previous - begin) / 750
            svg.setAttribute("viewBox", `${250 + 50 * fraction} ${320 + 30 * fraction} 240 150`)
            const current = await frame()
            frames.push(current - previous)
            previous = current
          }
          await frame()
          await frame()
          const fps = frames.length * 1000 / (previous - begin)
          const p95 = frames.sort((a, b) => a - b)[Math.floor((frames.length - 1) * .95)]
          return { mountMs, fps, p95, domNodes, drawn: Number(element.dataset.symbolCount ?? count), represented: Number(element.dataset.pointCount ?? count) }
        }, { count, mode })
        const after = await metrics()
        samples.push({ ...sample, cpuMs: (after.TaskDuration - before.TaskDuration) * 1000,
          heapMiB: (after.JSHeapUsedSize - before.JSHeapUsedSize) / 1048576 })
      }
      const median = key => Number(samples.map(sample => sample[key]).sort((a, b) => a - b)[1].toFixed(2))
      console.log(JSON.stringify({ count, mode, ...Object.fromEntries(Object.keys(samples[0]).map(key => [key, median(key)])) }))
    }
  }
} finally {
  await browser.close()
}
