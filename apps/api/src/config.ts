import 'dotenv/config'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AiConfig } from './ai.js'

// ── AI config file (written by admin panel) ────────────────
const AI_CONFIG_PATH = resolve(process.cwd(), '.ai-config.json')

function readAiConfigFile(): Partial<AiConfig> {
  try {
    if (!existsSync(AI_CONFIG_PATH)) return {}
    return JSON.parse(readFileSync(AI_CONFIG_PATH, 'utf-8')) as Partial<AiConfig>
  } catch {
    return {}
  }
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  adminUrl: process.env.ADMIN_URL ?? 'http://localhost:5174',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  stripePrices: {
    nivel1: process.env.STRIPE_PRICE_ID_NIVEL1 ?? '',
    nivel2: process.env.STRIPE_PRICE_ID_NIVEL2 ?? '',
    nivel3: process.env.STRIPE_PRICE_ID_NIVEL3 ?? '',
  },
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  adminApiSecret: process.env.ADMIN_API_SECRET ?? 'vs-admin-dev',
}

export function hasStripeConfig(): boolean {
  return Boolean(config.stripeSecretKey)
}

export function hasSupabaseAdminConfig(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey)
}

/**
 * Resolves the current AI config.
 * Priority: env vars → .ai-config.json file → no config.
 */
export function getAiConfig(): AiConfig | null {
  const fileConfig = readAiConfigFile()

  const provider = (process.env.AI_PROVIDER as AiConfig['provider'] | undefined) ?? fileConfig.provider ?? 'claude'
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.GEMINI_API_KEY ?? fileConfig.apiKey ?? ''
  const model = process.env.AI_MODEL ?? fileConfig.model ?? 'claude-sonnet-4-5'

  if (!apiKey) return null

  return { provider, apiKey, model }
}
