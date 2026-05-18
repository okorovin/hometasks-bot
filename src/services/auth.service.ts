import { randomUUID } from "crypto"

interface PendingToken {
    userId: number
    expiresAt: number
}

const pendingTokens = new Map<string, PendingToken>()

const TOKEN_TTL_MS = 5 * 60 * 1000 // 5 minutes

export function generateToken(userId: number): string {
    const token = randomUUID()
    pendingTokens.set(token, {
        userId,
        expiresAt: Date.now() + TOKEN_TTL_MS,
    })
    return token
}

export function validateToken(token: string): number | null {
    const pending = pendingTokens.get(token)
    if (!pending) return null
    if (Date.now() > pending.expiresAt) {
        pendingTokens.delete(token)
        return null
    }
    pendingTokens.delete(token) // one-time use
    return pending.userId
}

// Cleanup expired tokens every 10 minutes
setInterval(() => {
    const now = Date.now()
    for (const [token, data] of pendingTokens) {
        if (now > data.expiresAt) pendingTokens.delete(token)
    }
}, 10 * 60 * 1000)
