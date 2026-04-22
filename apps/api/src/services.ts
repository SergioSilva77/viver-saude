import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { getPlan, plans, type PlanId } from '@viver-saude/shared'

import { config, hasStripeConfig, hasSupabaseAdminConfig } from './config.js'

type RegisterIntentInput = {
  email: string
  password: string
  fullName: string
  planId: PlanId
}

export function getStripeClient(): Stripe {
  if (!hasStripeConfig()) {
    throw new Error('As credenciais do Stripe ainda não foram configuradas.')
  }

  return new Stripe(config.stripeSecretKey)
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
  const plan = getPlan(planId)
  const mode = plan.billingInterval === 'monthly' ? 'subscription' : 'payment'
  const configuredPriceId = config.stripePrices[planId]

  return stripe.checkout.sessions.create({
    mode,
    customer_email: customerEmail,
    success_url: `${config.appUrl}/?checkout=success&plan=${planId}`,
    cancel_url: `${config.appUrl}/?checkout=cancelled&plan=${planId}`,
    metadata: {
      planId,
      app: 'viver-saude',
    },
    ...(configuredPriceId
      ? {
          line_items: [
            {
              price: configuredPriceId,
              quantity: 1,
            },
          ],
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
                recurring:
                  plan.billingInterval === 'monthly'
                    ? {
                        interval: 'month',
                      }
                    : undefined,
                unit_amount: plan.priceInCents,
              },
              quantity: 1,
            },
          ],
        }),
  })
}

export async function applyWebhookCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (!hasSupabaseAdminConfig()) {
    return {
      persisted: false,
      message: 'Webhook recebido, mas o Supabase ainda não está configurado.',
    }
  }

  const supabase = getSupabaseAdminClient()
  const email = session.customer_details?.email ?? session.customer_email

  if (!email) {
    throw new Error('Sessão do Stripe sem email associado.')
  }

  const { data: userData, error: userError } = await supabase.auth.admin.listUsers()
  if (userError) {
    throw new Error(userError.message)
  }

  const user = userData.users.find((candidate) => candidate.email === email)
  if (!user) {
    throw new Error('Usuário não localizado para ativação pós-pagamento.')
  }

  const planId = (session.metadata?.planId as PlanId | undefined) ?? 'nivel1'

  const profileResult = await supabase.from('profiles').upsert({
    id: user.id,
    email,
    selected_plan: planId,
    onboarding_status: 'active',
    has_completed_payment: true,
    stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
  })

  if (profileResult.error) {
    throw new Error(profileResult.error.message)
  }

  const paymentResult = await supabase.from('payments').insert({
    user_id: user.id,
    plan_id: planId,
    amount_cents: session.amount_total ?? getPlan(planId).priceInCents,
    currency: session.currency ?? 'brl',
    status: session.payment_status,
    stripe_session_id: session.id,
    stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
  })

  if (paymentResult.error) {
    throw new Error(paymentResult.error.message)
  }

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
