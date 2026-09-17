import { ApplicationEvent } from '@activepieces/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../database/database-common'

type AuditLogSchema = ApplicationEvent

export const AuditLogEntity = new EntitySchema<AuditLogSchema>({
    name: 'audit_log',
    tableName: 'audit_event',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: {
            type: String,
        },
        projectId: {
            type: String,
            nullable: true,
        },
        action: {
            type: String,
        },
        userEmail: {
            type: String,
            nullable: true,
        },
        projectDisplayName: {
            type: String,
            nullable: true,
        },
        data: {
            type: 'jsonb',
        },
        ip: {
            type: String,
            nullable: true,
        },
        userId: {
            type: String,
            nullable: true,
        },
    },
})
