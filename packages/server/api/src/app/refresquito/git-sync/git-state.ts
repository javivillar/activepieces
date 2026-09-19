import { FieldType, FlowOperationStatus, FlowState, PopulatedFlow, PopulatedTable, TableState } from '@activepieces/shared'
import { flowMigrations } from '../../flows/flow-version/migrations'
import { CleanedFlowState, refresquitoCleanFlowState } from './clean-flow-state'

async function buildFlowExportState(flow: PopulatedFlow): Promise<CleanedFlowState> {
    const migratedVersion = await flowMigrations.apply(flow.version)
    const flowState: FlowState = {
        ...flow,
        operationStatus: flow.operationStatus ?? FlowOperationStatus.NONE,
        externalId: flow.externalId ?? flow.id,
        version: migratedVersion,
    }
    return refresquitoCleanFlowState.cleanFlowState(flowState)
}

function buildTableExportState(table: PopulatedTable): TableState {
    return TableState.parse({
        id: table.id,
        externalId: table.externalId ?? table.id,
        name: table.name,
        status: table.status,
        trigger: table.trigger,
        fields: table.fields.map((field) => ({
            name: field.name,
            type: field.type,
            externalId: field.externalId,
            data: field.type === FieldType.STATIC_DROPDOWN ? field.data : undefined,
        })),
    })
}

export const refresquitoGitState = {
    buildFlowExportState,
    buildTableExportState,
}
