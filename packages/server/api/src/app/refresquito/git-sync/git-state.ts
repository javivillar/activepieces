import { FieldState, FieldType, FlowOperationStatus, FlowState, PopulatedFlow, PopulatedTable, TableState } from '@activepieces/shared'
import { flowMigrations } from '../../flows/flow-version/migrations'
import { refresquitoCleanFlowState } from './clean-flow-state'

export const refresquitoGitState = {
    async getFlowState(flow: PopulatedFlow): Promise<FlowState> {
        const migratedVersion = await flowMigrations.apply(flow.version)
        const flowState: FlowState = {
            ...flow,
            operationStatus: flow.operationStatus ?? FlowOperationStatus.NONE,
            externalId: flow.externalId ?? flow.id,
            version: migratedVersion,
        }
        return refresquitoCleanFlowState.cleanFlowState(flowState)
    },
    getTableState(table: PopulatedTable): TableState {
        const fields: FieldState[] = table.fields.map((field) => ({
            name: field.name,
            type: field.type,
            externalId: field.externalId,
            data: field.type === FieldType.STATIC_DROPDOWN ? field.data : undefined,
        }))
        return TableState.parse({
            id: table.id,
            externalId: table.externalId ?? table.id,
            name: table.name,
            fields,
        })
    },
}
