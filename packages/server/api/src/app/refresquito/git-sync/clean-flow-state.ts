import {
    CodeAction,
    ContinueOnFailureBranches,
    FlowAction,
    FlowActionType,
    FlowState,
    FlowTrigger,
    FlowTriggerType,
    FlowVersion,
    isNil,
    omit,
    PieceAction,
} from '@activepieces/shared'

// Fields that are either internal-DB bookkeeping (change on every read / write) or point at
// records (project, owner, folder, template) that only make sense inside the environment the
// flow was exported from. Declared as data so the strip set is the single source of truth,
// rather than being implied by which fields a hand-written copy happens to mention.
const FLOW_VOLATILE_KEYS = [
    'created',
    'updated',
    'projectId',
    'ownerId',
    'folderId',
    'publishedVersionId',
    'operationStatus',
    'timeSavedPerRun',
    'templateId',
    'createdBy',
] as const

const FLOW_VERSION_VOLATILE_KEYS = ['created', 'updated', 'updatedBy'] as const

// Every action/trigger "node" keeps all of its own fields except the ones that point at child
// nodes — those need to be recursively cleaned rather than copied verbatim. Naming them per node
// kind, instead of writing out every kept field by hand, is what lets a single generic step
// (`omit` + recurse) stand in for a bespoke copy-function per node type.
const TRIGGER_CHILD_KEYS = ['nextAction'] as const
const BRANCHING_ACTION_CHILD_KEYS = ['nextAction', 'continueOnFailureBranches'] as const
const LOOP_ACTION_CHILD_KEYS = ['nextAction', 'firstLoopAction'] as const
const ROUTER_ACTION_CHILD_KEYS = ['nextAction', 'children'] as const

export type CleanedFlowVersion = Omit<FlowVersion, typeof FLOW_VERSION_VOLATILE_KEYS[number]>
export type CleanedFlowState = Omit<FlowState, typeof FLOW_VOLATILE_KEYS[number] | 'version'> & {
    version: CleanedFlowVersion
}

function cleanFlowState(flowState: FlowState): CleanedFlowState {
    return {
        ...omit(flowState, [...FLOW_VOLATILE_KEYS]),
        version: cleanFlowVersion(flowState.version),
    }
}

function cleanFlowVersion(version: FlowVersion): CleanedFlowVersion {
    return {
        ...omit(version, [...FLOW_VERSION_VOLATILE_KEYS]),
        trigger: cleanTrigger(version.trigger),
    }
}

function cleanTrigger(trigger: FlowTrigger): FlowTrigger {
    switch (trigger.type) {
        case FlowTriggerType.PIECE:
            return {
                ...omit(trigger, [...TRIGGER_CHILD_KEYS]),
                nextAction: cleanOptionalAction(trigger.nextAction),
            }
        case FlowTriggerType.EMPTY:
            return {
                ...omit(trigger, [...TRIGGER_CHILD_KEYS]),
                nextAction: cleanOptionalAction(trigger.nextAction),
            }
    }
}

function cleanAction(action: FlowAction): FlowAction {
    switch (action.type) {
        case FlowActionType.CODE:
            return cleanBranchingAction(action)
        case FlowActionType.PIECE:
            return cleanBranchingAction(action)
        case FlowActionType.LOOP_ON_ITEMS:
            return {
                ...omit(action, [...LOOP_ACTION_CHILD_KEYS]),
                nextAction: cleanOptionalAction(action.nextAction),
                firstLoopAction: cleanOptionalAction(action.firstLoopAction),
            }
        case FlowActionType.ROUTER:
            return {
                ...omit(action, [...ROUTER_ACTION_CHILD_KEYS]),
                nextAction: cleanOptionalAction(action.nextAction),
                children: action.children.map((child) => isNil(child) ? null : cleanAction(child)),
            }
    }
}

function cleanBranchingAction(action: CodeAction | PieceAction): FlowAction {
    if (action.type === FlowActionType.CODE) {
        return {
            ...omit(action, [...BRANCHING_ACTION_CHILD_KEYS]),
            nextAction: cleanOptionalAction(action.nextAction),
            continueOnFailureBranches: cleanBranches(action.continueOnFailureBranches),
        }
    }
    return {
        ...omit(action, [...BRANCHING_ACTION_CHILD_KEYS]),
        nextAction: cleanOptionalAction(action.nextAction),
        continueOnFailureBranches: cleanBranches(action.continueOnFailureBranches),
    }
}

function cleanOptionalAction(action: FlowAction | undefined): FlowAction | undefined {
    return isNil(action) ? undefined : cleanAction(action)
}

function cleanBranches(branches: ContinueOnFailureBranches | undefined): ContinueOnFailureBranches | undefined {
    if (isNil(branches) || (isNil(branches.onSuccess) && isNil(branches.onFailure))) {
        return undefined
    }
    return {
        onSuccess: cleanOptionalAction(branches.onSuccess),
        onFailure: cleanOptionalAction(branches.onFailure),
    }
}

export const refresquitoCleanFlowState = {
    cleanFlowState,
}
