import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Types ──────────────────────────────────────────────────

export interface StoredUser {
  id: string
  fullName: string
  email: string
  planIds: string[]
  /** Plain text password — matches dev-mode behaviour. */
  password: string
  /**
   * Per-plan expiry as ISO date strings.
   * Absent or null means lifetime access (one-time payment).
   */
  planExpiresAt?: Record<string, string>
  /**
   * Stripe Subscription IDs mapped by planId.
   * Used to cancel subscriptions via the Stripe API.
   * Only populated for recurring (monthly) plans.
   */
  subscriptionIds?: Record<string, string>
  /**
   * Plans scheduled for cancellation at period end.
   * Value is the ISO date when access will be revoked.
   */
  planCancelledAt?: Record<string, string>
}

// ── Storage ────────────────────────────────────────────────

const USERS_PATH = resolve(process.cwd(), 'users.json')

function readUsers(): StoredUser[] {
  try {
    if (!existsSync(USERS_PATH)) return []
    return JSON.parse(readFileSync(USERS_PATH, 'utf-8')) as StoredUser[]
  } catch {
    return []
  }
}

function writeUsers(users: StoredUser[]): void {
  writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf-8')
}

// ── Public API ─────────────────────────────────────────────

export function listUsers(): StoredUser[] {
  return readUsers()
}

/**
 * Creates or updates a user by ID.
 * If updating, only provided fields are overwritten; password is preserved if omitted.
 */
export function upsertUser(data: Partial<StoredUser> & { id: string; email: string }): StoredUser {
  const users = readUsers()
  const idx = users.findIndex((u) => u.id === data.id)
  const existing = idx !== -1 ? users[idx] : null

  const merged: StoredUser = {
    fullName: data.fullName ?? existing?.fullName ?? '',
    planIds: data.planIds ?? existing?.planIds ?? [],
    password: data.password ?? existing?.password ?? '',
    ...existing,
    id: data.id,
    email: data.email,
    // Allow explicit override of tracked fields
    ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
    ...(data.planIds !== undefined ? { planIds: data.planIds } : {}),
    ...(data.password !== undefined ? { password: data.password } : {}),
    ...(data.planExpiresAt !== undefined ? { planExpiresAt: { ...(existing?.planExpiresAt ?? {}), ...data.planExpiresAt } } : {}),
    ...(data.subscriptionIds !== undefined ? { subscriptionIds: { ...(existing?.subscriptionIds ?? {}), ...data.subscriptionIds } } : {}),
    ...(data.planCancelledAt !== undefined ? { planCancelledAt: { ...(existing?.planCancelledAt ?? {}), ...data.planCancelledAt } } : {}),
  }

  if (idx !== -1) {
    users[idx] = merged
  } else {
    users.unshift(merged)
  }

  writeUsers(users)
  return merged
}

export function removeUser(id: string): void {
  writeUsers(readUsers().filter((u) => u.id !== id))
}

/** Returns the user matching the email (case-insensitive), or null. */
export function findByEmail(email: string): StoredUser | null {
  return readUsers().find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null
}
