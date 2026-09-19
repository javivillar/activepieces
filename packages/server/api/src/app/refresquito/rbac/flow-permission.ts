import { FlowOperationType, Permission, Principal, ProjectId } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { refresquitoRbacService } from './rbac.service'

// Refresquito fork: secondary, flow-operation-specific permission check.
// Called by flow.controller.ts on every "apply operation to a flow"
// request, independently of (and redundantly with) the route-level project
// permission check authorize.ts already runs. Unconditionally active --
// no edition/feature-flag gate, on purpose.
//
// Only status-changing operations require the narrower UPDATE_FLOW_STATUS
// permission; every other flow mutation requires WRITE_FLOW. Read-only
// access to a flow never reaches this function at all, since it's only
// wired into the mutating "apply operation" endpoint.
const STATUS_CHANGING_FLOW_OPERATIONS: ReadonlySet<FlowOperationType> = new Set([
    FlowOperationType.CHANGE_STATUS,
    FlowOperationType.LOCK_AND_PUBLISH,
])

export async function refresquitoAssertUserHasPermissionToFlow(
    principal: Principal,
    projectId: ProjectId,
    operationType: FlowOperationType,
    log: FastifyBaseLogger,
): Promise<void> {
    const requiredPermission = STATUS_CHANGING_FLOW_OPERATIONS.has(operationType)
        ? Permission.UPDATE_FLOW_STATUS
        : Permission.WRITE_FLOW

    await refresquitoRbacService(log).assertPrinicpalAccessToProject({
        principal,
        permission: requiredPermission,
        projectId,
    })
}
