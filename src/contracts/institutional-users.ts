import { z } from "zod";
import { ROLES } from "@/lib/auth/policy";
import { directHash } from "@/contracts/pcdf-direct";
import { strongInstitutionalPassword } from "@/lib/auth/onboarding";

export const institutionalUser = z.object({
  id: z.uuid(), name: z.string().min(1), email: z.string().nullable(), orgao: z.string().nullable(),
  perfil: z.enum(ROLES), ativo: z.boolean(), cadastro: z.string(), version: directHash,
  activity: z.array(z.string()),
  deletionPending: z.boolean().optional(),
  loginEmail: z.string().nullable().optional(),
  firstAccessPending: z.boolean().optional(),
});
export type InstitutionalUser = z.infer<typeof institutionalUser>;

const target = { id: z.uuid(), version: directHash };
const fields = {
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().max(254).pipe(z.union([z.email(), z.literal("")])),
  orgao: z.string().trim().max(160),
};
export const institutionalEdit = z.union([
  z.strictObject({ ...target, ...fields }),
  z.strictObject({ ...target, perfil: z.enum(ROLES) }),
  z.strictObject({ ...target, ativo: z.boolean() }),
]);
export type InstitutionalEdit = z.infer<typeof institutionalEdit>;

export const institutionalCreate = z.strictObject({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  perfil: z.enum(ROLES),
  orgao: z.string().trim().max(160).default(""),
  password: z.string().max(72).refine(strongInstitutionalPassword),
  ativo: z.boolean().default(true),
});
export type InstitutionalCreate = z.infer<typeof institutionalCreate>;

export const institutionalDelete = z.strictObject({
  ...target,
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
});
export const institutionalDeletionTarget = z.object({
  id: z.uuid(), version: directHash, name: z.string(), email: z.email(), perfil: z.enum(ROLES),
});
