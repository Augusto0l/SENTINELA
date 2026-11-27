"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import NavigationIcon, { type NavigationIconName } from "@/components/NavigationIcon"
import Button from "@/components/ui/button"
import Dialog, { DialogClose, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { manualCatalogResponse, manualEditFields, manualMeans, manualOccurrencesPath, manualOccurrenceSchema, manualQuantityMaximum,
  manualReceiptResponse, nowInDf, type ManualCatalog, type ManualEditDraft, type ManualEditFields } from "@/contracts/manual-occurrences"
import { coordinateSchema } from "@/contracts/common"
import { completeCep, type AddressLocation, type PostalAddress } from "@/data/addressLocation"
import type { RaGeoJSON } from "@/data/geoLoader"
import { CARTOGRAPHY_PATH, structurallyValidCartography, validateTerritory } from "@/data/territorial-validation"
import territoryBindings from "../../../public/data/cartography/ra-bindings.json"
import ManualLocation from "./ManualLocation"
import useManualLocationSearch, { canSearchLocation } from "./use-manual-location-search"
import ManualNaturePicker from "./ManualNaturePicker"
import styles from "./ManualCreate.module.css"

const blank = { data: "", horario: "", cep: "", endereco: "", bairroOuSetor: "", numero: "",
  complemento: "", referencia: "", latitude: "", longitude: "" }
type Field = keyof typeof blank
const blankCrime = { descricao: "", meio: "", vitimas: "", autores: "", observacoes: "" }
const attemptValues = { consumado: false, tentado: true, "nao-informada": null } as const
const meansOptions = Object.entries(manualMeans)
type Nature = { key: number; id: string; tentativa: "" | keyof typeof attemptValues }
type Edition = { initial: ManualEditDraft; onSave: (dados: ManualEditFields, justificativa: string) => Promise<void>; onCancel: () => void; error: string }

function Heading({ icon, title, children }: { icon: NavigationIconName; title: string; children: ReactNode }) {
  return <div className={styles.heading}>
    <span className={styles.headingIcon}><NavigationIcon name={icon} size={23} /></span>
    <div><h2>{title}</h2><p>{children}</p></div>
  </div>
}

const formatCep = (value: string) => value.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2")
const territorialNames = new Map(territoryBindings.entries.map(entry => [entry.code, entry.catalogName]))
const firstStepSchema = manualOccurrenceSchema.pick({ data: true, horario: true, endereco: true, bairroOuSetor: true, coordenadas: true })

export default function ManualCreate({ edit }: { edit?: Edition } = {}) {
  const router = useRouter()
  const initial = edit?.initial
  const cepRequired = !initial || initial.cep !== undefined
  const crimeRequired = (key: "descricao" | "meio" | "vitimas" | "autores") => !initial || initial.dadosCrime[key] !== undefined
  const [crimeStep, setCrimeStep] = useState(false)
  const [draft, setDraft] = useState(() => initial ? {
    data: initial.data, horario: initial.horario, cep: formatCep(initial.cep ?? ""), endereco: initial.endereco,
    bairroOuSetor: initial.bairroOuSetor, numero: initial.numero ?? "", complemento: initial.complemento ?? "",
    referencia: initial.referencia ?? "", latitude: String(initial.coordenadas.latitude), longitude: String(initial.coordenadas.longitude),
  } : blank)
  const [crimeDraft, setCrimeDraft] = useState(() => initial ? {
    descricao: initial.dadosCrime.descricao ?? "", meio: initial.dadosCrime.meio ?? "",
    vitimas: String(initial.dadosCrime.vitimas ?? ""), autores: String(initial.dadosCrime.autores ?? ""),
    observacoes: initial.dadosCrime.observacoes ?? "",
  } : blankCrime)
  const [crimeAttempted, setCrimeAttempted] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState<string | null>()
  const [natureRows, setNatureRows] = useState<Nature[]>(() => initial?.naturezas.map(({ naturezaId, crimeTentado }, key) =>
    ({ key, id: naturezaId, tentativa: crimeTentado === null ? "nao-informada" : crimeTentado ? "tentado" : "consumado" }))
    ?? [{ key: 0, id: "", tentativa: "" }])
  const [catalog, setCatalog] = useState<ManualCatalog>()
  const [catalogError, setCatalogError] = useState("")
  const [cycle, setCycle] = useState(0)
  const [geo, setGeo] = useState<RaGeoJSON | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [addressChanged, setAddressChanged] = useState(false)
  const [postal, setPostal] = useState<{ code: string; address: PostalAddress }>()
  const [postalMessage, setPostalMessage] = useState("")
  const [locationQuery, setLocationQuery] = useState("")
  const [suggestion, setSuggestion] = useState<AddressLocation>()
  const [searchSelection, setSearchSelection] = useState(0)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [reason, setReason] = useState("")
  const [approved, setApproved] = useState(false)
  const [id, setId] = useState("")
  const [cancel, setCancel] = useState(false)
  const [locationAttempted, setLocationAttempted] = useState(false)
  const [pointError, setPointError] = useState(false)
  const inFlight = useRef(false)
  const command = useRef<{ body: string; key: string } | null>(null)
  const nextNature = useRef(natureRows.length)
  const title = useRef<HTMLHeadingElement>(null)
  const focusStep = useRef(false)

  useEffect(() => {
    if (focusStep.current) {
      focusStep.current = false
      title.current?.focus()
    }
  }, [crimeStep])

  function goToStep(crime: boolean) {
    focusStep.current = true
    if (!crime) setApproved(false)
    setCrimeStep(crime)
  }

  useEffect(() => {
    const controller = new AbortController()
    fetch(manualOccurrencesPath, { signal: controller.signal })
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw Error(
          response.status === 401 ? "Sessão necessária para consultar os catálogos."
            : response.status === 403 ? "Acesso ao catálogo negado para este perfil."
              : body?.error?.message ?? "Catálogos persistentes indisponíveis.",
        )
        return manualCatalogResponse.parse(body).data
      }).then(data => {
        if (!controller.signal.aborted) setCatalog(data)
      }).catch(error => {
        if (!controller.signal.aborted) setCatalogError(error?.name === "Error" ? error.message : "Catálogos persistentes indisponíveis.")
      })
    return () => controller.abort()
  }, [cycle])
  useEffect(() => {
    const controller = new AbortController()
    fetch(CARTOGRAPHY_PATH, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) return
        const boundaries = await response.json() as RaGeoJSON
        if (!controller.signal.aborted && structurallyValidCartography(boundaries)) setGeo(boundaries)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const persistentRegions = catalog?.regioes ?? []
  const referenceRegions = useMemo(() => geo?.features.map(({ properties }) => ({
    codigo: properties.ra_codigo,
    nome: territorialNames.get(properties.ra_codigo) ?? properties.ra_nome,
  })).sort((first, second) => first.nome.localeCompare(second.nome, "pt-BR")) ?? [], [geo])
  const regions = persistentRegions.length ? persistentRegions : referenceRegions
  const latitude = draft.latitude.trim() ? Number(draft.latitude) : NaN
  const longitude = draft.longitude.trim() ? Number(draft.longitude) : NaN
  const coordinate = coordinateSchema.safeParse({ latitude, longitude })
  const territorial = useMemo(() => validateTerritory(geo, latitude, longitude), [geo, latitude, longitude])
  const matchedCode = territorial.status === "reference_pending" && territorial.matches.length === 1 ? territorial.matches[0] : undefined
  const matchedRegion = regions.find(region => region.codigo === matchedCode)
  const mapRegionName = matchedRegion?.nome ?? referenceRegions.find(region => region.codigo === matchedCode)?.nome
  const manualReference = selectedRegion && !regions.some(region => region.codigo === selectedRegion)
    ? referenceRegions.find(region => region.codigo === selectedRegion) : undefined
  const initialRegion = initial && persistentRegions.find(region => region.id === initial.raId)?.codigo
  const chosenRegion = selectedRegion === undefined ? initialRegion : selectedRegion
  const regionCode = chosenRegion ?? (addressChanged ? "" : matchedRegion?.codigo ?? "")
  const divergence = Boolean(matchedCode && chosenRegion && matchedCode !== chosenRegion)
  const consistent = Boolean(matchedCode && !divergence)
  const raId = persistentRegions.find(region => region.codigo === regionCode)?.id ?? ""
  const locationMessage = matchedCode
    ? divergence ? "O ponto diverge da RA selecionada. Confira a região." : "Ponto dentro da RA na cartografia IDE/DF."
    : territorial.message
  const now = nowInDf()
  const hour = draft.horario.length === 5 ? draft.horario + ":00" : draft.horario
  const territoryReady = Boolean(geo?.features.length && geo.features.length === persistentRegions.length
    && geo.features.every(({ properties }) => persistentRegions.some(region => region.codigo === properties.ra_codigo)))
  const catalogReady = territoryReady && Boolean(catalog?.naturezas.length)
  const catalogBlock = !territoryReady || !raId
    ? "O cadastro exige o catálogo territorial completo e uma RA válida."
    : !catalog?.naturezas.length ? "O catálogo ainda não contém naturezas homologadas para cadastro manual." : ""
  const cepCode = completeCep(draft.cep)
  const addressLabel = suggestion?.label || (coordinate.success
    ? [draft.endereco, draft.bairroOuSetor].filter(Boolean).join(", ")
    : postal?.code === cepCode ? postal.address.label : undefined)
  const firstStepFields = { data: draft.data, horario: hour, endereco: draft.endereco,
    bairroOuSetor: draft.bairroOuSetor, coordenadas: coordinate.data }
  const invalidFields = new Set(firstStepSchema.safeParse({ ...firstStepFields, coordenadas: { latitude, longitude } })
    .error?.issues.map(issue => issue.path.at(-1)))
  const locationErrors: Partial<Record<Field | "regiao", string>> = {
    data: !draft.data ? "Informe a data da ocorrência." : invalidFields.has("data") ? "Informe uma data válida."
      : draft.data > now.data ? "A data da ocorrência não pode estar no futuro." : undefined,
    horario: !draft.horario ? "Informe o horário da ocorrência." : invalidFields.has("horario") ? "Informe um horário válido."
      : draft.data === now.data && hour > now.horario ? "O horário da ocorrência não pode estar no futuro." : undefined,
    cep: !cepCode && (cepRequired || draft.cep) ? "Informe um CEP válido." : undefined,
    endereco: invalidFields.has("endereco") ? "O endereço é obrigatório." : undefined,
    bairroOuSetor: invalidFields.has("bairroOuSetor") ? "Informe o bairro ou setor." : undefined,
    regiao: !regionCode ? "Selecione uma Região Administrativa."
      : divergence ? "Confira a Região Administrativa selecionada para este ponto." : undefined,
    latitude: invalidFields.has("latitude") ? "Informe uma latitude válida." : undefined,
    longitude: invalidFields.has("longitude") ? "Informe uma longitude válida." : undefined,
  }
  const firstInvalid = (Object.keys(locationErrors) as (keyof typeof locationErrors)[]).find(key => locationErrors[key])
  const canContinue = firstInvalid === undefined
  const cepError = locationAttempted && locationErrors.cep
  const regionError = locationAttempted && locationErrors.regiao
  const natureIds = new Set(catalog?.naturezas.map(nature => nature.id))
  const payload = {
    ...firstStepFields, cep: cepCode ?? undefined, raId,
    localizacaoConfirmada: confirmed && consistent,
    ...Object.fromEntries((["numero","complemento","referencia"] as const)
      .filter(key => draft[key].trim()).map(key => [key, draft[key]])),
    naturezas: natureRows.map(item => ({
      naturezaId: natureIds.has(item.id) ? item.id : "",
      crimeTentado: item.tentativa ? attemptValues[item.tentativa] : null,
    })),
    dadosCrime: {
      descricao: crimeDraft.descricao.trim() || undefined, meio: crimeDraft.meio || undefined,
      vitimas: crimeDraft.vitimas === "" ? undefined : Number(crimeDraft.vitimas),
      autores: crimeDraft.autores === "" ? undefined : Number(crimeDraft.autores),
      observacoes: crimeDraft.observacoes.trim() || undefined,
    },
  }
  const fields = (edit ? manualEditFields : manualOccurrenceSchema).safeParse(payload)
  const invalidDetails = new Set(fields.error?.issues.filter(issue => issue.path[0] === "dadosCrime").map(issue => issue.path[1]))
  const quantityIssue = (key: "vitimas" | "autores", missing: string) => !crimeDraft[key]
    ? crimeRequired(key) ? missing : undefined
    : invalidDetails.has(key) || !/^\d+$/.test(crimeDraft[key]) ? "Informe um número inteiro de 0 a 999.999." : undefined
  const natureCombinations = new Map<string, number>()
  for (const item of natureRows) {
    if (!natureIds.has(item.id) || !item.tentativa) continue
    const combination = `${item.id}:${item.tentativa}`
    natureCombinations.set(combination, (natureCombinations.get(combination) ?? 0) + 1)
  }
  const crimeErrors: Record<string, string | undefined> = {
    ...Object.fromEntries(natureRows.flatMap(item => [
      [`manual-nature-${item.key}`, natureIds.has(item.id) ? undefined : "Selecione uma natureza válida."],
      [`manual-attempt-${item.key}`, !item.tentativa ? "Selecione a tentativa."
        : (natureCombinations.get(`${item.id}:${item.tentativa}`) ?? 0) > 1 ? "Esta combinação está repetida." : undefined],
    ])),
    "manual-descricao": !payload.dadosCrime.descricao
      ? crimeRequired("descricao") ? "Informe a descrição do fato." : undefined
      : invalidDetails.has("descricao") ? "A descrição deve ter até 3.000 caracteres." : undefined,
    "manual-meio": invalidDetails.has("meio") || (!crimeDraft.meio && crimeRequired("meio")) ? "Selecione o meio empregado." : undefined,
    "manual-vitimas": quantityIssue("vitimas", "Informe a quantidade de vítimas."),
    "manual-autores": quantityIssue("autores", "Informe a quantidade de autores."),
    "manual-observacoes": invalidDetails.has("observacoes") ? "As observações devem ter até 1.500 caracteres." : undefined,
    ...(edit && {
      "manual-reason": !reason.trim() ? "Informe a justificativa da edição." : undefined,
      "manual-approved": !approved ? "Confirme as alterações para continuar." : undefined,
    }),
  }
  const invalidCrimeFields = Object.keys(crimeErrors).filter(key => crimeErrors[key])
  const crimeIssue = (id: string) => crimeAttempted ? crimeErrors[id] : undefined
  const descriptionError = crimeIssue("manual-descricao")
  const meansError = crimeIssue("manual-meio")
  const observationsError = crimeIssue("manual-observacoes")
  const registrationBlock = !canContinue ? "Volte à Etapa 1 e revise as informações da ocorrência."
    : !consistent || !confirmed ? "Volte à Etapa 1 e confirme um ponto válido no mapa."
      : catalogBlock ? catalogBlock
        : !edit && !catalog?.cadastroDisponivel ? "O PostgreSQL deste ambiente ainda não está qualificado para o cadastro."
          : !fields.success ? "Revise os dados da ocorrência antes de registrar." : ""
  const registrationError = crimeAttempted && !invalidCrimeFields.length && registrationBlock
  const dirty = Boolean(edit) || Object.values(draft).some(Boolean) || selectedRegion != null
    || natureRows.length > 1 || natureRows.some(row => row.id || row.tentativa) || Object.values(crimeDraft).some(Boolean)

  function changeCrime(key: keyof typeof blankCrime, value: string) {
    setCrimeDraft(previous => ({ ...previous, [key]: value }))
  }

  function quantityField(key: "vitimas" | "autores", label: string) {
    const value = crimeDraft[key]
    const controlId = `manual-${key}`
    const error = crimeIssue(controlId)
    const required = crimeRequired(key)
    return <label className={error ? styles.invalidLabel : undefined}>
      <span id={`${controlId}-label`}>{label}{required && " *"}</span>
      <input id={controlId} type="text" inputMode="numeric" value={value} required={required}
        onChange={event => changeCrime(key, event.target.value)}
        aria-labelledby={`${controlId}-label`} aria-invalid={Boolean(error)} aria-describedby={error ? `${controlId}-erro` : undefined} />
      {error && <small id={`${controlId}-erro`} className={styles.error}>{error}</small>}
    </label>
  }

  const change = (key: Field, value: string) => {
    if (["cep", "endereco", "bairroOuSetor", "numero", "latitude", "longitude"].includes(key)) {
      locationSearch.cancel()
      setConfirmed(false)
      setSuggestion(undefined)
      setAddressChanged(key !== "latitude" && key !== "longitude")
    }
    if (key === "cep") {
      setPostalMessage("")
      setLocationQuery(value)
      locationSearch.search(value, "postal", true)
    } else if (key === "endereco") {
      setLocationQuery(value)
    }
    setDraft(valueBefore => ({ ...valueBefore, [key]: value }))
  }

  function point(lat: number, lon: number) {
    if (inFlight.current) return
    locationSearch.cancel()
    setSuggestion(undefined)
    setDraft(previous => ({ ...previous, latitude: String(lat), longitude: String(lon) }))
    setConfirmed(false)
    setAddressChanged(false)
  }

  function applyPostal(code: string, address: PostalAddress) {
    setPostal({ code, address })
    setPostalMessage("CEP encontrado. Confira os dados do endereço.")
    const oldPostal = postal?.address
    setDraft(previous => ({
      ...previous, cep: formatCep(code),
      endereco: !previous.endereco || previous.endereco === oldPostal?.street ? address.street : previous.endereco,
      bairroOuSetor: !previous.bairroOuSetor || previous.bairroOuSetor === oldPostal?.district
        ? address.district : previous.bairroOuSetor,
    }))
    setConfirmed(false)
    setSuggestion(undefined)
    setAddressChanged(true)
  }

  const locationSearch = useManualLocationSearch(applyPostal, (result, replaceAddress) => {
    if (inFlight.current) return
    setDraft(previous => ({
      ...previous, latitude: String(result.latitude), longitude: String(result.longitude),
      endereco: (replaceAddress && result.street) || previous.endereco || result.street || "",
      bairroOuSetor: (replaceAddress && result.district) || previous.bairroOuSetor || result.district || "",
    }))
    setSuggestion(result)
    setConfirmed(false)
    setAddressChanged(false)
    setSearchSelection(value => value + 1)
  })

  function fillCep() {
    if (!cepCode) { setPostalMessage("Informe os oito dígitos do CEP."); return }
    setLocationQuery(formatCep(cepCode))
    locationSearch.search(cepCode, "postal", false)
  }

  function searchAddress() {
    setLocationQuery(draft.endereco)
    locationSearch.search(draft.endereco, "map")
  }

  function closeForm() {
    if (edit) edit.onCancel()
    else router.push("/ocorrencias")
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!crimeStep || inFlight.current) return
    setCrimeAttempted(true)
    setMessage("")
    if (invalidCrimeFields.length || registrationBlock || !fields.success) {
      requestAnimationFrame(() => {
        const control = invalidCrimeFields.map(id => document.getElementById(id)).find(field => field && !field.matches(":disabled"))
          ?? document.getElementById("manual-registration-error")
          ?? document.getElementById("manual-nature-status")
        control?.focus()
      })
      return
    }
    inFlight.current = true
    setSaving(true)
    try {
      if (edit) {
        await edit.onSave(fields.data, reason.trim())
        return
      }
      const body = JSON.stringify(fields.data)
      if (command.current?.body !== body) command.current = { body, key: crypto.randomUUID() }
      const response = await fetch(manualOccurrencesPath, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": command.current.key },
        body, signal: AbortSignal.timeout(16000),
      })
      const result = await response.json()
      if (response.status !== 201) { setMessage(result.error?.message ?? "Não foi possível registrar a ocorrência."); return }
      const receipt = manualReceiptResponse.parse(result)
      if (!receipt.meta.execution.persisted) throw Error()
      setId(receipt.data.id)
    } catch {
      setMessage(edit ? "Não foi possível confirmar a alteração. Confira o registro antes de tentar de novo."
        : "A confirmação está indisponível. Repita com os mesmos dados para consultar ou concluir o mesmo cadastro.")
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  function field(key: Field, label: string, options: { required?: boolean; type?: string; maxLength?: number } = {}) {
    const issue = locationAttempted && locationErrors[key]
    return <label className={issue ? styles.invalidLabel : undefined}>
      <span id={`manual-${key}-label`}>{label}{options.required && " *"}</span>
      <input {...options} id={`manual-${key}`} value={draft[key]} onChange={event => change(key, event.target.value)}
        onKeyDown={key === "endereco" ? event => {
          if (event.key !== "Enter") return
          event.preventDefault()
          if (canSearchLocation(draft.endereco) && !locationSearch.busy) searchAddress()
        } : undefined}
        onClick={key === "data" ? ({ currentTarget }) => {
          try { currentTarget.showPicker?.() } catch { /* The browser's date control remains available. */ }
        } : undefined}
        lang={key === "data" ? "pt-BR" : undefined}
        step={key === "horario" ? 1 : options.type === "number" ? "any" : undefined}
        max={key === "data" ? now.data : undefined}
        aria-labelledby={`manual-${key}-label`}
        aria-invalid={Boolean(issue)} aria-describedby={issue ? `manual-${key}-erro` : undefined} />
      {issue && <small id={`manual-${key}-erro`} className={styles.error}>{issue}</small>}
    </label>
  }

  if (id) return <section className={styles.complete} aria-labelledby="manual-confirmation">
    <h1 id="manual-confirmation" tabIndex={-1} ref={element => element?.focus()}>Ocorrência registrada</h1>
    <p role="status">Gravação confirmada no PostgreSQL de homologação. Situação: em revisão.</p>
    <p>Identificador <strong>{id}</strong></p>
    <div className={styles.actions}>
      <Button asChild><Link href={`/ocorrencias?manual=${id}`}>Consultar registro</Link></Button>
      <Button variant="outline" onClick={() => {
        command.current = null
        setDraft(blank)
        setCrimeDraft(blankCrime)
        setCrimeAttempted(false)
        setSelectedRegion(null)
        setNatureRows([{ key: 0, id: "", tentativa: "" }])
        setPostal(undefined)
        setLocationQuery("")
        setSuggestion(undefined)
        locationSearch.cancel()
        setPostalMessage("")
        setLocationAttempted(false)
        setConfirmed(false)
        setAddressChanged(false)
        setCrimeStep(false)
        setId("")
      }}>Novo cadastro</Button>
    </div>
  </section>

  return <>
    <form className={edit ? styles.edit : undefined} onSubmit={save} noValidate={crimeStep}
      aria-label={edit ? "Edição de ocorrência" : "Cadastro de ocorrência"} aria-busy={saving}>
      <div className={styles.hero}>
        <div className={styles.heroTitle}>
          <NavigationIcon name="record-plus" size={30} />
          <div>
            <h1 ref={title} tabIndex={-1}>{crimeStep ? "Dados do Crime" : edit ? "Informações e localização" : "Nova Ocorrência"}</h1>
            {!crimeStep && <p>{edit ? "Confira os dados e confirme o ponto no mapa." : "Registre uma ocorrência com localização no mapa e dados essenciais."}</p>}
          </div>
        </div>
        <div className={styles.actions}>
          {crimeStep ? <>
            <Button type="button" variant="outline" disabled={saving} onClick={() => goToStep(false)}>Voltar</Button>
            <Button type="submit" disabled={saving}>{edit ? saving ? "Salvando…" : "Salvar alterações"
              : saving ? "Registrando…" : "Registrar ocorrência"}</Button>
          </> : <>
            <Button type="button" variant="outline"
              onClick={() => dirty ? setCancel(true) : closeForm()}>Cancelar</Button>
            <Button type="button" onClick={event => {
              // The next step replaces this button with a submit button during the click.
              event.preventDefault()
              if (firstInvalid) {
                setLocationAttempted(true)
                const control = document.getElementById(`manual-${firstInvalid}`)
                requestAnimationFrame(() => control?.focus())
              } else if (!confirmed || !consistent) {
                setPointError(true)
                requestAnimationFrame(() => document.getElementById("manual-point-error")?.focus())
              } else goToStep(true)
            }}>Continuar</Button>
          </>}
        </div>
      </div>
      {crimeStep && (message || edit?.error || registrationError || (catalog && !catalogReady)) && <div className={styles.feedback}>
        {(message || edit?.error || registrationError) && <p id="manual-registration-error" tabIndex={-1} className={styles.error} role="alert">
          {message || edit?.error || registrationError}</p>}
        {catalog && !catalogReady && !registrationError && <p role="status">{catalogBlock}</p>}
      </div>}
      {/* Keep Leaflet mounted so returning to this step preserves its view. */}
      <fieldset className={styles.layout} hidden={crimeStep} disabled={crimeStep || saving}>
        <section className={`${styles.card} ${styles.fact}`}>
          <Heading icon="records" title="Informações da ocorrência">Dados principais do fato.</Heading>
          <div className={styles.twoColumns}>
            {field("data", "Data", { type: "date", required: true })}
            {field("horario", "Horário", { type: "time", required: true })}
          </div>
        </section>
        <section className={`${styles.card} ${styles.address}`}>
          <Heading icon="pin" title="Endereço">Local do fato. Preencha pelo CEP ou informe o endereço diretamente.</Heading>
          <div className={styles.postalRow}>
            <label className={cepError ? styles.invalidLabel : undefined}>
              <span id="manual-cep-label">CEP{cepRequired && " *"}</span>
              <input id="manual-cep" value={draft.cep} onChange={event => change("cep", formatCep(event.target.value))}
                placeholder="00000-000" inputMode="numeric" autoComplete="postal-code" maxLength={9} required={cepRequired}
                aria-labelledby="manual-cep-label" aria-invalid={Boolean(cepError)}
                aria-describedby={cepError ? "manual-cep-erro manual-postal-status" : "manual-postal-status"} />
              {cepError && <small id="manual-cep-erro" className={styles.error}>{cepError}</small>}
            </label>
            <Button type="button" disabled={locationSearch.surface === "postal" && locationSearch.busy} onClick={fillCep}>
              <NavigationIcon name="search" />Preencher pelo CEP
            </Button>
          </div>
          <div id="manual-postal-status" role="status">{(locationSearch.surface === "postal" && locationSearch.status) || postalMessage}</div>
          {postal?.code === cepCode && ((postal.address.street && draft.endereco !== postal.address.street)
            || (postal.address.district && draft.bairroOuSetor !== postal.address.district)) &&
            <div className={styles.postalSuggestion}>
              <p>{postal.address.label}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => {
                locationSearch.cancel()
                setConfirmed(false)
                setAddressChanged(true)
                setDraft(previous => ({
                  ...previous, cep: formatCep(postal.code), endereco: postal.address.street || previous.endereco,
                  bairroOuSetor: postal.address.district || previous.bairroOuSetor,
                }))
              }}>Usar endereço do CEP</Button>
            </div>}
          <div className={styles.addressSearch}>
            {field("endereco", "Endereço", { required: true, maxLength: 240 })}
            <Button type="button" size="icon" variant="outline" onClick={searchAddress}
              title="Pesquise somente o logradouro, setor ou CEP, sem informações pessoais."
              aria-label="Buscar endereço do formulário" disabled={!canSearchLocation(draft.endereco) || locationSearch.busy}>
              <NavigationIcon name="search" />
            </Button>
          </div>
          <div className={styles.twoColumns}>
            {field("bairroOuSetor", "Bairro / Setor", { required: true, maxLength: 100 })}
            <label className={regionError ? styles.invalidLabel : undefined}>
              <span id="manual-regiao-label">Região Administrativa *</span>
              <select id="manual-regiao" value={regionCode} onChange={event => {
                setSelectedRegion(event.target.value || null)
                if (edit) setConfirmed(false)
              }} required
                aria-labelledby="manual-regiao-label" aria-invalid={Boolean(regionError || divergence)}
                aria-describedby={regionError ? "manual-regiao-erro manual-territory" : "manual-territory"}>
                <option value="">Selecione a RA</option>
                {regions.map(region => <option value={region.codigo} key={region.codigo}>{region.nome}</option>)}
                {manualReference && <option value={manualReference.codigo}>{manualReference.nome}</option>}
              </select>
              {regionError && <small id="manual-regiao-erro" className={styles.error}>{regionError}</small>}
            </label>
          </div>
          <div className={styles.territory} id="manual-territory">
            {!persistentRegions.length && (catalog || catalogError) && <p role="status">
              {catalog ? "O catálogo de Regiões Administrativas está vazio." : "O catálogo de Regiões Administrativas está indisponível."}
              {referenceRegions.length > 0 && " Opções da IDE/DF disponíveis para referência. O registro exige o catálogo persistente."}
            </p>}
            {manualReference && <p role="status">A RA escolhida consta na IDE/DF e está ausente no catálogo persistente.</p>}
            {divergence && <p role="status">
              O ponto está em {mapRegionName ?? matchedCode} e diverge da RA selecionada. Confira a região.
            </p>}
            {!divergence && coordinate.success && (!matchedRegion || addressChanged) && <p role="status">
              {addressChanged ? "Endereço alterado. Atualize ou confirme o ponto para preencher a RA automaticamente."
                : "Sem correspondência automática para este ponto. Selecione a RA manualmente."}
            </p>}
            {matchedRegion && divergence && !addressChanged && <Button type="button" size="sm" variant="outline"
              onClick={() => { setSelectedRegion(null); if (edit) setConfirmed(false) }}>Usar RA identificada</Button>}
          </div>
        </section>
        <section className={`${styles.card} ${styles.extras}`} aria-labelledby="manual-extras">
          <div className={styles.extrasHeading}>
            <NavigationIcon name="records" />
            <div><h2 id="manual-extras">Detalhes complementares (opcional)</h2><small>Número, complemento e referência do local.</small></div>
          </div>
          <div className={styles.twoColumns}>
            {field("numero", "Número", { maxLength: 24 })}
            {field("complemento", "Complemento", { maxLength: 120 })}
          </div>
          {field("referencia", "Referência do local", { maxLength: 240 })}
        </section>
        <ManualLocation geo={geo} position={coordinate.data ?? null} selectedRegion={matchedCode} region={mapRegionName}
          locationMessage={locationMessage} confirmed={confirmed && consistent} confirmationPending={!confirmed && consistent}
          cep={postal && postal.code === cepCode ? formatCep(postal.code) : undefined}
          addressLabel={addressLabel}
          approximate={suggestion?.approximate} source={suggestion?.source}
          query={locationQuery} onQuery={value => {
            setLocationQuery(value)
            if (completeCep(value)) locationSearch.search(value, "map", true)
            else locationSearch.cancel()
          }} onSearch={() => locationSearch.search(locationQuery, "map", false)}
          status={locationSearch.surface === "map" || locationSearch.results.length ? locationSearch.status : ""}
          busy={locationSearch.surface === "map" && locationSearch.busy} results={locationSearch.results}
          searchSelection={searchSelection} onResult={locationSearch.choose} onPoint={point}
          onConfirm={() => { locationSearch.cancel(); setAddressChanged(false); setConfirmed(true); setPointError(false) }} />
        <section className={`${styles.card} ${styles.coordinates}`} aria-labelledby="manual-coordinates">
          <h2 id="manual-coordinates">Coordenadas *</h2>
          <div className={styles.twoColumns}>
            {field("latitude", "Latitude", { required: true, type: "number" })}
            {field("longitude", "Longitude", { required: true, type: "number" })}
          </div>
          <p role="status">{coordinate.success ? locationMessage : "Informe latitude e longitude ou marque o ponto no mapa."}</p>
          {pointError && (!confirmed || !consistent) && <p id="manual-point-error" role="alert" tabIndex={-1} className={styles.error}>Confirme um ponto válido no mapa para continuar.</p>}
        </section>
      </fieldset>
      {crimeStep && <fieldset className={`${styles.layout} ${styles.crimeLayout}`} disabled={saving}>
        <section className={styles.card}>
          <Heading icon="layers" title="Naturezas associadas">Classifique a ocorrência com uma ou mais naturezas criminais.</Heading>
          {natureRows.map((item, index) => {
            const natureId = `manual-nature-${item.key}`
            const attemptId = `manual-attempt-${item.key}`
            const attemptError = crimeIssue(attemptId)
            return <div key={item.key} className={styles.natureRow}>
              <ManualNaturePicker inputId={natureId} label={`Natureza ${index + 1}`}
                options={catalog?.naturezas ?? []} value={item.id} error={crimeIssue(natureId)}
                onChange={id => setNatureRows(rows => rows.map(row => row.key === item.key ? { ...row, id } : row))} />
              <label className={attemptError ? styles.invalidLabel : undefined}>Tentativa *
                <select id={attemptId} aria-label={`Tentativa ${index + 1}`} value={item.tentativa} required
                  aria-invalid={Boolean(attemptError)} aria-describedby={attemptError ? `${attemptId}-erro` : undefined}
                  onChange={event => setNatureRows(rows => rows.map(row => row.key === item.key
                    ? { ...row, tentativa: event.target.value as Nature["tentativa"] } : row))}>
                  <option value="" disabled>Selecione</option>
                  <option value="consumado">Consumado</option>
                  <option value="tentado">Tentado</option>
                  <option value="nao-informada">Não informada</option>
                </select>
                {attemptError && <small id={`${attemptId}-erro`} className={styles.error}>{attemptError}</small>}
              </label>
              <Button type="button" variant="outline" size="icon" aria-label={`Remover natureza ${index + 1}`}
                disabled={natureRows.length === 1} onClick={() => setNatureRows(rows => rows.filter(row => row.key !== item.key))}>
                <NavigationIcon name="trash" />
              </Button>
            </div>
          })}
          <p id="manual-nature-status" role="status" tabIndex={-1}>
            {catalogError ? catalogError
              : !catalog ? "Carregando catálogos…" : !catalog.naturezas.length ? "O catálogo de naturezas para cadastro manual está vazio."
                : crimeAttempted && [...natureCombinations.values()].some(count => count > 1)
                  ? "Revise as combinações de natureza e tentativa repetidas." : ""}
          </p>
          {catalogError && <Button type="button" variant="outline" size="sm" onClick={() => {
            setCatalogError(""); setCycle(value => value + 1)
          }}>Recarregar catálogos</Button>}
          <Button type="button" variant="outline" className={styles.addNature} disabled={!catalog?.naturezas.length || natureRows.length >= 100}
            onClick={() => {
              const key = nextNature.current++
              setNatureRows(rows => [...rows, { key, id: "", tentativa: "" }])
            }}><NavigationIcon name="plus" />Adicionar natureza</Button>
        </section>
        <section className={styles.card}>
          <Heading icon="records" title="Descrição do fato">Relate o que aconteceu, sem incluir dados pessoais desnecessários.</Heading>
          <label className={descriptionError ? styles.invalidLabel : undefined}>
            <span id="manual-descricao-label">Descrição do fato{crimeRequired("descricao") && " *"}</span>
            <textarea id="manual-descricao" rows={5} required={crimeRequired("descricao")} maxLength={3000} value={crimeDraft.descricao}
              onChange={event => changeCrime("descricao", event.target.value)}
              placeholder="Descreva de forma objetiva o que aconteceu, sem incluir dados pessoais desnecessários."
              aria-labelledby="manual-descricao-label" aria-invalid={Boolean(descriptionError)}
              aria-describedby={descriptionError ? "manual-descricao-erro" : undefined} />
            {descriptionError && <small id="manual-descricao-erro" className={styles.error}>{descriptionError}</small>}
          </label>
        </section>
        <section className={styles.card}>
          <Heading icon="hash" title="Informações adicionais">Informe as quantidades de 0 a {manualQuantityMaximum.toLocaleString("pt-BR")}.</Heading>
          <div className={styles.crimeAdditionalFields}>
            <label className={meansError ? styles.invalidLabel : undefined}>
              <span id="manual-meio-label">Meio empregado{crimeRequired("meio") && " *"}</span>
              <select id="manual-meio" required={crimeRequired("meio")} value={crimeDraft.meio} onChange={event => changeCrime("meio", event.target.value)}
                aria-labelledby="manual-meio-label" aria-invalid={Boolean(meansError)} aria-describedby={meansError ? "manual-meio-erro" : undefined}>
                <option value="" disabled={crimeRequired("meio")}>{crimeRequired("meio") ? "Selecione" : "Não informado"}</option>
                {meansOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              {meansError && <small id="manual-meio-erro" className={styles.error}>{meansError}</small>}
            </label>
            {quantityField("vitimas", "Quantidade de vítimas")}
            {quantityField("autores", "Quantidade de autores")}
          </div>
          <label className={observationsError ? styles.invalidLabel : undefined}>Observações adicionais
            <textarea id="manual-observacoes" rows={3} maxLength={1500} value={crimeDraft.observacoes}
              onChange={event => changeCrime("observacoes", event.target.value)}
              aria-invalid={Boolean(observationsError)} aria-describedby={observationsError ? "manual-observacoes-erro" : undefined} />
            {observationsError && <small id="manual-observacoes-erro" className={styles.error}>{observationsError}</small>}
          </label>
        </section>
        {edit && <section className={styles.card}>
          <Heading icon="records" title="Confirmação da edição">A justificativa e os valores alterados ficam no histórico de auditoria.</Heading>
          <label className={crimeIssue("manual-reason") ? styles.invalidLabel : undefined}>Justificativa *
            <textarea id="manual-reason" required maxLength={500} rows={3} value={reason} onChange={event => setReason(event.target.value)}
              aria-invalid={Boolean(crimeIssue("manual-reason"))} aria-describedby="manual-reason-error" />
          </label>
          <p id="manual-reason-error" className={styles.error}>{crimeIssue("manual-reason")}</p>
          <label className={styles.approval}>
            <input id="manual-approved" type="checkbox" required checked={approved} onChange={event => setApproved(event.target.checked)}
              aria-invalid={Boolean(crimeIssue("manual-approved"))} aria-describedby="manual-approved-error" />
            Confirmo a atualização dos dados, do ponto e das naturezas desta ocorrência.
          </label>
          <p id="manual-approved-error" className={styles.error}>{crimeIssue("manual-approved")}</p>
        </section>}
      </fieldset>}
    </form>
    {cancel && <Dialog className={styles.cancel} onClose={() => setCancel(false)}>
      <DialogTitle>Descartar preenchimento?</DialogTitle>
      <DialogDescription>Os dados preenchidos nesta tela serão descartados.</DialogDescription>
      <div className={styles.actions}>
        <DialogClose asChild><Button variant="outline">Continuar preenchendo</Button></DialogClose>
        <Button onClick={closeForm}>Descartar</Button>
      </div>
    </Dialog>}
  </>
}
