import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const TOKENS_PATH = resolve(process.cwd(), 'reset-tokens.json')
const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

interface ResetToken {
  token: string
  email: string
  expiresAt: string // ISO
}

function readTokens(): ResetToken[] {
  try {
    if (!existsSync(TOKENS_PATH)) return []
    return JSON.parse(readFileSync(TOKENS_PATH, 'utf-8')) as ResetToken[]
  } catch {
    return []
  }
}

function writeTokens(tokens: ResetToken[]): void {
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf-8')
}

function purgeExpired(tokens: ResetToken[]): ResetToken[] {
  const now = Date.now()
  return tokens.filter((t) => new Date(t.expiresAt).getTime() > now)
}

/** Creates a new reset token for the given email. Returns the token string. */
export function createResetToken(email: string): string {
  const tokens = purgeExpired(readTokens())
  // Remove any previous tokens for this email
  const filtered = tokens.filter((t) => t.email.toLowerCase() !== email.toLowerCase())
  const token = randomUUID()
  filtered.push({
    token,
    email: email.toLowerCase(),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  })
  writeTokens(filtered)
  return token
}

/**
 * Validates a reset token.
 * Returns the email if valid, null if not found or expired.
 * Consumes the token on success (one-time use).
 */
export function consumeResetToken(token: string): string | null {
  const tokens = purgeExpired(readTokens())
  const idx = tokens.findIndex((t) => t.token === token)
  if (idx === -1) return null
  const entry = tokens[idx]
  // Remove the token (one-time use)
  tokens.splice(idx, 1)
  writeTokens(tokens)
  return entry.email
}
