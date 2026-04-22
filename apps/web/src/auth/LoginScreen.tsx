import { useEffect, useRef, useState } from 'react'
import { plans } from '@viver-saude/shared'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { saveSession } from './sessionTypes'
import { devAuthenticate } from './devAuth'
import type { PlanId } from '@viver-saude/shared'

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
}

export function LoginScreen({ onLogin }: Props) {
  const [loginState, setLoginState] = useState<LoginState>('idle')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const [overlayVisible, setOverlayVisible] = useState(false)
  const [overlayEntered, setOverlayEntered] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

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
                    onClick={() => {
                      const planIds: PlanId[] = [plan.id as PlanId]
                      saveSession({
                        userId: 'new-user',
                        email: 'novo@usuario.com',
                        planIds,
                        guardiao24hUnlockedUntil: plan.id === 'nivel1' ? Date.now() + GUARDIAO_24H_MS : null,
                      })
                      onLogin(planIds)
                    }}
                  >
                    Assinar {index === 0 ? 'agora' : 'plano'}
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
