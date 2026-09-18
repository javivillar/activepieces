import { FlowOperationType, Permission, Principal, ProjectId } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { refresquitoRbacService } from './rbac.service'

// Refresquito fork: own replacement for the finer-grained per-flow-
// operation permission check (upstream:
// ee/authentication/project-role/rbac-middleware.ts's
// assertUserHasPermissionToFlow). Deliberately always active here (no
// edition gate) -- fully redundant with, not stricter than, the
// route-level WRITE_FLOW/UPDATE_FLOW_STATUS check already enforced by
// authorize.ts on the same endpoints, so enabling it changes no real
// behavior for any user.
export async function refresquitoAssertUserHasPermissionToFlow(
    principal: Principal,
    projectId: ProjectId,
    operationType: FlowOperationType,
    log: FastifyBaseLogger,
): Promise<void> {
    switch (operationType) {
        case FlowOperationType.LOCK_AND_PUBLISH:
        case FlowOperationType.CHANGE_STATUS:
            await refresquitoRbacService(log).assertPrinicpalAccessToProject({ principal, permission: Permission.UPDATE_FLOW_STATUS, projectId })
            break
        case FlowOperationType.UPDATE_MINUTES_SAVED:
        case FlowOperationType.SAVE_SAMPLE_DATA:
        case FlowOperationType.ADD_ACTION:
        case FlowOperationType.UPDATE_ACTION:
        case FlowOperationType.DELETE_ACTION:
        case FlowOperationType.LOCK_FLOW:
        case FlowOperationType.CHANGE_FOLDER:
        case FlowOperationType.CHANGE_NAME:
        case FlowOperationType.MOVE_ACTION:
        case FlowOperationType.IMPORT_FLOW:
        case FlowOperationType.UPDATE_TRIGGER:
        case FlowOperationType.DUPLICATE_ACTION:
        case FlowOperationType.USE_AS_DRAFT:
        case FlowOperationType.ADD_BRANCH:
        case FlowOperationType.DELETE_BRANCH:
        case FlowOperationType.DUPLICATE_BRANCH:
        case FlowOperationType.UPDATE_METADATA:
        case FlowOperationType.UPDATE_OWNER:
        case FlowOperationType.SET_SKIP_ACTION:
        case FlowOperationType.MOVE_BRANCH:
        case FlowOperationType.ADD_NOTE:
        case FlowOperationType.UPDATE_NOTE:
        case FlowOperationType.DELETE_NOTE:
        case FlowOperationType.UPDATE_SAMPLE_DATA_INFO:
            await refresquitoRbacService(log).assertPrinicpalAccessToProject({ principal, permission: Permission.WRITE_FLOW, projectId })
            break
    }
}
