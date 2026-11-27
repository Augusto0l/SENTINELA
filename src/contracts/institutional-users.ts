import { z } from "zod";
import { ROLES } from "@/lib/auth/policy";
import { directHash } from "@/contracts/pcdf-direct";
import { strongInstitutionalPassword } from "@/lib/auth/onboarding";

export const institutionalUser = z.object({
  id: z.uuid(), name: z.string().min(1), email: z.string().nullable(), orgao: z.string().nullable(),
  perfil: z.enum(ROLES), ativo: z.boolean(), cadastro: z.string(), version: directHash,
  activity: z.array(z.string()),
  deletionPending: z.boolean().optional(),
});
export type InstitutionalUser = z.infer<typeof institutionalUser>;

export const institutionalEdit = z.strictObject({
  id: z.uuid(), version: directHash,
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().max(254).pipe(z.union([z.email(), z.literal("")])),
  orgao: z.string().trim().max(160),
});
export type InstitutionalEdit = z.infer<typeof institutionalEdit>;

export const institutionalCreate = z.strictObject({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()).refine(email => email.endsWith("@gmail.com")),
  perfil: z.enum(ROLES),
  orgao: z.string().trim().max(160).default(""),
  password: z.string().max(72).refine(strongInstitutionalPassword),
});
export type InstitutionalCreate = z.infer<typeof institutionalCreate>;

export const institutionalDelete = z.strictObject({
  id: z.uuid(),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
});
export const institutionalDeletionTarget = z.object({
  id: z.uuid(), name: z.string(), email: z.email(), perfil: z.enum(ROLES),
});
