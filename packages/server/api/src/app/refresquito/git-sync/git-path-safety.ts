import { ActivepiecesError, ErrorCode } from '@activepieces/shared'

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._-]{1,128}$/
const RESERVED_IDENTIFIERS = new Set(['.', '..'])

function assertSafeIdentifier({ value, label }: { value: string, label: string }): void {
    if (!SAFE_IDENTIFIER_PATTERN.test(value) || RESERVED_IDENTIFIERS.has(value)) {
        throw new ActivepiecesError({
            code: ErrorCode.VALIDATION,
            params: { message: `invalid ${label} "${value}": only letters, digits, dots, dashes and underscores are allowed, and it cannot be "." or ".."` },
        })
    }
}

function assertSafeSlug(slug: string): void {
    assertSafeIdentifier({ value: slug, label: 'gitRepo.slug' })
}

function toSafeJsonFileName(fileName: string): string {
    assertSafeIdentifier({ value: fileName, label: 'fileName' })
    return `${fileName}.json`
}

export const gitPathSafety = {
    assertSafeSlug,
    toSafeJsonFileName,
}
