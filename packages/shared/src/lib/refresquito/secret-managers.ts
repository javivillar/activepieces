import { z } from 'zod'
import { BaseModelSchema, Nullable } from '../core/common/base-model'
import { ApId } from '../core/common/id-generator'
import { formErrors } from '../form-errors'

// Refresquito fork: unlike upstream's Enterprise "Secret Managers" (AWS/
// HashiCorp Vault/CyberArk/1Password, each needing an external vault this
// self-hosted deployment doesn't have), this reads keys from ONE named
// Kubernetes Secret via the activepieces pod's own ServiceAccount -- no
// external credentials to store or encrypt at all, so there's deliberately
// no provider discriminator or encrypted config blob here.
//
// The namespace and Secret name are fixed at connection-creation time, not
// at reference time: Kubernetes RBAC's `get` verb can be scoped to one
// named Secret via `resourceNames`, but `list`/`watch` cannot, so fixing
// the exact Secret up front lets the pod's Role grant `get` on that one
// Secret and nothing broader. A piece connection referencing this
// connection only ever supplies the `data` key to read inside it.
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
    const hasNoProjectSelected = data.scope === RefresquitoSecretManagerScope.PROJECT && (data.projectIds ?? []).length < 1
    if (hasNoProjectSelected) {
        ctx.addIssue({
            code: 'custom',
            message: 'Please select at least one project',
            path: ['projectIds'],
        })
    }
})
export type UpsertRefresquitoSecretManagerConnectionRequest = z.infer<typeof UpsertRefresquitoSecretManagerConnectionRequest>

// A piece-connection field can hold a reference instead of a literal value:
// `{{<connectionId><SEPARATOR><secretKey>}}`. The `{{ }}` wrapper keeps the
// syntax visually consistent with this app's own property-templating
// elsewhere, and `<secretKey>` is just the key to read inside the Secret
// Manager connection's already-fixed (namespace, secretName) -- never a
// namespace or Secret name of its own, per the design above.
function buildSecretManagerReference({ connectionId, key }: { connectionId: string, key: string }): string {
    return `{{${connectionId}${REFRESQUITO_SECRET_MANAGER_FIELDS_SEPARATOR}${key}}}`
}

function parseSecretManagerReference(value: string): { connectionId: string, key: string } | null {
    const trimmed = value.trim()
    if (!(trimmed.startsWith('{{') && trimmed.endsWith('}}'))) {
        return null
    }
    const inner = trimmed.slice(2, -2)
    const separatorIndex = inner.indexOf(REFRESQUITO_SECRET_MANAGER_FIELDS_SEPARATOR)
    if (separatorIndex === -1) {
        return null
    }
    const connectionId = inner.slice(0, separatorIndex)
    const key = inner.slice(separatorIndex + REFRESQUITO_SECRET_MANAGER_FIELDS_SEPARATOR.length)
    if (connectionId.length === 0 || key.length === 0) {
        return null
    }
    return { connectionId, key }
}

export const refresquitoSecretManagerReferenceUtils = {
    build: buildSecretManagerReference,
    parse: parseSecretManagerReference,
}

export const REFRESQUITO_SECRET_MANAGER_FIELDS_SEPARATOR = '|rq_sep_v1|'
