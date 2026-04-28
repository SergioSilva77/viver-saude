import { useState } from 'react'
import { UserList } from './UserList'
import { UserDrawer } from './UserDrawer'
import { CreateUserModal } from './CreateUserModal'
import { AiSettingsPage } from './settings/AiSettingsPage'
import { StripeSettingsPage } from './settings/StripeSettingsPage'
import { TokenUsagePage } from './settings/TokenUsagePage'
import { CommunityPage } from './CommunityPage'
import { RecipesPage } from './RecipesPage'
import { AdminLogin } from './auth/AdminLogin'
import { loadAdminSession, clearAdminSession } from './auth/adminSession'
import { loadUsers, persistUsers, type AdminSection, type AdminUser } from './types'
import './App.css'

const NAV_ITEMS: { id: AdminSection; icon: string; label: string }[] = [
  { id: 'usuarios', icon: 'bi-people-fill', label: 'Usuários' },
  { id: 'comunidade', icon: 'bi-people-fill', label: 'Comunidade' },
  { id: 'receitas', icon: 'bi-journal-medical', label: 'Receitas' },
  { id: 'mensagens', icon: 'bi-chat-dots-fill', label: 'Mensagens' },
  { id: 'concessoes', icon: 'bi-stars', label: 'Concessões' },
  { id: 'config-ia', icon: 'bi-robot', label: 'IA' },
  { id: 'config-stripe', icon: 'bi-credit-card-2-front-fill', label: 'Stripe' },
  { id: 'tokens', icon: 'bi-bar-chart-fill', label: 'Tokens' },
]

function App() {
  const [authed, setAuthed] = useState(() => loadAdminSession() !== null)
  const [activeSection, setActiveSection] = useState<AdminSection>('usuarios')
  const [users, setUsers] = useState<AdminUser[]>(loadUsers)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (!authed) {
    return <AdminLogin onLogin={() => setAuthed(true)} />
  }

  function handleLogout() {
    clearAdminSession()
    setAuthed(false)
  }

  function handleUpdateUser(updated: AdminUser) {
    setUsers((prev) => {
      const next = prev.map((u) => (u.id === updated.id ? updated : u))
      persistUsers(next)
      return next
    })
    setSelectedUser(updated)
  }

  function handleCreateUser(newUser: AdminUser) {
    setUsers((prev) => {
      const next = [newUser, ...prev]
      persistUsers(next)
      return next
    })
    setShowCreateModal(false)
  }

  return (
    <div className="admin-shell">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-logo">
            <i className="bi bi-heart-pulse-fill"></i>
          </div>
          <div>
            <div className="brand-name">Viver & Saúde</div>
            <div className="brand-sub">Painel Admin</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-tile ${activeSection === item.id ? 'nav-tile-active' : ''}`}
              onClick={() => {
                setActiveSection(item.id)
                setSidebarOpen(false)
              }}
            >
              <i className={`bi ${item.icon}`}></i>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="admin-badge">
            <i className="bi bi-shield-lock-fill"></i>
            <span>Acesso administrativo</span>
          </div>
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={handleLogout}
          >
            <i className="bi bi-box-arrow-right"></i>
            Sair
          </button>
        </div>
      </aside>

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Conteúdo principal */}
      <div className="admin-main">
        {/* Topbar mobile */}
        <div className="admin-topbar">
          <button
            type="button"
            className="topbar-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Menu"
          >
            <i className="bi bi-list"></i>
          </button>
          <span className="topbar-title">
            {NAV_ITEMS.find((n) => n.id === activeSection)?.label}
          </span>
          <div style={{ width: 40 }} />
        </div>

        <div className="admin-content">
          {/* ── USUÁRIOS ─────────────────────────────────── */}
          {activeSection === 'usuarios' && (
            <UserList
              users={users}
              onSelect={setSelectedUser}
              onCreateNew={() => setShowCreateModal(true)}
            />
          )}

          {/* ── RECEITAS ─────────────────────────────────── */}
          {activeSection === 'receitas' && (
            <RecipesPage
              adminToken={import.meta.env.VITE_ADMIN_TOKEN ?? 'vs-admin-dev'}
            />
          )}

          {/* ── MENSAGENS ────────────────────────────────── */}
          {activeSection === 'mensagens' && (
            <div className="placeholder-section">
              <div className="placeholder-icon">
                <i className="bi bi-chat-dots-fill"></i>
              </div>
              <h2>Mensagens</h2>
              <p>Envio de mensagens e broadcasts para usuários. Em breve.</p>
            </div>
          )}

          {/* ── CONCESSÕES ───────────────────────────────── */}
          {activeSection === 'concessoes' && (
            <div className="placeholder-section">
              <div className="placeholder-icon">
                <i className="bi bi-stars"></i>
              </div>
              <h2>Concessões e testes</h2>
              <p>Acesso rápido para conceder períodos de teste e demonstrações. Em breve.</p>
            </div>
          )}

          {/* ── IA ───────────────────────────────────────── */}
          {activeSection === 'config-ia' && <AiSettingsPage />}

          {/* ── STRIPE ───────────────────────────────────── */}
          {activeSection === 'config-stripe' && <StripeSettingsPage />}

          {/* ── TOKENS ───────────────────────────────────── */}
          {activeSection === 'tokens' && (
            <TokenUsagePage
              apiUrl=""
              adminToken={import.meta.env.VITE_ADMIN_TOKEN ?? 'vs-admin-dev'}
            />
          )}

          {/* ── COMUNIDADE ───────────────────────────────── */}
          {activeSection === 'comunidade' && (
            <CommunityPage
              adminToken={import.meta.env.VITE_ADMIN_TOKEN ?? 'vs-admin-dev'}
            />
          )}
        </div>
      </div>

      {/* Drawer de usuário */}
      {selectedUser && (
        <UserDrawer
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onUpdate={handleUpdateUser}
        />
      )}

      {/* Modal de criação */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateUser}
        />
      )}
    </div>
  )
}

export default App
