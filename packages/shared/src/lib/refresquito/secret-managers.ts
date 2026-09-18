import { z } from 'zod'
import { BaseModelSchema, Nullable } from '../core/common/base-model'
import { ApId } from '../core/common/id-generator'
import { formErrors } from '../form-errors'

// Refresquito fork: unlike upstream's Enterprise "Secret Managers" (AWS/
// HashiCorp Vault/CyberArk/1Password, all needing an external vault this
// self-hosted deployment doesn't have), this reads keys from ONE named
// Kubernetes Secret via the activepieces pod's own ServiceAccount -- no
// credentials to store or encrypt at all, so there's deliberately no
// provider discriminator or encrypted config blob here.
export enum RefresquitoSecretManagerScope {
    PLATFORM = 'PLATFORM',
    PROJECT = 'PROJECT',
}

export const RefresquitoSecretManagerConnection = z.object({
    ...BaseModelSchema,
    platformId: ApId,
    name: z.string(),
    namespace: z.string(),
    secretName: z.string(),
    scope: z.enum(RefresquitoSecretManagerScope),
    projectIds: Nullable(z.array(z.string())),
})
export type RefresquitoSecretManagerConnection = z.infer<typeof RefresquitoSecretManagerConnection>

export const RefresquitoSecretManagerConnectionWithStatus = RefresquitoSecretManagerConnection.extend({
    connected: z.boolean(),
})
export type RefresquitoSecretManagerConnectionWithStatus = z.infer<typeof RefresquitoSecretManagerConnectionWithStatus>

export const UpsertRefresquitoSecretManagerConnectionRequest = z.object({
    name: z.string().min(1, formErrors.required),
    namespace: z.string().min(1, formErrors.required),
    secretName: z.string().min(1, formErrors.required),
    scope: z.enum(RefresquitoSecretManagerScope),
    projectIds: z.array(z.string()).optional(),
}).superRefine((data, ctx) => {
    if (data.scope === RefresquitoSecretManagerScope.PROJECT && (!data.projectIds || data.projectIds.length < 1)) {
        ctx.addIssue({
            code: 'custom',
            message: 'Please select at least one project',
            path: ['projectIds'],
        })
    }
})
export type UpsertRefresquitoSecretManagerConnectionRequest = z.infer<typeof UpsertRefresquitoSecretManagerConnectionRequest>

export const REFRESQUITO_SECRET_MANAGER_FIELDS_SEPARATOR = '|rq_sep_v1|'
