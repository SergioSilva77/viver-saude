import { useState } from 'react'
import { StripeSettings } from './StripeSettings'
import { loadSettings, saveSettings, type AppSettings } from './settingsTypes'

export function StripeSettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [saved, setSaved] = useState(false)

  function handleSave() {
    saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function handleReset() {
    if (!confirm('Tem certeza? Isso apagará todas as configurações do Stripe.')) return
    const fresh = loadSettings()
    const resetted: AppSettings = {
      ...settings,
      stripe: {
        secretKey: '',
        webhookSecret: '',
        priceIdNivel1: '',
        priceIdNivel2: '',
        priceIdNivel3: '',
      },
    }
    saveSettings(resetted)
    setSettings(fresh)
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <div>
          <h1 className="settings-page-title">Stripe — Pagamentos</h1>
          <p className="settings-page-sub">
            Chaves de API e Price IDs para integração com Stripe.{' '}
            <span className="settings-page-warning">
              <i className="bi bi-exclamation-triangle-fill" /> Não compartilhe esta tela.
            </span>
          </p>
        </div>
      </div>

      <div className="settings-sections">
        <StripeSettings
          config={settings.stripe}
          onChange={(stripe) => setSettings((s) => ({ ...s, stripe }))}
        />
      </div>

      <div className="settings-footer">
        <button type="button" className="btn-settings-reset" onClick={handleReset}>
          <i className="bi bi-trash3" />
          Limpar chaves
        </button>
        <button type="button" className="btn-settings-save" onClick={handleSave}>
          {saved ? (
            <>
              <i className="bi bi-check-lg" />
              Salvo!
            </>
          ) : (
            <>
              <i className="bi bi-floppy2-fill" />
              Salvar configurações
            </>
          )}
        </button>
      </div>
    </div>
  )
}
