// ── AI provider models ─────────────────────────────────────

export type ClaudeModelId =
  | 'claude-sonnet-4-5'
  | 'claude-opus-4-5'
  | 'claude-haiku-3-5'

export type GeminiModelId =
  | 'gemini-2.0-flash'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-flash'

export type AiProvider = 'claude' | 'gemini'

export interface ClaudeModel {
  id: ClaudeModelId
  label: string
  description: string
  tier: 'fast' | 'balanced' | 'powerful'
}

export interface GeminiModel {
  id: GeminiModelId
  label: string
  description: string
  tier: 'fast' | 'balanced' | 'powerful'
}

// ── Config groups ──────────────────────────────────────────

export interface StripeConfig {
  secretKey: string
  webhookSecret: string
  priceIdNivel1: string
  priceIdNivel2: string
  priceIdNivel3: string
}

export interface ClaudeConfig {
  apiKey: string
  activeModel: ClaudeModelId
}

export interface GeminiConfig {
  apiKey: string
  activeModel: GeminiModelId
}

export interface AiConfig {
  activeProvider: AiProvider
  claude: ClaudeConfig
  gemini: GeminiConfig
}

export type SessionDurationDays = 1 | 7 | 15 | 30 | 60

export interface SessionConfig {
  durationDays: SessionDurationDays
}

export interface AppSettings {
  session: SessionConfig
  stripe: StripeConfig
  ai: AiConfig
}

// ── Static model catalog ───────────────────────────────────

export const CLAUDE_MODELS: ClaudeModel[] = [
  {
    id: 'claude-haiku-3-5',
    label: 'Claude Haiku 3.5',
    description: 'Respostas rápidas e econômicas, ideal para interações simples.',
    tier: 'fast',
  },
  {
    id: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    description: 'Equilíbrio ideal entre velocidade, qualidade e custo.',
    tier: 'balanced',
  },
  {
    id: 'claude-opus-4-5',
    label: 'Claude Opus 4.5',
    description: 'Máxima capacidade de raciocínio para respostas complexas.',
    tier: 'powerful',
  },
]

export const GEMINI_MODELS: GeminiModel[] = [
  {
    id: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    description: 'Baixa latência, excelente para chat em tempo real.',
    tier: 'fast',
  },
  {
    id: 'gemini-1.5-flash',
    label: 'Gemini 1.5 Flash',
    description: 'Custo-benefício otimizado para volume alto de consultas.',
    tier: 'balanced',
  },
  {
    id: 'gemini-1.5-pro',
    label: 'Gemini 1.5 Pro',
    description: 'Modelo premium com janela de contexto de 1 milhão de tokens.',
    tier: 'powerful',
  },
]

export const TIER_ICON: Record<string, string> = {
  fast: 'bi-lightning-charge-fill',
  balanced: 'bi-stars',
  powerful: 'bi-cpu-fill',
}

export const TIER_LABEL: Record<string, string> = {
  fast: 'Rápido',
  balanced: 'Equilibrado',
  powerful: 'Poderoso',
}

// ── localStorage persistence ───────────────────────────────

const STORAGE_KEY = 'vs_admin_settings'

export const SESSION_DURATION_OPTIONS: { value: SessionDurationDays; label: string }[] = [
  { value: 1, label: '1 dia' },
  { value: 7, label: '7 dias' },
  { value: 15, label: '15 dias' },
  { value: 30, label: '30 dias (padrão)' },
  { value: 60, label: '60 dias' },
]

export const DEFAULT_SETTINGS: AppSettings = {
  session: {
    durationDays: 30,
  },
  stripe: {
    secretKey: '',
    webhookSecret: '',
    priceIdNivel1: '',
    priceIdNivel2: '',
    priceIdNivel3: '',
  },
  ai: {
    activeProvider: 'claude',
    claude: {
      apiKey: '',
      activeModel: 'claude-sonnet-4-5',
    },
    gemini: {
      apiKey: '',
      activeModel: 'gemini-2.0-flash',
    },
  },
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
