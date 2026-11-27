import { z } from "zod"
import catalog from "../../docs/contratos/catalogos-v0.1.0.json" with { type: "json" }
import { demoCivilDate } from "@/data/demoAnalytics"

export const CONTRACT_VERSION = "0.1.0"
export const catalogVersion = catalog.versao
export const raSchema = z.enum(
  catalog.regioes.map((item) => item.id) as [string, ...string[]],
)
export const natureSchema = z.enum(
  catalog.naturezas.map((item) => item.nome) as [string, ...string[]],
)
export const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9#][A-Za-z0-9_.:#-]*$/)
  .describe(
    "Identificador interno opaco; aceita IDs demonstrativos como #00001. Não é código oficial nem exige UUID.",
  )
export const dateSchema = z.iso
  .date()
  .regex(/^(?:19\d{2}|[2-9]\d{3})-/)
  .refine((value) => demoCivilDate(value) !== null, "Data civil inválida.")
  .describe(
    "Data civil ISO, anos 1900–9999; limites inclusivos, sem conversão para timestamp.",
  )
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
export const coordinateSchema = z
  .strictObject({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .describe(
    "WGS84 em graus decimais; GeoJSON usa [longitude, latitude]. Não comprova pertencimento ao DF/RA.",
  )
export const countSchema = z.number().int().nonnegative()
export const executionSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("demonstrativo"),
    persisted: z.literal(false),
  }),
  z.strictObject({ mode: z.literal("proposto"), persisted: z.literal(false) }),
  z.strictObject({ mode: z.literal("operacional"), persisted: z.boolean() }),
])
export const metadataSchema = z.strictObject({
  contractVersion: z.literal(CONTRACT_VERSION),
  catalogVersion: z.literal(catalogVersion),
  execution: executionSchema,
})
export const paginationSchema = z
  .strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
    total: countSchema,
    totalPages: z.number().int().positive(),
  })
  .refine(
    (value) =>
      value.totalPages ===
        Math.max(1, Math.ceil(value.total / value.pageSize)) &&
      value.page <= value.totalPages,
    "Paginação inconsistente.",
  )
export const validationIssueSchema = z.strictObject({
  path: z.array(z.union([z.string(), countSchema])),
  code: z.string().min(1),
  message: z.string().min(1),
})
export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const
export const errorSchema = z
  .strictObject({
    success: z.literal(false),
    error: z.strictObject({
      code: z.enum(
        Object.keys(
          ERROR_STATUS,
        ) as [keyof typeof ERROR_STATUS, ...Array<keyof typeof ERROR_STATUS>],
      ),
      status: z.number().int(),
      message: z.string().min(1),
      details: z.array(validationIssueSchema),
      requestId: idSchema.optional(),
    }),
  })
  .refine(
    (value) => ERROR_STATUS[value.error.code] === value.error.status,
    "Código e status HTTP incompatíveis.",
  )
export function successSchema<T extends z.ZodType>(data: T) {
  return z.strictObject({
    success: z.literal(true),
    data,
    meta: metadataSchema,
  })
}
export function contractError(
  code: keyof typeof ERROR_STATUS,
  message: string,
  details: z.infer<typeof validationIssueSchema>[] = [],
) {
  return errorSchema.parse({
    success: false,
    error: { code, status: ERROR_STATUS[code], message, details },
  })
}
export type ApiError = z.infer<typeof errorSchema>
export type Coordinates = z.infer<typeof coordinateSchema>
