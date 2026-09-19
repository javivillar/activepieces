import fs from 'fs/promises'
import path from 'path'
import { fileSystemUtils } from '@activepieces/server-utils'
import { ActivepiecesError, ErrorCode, RefresquitoGitRepo, tryCatch } from '@activepieces/shared'
import { nanoid } from 'nanoid'
import simpleGit, { SimpleGit } from 'simple-git'
import { gitPathSafety } from './git-path-safety'
import { gitSshKey } from './git-ssh-key'

const WORKSPACES_ROOT = path.resolve(path.join('tmp', 'refresquito-git-workspaces'))

export type GitWorkingCopy = {
    git: SimpleGit
    flowsDir: string
    tablesDir: string
    dispose: () => Promise<void>
}

async function openWorkingCopy({ gitRepo, authorEmail, authorName }: {
    gitRepo: RefresquitoGitRepo
    authorEmail: string
    authorName: string
}): Promise<GitWorkingCopy> {
    gitPathSafety.assertSafeSlug(gitRepo.slug)
    const workspaceDir = path.join(WORKSPACES_ROOT, gitRepo.projectId, gitRepo.slug)
    await fs.mkdir(WORKSPACES_ROOT, { recursive: true })
    await fileSystemUtils.assertPathInside({ baseDir: WORKSPACES_ROOT, targetPath: workspaceDir })
    await fs.rm(workspaceDir, { recursive: true, force: true })
    await fs.mkdir(workspaceDir, { recursive: true })

    const flowsDir = path.join(workspaceDir, 'flows')
    const tablesDir = path.join(workspaceDir, 'tables')
    await fs.mkdir(flowsDir, { recursive: true })
    await fs.mkdir(tablesDir, { recursive: true })

    const { sshCommand, dispose } = await gitSshKey.writeTemporaryPrivateKey({
        sshPrivateKey: gitRepo.sshPrivateKey ?? '',
        id: gitRepo.id,
    })
    const git = buildSimpleGitClient({ baseDir: workspaceDir, sshCommand })
    await git.init()
    await git.addConfig('core.symlinks', 'false')
    await git.addConfig('protocol.file.allow', 'never')
    await git.addConfig('user.email', authorEmail)
    await git.addConfig('user.name', authorName)
    await git.addRemote('origin', gitRepo.remoteUrl)
    await git.branch(['-M', gitRepo.branch])
    await git.pull('origin', gitRepo.branch)

    return { git, flowsDir, tablesDir, dispose }
}

async function commitAndPush({ git, branch, commitMessage }: {
    git: SimpleGit
    branch: string
    commitMessage: string
}): Promise<void> {
    await git.add('.')
    const status = await git.status()
    if (status.files.length === 0) {
        return
    }
    await git.commit(commitMessage)
    await git.push('origin', branch)
}

async function verifyRemoteIsReachable({ remoteUrl, branch, sshPrivateKey }: {
    remoteUrl: string
    branch: string
    sshPrivateKey: string
}): Promise<void> {
    const validationDir = path.join(WORKSPACES_ROOT, 'validate', nanoid())
    const { sshCommand, dispose } = await gitSshKey.writeTemporaryPrivateKey({ sshPrivateKey })
    const { error } = await tryCatch(async () => {
        await fs.mkdir(validationDir, { recursive: true })
        const git = buildSimpleGitClient({ baseDir: validationDir, sshCommand })
        await git.init()
        await git.addConfig('protocol.file.allow', 'never')
        await git.addRemote('origin', remoteUrl)
        await git.branch(['-M', branch])
        await git.pull('origin', branch)
    })
    await fs.rm(validationDir, { recursive: true, force: true })
    await dispose()
    if (error !== null) {
        throw new ActivepiecesError({
            code: ErrorCode.INVALID_GIT_CREDENTIALS,
            params: { message: error.message },
        })
    }
}

function buildSimpleGitClient({ baseDir, sshCommand }: { baseDir: string, sshCommand: string }): SimpleGit {
    return simpleGit({
        baseDir,
        binary: 'git',
        unsafe: {
            allowUnsafeSshCommand: true,
            allowUnsafeProtocolOverride: true,
        },
    }).env('GIT_SSH_COMMAND', sshCommand)
}

export const gitWorkspace = {
    openWorkingCopy,
    commitAndPush,
    verifyRemoteIsReachable,
}
