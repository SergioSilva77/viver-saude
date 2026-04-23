import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { getPlan, plans, type PlanId } from '@viver-saude/shared'

import { config, getStripeConfig, hasStripeConfig, hasSupabaseAdminConfig } from './config.js'
import { findByEmail, upsertUser } from './userStore.js'

type RegisterIntentInput = {
  email: string
  password: string
  fullName: string
  planId: PlanId
}

export function getStripeClient(): Stripe {
  const { secretKey } = getStripeConfig()
  if (!secretKey) {
    throw new Error('As credenciais do Stripe ainda não foram configuradas.')
  }
  return new Stripe(secretKey)
}

function getSupabaseAdminClient() {
  if (!hasSupabaseAdminConfig()) {
    throw new Error('As credenciais administrativas do Supabase ainda não foram configuradas.')
  }

  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function registerPendingUser(input: RegisterIntentInput) {
  if (!hasSupabaseAdminConfig()) {
    return {
      persisted: false,
      mode: 'configuration_missing' as const,
      message: 'Configure o Supabase para persistir o cadastro antes do pagamento.',
    }
  }

  const supabase = getSupabaseAdminClient()
  const authResult = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName,
      onboarding_plan: input.planId,
    },
  })

  if (authResult.error || !authResult.data.user) {
    throw new Error(authResult.error?.message ?? 'Falha ao criar usuário no Supabase.')
  }

  const profileResult = await supabase.from('profiles').upsert({
    id: authResult.data.user.id,
    full_name: input.fullName,
    email: input.email,
    selected_plan: input.planId,
    onboarding_status: 'awaiting_payment',
  })

  if (profileResult.error) {
    throw new Error(profileResult.error.message)
  }

  return {
    persisted: true,
    mode: 'supabase' as const,
    userId: authResult.data.user.id,
  }
}

export async function createCheckoutSession(planId: PlanId, customerEmail: string) {
  const stripe = getStripeClient()
  const stripeConf = getStripeConfig()
  const plan = getPlan(planId)
  const mode = plan.billingInterval === 'monthly' ? 'subscription' : 'payment'
  const configuredPriceId = stripeConf[`priceId${planId.charAt(0).toUpperCase()}${planId.slice(1)}` as keyof typeof stripeConf] as string

  return stripe.checkout.sessions.create({
    mode,
    customer_email: customerEmail,
    success_url: `${config.appUrl}/?checkout=success&plan=${planId}`,
    cancel_url:  `${config.appUrl}/?checkout=cancelled&plan=${planId}`,
    metadata: {
      planId,
      app: 'viver-saude',
    },
    ...(configuredPriceId
      ? {
          line_items: [{ price: configuredPriceId, quantity: 1 }],
        }
      : {
          line_items: [
            {
              price_data: {
                currency: 'brl',
                product_data: {
                  name: plan.label,
                  description: plan.description,
                },
                recurring: plan.billingInterval === 'monthly' ? { interval: 'month' } : undefined,
                unit_amount: plan.priceInCents,
              },
              quantity: 1,
            },
          ],
        }),
  })
}

// ── Expiry helpers ─────────────────────────────────────────

function calcPlanExpiry(planId: PlanId): string | null {
  const plan = getPlan(planId)
  if (plan.billingInterval === 'one_time') return null   // lifetime access
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)
  return expiresAt.toISOString()
}

// ── Webhook handler ────────────────────────────────────────

export async function applyWebhookCheckoutCompleted(session: Stripe.Checkout.Session) {
  const email = session.customer_details?.email ?? session.customer_email

  if (!email) {
    throw new Error('Sessão do Stripe sem email associado.')
  }

  const planId = (session.metadata?.planId as PlanId | undefined) ?? 'nivel1'
  const expiresAt = calcPlanExpiry(planId)

  // ── 1. Update local users.json (works without Supabase) ──
  const localUser = findByEmail(email)
  if (localUser) {
    const updatedPlanIds = localUser.planIds.includes(planId)
      ? localUser.planIds
      : [...localUser.planIds, planId]

    const updatedPlanExpiresAt = {
      ...(localUser.planExpiresAt ?? {}),
      ...(expiresAt ? { [planId]: expiresAt } : {}),
    }

    upsertUser({
      id: localUser.id,
      email: localUser.email,
      planIds: updatedPlanIds,
      planExpiresAt: updatedPlanExpiresAt,
    })
  }

  // ── 2. Update Supabase profile (if configured) ────────────
  if (!hasSupabaseAdminConfig()) {
    return {
      persisted: localUser !== null,
      message: localUser
        ? 'Pagamento confirmado e acesso liberado.'
        : 'Webhook recebido. Usuário não encontrado no sistema local.',
    }
  }

  const supabase = getSupabaseAdminClient()
  const { data: userData, error: userError } = await supabase.auth.admin.listUsers()
  if (userError) throw new Error(userError.message)

  const user = userData.users.find((candidate) => candidate.email === email)
  if (!user) throw new Error('Usuário não localizado no Supabase para ativação pós-pagamento.')

  const profileResult = await supabase.from('profiles').upsert({
    id: user.id,
    email,
    selected_plan: planId,
    onboarding_status: 'active',
    has_completed_payment: true,
    stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
  })

  if (profileResult.error) throw new Error(profileResult.error.message)

  const paymentResult = await supabase.from('payments').insert({
    user_id: user.id,
    plan_id: planId,
    amount_cents: session.amount_total ?? getPlan(planId).priceInCents,
    currency: session.currency ?? 'brl',
    status: session.payment_status,
    stripe_session_id: session.id,
    stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
  })

  if (paymentResult.error) throw new Error(paymentResult.error.message)

  return {
    persisted: true,
    message: 'Pagamento confirmado e acesso liberado.',
  }
}

export function getCatalog() {
  return plans.map((plan) => ({
    ...plan,
    formattedPrice: (plan.priceInCents / 100).toFixed(2).replace('.', ','),
  }))
}
