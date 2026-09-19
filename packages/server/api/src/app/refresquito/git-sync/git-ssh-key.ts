import fs from 'fs/promises'
import path from 'path'
import { nanoid } from 'nanoid'

const SSH_KEYS_ROOT = path.resolve(path.join('tmp', 'refresquito-ssh-keys'))

// SSH clients refuse a private key file that is readable by anyone but its owner.
const PRIVATE_KEY_FILE_MODE = 0o600

async function writeTemporaryPrivateKey({ sshPrivateKey, id }: { sshPrivateKey: string, id?: string }): Promise<{
    sshCommand: string
    dispose: () => Promise<void>
}> {
    await fs.mkdir(SSH_KEYS_ROOT, { recursive: true })
    // `id`, when given, always comes from a server-generated apId (never raw user input), so it is
    // safe to interpolate directly into the path without extra charset validation here.
    const keyPath = path.join(SSH_KEYS_ROOT, id ?? nanoid())
    await fs.writeFile(keyPath, sshPrivateKey, { mode: PRIVATE_KEY_FILE_MODE })
    await fs.chmod(keyPath, PRIVATE_KEY_FILE_MODE)
    return {
        sshCommand: `ssh -i ${keyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`,
        dispose: async () => {
            await fs.rm(keyPath, { force: true })
        },
    }
}

export const gitSshKey = {
    writeTemporaryPrivateKey,
}
