import fs from 'fs/promises'
import path from 'path'
import { fileSystemUtils } from '@activepieces/server-utils'
import { PopulatedFlow, PopulatedTable } from '@activepieces/shared'
import { refresquitoGitState } from './git-state'

const SAFE_FILENAME_PATTERN = /^[A-Za-z0-9._-]{1,128}$/

export const refresquitoGitSyncHelper = {
    async upsertFlowToGit({ fileName, flow, flowFolderPath }: { fileName: string, flow: PopulatedFlow, flowFolderPath: string }): Promise<void> {
        const flowJsonPath = resolveSafeJsonPath({ fileName, baseDir: flowFolderPath })
        await fileSystemUtils.assertPathInside({ baseDir: flowFolderPath, targetPath: flowJsonPath })
        await fs.mkdir(path.dirname(flowJsonPath), { recursive: true })
        const flowState = await refresquitoGitState.getFlowState(flow)
        await fs.writeFile(flowJsonPath, JSON.stringify(flowState, null, 2))
    },

    async upsertTableToGit({ fileName, table, tablesFolderPath }: { fileName: string, table: PopulatedTable, tablesFolderPath: string }): Promise<void> {
        const tableJsonPath = resolveSafeJsonPath({ fileName, baseDir: tablesFolderPath })
        await fileSystemUtils.assertPathInside({ baseDir: tablesFolderPath, targetPath: tableJsonPath })
        await fs.mkdir(path.dirname(tableJsonPath), { recursive: true })
        const tableState = refresquitoGitState.getTableState(table)
        await fs.writeFile(tableJsonPath, JSON.stringify(tableState, null, 2))
    },

    async deleteFromGit({ fileName, folderPath }: { fileName: string, folderPath: string }): Promise<boolean> {
        const jsonPath = resolveSafeJsonPath({ fileName, baseDir: folderPath })
        await fileSystemUtils.assertPathInside({ baseDir: folderPath, targetPath: jsonPath })
        const exists = await fileSystemUtils.fileExists(jsonPath)
        if (exists) {
            await fs.unlink(jsonPath)
        }
        return exists
    },
}

function resolveSafeJsonPath({ fileName, baseDir }: { fileName: string, baseDir: string }): string {
    if (!SAFE_FILENAME_PATTERN.test(fileName) || fileName === '.' || fileName === '..') {
        throw new Error(`invalid fileName "${fileName}": only alphanumeric, dot, dash and underscore are allowed`)
    }
    return path.join(baseDir, `${fileName}.json`)
}
