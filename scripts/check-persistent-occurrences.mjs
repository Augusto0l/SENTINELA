// Playwright HTTP fixtures live ONLY in this qualification script, never application code.

import "./contracts-runtime.mjs"

import assert from "node:assert/strict"

import { join } from "node:path"

import { writeFile } from "node:fs/promises"

import { chromium } from "playwright-core"

const { contractModels } = await import("../src/contracts/examples.ts")

const { CATALOG_PATHS } = await import("../src/contracts/persistent-catalogs.ts")

const { contractError } = await import("../src/contracts/common.ts")

export async function checkOccurrenceInterface({
  origin,
  cookie,
  privateDir,
  securityOnly,
  role,
}) {
  const browser = await chromium.launch({ channel: "msedge", headless: true })

  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  })

  const [name, value] = cookie.split("=")

  await context.addCookies([
    { name, value, url: origin, httpOnly: true, sameSite: "Strict" },
  ])

  const page = await context.newPage(),
    checks = [],
    errors = [],
    requests = []

  page.on("pageerror", (e) => errors.push(e.message))

  let mode = "real",
    delayedDetail = false, catalogMode = "real"
  const catalogRequests = []

  const meta = contractModels.PersistentDetail.example.meta

  const item = (i) => ({
    ...structuredClone(contractModels.PersistentDetail.example.data),
    id: `50000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    local: i === 1 ? null : "Local sintético",
    ra: {
      id: "10000000-0000-4000-8000-000000000001",
      codigo: "TESTE",
      nome: "Região sintética",
    },
    naturezas: [1, 2].map((n) => ({
      id: `60000000-0000-4000-8000-${String(n + i * 10).padStart(12, "0")}`,
      crimeTentado: false,
      classificacaoStatus: "homologada",
      natureza: {
        id: `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        descricao: `Natureza sintética ${n}`,
        categoriaOriginal: null,
      },
      categoria: null,
    })),
  })

  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url())

    if (url.origin !== origin) return route.abort()

    const kind = Object.keys(CATALOG_PATHS).find(k => CATALOG_PATHS[k] === url.pathname)
    if (kind) {
      catalogRequests.push({method:route.request().method(),url:url.href})
      const capturedCatalogMode = catalogMode
      if (capturedCatalogMode === "real") return route.continue()
      if (capturedCatalogMode === "network") return route.abort()
      if (capturedCatalogMode === "invalid") return route.fulfill({json:{unexpected:true}})
      if (/^error\d+$/.test(capturedCatalogMode)) {
        const status=Number(capturedCatalogMode.slice(5))
        return route.fulfill({status,json:contractError({401:"UNAUTHORIZED",403:"FORBIDDEN",503:"SERVICE_UNAVAILABLE"}[status],"Teste sint\u00e9tico")})
      }
      if(capturedCatalogMode === "delay")await new Promise(r=>setTimeout(r,600))
      const example=contractModels[kind === "regioes" ? "RegionCatalog" : "NatureCatalog"].example
      const data=capturedCatalogMode === "empty" ? {items:[]} : example.data
      try { return await route.fulfill({json:{success:true,data,meta}}) } catch { return }
    }
    if (!url.pathname.startsWith("/api/v1/ocorrencias")) return route.continue()

    requests.push({ method: route.request().method(), url: url.href })

    if (mode === "real") return route.continue()

    if (mode === "network") return route.abort()

    if (mode === "invalid") return route.fulfill({ json: { unexpected: true } })

    if (/^error\d+$/.test(mode)) {
      const status = Number(mode.slice(5))
      return route.fulfill({
        status,
        json: contractError(
          {
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            422: "VALIDATION_ERROR",
            503: "SERVICE_UNAVAILABLE",
          }[status],
          "Teste sintético",
        ),
      })
    }

    const isDetail = url.pathname !== "/api/v1/ocorrencias"

    if (isDetail) {
      const id = url.pathname.split("/").at(-1)

      if (delayedDetail && id.endsWith("000000000001"))
        await new Promise((r) => setTimeout(r, 600))

      try {
        return await route.fulfill({
          json: {
            success: true,
            data: { ...item(Number(id.slice(-2))), id },
            meta,
          },
        })
      } catch {
        return
      }
    }

    const query = url.searchParams,
      pageNumber = Number(query.get("page") ?? 1),
      size = Number(query.get("pageSize") ?? 25)

    const captured = mode

    if (mode === "delay") await new Promise((r) => setTimeout(r, 600))

    if (query.get("local") === "lenta")
      await new Promise((r) => setTimeout(r, 700))

    const filtered = [
      "raId",
      "naturezaId",
      "startDate",
      "endDate",
      "local",
      "identificacao",
    ].some((k) => query.has(k))

    const total =
      captured === "empty" ? 0 : captured === "shrink" || filtered ? 1 : 26

    const items = Array.from(
      { length: Math.min(size, Math.max(0, total - (pageNumber - 1) * size)) },
      (_, i) => ({
        ...item((pageNumber - 1) * size + i + 1),
        ...(query.has("local") ? { local: query.get("local") } : {}),
      }),
    )

    try {
      return await route.fulfill({
        json: {
          success: true,
          data: {
            items,
            pagination: {
              page: pageNumber,
              pageSize: size,
              total,
              totalPages: Math.ceil(total / size),
            },
          },
          meta,
        },
      })
    } catch {
      return
    }
  })

  const pass = (name, source = "browser-contract-http-fixtures") =>
    checks.push({ name: `ui_${role}_${name}`, source })

  const waitText = (text) =>
    page.getByText(text, { exact: false }).first().waitFor({ timeout: 30000 })

  const reload = async () => {
    await page.reload()
    await page
      .getByRole("heading", { name: "Ocorrências", exact: true })
      .waitFor()
  }

  try {
    await page.goto(origin + "/ocorrencias")

    if (securityOnly) await waitText("Serviço de leitura indisponível")
    else {
      await waitText("Nenhuma ocorrência disponível na base local.")
      assert.equal(await page.locator("tbody tr").count(), 0)
    }

    pass(
      securityOnly
        ? "real_http_unavailable_without_database"
        : "real_postgresql_empty_screen",
      securityOnly ? "real-http-no-database" : "real-http-postgresql",
    )

    const demoCreate = page.getByRole("link", {
      name: "Novo cadastro demonstrativo",
      exact: true,
    })
    if (role === "Analista") assert.equal(await demoCreate.count(), 0)
    else assert.equal(await demoCreate.getAttribute("href"), "/ocorrencias/nova")
    pass("create_entry_demonstration_only")

    if (role !== "Administrador") return checks

    mode = "empty"
    catalogMode = "empty"
    await reload()
    await waitText("Nenhuma ocorrência disponível na base local.")

    assert(
      await page
        .getByRole("button", { name: "Próxima página", exact: true })
        .isDisabled(),
    )
    for(const label of ["Regi\u00e3o Administrativa","Natureza criminal original"])assert(await page.getByRole("combobox",{name:label,exact:true}).isDisabled())
    await waitText("Nenhuma regi\u00e3o vis\u00edvel no cat\u00e1logo persistente.")
    await waitText("Nenhuma natureza vis\u00edvel no cat\u00e1logo persistente.")
    pass("empty_catalogs_disabled_without_mock_options")
    pass("empty_and_disabled_pagination")
    await page.getByRole("searchbox", {name:"Buscar localiza\u00e7\u00e3o",exact:true}).fill("sem correspondencia")
    await page.getByRole("button", {name:"Aplicar filtros",exact:true}).click()
    await waitText("Nenhuma ocorr\u00eancia corresponde aos filtros aplicados.")
    assert.equal(await page.locator("tbody tr").count(),0)
    await page.getByRole("button", {name:"Limpar filtros",exact:true}).click()
    await waitText("Nenhuma ocorr\u00eancia dispon\u00edvel na base local.")
    pass("filtered_empty_distinguished_from_empty_database")

    mode = "delay"
    catalogMode = "delay"
    await reload()
    await waitText("Carregando regi\u00f5es")
    assert(await page.getByRole("combobox",{name:"Regi\u00e3o Administrativa",exact:true}).isDisabled())
    await waitText("Carregando ocorrências")
    await page.waitForFunction(
      () => document.querySelectorAll("tbody tr").length === 25,
    )

    pass("initial_loading_and_25_rows")

    mode = "filled"
    catalogMode = "filled"
    await page.getByRole("combobox",{name:"Regi\u00e3o Administrativa",exact:true}).locator('option[value="10000000-0000-4000-8000-000000000001"]').waitFor({state:"attached"})
    pass("catalog_loading_and_readable_persisted_options")

    await waitText("26 registros")

    await page
      .getByRole("button", { name: "Próxima página", exact: true })
      .click()
    await waitText("Página 2 de 2")
    assert.equal(await page.locator("tbody tr").count(), 1)

    await page
      .getByRole("button", {
        name: "Ordenar por Data em ordem crescente",
        exact: true,
      })
      .click()
    await waitText("Página 1 de 2")

    assert.equal(await page.locator('th[aria-sort="ascending"]').count(), 1)

    await page
      .getByRole("button", {
        name: "Ordenar por Data em ordem decrescente",
        exact: true,
      })
      .click()
    await page.locator('th[aria-sort="descending"]').waitFor()

    pass("server_pagination_total_and_sort_aria")

    await page.waitForFunction(() => document.querySelector('section[aria-busy="false"]'))
    await page.getByRole("button", {name:"Pr\u00f3xima p\u00e1gina",exact:true}).click()
    await waitText("P\u00e1gina 2 de 2")
    const start = requests.length
    const catalogStart = catalogRequests.length

    await page
      .getByRole("searchbox", { name: "Buscar identificação", exact: true })
      .fill("identificação sintética")

    await page
      .getByRole("searchbox", { name: "Buscar localização", exact: true })
      .fill("local sintético")

    await page
      .getByRole("combobox", {
        name: "Regi\u00e3o Administrativa",
        exact: true,
      })
      .selectOption("10000000-0000-4000-8000-000000000001")

    await page
      .getByRole("combobox", { name: "Natureza criminal original", exact: true })
      .selectOption("30000000-0000-4000-8000-000000000001")

    await page.getByLabel("Data inicial", { exact: true }).fill("2026-01-01")
    await page.getByLabel("Data final", { exact: true }).fill("2026-12-31")

    assert.equal(requests.length, start)

    await page
      .getByRole("button", { name: "Aplicar filtros", exact: true })
      .click()
    await waitText("Página 1 de 1")

    const applied = new URL(requests.at(-1).url)
    for (const key of [
      "identificacao",
      "local",
      "raId",
      "naturezaId",
      "startDate",
      "endDate",
    ])
      assert(applied.searchParams.has(key))

    assert.equal(applied.searchParams.get("page"), "1")
    assert.equal(applied.searchParams.get("raId"),"10000000-0000-4000-8000-000000000001")
    assert.equal(applied.searchParams.get("naturezaId"),"30000000-0000-4000-8000-000000000001")
    assert.equal(catalogRequests.length,catalogStart)
    pass("combined_filters_real_UUIDs_no_catalog_refetch_pagination_reset")
    pass("combined_filters_apply_no_typing_requests")

    await page.getByLabel("Data inicial", { exact: true }).fill("2026-12-31")
    await page.getByLabel("Data final", { exact: true }).fill("2026-01-01")

    const before = requests.length
    await page
      .getByRole("button", { name: "Aplicar filtros", exact: true })
      .click()
    await waitText("Revise os identificadores e as datas")
    assert.equal(requests.length, before)
    pass("invalid_dates_no_request")

    await page
      .getByRole("button", { name: "Limpar filtros", exact: true })
      .click()
    await waitText("Página 1 de 2")
    assert(!new URL(requests.at(-1).url).searchParams.has("local"))
    for(const label of ["Regi\u00e3o Administrativa","Natureza criminal original"])assert.equal(await page.getByRole("combobox",{name:label,exact:true}).inputValue(),"")
    assert.equal(catalogRequests.length,catalogStart)
    pass("clear_filters")

    await page
      .getByRole("searchbox", {
        name: "Buscar localiza\u00e7\u00e3o",
        exact: true,
      })
      .fill("lenta")

    await page
      .getByRole("button", { name: "Aplicar filtros", exact: true })
      .click()

    await page.waitForTimeout(100)

    await page
      .getByRole("searchbox", {
        name: "Buscar localiza\u00e7\u00e3o",
        exact: true,
      })
      .fill("rapida")

    await page
      .getByRole("button", { name: "Aplicar filtros", exact: true })
      .click()
    await page.locator("tbody").getByText("rapida", { exact: true }).waitFor()

    await page.waitForTimeout(800)
    assert.equal(
      await page.locator("tbody").getByText("lenta", { exact: true }).count(),
      0,
    )
    pass("obsolete_filter_responses_ignored")

    await page
      .getByRole("button", { name: "Limpar filtros", exact: true })
      .click()
    await waitText("P\u00e1gina 1 de 2")

    assert(
      await page
        .getByRole("button", { name: "Editar", exact: true })
        .first()
        .isDisabled(),
    )

    assert(
      await page
        .getByRole("button", { name: "Inativar", exact: true })
        .first()
        .isDisabled(),
    )
    pass("write_actions_disabled")

    const first = page.getByRole("button", {
      name: "Ver detalhes de 50000000-0000-4000-8000-000000000001",
      exact: true,
    })

    const detailBefore = requests.filter((r) =>
      new URL(r.url).pathname.endsWith("000000000001"),
    ).length

    await first.focus()
    await first.click()
    await page.getByRole("dialog").waitFor()
    await page
      .getByRole("dialog")
      .getByText("Natureza sintética 2", { exact: false })
      .waitFor()

    await page
      .getByRole("dialog")
      .getByText("Não informado", { exact: true })
      .first()
      .waitFor()

    assert(
      requests.filter((r) => new URL(r.url).pathname.endsWith("000000000001"))
        .length >=
        detailBefore + 1,
    ) // React development StrictMode may abort and replay the initial effect.

    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "detached" })
    assert(await first.evaluate((e) => e === document.activeElement))
    pass("lazy_details_multiple_natures_null_escape_focus")

    delayedDetail = true
    await first.click()
    await page.getByRole("dialog").waitFor()
    await page.keyboard.press("Escape")

    const second = page.getByRole("button", {
      name: "Ver detalhes de 50000000-0000-4000-8000-000000000002",
      exact: true,
    })
    await second.click()

    await page
      .getByRole("dialog")
      .getByText("50000000-0000-4000-8000-000000000002", { exact: true })
      .waitFor()
    await page.waitForTimeout(750)

    assert.equal(
      await page
        .getByRole("dialog")
        .getByText("50000000-0000-4000-8000-000000000001", { exact: true })
        .count(),
      0,
    )

    await page
      .getByRole("button", { name: "Fechar detalhes", exact: true })
      .click()
    pass("obsolete_details_ignored")

    for (const status of [401, 403, 422, 503]) {
      mode = "error" + status
      await reload()
      await page
        .getByRole("region", { name: "Resultados de ocorr\u00eancias" })
        .getByRole("alert")
        .waitFor()
      assert.equal(await page.locator("tbody tr").count(), 0)
    }

    await page
      .getByRole("button", { name: "Tentar novamente", exact: true })
      .waitFor()
    mode = "filled"
    await page
      .getByRole("button", { name: "Tentar novamente", exact: true })
      .click()
    await waitText("Página 1 de 2")
    pass("authorization_errors_retry_no_fallback")

    mode = "error404"
    await first.click()
    await page.getByRole("dialog").getByRole("alert").waitFor()
    await page.keyboard.press("Escape")
    pass("details_not_found")

    for (const value of ["network", "invalid"]) {
      mode = value
      await reload()
      await page
        .getByRole("region", { name: "Resultados de ocorr\u00eancias" })
        .getByRole("alert")
        .waitFor()
      assert.equal(await page.locator("tbody tr").count(), 0)
    }
    pass("network_and_invalid_contract")

    mode = "filled"
    await reload()
    await waitText("Página 1 de 2")

    for(const failure of ["error401","error403","error503","network","invalid"]) {
      catalogMode=failure
      await reload()
      await page.locator("form").getByRole("alert").first().waitFor()
      for(const label of ["Regi\u00e3o Administrativa","Natureza criminal original"]){
        const select=page.getByRole("combobox",{name:label,exact:true})
        assert(await select.isDisabled());assert.equal(await select.locator("option").count(),1)
      }
      if(failure==="error401")assert(await page.locator("form").getByRole("link",{name:"Entrar novamente",exact:true}).count()>=1)
      pass(`catalog_${failure}_no_fallback`)
    }
    catalogMode="filled"
    await page.locator("form").getByRole("button",{name:"Tentar novamente",exact:true}).first().click()
    await page.getByRole("combobox",{name:"Regi\u00e3o Administrativa",exact:true}).locator('option[value="10000000-0000-4000-8000-000000000001"]').waitFor({state:"attached"})
    await reload()
    await waitText("P\u00e1gina 1 de 2")
    pass("catalog_retry_recovers")

    mode = "shrink"
    await page
      .getByRole("button", { name: "Próxima página", exact: true })
      .click()
    await waitText("Página 1 de 1")
    pass("empty_page_recovers_to_last_valid_page")

    mode = "filled"
    await page.setViewportSize({ width: 320, height: 900 })
    await reload()
    await waitText("26 registros")

    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )

    await page.screenshot({
      path: join(privateDir, "occurrences-filled-320.png"),
      fullPage: true,
    })
    pass("filled_table_mobile_scroll")

    mode = "empty"
    await reload()
    await waitText("Nenhuma ocorrência disponível na base local.")

    for (const theme of ["claro", "escuro"])
      for (const width of [1366, 768, 390, 320]) {
        await page.evaluate(
          (theme) => localStorage.setItem("sentinela-theme", theme),
          theme,
        )
        await page.setViewportSize({ width, height: 900 })
        await reload()
        await waitText("Nenhuma ocorrência disponível na base local.")

        assert.equal(
          await page.locator("html").getAttribute("data-theme"),
          theme,
        )

        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        )

        await page.screenshot({
          path: join(privateDir, `occurrences-${theme}-${width}.png`),
          fullPage: true,
        })
        pass(`responsive_${theme}_${width}`)
      }

    await page.setViewportSize({width:1366,height:900})
    for (const route of ["/dashboard", "/mapa-criminal"]) {
      await page.goto(origin+route)
      await page.locator(".system-topbar").getByText("Demonstra\u00e7\u00e3o \u00b7 sem persist\u00eancia", {exact:true}).waitFor()
      assert.equal(await page.locator(".system-topbar").getByText("PostgreSQL local \u00b7 leitura", {exact:true}).count(),0)
    }
    pass("shared_header_dashboard_and_map_unchanged")
    assert([...requests,...catalogRequests].every((r) => r.method === "GET"))
    assert.equal(errors.length, 0)
    pass("no_data_writes_or_browser_errors")

    return checks
  } catch (error) {
    await writeFile(
      join(privateDir, `ui-${role}-diagnostic.json`),
      JSON.stringify(
        {
          checks,
          message: String(error.message)
            .replace(/https?:\/\/[^\s]+/g, "[endpoint]")
            .slice(0, 1200),
        },
        null,
        2,
      ),
    )

    throw new Error(
      "Interface qualification failed; sanitized private diagnostic preserved",
    )
  } finally {
    await browser.close()
  }
}
