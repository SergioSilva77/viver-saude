/**
 * Dev-mode authentication: validates credentials against the backend API.
 *
 * Calls POST /api/auth/login — proxied to localhost:4000 in development (via
 * Vite proxy) and handled by Nginx in production.
 *
 * Only active when Supabase is not configured.
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
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const data = await res.json() as {
      ok?: boolean
      message?: string
      userId?: string
      email?: string
      planIds?: string[]
    }

    if (!res.ok || !data.ok) {
      return { ok: false, error: data.message ?? 'Credenciais inválidas.' }
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
      error: 'Não foi possível conectar ao servidor. Verifique sua conexão.',
    }
  }
}
