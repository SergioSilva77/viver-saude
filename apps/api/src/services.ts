import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { getPlan, plans, type PlanId } from '@viver-saude/shared'

import { config, getStripeConfig, hasStripeConfig, hasSupabaseAdminConfig } from './config.js'
import { findByEmail, upsertUser } from './userStore.js'
import { sendRegistrationLink } from './emailService.js'

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

export async function createCheckoutSession(planId: PlanId, customerEmail?: string, customerFullName?: string) {
  const stripe = getStripeClient()
  const stripeConf = getStripeConfig()
  const plan = getPlan(planId)
  const mode = plan.billingInterval === 'monthly' ? 'subscription' : 'payment'
  const configuredPriceId = stripeConf[`priceId${planId.charAt(0).toUpperCase()}${planId.slice(1)}` as keyof typeof stripeConf] as string

  return stripe.checkout.sessions.create({
    mode,
    // customer_email is optional — Stripe collects it during checkout if not provided
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    // {CHECKOUT_SESSION_ID} is a Stripe template placeholder replaced automatically
    success_url: `${config.appUrl}/?checkout=success&plan=${planId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${config.appUrl}/?checkout=cancelled`,
    metadata: {
      planId,
      app: 'viver-saude',
      ...(customerFullName ? { fullName: customerFullName } : {}),
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
  const fullName = (session.metadata?.fullName as string | undefined) ?? session.customer_details?.name ?? 'Cliente'
  const expiresAt = calcPlanExpiry(planId)

  // ── 1. Update local users.json (works without Supabase) ──
  const localUser = findByEmail(email)
  if (localUser) {
    const updatedPlanIds = localUser.planIds.includes(planId)
      ? localUser.planIds
      : [...localUser.planIds, planId]

    // Save Stripe subscription ID for monthly plans (needed for future cancellation)
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null

    // Clear any previous cancellation record for this plan (re-subscription)
    const updatedCancelledAt = { ...(localUser.planCancelledAt ?? {}) }
    delete updatedCancelledAt[planId]

    upsertUser({
      id: localUser.id,
      email: localUser.email,
      planIds: updatedPlanIds,
      planExpiresAt: expiresAt ? { [planId]: expiresAt } : undefined,
      subscriptionIds: subscriptionId ? { [planId]: subscriptionId } : undefined,
      planCancelledAt: updatedCancelledAt,
    })
  }

  // ── 2. Send registration e-mail (fire-and-forget) ────────
  // Only send if the user hasn't registered yet (no local account found).
  // This acts as a safety net: if the user closes the browser after paying,
  // they receive a link to complete registration via email.
  if (!localUser) {
    setImmediate(() => {
      sendRegistrationLink({
        to: email,
        fullName,
        sessionId: session.id,
        planId,
      }).catch(() => { /* already logged inside sendRegistrationLink */ })
    })
  }

  // ── 3. Update Supabase profile (if configured) ────────────
  if (!hasSupabaseAdminConfig()) {
    return {
      persisted: localUser !== null,
      message: localUser
        ? 'Pagamento confirmado e acesso liberado.'
        : 'Webhook recebido. E-mail de ativação enviado (se SMTP configurado).',
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

/**
 * Called when Stripe fires `customer.subscription.deleted`.
 * Removes the cancelled plan from the user's active plan list.
 */
export async function applyWebhookSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id

  if (!customerId) return { skipped: true, reason: 'No customer ID in subscription event.' }

  // Find user by matching subscriptionId in any stored record
  const { listUsers, upsertUser: updateUser } = await import('./userStore.js')
  const users = listUsers()
  const user = users.find((u) =>
    Object.values(u.subscriptionIds ?? {}).includes(subscription.id)
  )

  if (!user) return { skipped: true, reason: 'No user found with this subscription ID.' }

  // Identify which planId corresponds to this subscription
  const planId = Object.entries(user.subscriptionIds ?? {}).find(
    ([, subId]) => subId === subscription.id
  )?.[0]

  if (!planId) return { skipped: true, reason: 'Could not map subscription to a plan.' }

  // Remove the plan from active plans and clear tracking fields
  const updatedPlanIds = user.planIds.filter((id) => id !== planId)
  const updatedSubscriptionIds = { ...(user.subscriptionIds ?? {}) }
  delete updatedSubscriptionIds[planId]
  const updatedCancelledAt = { ...(user.planCancelledAt ?? {}) }
  delete updatedCancelledAt[planId]
  const updatedPlanExpiresAt = { ...(user.planExpiresAt ?? {}) }
  delete updatedPlanExpiresAt[planId]

  updateUser({
    id: user.id,
    email: user.email,
    planIds: updatedPlanIds,
    subscriptionIds: updatedSubscriptionIds,
    planCancelledAt: updatedCancelledAt,
    planExpiresAt: updatedPlanExpiresAt,
  })

  return { ok: true, userId: user.id, planId, message: `Plano ${planId} removido após cancelamento no Stripe.` }
}

/**
 * Cancels a Stripe subscription at period end.
 * Returns the period end date so the frontend can display it.
 */
export async function cancelSubscriptionAtPeriodEnd(userId: string, planId: string): Promise<{ cancelAt: string }> {
  const { findByEmail, listUsers, upsertUser: updateUser } = await import('./userStore.js')
  const users = listUsers()
  const user = users.find((u) => u.id === userId)

  if (!user) throw new Error('Usuário não encontrado.')

  const subscriptionId = user.subscriptionIds?.[planId]
  if (!subscriptionId) throw new Error('Nenhuma assinatura recorrente encontrada para este plano.')

  const stripe = getStripeClient()
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true })
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)

  // current_period_end moved to items in Stripe API 2025-03-31
  const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end
    ?? subscription.items?.data?.[0]?.current_period_end
    ?? Math.floor(Date.now() / 1000) + 30 * 86400

  const cancelAt = new Date(periodEnd * 1000).toISOString()

  // Record the cancellation date locally so the UI can show it immediately
  updateUser({
    id: user.id,
    email: user.email,
    planCancelledAt: { [planId]: cancelAt },
  })

  return { cancelAt }
}

export function getCatalog() {
  return plans.map((plan) => ({
    ...plan,
    formattedPrice: (plan.priceInCents / 100).toFixed(2).replace('.', ','),
  }))
}
