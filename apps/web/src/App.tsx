import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  bottomNavItems,
  getSectionAccessForPlans,
  plans,
  sampleCommunityLinks,
  sampleRecipes,
  sectionRequiredPlan,
  type AppSection,
  type PlanId,
} from '@viver-saude/shared'
import { LoginScreen } from './auth/LoginScreen'
import { MeuGuardiao } from './guardiao/MeuGuardiao'
import { HealthProfileEditor } from './health/HealthProfileEditor'
import { loadHealthProfile, saveHealthProfile, type HealthProfile } from './health/healthProfile'
import { loadSession, clearSession, updateSession } from './auth/sessionTypes'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import './App.css'

const planIcons = ['bi-seedling', 'bi-heart-pulse', 'bi-stars']
const planIconClass = ['n1', 'n2', 'n3']

/* ─────────────────────────────────────────────────────────────
   Countdown helpers
───────────────────────────────────────────────────────────── */
function formatCountdown(ms: number): string {
  if (ms <= 0) return '0h 0min'
  const totalMin = Math.floor(ms / 60000)
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  return `${hours}h ${mins}min`
}

/* ─────────────────────────────────────────────────────────────
   Seção bloqueada
───────────────────────────────────────────────────────────── */
interface LockedSectionProps {
  section: AppSection
  limited?: boolean
  onViewPlans: () => void
  children: ReactNode
}

function LockedSection({ section, limited = false, onViewPlans, children }: LockedSectionProps) {
  const requiredPlan = sectionRequiredPlan[section]
  return (
    <div className="locked-wrapper">
      <div className="locked-blur" aria-hidden="true">{children}</div>
      <div className="locked-overlay">
        <div className="locked-card">
          <div className="locked-lock"><i className="bi bi-lock-fill"></i></div>
          <div className="locked-card-title">
            {limited ? 'Acesso limitado' : 'Conteúdo exclusivo'}
          </div>
          <p className="locked-card-sub">
            {limited
              ? 'Você tem acesso parcial. Assine o Nível 2 para liberar tudo.'
              : `Disponível no ${requiredPlan}. Assine para desbloquear.`}
          </p>
          <button type="button" className="btn-subscribe primary locked-cta" onClick={onViewPlans}>
            Ver planos
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Previews borradas (renderizadas por trás do overlay)
───────────────────────────────────────────────────────────── */
function GuardiaoPreview() {
  return (
    <>
      <h2 className="section-title">MeuGuardião</h2>
      <p className="section-sub">Seu assistente de saúde pessoal</p>
      <div className="section-chat">
        <div className="chat-message ai">Olá! Analisei seu histórico e trouxe orientações personalizadas.</div>
        <div className="chat-message user">Quero melhorar meu sono.</div>
        <div className="chat-message ai">Com base no seu perfil, recomendo evitar cafeína após as 14h.</div>
        <div className="chat-message user">E para reduzir inflamação?</div>
        <div className="chat-message ai">Açafrão e gengibre são aliados potentes.</div>
      </div>
      <div className="chat-input-area">
        <div className="chat-input">Digite sua mensagem...</div>
        <div className="chat-send-btn"><i className="bi bi-send-fill"></i></div>
      </div>
    </>
  )
}

function ReceitasPreview() {
  return (
    <>
      <h2 className="section-title">Receitas</h2>
      <p className="section-sub">Protocolos e e-books naturais</p>
      <div className="cards-list">
        {sampleRecipes.map((recipe) => (
          <div className="content-card" key={recipe.id}>
            <div className="content-card-icon">
              <i className={`bi ${recipe.assetType === 'ebook' ? 'bi-book' : recipe.assetType === 'protocol' ? 'bi-clipboard2-heart' : 'bi-cup-hot'}`}></i>
            </div>
            <div className="content-card-body">
              <div className="content-card-title">{recipe.title}</div>
              <div className="content-card-sub">{recipe.category}</div>
            </div>
            <i className="bi bi-chevron-right content-card-arrow"></i>
          </div>
        ))}
        {['Detox matinal', 'Suco anti-inflamatório', 'Protocolo digestivo'].map((t) => (
          <div className="content-card" key={t}>
            <div className="content-card-icon"><i className="bi bi-cup-hot"></i></div>
            <div className="content-card-body">
              <div className="content-card-title">{t}</div>
              <div className="content-card-sub">Receita natural</div>
            </div>
            <i className="bi bi-chevron-right content-card-arrow"></i>
          </div>
        ))}
      </div>
    </>
  )
}

function ComunidadePreview() {
  return (
    <>
      <h2 className="section-title">Comunidade</h2>
      <p className="section-sub">Grupos exclusivos por plano</p>
      <div className="cards-list">
        {sampleCommunityLinks.map((link) => (
          <div className="content-card" key={link.id}>
            <div className="content-card-icon">
              <i className={`bi ${link.platform === 'whatsapp' ? 'bi-whatsapp' : 'bi-telegram'}`}></i>
            </div>
            <div className="content-card-body">
              <div className="content-card-title">{link.title}</div>
              <div className="content-card-sub">{link.platform}</div>
            </div>
            <i className="bi bi-chevron-right content-card-arrow"></i>
          </div>
        ))}
      </div>
    </>
  )
}

function ContaPreview() {
  return (
    <>
      <div className="profile-avatar"><i className="bi bi-person-fill"></i></div>
      <div className="profile-name">Meu Perfil</div>
      <div className="profile-plan">Sem plano ativo</div>
      <ul className="menu-list">
        {[
          { icon: 'bi-person', label: 'Dados pessoais' },
          { icon: 'bi-heart', label: 'Saúde e histórico familiar' },
          { icon: 'bi-credit-card', label: 'Histórico de pagamentos' },
          { icon: 'bi-arrow-up-circle', label: 'Fazer upgrade de plano' },
        ].map((item) => (
          <li key={item.label}>
            <div className="menu-item">
              <div className="menu-item-icon"><i className={`bi ${item.icon}`}></i></div>
              <span className="menu-item-label">{item.label}</span>
              <i className="bi bi-chevron-right menu-item-chevron"></i>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

/* ─────────────────────────────────────────────────────────────
   Botão de consultor (uso único para Nível 1)
───────────────────────────────────────────────────────────── */
interface ConsultorCardProps {
  used: boolean
  onUse: () => void
}

function ConsultorCard({ used, onUse }: ConsultorCardProps) {
  function handleClick() {
    if (used) return
    const confirmed = confirm(
      'Você tem direito a 1 sessão gratuita de 30 min com nosso consultor.\n\nAo confirmar, este benefício será marcado como utilizado e não poderá ser usado novamente.\n\nDeseja prosseguir?'
    )
    if (!confirmed) return
    onUse()
    window.open('https://wa.me/5500000000000?text=Olá!%20Quero%20agendar%20minha%20sessão%20gratuita.', '_blank')
  }

  return (
    <div className={`consultor-card ${used ? 'consultor-card-used' : 'consultor-card-available'}`}>
      <div className="consultor-card-icon">
        <i className={`bi ${used ? 'bi-check-circle-fill' : 'bi-headset'}`}></i>
      </div>
      <div className="consultor-card-body">
        <div className="consultor-card-title">
          {used ? 'Sessão com consultor utilizada' : '30 min grátis com consultor'}
        </div>
        <div className="consultor-card-sub">
          {used
            ? 'Você já utilizou este benefício exclusivo do Nível 1.'
            : 'Benefício exclusivo do Nível 1 — use uma única vez.'}
        </div>
      </div>
      {!used && (
        <button type="button" className="btn-consultor-cta" onClick={handleClick}>
          Agendar
        </button>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   App principal
───────────────────────────────────────────────────────────── */
type AuthState = 'checking' | 'unauthenticated' | 'authenticated'

function App() {
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [activePlans, setActivePlans] = useState<PlanId[]>([])
  const [activeSection, setActiveSection] = useState<AppSection>('inicio')
  const [sessionUserId, setSessionUserId] = useState<string | undefined>(undefined)
  const [sessionUserEmail, setSessionUserEmail] = useState<string | undefined>(undefined)

  // 24h MeuGuardião unlock state
  const [guardiao24hUntil, setGuardiao24hUntil] = useState<number | null>(null)
  const [guardiao24hRemaining, setGuardiao24hRemaining] = useState<number>(0)

  // Consultant one-time use
  const [consultantUsed, setConsultantUsed] = useState(false)

  // Health profile
  const [healthProfile, setHealthProfile] = useState<HealthProfile>(loadHealthProfile)
  const [showHealthEditor, setShowHealthEditor] = useState(false)

  // Confirm dialog ref (for consultant)
  const consultorConfirmedRef = useRef(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      const session = loadSession()
      if (session) {
        setActivePlans(session.planIds)
        setGuardiao24hUntil(session.guardiao24hUnlockedUntil ?? null)
        setConsultantUsed(session.consultantUsed ?? false)
        setSessionUserId(session.userId)
        setSessionUserEmail(session.email)
        setAuthState('authenticated')
      } else {
        setAuthState('unauthenticated')
      }
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        const planId = (data.session.user.user_metadata?.plan_id as PlanId | undefined) ?? null
        const resolvedPlans: PlanId[] = planId ? [planId] : []
        setActivePlans(resolvedPlans)
        setSessionUserId(data.session.user.id)
        setSessionUserEmail(data.session.user.email ?? undefined)
        const session = loadSession()
        setGuardiao24hUntil(session?.guardiao24hUnlockedUntil ?? null)
        setConsultantUsed(session?.consultantUsed ?? false)
        setAuthState('authenticated')
      } else {
        clearSession()
        setAuthState('unauthenticated')
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const planId = (session.user.user_metadata?.plan_id as PlanId | undefined) ?? null
        setActivePlans(planId ? [planId] : [])
        setAuthState('authenticated')
      } else {
        clearSession()
        setAuthState('unauthenticated')
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Countdown ticker for 24h MeuGuardião unlock
  useEffect(() => {
    if (!guardiao24hUntil) return
    function tick() {
      const remaining = (guardiao24hUntil ?? 0) - Date.now()
      setGuardiao24hRemaining(Math.max(0, remaining))
    }
    tick()
    const id = setInterval(tick, 60000) // update every minute
    return () => clearInterval(id)
  }, [guardiao24hUntil])

  function handleConsultorUse() {
    consultorConfirmedRef.current = true
    setConsultantUsed(true)
    updateSession({ consultantUsed: true })
  }

  if (authState === 'checking') {
    return (
      <div className="auth-splash">
        <div className="auth-splash-logo"><i className="bi bi-heart-pulse-fill" /></div>
        <div className="auth-splash-spinner" />
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return (
      <LoginScreen
        onLogin={(planIds) => {
          setActivePlans(planIds)
          const session = loadSession()
          setGuardiao24hUntil(session?.guardiao24hUnlockedUntil ?? null)
          setConsultantUsed(session?.consultantUsed ?? false)
          setAuthState('authenticated')
        }}
      />
    )
  }

  // Resolve if guardiao is in 24h unlock window
  const guardiao24hActive = guardiao24hUntil !== null && guardiao24hUntil > Date.now()

  // Compute access for current section
  function resolveAccess(section: AppSection) {
    // Special case: nivel1 user within 24h window gets full guardiao access
    if (section === 'meuguardiao' && guardiao24hActive) return 'free' as const
    return getSectionAccessForPlans(activePlans, section)
  }

  const access = resolveAccess(activeSection)
  const isLocked = access === 'locked'
  const isLimited = access === 'limited'

  const goToPlans = () => setActiveSection('inicio')

  async function handleLogout() {
    clearSession()
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut()
    } else {
      setAuthState('unauthenticated')
    }
  }

  const isNivel1Only = activePlans.includes('nivel1') && !activePlans.includes('nivel2') && !activePlans.includes('nivel3')
  const planLabel = activePlans.length > 0
    ? activePlans.map((id) => `Nível ${id.replace('nivel', '')}`).join(' + ') + ' ativo'
    : 'Sem plano ativo'

  return (
    <div className="app-shell">
      {/* ── Topo ──────────────────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-logo"><i className="bi bi-heart-pulse-fill"></i></div>
          <span className="topbar-name">Viver &amp; Saúde</span>
        </div>
        <button type="button" className="topbar-bell" aria-label="Notificações">
          <i className="bi bi-bell"></i>
        </button>
      </header>

      {/* ── Conteúdo ──────────────────────────────────────── */}
      <div className="scroll-area">

        {/* INÍCIO */}
        {activeSection === 'inicio' && (
          <>
            <div>
              <h2 className="section-title">Escolha seu plano</h2>
              <p className="section-sub">Comece sua jornada de saúde hoje</p>
            </div>
            <div className="plans-list">
              {plans.map((plan, index) => (
                <div key={plan.id} className={`plan-card ${index === 1 ? 'featured' : ''}`}>
                  {index === 1 && <span className="plan-featured-badge">mais popular</span>}
                  <div className="plan-card-top">
                    <div className={`plan-icon ${planIconClass[index]}`}>
                      <i className={`bi ${planIcons[index]}`}></i>
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
                        <i className="bi bi-check2"></i>
                        {benefit}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className={`btn-subscribe ${index === 1 ? 'primary' : 'outline'}`}
                  >
                    Assinar {index === 0 ? 'agora' : 'plano'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* MEU GUARDIÃO */}
        {activeSection === 'meuguardiao' && (
          isLocked ? (
            <LockedSection section="meuguardiao" onViewPlans={goToPlans}>
              <GuardiaoPreview />
            </LockedSection>
          ) : (
            <>
              {/* Banner de 24h para Nível 1 */}
              {guardiao24hActive && isNivel1Only && (
                <div className="guardiao-24h-banner">
                  <i className="bi bi-clock-history"></i>
                  <div>
                    <strong>Acesso completo por mais {formatCountdown(guardiao24hRemaining)}</strong>
                    <span>Após este período, o acesso ao MeuGuardião ficará limitado. Assine o Nível 2 para acesso permanente.</span>
                  </div>
                </div>
              )}

              {/* Aviso de acesso limitado (após expirar 24h, nivel1 sem upgrade) */}
              {isLimited && !guardiao24hActive && (
                <div className="guardiao-limited-banner">
                  <i className="bi bi-info-circle"></i>
                  <div>
                    <strong>Acesso limitado</strong>
                    <span>Você é do Nível 1. Assine o Nível 2 para acesso completo e permanente ao MeuGuardião.</span>
                  </div>
                  <button type="button" className="btn-upgrade-mini" onClick={goToPlans}>
                    Ver planos
                  </button>
                </div>
              )}

              {/* Botão de consultor — só aparece para nivel1 */}
              {isNivel1Only && (
                <ConsultorCard used={consultantUsed} onUse={handleConsultorUse} />
              )}

              <MeuGuardiao
                userId={sessionUserId}
                userEmail={sessionUserEmail}
                userProfile={{
                  name: healthProfile.name || undefined,
                  age: typeof healthProfile.age === 'number' ? healthProfile.age : undefined,
                  weightKg: typeof healthProfile.weightKg === 'number' ? healthProfile.weightKg : undefined,
                  heightCm: typeof healthProfile.heightCm === 'number' ? healthProfile.heightCm : undefined,
                  bloodType: healthProfile.bloodType || undefined,
                  goals: healthProfile.goals.length > 0 ? healthProfile.goals : undefined,
                  familyHistory: healthProfile.familyHistory.length > 0
                    ? healthProfile.familyHistory.map((e) => ({ relation: e.relation, notes: e.notes }))
                    : undefined,
                }}
                guardiao24hUntil={guardiao24hUntil}
                onViewPlans={goToPlans}
              />
            </>
          )
        )}

        {/* RECEITAS */}
        {activeSection === 'receitas' && (
          isLocked ? (
            <LockedSection section="receitas" onViewPlans={goToPlans}>
              <ReceitasPreview />
            </LockedSection>
          ) : (
            <>
              <div>
                <h2 className="section-title">Receitas</h2>
                <p className="section-sub">Protocolos e e-books naturais</p>
              </div>
              <div className="cards-list">
                {sampleRecipes.map((recipe) => (
                  <button type="button" className="content-card" key={recipe.id}>
                    <div className="content-card-icon">
                      <i className={`bi ${recipe.assetType === 'ebook' ? 'bi-book' : recipe.assetType === 'protocol' ? 'bi-clipboard2-heart' : 'bi-cup-hot'}`}></i>
                    </div>
                    <div className="content-card-body">
                      <div className="content-card-title">{recipe.title}</div>
                      <div className="content-card-sub">{recipe.category}</div>
                    </div>
                    <i className="bi bi-chevron-right content-card-arrow"></i>
                  </button>
                ))}
              </div>
            </>
          )
        )}

        {/* COMUNIDADE */}
        {activeSection === 'comunidade' && (
          isLocked ? (
            <LockedSection section="comunidade" onViewPlans={goToPlans}>
              <ComunidadePreview />
            </LockedSection>
          ) : (
            <>
              <div>
                <h2 className="section-title">Comunidade</h2>
                <p className="section-sub">Grupos exclusivos por plano</p>
              </div>
              <div className="cards-list">
                {sampleCommunityLinks.map((link) => (
                  <button type="button" className="content-card" key={link.id}>
                    <div className="content-card-icon">
                      <i className={`bi ${link.platform === 'whatsapp' ? 'bi-whatsapp' : 'bi-telegram'}`}></i>
                    </div>
                    <div className="content-card-body">
                      <div className="content-card-title">{link.title}</div>
                      <div className="content-card-sub">{link.platform}</div>
                    </div>
                    <i className="bi bi-chevron-right content-card-arrow"></i>
                  </button>
                ))}
              </div>
            </>
          )
        )}

        {/* CONTA */}
        {activeSection === 'conta' && (
          isLocked ? (
            <LockedSection section="conta" onViewPlans={goToPlans}>
              <ContaPreview />
            </LockedSection>
          ) : (
            <>
              <div>
                <div className="profile-avatar"><i className="bi bi-person-fill"></i></div>
                <div className="profile-name">Meu Perfil</div>
                <div className="profile-plan">{planLabel}</div>
              </div>
              <ul className="menu-list">
                {[
                  { icon: 'bi-person', label: 'Dados pessoais', action: () => setShowHealthEditor(true) },
                  { icon: 'bi-heart', label: 'Saúde e histórico familiar', action: () => setShowHealthEditor(true) },
                  { icon: 'bi-credit-card', label: 'Histórico de pagamentos', action: undefined as (() => void) | undefined },
                  { icon: 'bi-arrow-up-circle', label: 'Fazer upgrade de plano', action: goToPlans },
                  { icon: 'bi-x-circle', label: 'Cancelar assinatura', action: undefined },
                  { icon: 'bi-box-arrow-right', label: 'Sair', action: handleLogout },
                ].map((item) => (
                  <li key={item.label}>
                    <button type="button" className="menu-item" onClick={item.action}>
                      <div className="menu-item-icon"><i className={`bi ${item.icon}`}></i></div>
                      <span className="menu-item-label">{item.label}</span>
                      <i className="bi bi-chevron-right menu-item-chevron"></i>
                    </button>
                  </li>
                ))}
              </ul>

              {/* Resumo de saúde — mostra dados reais */}
              <div>
                <div className="health-summary-header">
                  <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: 0 }}>
                    Dados de saúde
                  </h3>
                  <button
                    type="button"
                    className="btn-edit-health"
                    onClick={() => setShowHealthEditor(true)}
                  >
                    <i className="bi bi-pencil-fill" />
                    Editar
                  </button>
                </div>

                {healthProfile.age === '' && healthProfile.weightKg === '' && !healthProfile.bloodType ? (
                  <button
                    type="button"
                    className="health-empty-card"
                    onClick={() => setShowHealthEditor(true)}
                  >
                    <i className="bi bi-heart-pulse" />
                    <div>
                      <div className="health-empty-card-title">Perfil de saúde incompleto</div>
                      <div className="health-empty-card-sub">Toque para adicionar suas informações. O MeuGuardião usará esses dados para personalizar as orientações.</div>
                    </div>
                    <i className="bi bi-chevron-right" style={{ color: '#aac8bc', flexShrink: 0 }} />
                  </button>
                ) : (
                  <div className="cards-list" style={{ marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="content-card"
                      onClick={() => setShowHealthEditor(true)}
                    >
                      <div className="content-card-icon"><i className="bi bi-person-vcard"></i></div>
                      <div className="content-card-body">
                        <div className="content-card-title">
                          {[
                            healthProfile.age !== '' ? `${healthProfile.age} anos` : null,
                            healthProfile.weightKg !== '' ? `${healthProfile.weightKg} kg` : null,
                            healthProfile.heightCm !== '' ? `${healthProfile.heightCm} cm` : null,
                          ].filter(Boolean).join(' · ') || 'Medidas não informadas'}
                        </div>
                        <div className="content-card-sub">
                          {[
                            healthProfile.bloodType ? `Tipo ${healthProfile.bloodType}` : null,
                            healthProfile.gender ? healthProfile.gender.charAt(0).toUpperCase() + healthProfile.gender.slice(1) : null,
                          ].filter(Boolean).join(' · ') || 'Tipo sanguíneo não informado'}
                        </div>
                      </div>
                      <i className="bi bi-chevron-right content-card-arrow"></i>
                    </button>

                    {healthProfile.goals.length > 0 && (
                      <button
                        type="button"
                        className="content-card"
                        onClick={() => setShowHealthEditor(true)}
                      >
                        <div className="content-card-icon"><i className="bi bi-bullseye"></i></div>
                        <div className="content-card-body">
                          <div className="content-card-title">Objetivos</div>
                          <div className="content-card-sub">{healthProfile.goals.slice(0, 2).join(', ')}{healthProfile.goals.length > 2 ? ` +${healthProfile.goals.length - 2}` : ''}</div>
                        </div>
                        <i className="bi bi-chevron-right content-card-arrow"></i>
                      </button>
                    )}

                    <button
                      type="button"
                      className="content-card"
                      onClick={() => setShowHealthEditor(true)}
                    >
                      <div className="content-card-icon"><i className="bi bi-people"></i></div>
                      <div className="content-card-body">
                        <div className="content-card-title">Histórico familiar</div>
                        <div className="content-card-sub">
                          {healthProfile.familyHistory.length > 0
                            ? `${healthProfile.familyHistory.length} registro(s)`
                            : 'Nenhum registro adicionado'}
                        </div>
                      </div>
                      <i className="bi bi-chevron-right content-card-arrow"></i>
                    </button>
                  </div>
                )}
              </div>
            </>
          )
        )}
      </div>

      {/* ── Editor de perfil de saúde ─────────────────────── */}
      {showHealthEditor && (
        <HealthProfileEditor
          profile={healthProfile}
          onSave={(updated) => {
            setHealthProfile(updated)
            saveHealthProfile(updated)
            setShowHealthEditor(false)
          }}
          onClose={() => setShowHealthEditor(false)}
        />
      )}

      {/* ── Navegação inferior ────────────────────────────── */}
      <nav className="bottom-nav" aria-label="Navegação principal">
        {bottomNavItems.map((item) => {
          const itemAccess = resolveAccess(item.id)
          const itemLocked = itemAccess === 'locked'
          return (
            <button
              type="button"
              key={item.id}
              aria-label={item.label}
              title={item.label}
              className={`nav-btn ${activeSection === item.id ? 'active' : ''} ${itemLocked ? 'nav-btn-locked' : ''}`}
              onClick={() => setActiveSection(item.id)}
            >
              <i className={`bi ${item.icon}`}></i>
              {itemLocked && <i className="bi bi-lock-fill nav-lock-badge"></i>}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export default App
