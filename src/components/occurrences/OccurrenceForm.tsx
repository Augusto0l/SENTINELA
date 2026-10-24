"use client"
import { useCallback, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CRIME_NATURES, RA_LIST } from "@/data/mockData"
import {
  occurrenceSchema,
  simulateGeocoding,
  type OccurrenceFormValues,
} from "@/data/occurrenceForm"
import type { MockOccurrence } from "@/data/mockOccurrences"
import { useOperations } from "@/components/OperationalProvider"
import { canWrite } from "@/data/demoPermissions"
import { useDemoToast } from "@/components/DemoProvider"
import Button from "@/components/ui/button"
import Dialog from "@/components/ui/dialog"
import AddressLocationSearch from "@/components/occurrences/AddressLocationSearch"
const LocationPicker = dynamic(() => import("./LocationPicker"), {
  ssr: false,
  loading: () => <p>Carregando mapa…</p>,
})

export default function OccurrenceForm({
  initial,
  onDone,
}: {
  initial?: MockOccurrence
  onDone: () => void
}) {
  const operations = useOperations()
  const notify = useDemoToast()
  const [cancel, setCancel] = useState(false)
  const [geoMessage, setGeoMessage] = useState("")
  const [cep, setCep] = useState("")
  const [searchByCep, setSearchByCep] = useState(false)
  const [searchSelection, setSearchSelection] = useState(0)
  const postalAddress = useRef("")
  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<OccurrenceFormValues>({
    resolver: zodResolver(occurrenceSchema),
    defaultValues: {
      natureza: initial?.natureza ?? "",
      data: initial?.data ?? "",
      horario: initial?.horario ?? "",
      raCode: initial?.raCode ?? "",
      local: initial?.local ?? "",
      latitude: initial ? String(initial.latitude) : "",
      longitude: initial ? String(initial.longitude) : "",
    },
  })
  const values = useWatch({ control })
  const fillPostalAddress = useCallback((address: string) => {
    const current = getValues("local")
    if (!current.trim() || current === postalAddress.current) {
      postalAddress.current = address
      setValue("local", address, { shouldDirty: true, shouldValidate: true })
    }
  }, [getValues, setValue])
  const latitude = Number(values.latitude),
    longitude = Number(values.longitude)
  const hasPoint =
    values.latitude !== "" &&
    values.longitude !== "" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -16.2 &&
    latitude <= -15.4 &&
    longitude >= -48.3 &&
    longitude <= -47.3
  function updatePoint(lat: number, lng: number) {
    setValue("latitude", lat.toFixed(6), {
      shouldDirty: true,
      shouldValidate: true,
    })
    setValue("longitude", lng.toFixed(6), {
      shouldDirty: true,
      shouldValidate: true,
    })
  }
  if (
    !canWrite(operations.role) ||
    (initial && operations.inactive[initial.id])
  )
    return (
      <p role="alert">
        Edição indisponível para este perfil ou registro inativo.
      </p>
    )
  return (
    <form
      className="occurrence-form"
      noValidate
      onSubmit={handleSubmit((data) => {
        const ra = RA_LIST.find((item) => item.codigo === data.raCode)!
        const record: MockOccurrence = {
          ...initial,
          ...data,
          id: initial?.id ?? `DEMO-LOCAL-${crypto.randomUUID()}`,
          raName: ra.nomeDisplay,
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          x: initial?.x ?? 0,
          y: initial?.y ?? 0,
        }
        if (!operations.save(record)) {
          notify("Ação bloqueada pelo perfil ou estado do registro.")
          return
        }
        notify(
          "Simulação aplicada somente em memória. Nenhum dado foi gravado no servidor.",
        )
        onDone()
      })}
    >
      <p>
        Dados fictícios · alterações perdidas ao recarregar. Catálogos e limites
        territoriais demonstrativos.
      </p>
      <div className="occurrence-form-grid">
        {([
          ["natureza", "Natureza"],
          ["data", "Data (DD/MM/AAAA)"],
          ["horario", "Hora (HH:mm)"],
          ["raCode", "Região Administrativa"],
          ["local", "Endereço"],
          ["latitude", "Latitude"],
          ["longitude", "Longitude"],
        ] as const).map(([name, label]) => (
          <div key={name}>
            <label htmlFor={`occ-${name}`}>{label} *</label>
            {name === "natureza" || name === "raCode" ? (
              <select
                id={`occ-${name}`}
                {...register(name)}
                aria-required="true"
                aria-invalid={!!errors[name]}
                aria-describedby={errors[name] ? `error-${name}` : undefined}
              >
                <option value="">Selecione…</option>
                {name === "natureza"
                  ? CRIME_NATURES.map((item) => (
                      <option key={item}>{item}</option>
                    ))
                  : RA_LIST.map((ra) => (
                      <option key={ra.codigo} value={ra.codigo}>
                        {ra.nomeDisplay}
                        {ra.codigo === "RA-S" ? " (área demonstrativa)" : ""}
                      </option>
                    ))}
              </select>
            ) : (
              <input
                id={`occ-${name}`}
                {...register(name, name === "local" ? {
                  onChange: () => setSearchByCep(false),
                } : undefined)}
                aria-required="true"
                aria-invalid={!!errors[name]}
                aria-describedby={errors[name] ? `error-${name}` : undefined}
                placeholder={
                  name === "data"
                    ? "DD/MM/AAAA"
                    : name === "horario"
                      ? "HH:mm"
                      : undefined
                }
              />
            )}
            {errors[name] && (
              <p id={`error-${name}`} role="alert">
                {errors[name]?.message}
              </p>
            )}
          </div>
        ))}
        {!initial && <div>
          <label htmlFor="occ-cep">CEP (opcional)</label>
          <input
            id="occ-cep"
            value={cep}
            onChange={(event) => {
              setCep(event.target.value)
              setSearchByCep(Boolean(event.target.value.trim()))
            }}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            maxLength={9}
            aria-describedby="occ-cep-help"
          />
          <p id="occ-cep-help">Use oito dígitos, com ou sem hífen, para consultar o endereço.</p>
        </div>}
      </div>
      {!initial && <AddressLocationSearch
        address={searchByCep ? cep : values.local ?? ""}
        searchByCep={searchByCep}
        raCode={values.raCode ?? ""}
        latitude={values.latitude ?? ""}
        longitude={values.longitude ?? ""}
        onPostalAddress={fillPostalAddress}
        onSelect={(lat, lng) => {
          updatePoint(lat, lng)
          setSearchSelection((previous) => previous + 1)
        }}
      />}
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          const point = simulateGeocoding(
            getValues("local"),
            getValues("raCode"),
          )
          if (!point) {
            setGeoMessage(
              "Informe uma RA e um endereço válido com pelo menos cinco caracteres e letras.",
            )
            return
          }
          updatePoint(point.latitude, point.longitude)
          setGeoMessage(
            "Referência fictícia da RA selecionada. O endereço não foi consultado; ajuste o pino ou as coordenadas.",
          )
        }}
      >
        Simular geocodificação
      </Button>
      <p role="status">{geoMessage}</p>
      <p>
        Clique no mapa ou arraste o pino. Para ajuste por teclado, use latitude
        e longitude (ponto decimal). O fundo OpenStreetMap depende de conexão.
      </p>
      {!hasPoint && (
        <p>
          Pino inicial de referência: selecione uma localização válida antes de
          aplicar a simulação.
        </p>
      )}
      <LocationPicker
        expanded={!initial}
        searchSelection={searchSelection}
        latitude={hasPoint ? latitude : -15.79}
        longitude={hasPoint ? longitude : -47.88}
        onChange={updatePoint}
      />
      <div className="occurrence-actions">
        <Button type="submit" disabled={isSubmitting}>
          {initial
            ? "Aplicar edição demonstrativa"
            : "Criar ocorrência demonstrativa"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => (isDirty || cep.trim() ? setCancel(true) : onDone())}
        >
          Cancelar
        </Button>
      </div>
      {cancel && (
        <Dialog title="Descartar alterações?" onClose={() => setCancel(false)}>
          <h2>Descartar alterações?</h2>
          <p>Os valores preenchidos neste formulário serão descartados.</p>
          <Button type="button" onClick={onDone}>
            Descartar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setCancel(false)}
          >
            Continuar editando
          </Button>
        </Dialog>
      )}
    </form>
  )
}
