import fs from 'fs/promises'
import path from 'path'
import { fileSystemUtils } from '@activepieces/server-utils'
import { gitPathSafety } from './git-path-safety'

async function writeJsonFile({ dir, fileName, contents }: { dir: string, fileName: string, contents: unknown }): Promise<void> {
    const filePath = resolveJsonFilePath({ dir, fileName })
    await fileSystemUtils.assertPathInside({ baseDir: dir, targetPath: filePath })
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(contents, null, 2))
}

async function deleteJsonFile({ dir, fileName }: { dir: string, fileName: string }): Promise<void> {
    const filePath = resolveJsonFilePath({ dir, fileName })
    await fileSystemUtils.assertPathInside({ baseDir: dir, targetPath: filePath })
    await fileSystemUtils.deleteFile(filePath)
}

function resolveJsonFilePath({ dir, fileName }: { dir: string, fileName: string }): string {
    return path.join(dir, gitPathSafety.toSafeJsonFileName(fileName))
}

export const refresquitoGitSyncHelper = {
    writeJsonFile,
    deleteJsonFile,
}
