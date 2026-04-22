import { useEffect, useRef, useState } from 'react'
import { saveAdminSession } from './adminSession'
import { getLockStatus, recordFailure, resetLockout } from './rateLimiter'
import { logger } from '../lib/logger'

// Credentials come exclusively from environment variables — nothing hardcoded.
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD as string | undefined

const configMissing = !ADMIN_EMAIL || !ADMIN_PASSWORD

// Log technical detail to file only — never to the browser console or UI.
if (configMissing) {
  logger.error(
    'Credenciais nao configuradas. Crie apps/admin/.env com VITE_ADMIN_EMAIL e VITE_ADMIN_PASSWORD.',
    'AdminLogin',
  )
}

interface Props {
  onLogin: () => void
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  if (totalSeconds >= 60) {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return s > 0 ? `${m}m ${s}s` : `${m}m`
  }
  return `${totalSeconds}s`
}

export function AdminLogin({ onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [remainingMs, setRemainingMs] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Sync countdown with real remaining time every 250ms
  function startCountdown(initialMs: number) {
    setRemainingMs(initialMs)
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      const status = getLockStatus()
      setRemainingMs(status.remainingMs)
      if (!status.locked) {
        clearInterval(countdownRef.current!)
        countdownRef.current = null
        setErrorMsg('')
      }
    }, 250)
  }

  // Restore lockout state on mount (survives page reload)
  useEffect(() => {
    const status = getLockStatus()
    if (status.locked) {
      setErrorMsg(buildLockMessage(status.remainingMs))
      startCountdown(status.remainingMs)
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  function buildLockMessage(ms: number): string {
    return `Muitas tentativas incorretas. Aguarde ${formatCountdown(ms)} antes de tentar novamente.`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (configMissing) {
      setErrorMsg('Serviço indisponível. Contate o suporte técnico.')
      return
    }

    const status = getLockStatus()
    if (status.locked) {
      setErrorMsg(buildLockMessage(status.remainingMs))
      return
    }

    if (!email || !password) {
      setErrorMsg('Preencha e-mail e senha.')
      return
    }

    setLoading(true)
    setErrorMsg('')

    // Constant-time comparison to prevent timing attacks
    await new Promise((r) => setTimeout(r, 400))

    const emailMatch = email.trim().toLowerCase() === ADMIN_EMAIL!.toLowerCase()
    const passMatch = password === ADMIN_PASSWORD!

    if (!emailMatch || !passMatch) {
      const next = recordFailure()
      logger.warn(
        `Tentativa de login falhou. Tentativas: ${next.attempts}. Bloqueado: ${next.locked}.`,
        'AdminLogin',
      )
      if (next.locked) {
        setErrorMsg(buildLockMessage(next.remainingMs))
        startCountdown(next.remainingMs)
      } else {
        // Generic message — does not reveal attempt count or lockout threshold
        setErrorMsg('E-mail ou senha incorretos.')
      }
      setLoading(false)
      return
    }

    resetLockout()
    saveAdminSession()
    onLogin()
  }

  const isLocked = remainingMs > 0

  return (
    <div className="admin-login-screen">
      <div className="admin-login-card">
        {/* Brand */}
        <div className="admin-login-brand">
          <div className="admin-login-logo">
            <i className="bi bi-heart-pulse-fill" />
          </div>
          <div>
            <h1 className="admin-login-title">Viver &amp; Saúde</h1>
            <p className="admin-login-sub">Painel administrativo</p>
          </div>
        </div>

        {/* Generic unavailability notice — reveals no internal detail */}
        {configMissing && (
          <div className="admin-login-unavailable">
            <i className="bi bi-slash-circle" />
            <span>Serviço temporariamente indisponível.</span>
          </div>
        )}

        {/* Form */}
        <form className="admin-login-form" onSubmit={handleSubmit} noValidate>
          <div className="admin-login-field">
            <label className="admin-login-label" htmlFor="adm-email">E-mail</label>
            <input
              id="adm-email"
              type="email"
              className="admin-login-input"
              placeholder="admin@dominio.com"
              value={email}
              autoComplete="email"
              disabled={isLocked || loading}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="admin-login-field">
            <label className="admin-login-label" htmlFor="adm-password">Senha</label>
            <div className="admin-login-input-wrap">
              <input
                id="adm-password"
                type={showPassword ? 'text' : 'password'}
                className="admin-login-input"
                placeholder="••••••••"
                value={password}
                autoComplete="current-password"
                disabled={isLocked || loading}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="admin-login-eye"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} />
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className={`admin-login-error ${isLocked ? 'admin-login-error-locked' : ''}`}>
              <i className={`bi ${isLocked ? 'bi-clock-history' : 'bi-exclamation-circle'}`} />
              <span>
                {errorMsg}
                {isLocked && <strong className="admin-login-countdown"> {formatCountdown(remainingMs)}</strong>}
              </span>
            </div>
          )}

          <button
            type="submit"
            className="admin-login-btn"
            disabled={isLocked || loading || configMissing}
          >
            {loading ? (
              <span className="admin-login-spinner" />
            ) : isLocked ? (
              <>
                <i className="bi bi-lock-fill" />
                Bloqueado — {formatCountdown(remainingMs)}
              </>
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        <p className="admin-login-footer">
          <i className="bi bi-shield-lock" /> Acesso restrito a administradores autorizados.
        </p>
      </div>
    </div>
  )
}
