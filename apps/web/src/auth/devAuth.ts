/**
 * Dev-mode authentication: validates credentials against the Vite dev store.
 *
 * The web app's Vite server exposes /__dev__/auth which reads from
 * .dev-users.json — a file written by the admin panel when creating users.
 *
 * Only active when Supabase is not configured. Never runs in production.
 */

import type { PlanId } from '@viver-saude/shared'

export interface DevAuthResult {
  ok: boolean
  userId?: string
  email?: string
  planIds?: PlanId[]
  error?: string
}

export async function devAuthenticate(email: string, password: string): Promise<DevAuthResult> {
  try {
    const res = await fetch('/__dev__/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const data = await res.json() as {
      ok?: boolean
      error?: string
      userId?: string
      email?: string
      planIds?: string[]
    }

    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? 'Credenciais inválidas.' }
    }

    return {
      ok: true,
      userId: data.userId,
      email: data.email,
      planIds: (data.planIds ?? []) as PlanId[],
    }
  } catch {
    return {
      ok: false,
      error: 'Não foi possível conectar ao servidor local. O web app (5173) está rodando?',
    }
  }
}
