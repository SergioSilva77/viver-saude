import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import multer from 'multer'
import { z } from 'zod'
import Stripe from 'stripe'
import { existsSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve, extname, basename } from 'node:path'
import {
  getCatalog,
  createCheckoutSession,
  registerPendingUser,
  applyWebhookCheckoutCompleted,
  getStripeClient,
} from './services.js'
import { config, hasStripeConfig, getAiConfig } from './config.js'
import { chat, type ChatMessage, type UserProfile } from './ai.js'
import { recordUsage, getUsageStats, setQuota } from './tokenTracker.js'
import { listUsers, upsertUser, removeUser, findByEmail } from './userStore.js'
import {
  loadManifest,
  removeManifestEntry,
  selectRelevantFiles,
  upsertManifestEntry,
  type KnowledgeEntry,
} from './knowledgeRouter.js'

// ── Paths ──────────────────────────────────────────────────
const AI_CONFIG_PATH = resolve(process.cwd(), '.ai-config.json')
const KNOWLEDGE_DIR = resolve(process.cwd(), 'knowledge')

// ── Zod schemas ────────────────────────────────────────────
const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  fullName: z.string().min(3),
  planId: z.enum(['nivel1', 'nivel2', 'nivel3']),
})

const checkoutSchema = z.object({
  email: z.email(),
  planId: z.enum(['nivel1', 'nivel2', 'nivel3']),
})

const grantSchema = z.object({
  userId: z.uuid(),
  planId: z.enum(['nivel1', 'nivel2', 'nivel3']),
  expiresAt: z.iso.datetime().optional(),
  reason: z.string().min(3),
})

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(50),
  userProfile: z
    .object({
      name: z.string().optional(),
      age: z.number().optional(),
      weightKg: z.number().optional(),
      heightCm: z.number().optional(),
      bloodType: z.string().optional(),
      goals: z.array(z.string()).optional(),
      familyHistory: z.array(z.object({ relation: z.string(), notes: z.string() })).optional(),
    })
    .optional(),
  userId: z.string().optional(),
  userEmail: z.string().optional(),
})

const tokenQuotaSchema = z.object({
  quota: z.number().int().positive().nullable(),
})

const aiSettingsSchema = z.object({
  provider: z.enum(['claude', 'gemini']),
  apiKey: z.string().min(10),
  model: z.string().min(3),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const createUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().default(''),
  planIds: z.array(z.string()).default([]),
  password: z.string().optional(),
})

const knowledgeMetaSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(300).default(''),
  topics: z.array(z.string().min(1).max(50)).max(30).default([]),
})

// ── Multer — only .txt, max 512 KB ────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, KNOWLEDGE_DIR),
    filename: (_req, file, cb) => {
      // Sanitize filename: keep only safe characters
      const safe = basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_')
      cb(null, safe)
    },
  }),
  limits: { fileSize: 512 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (extname(file.originalname).toLowerCase() !== '.txt') {
      cb(new Error('Apenas arquivos .txt são aceitos.'))
      return
    }
    cb(null, true)
  },
})

// ── Helpers ────────────────────────────────────────────────
function requireAdminToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const token = req.headers['x-admin-token']
  if (token !== config.adminApiSecret) {
    res.status(401).json({ message: 'Token de administrador inválido.' })
    return
  }
  next()
}


// ── App ────────────────────────────────────────────────────
const app = express()

// Webhook route must be before express.json()
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (request, response) => {
  if (!hasStripeConfig() || !config.stripeWebhookSecret) {
    response.status(503).json({
      message: 'Configure STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET para processar webhooks.',
    })
    return
  }

  try {
    const event = getStripeClient().webhooks.constructEvent(
      request.body,
      request.headers['stripe-signature'] ?? '',
      config.stripeWebhookSecret,
    )

    if (event.type === 'checkout.session.completed') {
      await applyWebhookCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
    }

    response.json({ received: true })
  } catch (error) {
    response.status(400).json({
      message: error instanceof Error ? error.message : 'Falha ao validar webhook.',
    })
  }
})

app.use(express.json())
app.use(cors({ origin: [config.appUrl, config.adminUrl] }))
app.use(helmet())
app.use(morgan('dev'))

// ── Health ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const aiConfig = getAiConfig()
  res.json({
    status: 'ok',
    service: 'viver-saude-api',
    stripeConfigured: hasStripeConfig(),
    aiConfigured: aiConfig !== null,
    aiProvider: aiConfig?.provider ?? null,
  })
})

// ── Catalog ────────────────────────────────────────────────
app.get('/api/catalog/plans', (_req, res) => {
  res.json({ plans: getCatalog() })
})

// ── Onboarding ─────────────────────────────────────────────
app.post('/api/onboarding/register-intent', async (req, res) => {
  try {
    const payload = registerSchema.parse(req.body)
    const persistence = await registerPendingUser(payload)
    res.status(201).json({
      nextStep: 'checkout',
      user: { email: payload.email, fullName: payload.fullName, planId: payload.planId },
      persistence,
    })
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao registrar intenção de cadastro.' })
  }
})

// ── Billing ────────────────────────────────────────────────
app.post('/api/billing/checkout-session', async (req, res) => {
  try {
    const payload = checkoutSchema.parse(req.body)
    const session = await createCheckoutSession(payload.planId, payload.email)
    res.status(201).json({ sessionId: session.id, url: session.url })
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao criar sessão de checkout.' })
  }
})

// ── Admin grants ───────────────────────────────────────────
app.post('/api/admin/access-grants', async (req, res) => {
  try {
    const payload = grantSchema.parse(req.body)
    res.status(201).json({
      grant: { ...payload, createdAt: new Date().toISOString(), mode: 'manual-admin-grant' },
      message: 'Endpoint pronto para sincronizar concessões com Supabase e Stripe.',
    })
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao registrar concessão manual.' })
  }
})

// ── AI: save settings ──────────────────────────────────────
app.post('/api/admin/ai-settings', requireAdminToken, (req, res) => {
  try {
    const payload = aiSettingsSchema.parse(req.body)
    writeFileSync(AI_CONFIG_PATH, JSON.stringify(payload, null, 2), 'utf-8')
    res.json({ ok: true, message: 'Configurações de IA salvas no servidor.' })
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao salvar configurações de IA.' })
  }
})

// ── AI: knowledge files ────────────────────────────────────
app.get('/api/admin/knowledge', requireAdminToken, (_req, res) => {
  try {
    if (!existsSync(KNOWLEDGE_DIR)) {
      res.json({ files: [] })
      return
    }
    const manifest = loadManifest()
    const metaByFilename = new Map(manifest.map((e) => [e.filename, e]))

    const files = readdirSync(KNOWLEDGE_DIR)
      .filter((f) => f.endsWith('.txt'))
      .map((filename) => {
        const stat = statSync(resolve(KNOWLEDGE_DIR, filename))
        const meta = metaByFilename.get(filename)
        return {
          filename,
          sizeBytes: stat.size,
          uploadedAt: stat.mtime.toISOString(),
          title: meta?.title ?? '',
          description: meta?.description ?? '',
          topics: meta?.topics ?? [],
        }
      })
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))

    res.json({ files })
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Falha ao listar arquivos.' })
  }
})

app.post('/api/admin/knowledge', requireAdminToken, (req, res, next) => {
  upload.array('files', 20)(req, res, (err) => {
    if (err) {
      res.status(400).json({ message: err.message })
      return
    }
    const uploaded = (req.files as Express.Multer.File[] | undefined) ?? []
    res.status(201).json({
      ok: true,
      uploaded: uploaded.map((f) => ({ filename: f.filename, sizeBytes: f.size })),
    })
  })
})

app.put('/api/admin/knowledge/:filename/meta', requireAdminToken, (req, res) => {
  try {
    const filename = basename(String(req.params.filename))
    if (!filename.endsWith('.txt')) {
      res.status(400).json({ message: 'Somente arquivos .txt são válidos.' })
      return
    }
    if (!existsSync(resolve(KNOWLEDGE_DIR, filename))) {
      res.status(404).json({ message: 'Arquivo não encontrado.' })
      return
    }
    const payload = knowledgeMetaSchema.parse(req.body)
    const entry: KnowledgeEntry = { filename, ...payload }
    upsertManifestEntry(entry)
    res.json({ ok: true, entry })
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao salvar metadados.' })
  }
})

app.delete('/api/admin/knowledge/:filename', requireAdminToken, (req, res) => {
  try {
    const filename = basename(String(req.params.filename))
    if (!filename.endsWith('.txt')) {
      res.status(400).json({ message: 'Somente arquivos .txt podem ser removidos.' })
      return
    }
    const filePath = resolve(KNOWLEDGE_DIR, filename)
    if (!existsSync(filePath)) {
      res.status(404).json({ message: 'Arquivo não encontrado.' })
      return
    }
    unlinkSync(filePath)
    removeManifestEntry(filename)
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Falha ao remover arquivo.' })
  }
})

// ── AI: chat ───────────────────────────────────────────────
app.post('/api/ai/chat', async (req, res) => {
  const aiConfig = getAiConfig()

  if (!aiConfig) {
    res.status(503).json({
      message: 'A IA não está configurada. Configure a chave de API no painel admin.',
    })
    return
  }

  try {
    const payload = chatSchema.parse(req.body)

    // Extract the last user message to route knowledge selection
    const lastUserMessage = [...payload.messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const knowledgeContent = selectRelevantFiles(lastUserMessage)

    const result = await chat(
      payload.messages as ChatMessage[],
      payload.userProfile as UserProfile | undefined,
      knowledgeContent,
      aiConfig,
    )

    // Record token usage asynchronously — never block the response
    setImmediate(() => {
      try {
        recordUsage({
          userId: payload.userId ?? 'anonymous',
          userEmail: payload.userEmail ?? 'anonymous',
          date: new Date().toISOString(),
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          provider: aiConfig.provider,
          model: aiConfig.model,
        })
      } catch {
        // Silently ignore tracking errors — usage data is non-critical
      }
    })

    res.json({ reply: result.reply })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro ao processar mensagem.'
    // Do not leak internal error details to the client
    res.status(500).json({ message: 'Não foi possível obter resposta da IA. Tente novamente.' })
    console.error('[AI Chat Error]', msg)
  }
})

// ── Admin: token usage ─────────────────────────────────────
app.get('/api/admin/token-usage', requireAdminToken, (_req, res) => {
  try {
    const stats = getUsageStats()
    res.json(stats)
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Falha ao obter estatísticas.' })
  }
})

app.put('/api/admin/token-quota', requireAdminToken, (req, res) => {
  try {
    const { quota } = tokenQuotaSchema.parse(req.body)
    setQuota(quota)
    res.json({ ok: true, quota })
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Quota inválida.' })
  }
})

// ── Auth ───────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body)
    const user = findByEmail(email)

    if (!user || user.password !== password) {
      res.status(401).json({ message: 'E-mail ou senha incorretos.' })
      return
    }

    res.json({ ok: true, userId: user.id, email: user.email, planIds: user.planIds })
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Credenciais inválidas.' })
  }
})

// ── Admin: user management ─────────────────────────────────
app.get('/api/admin/users', requireAdminToken, (_req, res) => {
  try {
    const users = listUsers().map(({ password: _pw, ...rest }) => rest)
    res.json({ users })
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Falha ao listar usuários.' })
  }
})

app.post('/api/admin/users', requireAdminToken, (req, res) => {
  try {
    const payload = createUserSchema.parse(req.body)
    const existing = listUsers().find((u) => u.id === payload.id)

    if (!existing && !payload.password) {
      res.status(400).json({ message: 'Senha obrigatória para novos usuários.' })
      return
    }

    const saved = upsertUser(payload)
    const { password: _pw, ...safe } = saved
    res.status(201).json({ ok: true, user: safe })
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao salvar usuário.' })
  }
})

app.delete('/api/admin/users/:id', requireAdminToken, (req, res) => {
  try {
    removeUser(String(req.params.id))
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Falha ao remover usuário.' })
  }
})

// ── Start ──────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`Viver & Saúde API pronta em http://localhost:${config.port}`)
})
