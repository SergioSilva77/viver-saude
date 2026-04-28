import { useEffect, useRef, useState } from 'react'
import { plans } from '@viver-saude/shared'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { saveSession } from './sessionTypes'
import { devAuthenticate } from './devAuth'
import type { PlanId } from '@viver-saude/shared'

type SubscribeState = 'idle' | 'loading' | 'error'

const GUARDIAO_24H_MS = 24 * 60 * 60 * 1000

// ── Auth error messages ────────────────────────────────────

function translateAuthError(msg: string): string {
  if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials'))
    return 'E-mail ou senha incorretos.'
  if (msg.includes('Email not confirmed'))
    return 'Confirme seu e-mail antes de entrar.'
  if (msg.includes('Too many requests') || msg.includes('rate limit'))
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  if (msg.includes('User not found'))
    return 'Nenhuma conta encontrada com este e-mail.'
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Erro de conexão. Verifique sua internet.'
  return 'Não foi possível entrar. Tente novamente.'
}

// ── Plan display constants ──────────────────────────────────
const planIcons = ['bi-seedling', 'bi-heart-pulse', 'bi-stars']
const planIconClass = ['n1', 'n2', 'n3']

type LoginState = 'idle' | 'loading' | 'error'

interface Props {
  onLogin: (planIds: PlanId[]) => void
  onSubscribe: (planId: PlanId) => Promise<void>
  /** Success banner shown after registration redirect — also hides "Assinar" button */
  successMessage?: string
  /** Email pre-filled after registration redirect */
  prefilledEmail?: string
  /**
   * `true`  → Stripe configured, can subscribe
   * `false` → Stripe NOT configured, disable subscribe and show banner
   * `null`  → still checking
   */
  stripeReady?: boolean | null
}

export function LoginScreen({ onLogin, onSubscribe, successMessage, prefilledEmail, stripeReady = null }: Props) {
  const [loginState, setLoginState] = useState<LoginState>('idle')
  const [email, setEmail] = useState(prefilledEmail ?? '')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const [overlayVisible, setOverlayVisible] = useState(false)
  const [overlayEntered, setOverlayEntered] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  const [subscribeState, setSubscribeState] = useState<SubscribeState>('idle')
  const [subscribeError, setSubscribeError] = useState('')
  const [subscribingPlanId, setSubscribingPlanId] = useState<PlanId | null>(null)

  function openPlans() {
    setOverlayVisible(true)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setOverlayEntered(true))
    })
  }

  function closePlans() {
    setOverlayEntered(false)
    setTimeout(() => setOverlayVisible(false), 380)
  }

  function buildGuardiao24hTimestamp(planIds: PlanId[]): number | null {
    // Only start the 24h window if the user has nivel1 (and not a higher tier that gives full access)
    if (planIds.includes('nivel1') && !planIds.includes('nivel2') && !planIds.includes('nivel3')) {
      return Date.now() + GUARDIAO_24H_MS
    }
    return null
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      setErrorMsg('Preencha e-mail e senha.')
      setLoginState('error')
      return
    }

    setLoginState('loading')
    setErrorMsg('')

    // ── Dev mode ─────────────────────────────────────────────
    if (!isSupabaseConfigured()) {
      const result = await devAuthenticate(email, password)
      if (!result.ok) {
        setErrorMsg(result.error ?? 'Credenciais inválidas.')
        setLoginState('error')
        return
      }
      const resolvedPlanIds = result.planIds ?? []
      saveSession({
        userId: result.userId!,
        email: result.email!,
        planIds: resolvedPlanIds,
        planExpiresAt: result.planExpiresAt,
        guardiao24hUnlockedUntil: buildGuardiao24hTimestamp(resolvedPlanIds),
      })
      onLogin(resolvedPlanIds)
      return
    }

    // ── Production: Supabase ──────────────────────────────────
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || !data.user) {
      setErrorMsg(translateAuthError(error?.message ?? 'Erro desconhecido.'))
      setLoginState('error')
      return
    }

    const planId = (data.user.user_metadata?.plan_id as PlanId | undefined) ?? null
    const resolvedPlanIds: PlanId[] = planId ? [planId] : []
    saveSession({
      userId: data.user.id,
      email: data.user.email ?? email,
      planIds: resolvedPlanIds,
      guardiao24hUnlockedUntil: buildGuardiao24hTimestamp(resolvedPlanIds),
    })
    onLogin(resolvedPlanIds)
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && overlayVisible) closePlans()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [overlayVisible])

  const devMode = !isSupabaseConfigured()

  return (
    <div className="login-screen">
      {devMode && (
        <div className="login-dev-banner">
          <i className="bi bi-cone-striped" />
          Modo desenvolvimento — autenticação local (painel admin)
        </div>
      )}

      {successMessage && (
        <div className="login-success-banner">
          <i className="bi bi-check-circle-fill" />
          {successMessage}
        </div>
      )}

      <div className="login-brand">
        <div className="login-logo">
          <i className="bi bi-heart-pulse-fill" />
        </div>
        <h1 className="login-app-name">Viver &amp; Saúde</h1>
        <p className="login-tagline">Sua jornada de saúde natural começa aqui</p>
      </div>

      <form className="login-form" onSubmit={handleLogin} noValidate>
        <div className="login-field">
          <label className="login-label" htmlFor="login-email">E-mail</label>
          <input
            id="login-email"
            type="email"
            className="login-input"
            placeholder="seu@email.com"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="login-field">
          <label className="login-label" htmlFor="login-password">Senha</label>
          <input
            id="login-password"
            type="password"
            className="login-input"
            placeholder="••••••••"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {loginState === 'error' && (
          <p className="login-error">
            <i className="bi bi-exclamation-circle" /> {errorMsg}
          </p>
        )}

        <button
          type="submit"
          className="btn-login-enter"
          disabled={loginState === 'loading'}
        >
          {loginState === 'loading' ? <span className="login-spinner" /> : 'Entrar'}
        </button>

        <a href="#" className="login-forgot">Esqueci minha senha</a>
      </form>

      <div className="login-divider">
        <span>Novo por aqui?</span>
      </div>

      {/* Hide subscribe button after a payment/registration — user must log in */}
      {!successMessage && (
        <div className="login-subscribe-area">
          <button
            type="button"
            className="btn-login-subscribe"
            onClick={openPlans}
            aria-label="Ver planos e assinar"
          >
            <i className="bi bi-stars" />
            Assinar
          </button>
        </div>
      )}

      {overlayVisible && (
        <div
          ref={overlayRef}
          className={`plans-overlay ${overlayEntered ? 'plans-overlay-entered' : ''}`}
          aria-modal="true"
          role="dialog"
          aria-label="Escolha seu plano"
        >
          <div className="plans-overlay-handle" onClick={closePlans} />

          <div className="plans-overlay-header">
            <div>
              <h2 className="plans-overlay-title">Escolha seu plano</h2>
              <p className="plans-overlay-sub">Comece sua jornada de saúde hoje</p>
            </div>
            <button
              type="button"
              className="plans-overlay-close"
              onClick={closePlans}
              aria-label="Fechar"
            >
              <i className="bi bi-x-lg" />
            </button>
          </div>

          <div className="plans-overlay-body">
            {stripeReady === false && (
              <div className="stripe-unavailable-banner">
                <i className="bi bi-credit-card-2-front" />
                <div>
                  <strong>Pagamentos indisponíveis</strong>
                  <p>O sistema de pagamentos está em manutenção. Tente novamente em alguns minutos.</p>
                </div>
              </div>
            )}
            {subscribeError && (
              <div className="checkout-error-banner" style={{ marginBottom: '1rem' }}>
                <i className="bi bi-exclamation-triangle-fill" />
                {subscribeError}
              </div>
            )}
            <div className="plans-list">
              {plans.map((plan, index) => (
                <div
                  key={plan.id}
                  className={`plan-card ${index === 1 ? 'featured' : ''}`}
                >
                  {index === 1 && (
                    <span className="plan-featured-badge">mais popular</span>
                  )}
                  <div className="plan-card-top">
                    <div className={`plan-icon ${planIconClass[index]}`}>
                      <i className={`bi ${planIcons[index]}`} />
                    </div>
                    <div className="plan-meta">
                      <div className="plan-name">{plan.label}</div>
                      <div className="plan-price">
                        <span className="plan-price-currency">R$</span>
                        <span className="plan-price-value">
                          {(plan.priceInCents / 100).toFixed(2).replace('.', ',')}
                        </span>
                        {plan.billingInterval === 'monthly' && (
                          <span className="plan-price-period">/mês</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ul className="plan-benefits">
                    {plan.benefits.map((benefit) => (
                      <li key={benefit}>
                        <i className="bi bi-check2" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className={`btn-subscribe ${index === 1 ? 'primary' : 'outline'}`}
                    disabled={subscribeState === 'loading' || stripeReady === false}
                    onClick={async () => {
                      setSubscribeError('')
                      setSubscribeState('loading')
                      setSubscribingPlanId(plan.id)
                      let didFail = false
                      try {
                        await onSubscribe(plan.id)
                      } catch (err) {
                        didFail = true
                        const msg = err instanceof Error ? err.message : 'Erro desconhecido ao iniciar o checkout.'
                        setSubscribeError(msg)
                        setSubscribeState('error')
                      } finally {
                        setSubscribingPlanId(null)
                        if (!didFail) setSubscribeState('idle')
                      }
                    }}
                  >
                    {subscribeState === 'loading' && subscribingPlanId === plan.id
                      ? <><span className="btn-spinner" /> Aguarde...</>
                      : <>Assinar {index === 0 ? 'agora' : 'plano'}</>
                    }
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn-already-have-account"
              onClick={closePlans}
            >
              Já tenho uma conta — fazer login
            </button>
          </div>
        </div>
      )}

      {overlayVisible && (
        <div
          className={`plans-backdrop ${overlayEntered ? 'plans-backdrop-entered' : ''}`}
          onClick={closePlans}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
