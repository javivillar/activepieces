import { z } from 'zod'
import { isNil, Nullable } from '../../core/common'
import { AiCreditsAutoTopUpState, PlanName, PlatformPlanWithOnlyLimits, PlatformUsageMetric, TeamProjectsLimit } from '../../management/platform'
import { PiecesFilterType } from '../../management/project'

export const PRICE_PER_EXTRA_ACTIVE_FLOWS = 5

export type ProjectPlanLimits = {
    nickname?: string
    locked?: boolean
    pieces?: string[]
    aiCredits?: number | null
    piecesFilterType?: PiecesFilterType
}

export enum ApSubscriptionStatus {
    ACTIVE = 'active',
    CANCELED = 'canceled',
}

export const METRIC_TO_LIMIT_MAPPING = {
    [PlatformUsageMetric.ACTIVE_FLOWS]: 'activeFlowsLimit',
} as const

export const METRIC_TO_USAGE_MAPPING = {
    [PlatformUsageMetric.ACTIVE_FLOWS]: 'activeFlows',
} as const

export const UpdateActiveFlowsAddonParamsSchema = z.object({
    newActiveFlowsLimit: z.number(),
})
export type UpdateActiveFlowsAddonParams = z.infer<typeof UpdateActiveFlowsAddonParamsSchema>

export const CreateCheckoutSessionParamsSchema = z.object({
    newActiveFlowsLimit: z.number(),
})
export type CreateSubscriptionParams = z.infer<typeof CreateCheckoutSessionParamsSchema>

export const CreateAICreditCheckoutSessionParamsSchema = z.object({
    aiCredits: z.number(),
})
export type CreateAICreditCheckoutSessionParamsSchema = z.infer<typeof CreateAICreditCheckoutSessionParamsSchema>

export const UpdateAICreditsAutoTopUpParamsSchema = z.union([
    z.object({
        state: z.literal(AiCreditsAutoTopUpState.ENABLED),
        minThreshold: z.number(),
        creditsToAdd: z.number(),
        maxMonthlyLimit: Nullable(z.number()),
    }),
    z.object({
        state: z.literal(AiCreditsAutoTopUpState.DISABLED),
    }),
])
export type UpdateAICreditsAutoTopUpParamsSchema = z.infer<typeof UpdateAICreditsAutoTopUpParamsSchema>

export enum PRICE_NAMES {
    AI_CREDITS = 'ai-credit',
    ACTIVE_FLOWS = 'active-flow',
}

export const PRICE_ID_MAP = {
    [PRICE_NAMES.AI_CREDITS]: {
        dev: 'price_1SfgNxKTWXpWeD7hmDBG4YMZ',
        prod: 'price_1Rnj5bKZ0dZRqLEKQx2gwL7s',
    },
    [PRICE_NAMES.ACTIVE_FLOWS]: {
        dev: 'price_1SQbbYQN93Aoq4f8WK2JC4sf',
        prod: 'price_1SQbcvKZ0dZRqLEKHV5UepRx',
    },
}

export const STANDARD_CLOUD_PLAN: PlatformPlanWithOnlyLimits = {
    plan: 'standard',
    tablesEnabled: true,
    eventStreamingEnabled: false,
    includedAiCredits: 200,
    activeFlowsLimit: 10,
    projectsLimit: 1,
    aiCreditsAutoTopUpState: AiCreditsAutoTopUpState.DISABLED,
    embeddingEnabled: false,
    agentsEnabled: true,
    aiProvidersEnabled: false,
    chatEnabled: false,
    dataManipulationEnabled: false,
    globalConnectionsEnabled: false,
    customRolesEnabled: false,
    environmentsEnabled: false,
    analyticsEnabled: true,
    showPoweredBy: false,
    auditLogEnabled: false,
    managePiecesEnabled: false,
    manageTemplatesEnabled: false,
    customAppearanceEnabled: false,
    teamProjectsLimit: TeamProjectsLimit.ONE,
    projectRolesEnabled: false,
    apiKeysEnabled: false,
    ssoEnabled: false,
    secretManagersEnabled: false,
    scimEnabled: false,
    dedicatedWorkers: null,
    canary: false,
    customDomainsEnabled: false,
}

export const OPEN_SOURCE_PLAN: PlatformPlanWithOnlyLimits = {
    tablesEnabled: true,
    embeddingEnabled: false,
    agentsEnabled: true,
    aiProvidersEnabled: true,
    chatEnabled: false,
    dataManipulationEnabled: false,
    globalConnectionsEnabled: false,
    // Refresquito fork: custom project roles are pure CRUD + a generic
    // permission-array check (rbacService.assertPrinicpalAccessToProject
    // reads ProjectRole.permissions the same way for default and custom
    // roles, no license/edition check anywhere in that path) -- no new code
    // needed, just unlocking the already-built service/module/frontend.
    customRolesEnabled: true,
    includedAiCredits: 0,
    environmentsEnabled: false,
    eventStreamingEnabled: false,
    analyticsEnabled: true,
    showPoweredBy: false,
    // Refresquito fork: audit logging is now backed by this deployment's own
    // Community-native module (server/api/src/app/audit-logs/, no ee/ import)
    // instead of the upstream Enterprise one -- this flag just unlocks the
    // already edition-agnostic frontend page/UI for it.
    auditLogEnabled: true,
    managePiecesEnabled: false,
    manageTemplatesEnabled: false,
    customAppearanceEnabled: false,
    // Refresquito fork: upstream caps Community self-hosted at exactly one
    // TEAM project (a plan config value, not a real technical constraint --
    // TeamProjectsLimit.UNLIMITED is already a first-class enum value,
    // assertMaximumNumberOfProjectsReachedByEdition() just breaks with no
    // check for it). Lifted so this deployment can have more than one
    // shared project.
    teamProjectsLimit: TeamProjectsLimit.UNLIMITED,
    // Unlocks /v1/project-members (assign/remove members, change role) --
    // pairs with customRolesEnabled above for granular per-project
    // authorization. Complementary to, not conflicting with, the existing
    // Keycloak group -> DefaultProjectRole sync in keycloak-authn-module.ts:
    // both act on the same project_member/project_role tables, this just
    // also lets a platform admin manage it by hand via the UI.
    projectRolesEnabled: true,
    apiKeysEnabled: false,
    ssoEnabled: false,
    // Unlocks /v1/secret-managers. Same generic CRUD + provider-plugin
    // mechanism as everything else -- no license check anywhere in
    // secretManagersService or the providers. Added a 5th provider
    // (KUBERNETES, secret-manager-providers/kubernetes-provider.ts) for
    // this self-hosted deployment: reads from a dedicated Secret in the
    // refresquito-secrets namespace via the pod's own ServiceAccount,
    // since no external vault (AWS/Vault/CyberArk/1Password) is available
    // here.
    secretManagersEnabled: true,
    scimEnabled: false,
    stripeCustomerId: undefined,
    stripeSubscriptionId: undefined,
    stripeSubscriptionStatus: undefined,
    aiCreditsAutoTopUpState: AiCreditsAutoTopUpState.DISABLED,
    dedicatedWorkers: null,
    canary: false,
    customDomainsEnabled: false,
}

export const APPSUMO_PLAN = (planName: PlanName): PlatformPlanWithOnlyLimits => ({
    ...STANDARD_CLOUD_PLAN,
    plan: planName,
    eventStreamingEnabled: false,
    activeFlowsLimit: undefined,
})

export const isCloudPlanButNotEnterprise = (plan?: string | null): boolean => {
    if (isNil(plan)) {
        return false
    }

    return plan === PlanName.STANDARD
}
