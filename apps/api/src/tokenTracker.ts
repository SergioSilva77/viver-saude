import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Types ──────────────────────────────────────────────────

export interface TokenRecord {
  userId: string
  userEmail: string
  date: string             // ISO-8601
  inputTokens: number
  outputTokens: number
  provider: string
  model: string
}

export interface UserTokenStats {
  userId: string
  userEmail: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  requestCount: number
  lastUsedAt: string
  /** Breakdown by provider+model for this user. */
  byModel: ModelStats[]
}

export interface ModelStats {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  requestCount: number
  lastUsedAt: string
}

export interface TokenUsageStats {
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  quota: number | null
  remainingTokens: number | null
  requestCount: number
  byUser: UserTokenStats[]
  /** Global breakdown by provider+model. */
  byModel: ModelStats[]
  /** Most recent N records for the activity log. */
  recentRecords: TokenRecord[]
}

interface StorageFile {
  quota: number | null
  records: TokenRecord[]
}

// ── Constants ──────────────────────────────────────────────

const STORAGE_PATH = resolve(process.cwd(), 'token-usage.json')
const MAX_RECORDS = 10_000   // cap to avoid unbounded file growth
const RECENT_RECORDS = 50    // records shown in the activity log

// ── Storage helpers ────────────────────────────────────────

function readStorage(): StorageFile {
  try {
    if (!existsSync(STORAGE_PATH)) return { quota: null, records: [] }
    return JSON.parse(readFileSync(STORAGE_PATH, 'utf-8')) as StorageFile
  } catch {
    return { quota: null, records: [] }
  }
}

function writeStorage(data: StorageFile): void {
  writeFileSync(STORAGE_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

// ── Public API ─────────────────────────────────────────────

/**
 * Appends a token usage record.
 * Automatically evicts oldest records when MAX_RECORDS is exceeded.
 */
export function recordUsage(record: TokenRecord): void {
  const data = readStorage()
  data.records.push(record)

  if (data.records.length > MAX_RECORDS) {
    data.records = data.records.slice(-MAX_RECORDS)
  }

  writeStorage(data)
}

/** Returns the configured token quota (null = unlimited). */
export function getQuota(): number | null {
  return readStorage().quota
}

/** Persists a new quota value (null to remove limit). */
export function setQuota(quota: number | null): void {
  const data = readStorage()
  data.quota = quota
  writeStorage(data)
}

// ── Aggregation helpers ────────────────────────────────────

function modelKey(provider: string, model: string): string {
  return `${provider}::${model}`
}

function upsertModelStats(
  map: Map<string, ModelStats>,
  record: TokenRecord,
): void {
  const key = modelKey(record.provider, record.model)
  const existing = map.get(key)
  const delta = record.inputTokens + record.outputTokens

  if (existing) {
    existing.inputTokens += record.inputTokens
    existing.outputTokens += record.outputTokens
    existing.totalTokens += delta
    existing.requestCount += 1
    if (record.date > existing.lastUsedAt) existing.lastUsedAt = record.date
  } else {
    map.set(key, {
      provider: record.provider,
      model: record.model,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      totalTokens: delta,
      requestCount: 1,
      lastUsedAt: record.date,
    })
  }
}

// ── Public API ─────────────────────────────────────────────

/** Aggregates all records into summary stats. */
export function getUsageStats(): TokenUsageStats {
  const { quota, records } = readStorage()

  let totalInputTokens = 0
  let totalOutputTokens = 0

  // user-level aggregation
  const userMap = new Map<string, { stats: UserTokenStats; modelMap: Map<string, ModelStats> }>()
  // global model aggregation
  const globalModelMap = new Map<string, ModelStats>()

  for (const r of records) {
    totalInputTokens += r.inputTokens
    totalOutputTokens += r.outputTokens

    // Global model breakdown
    upsertModelStats(globalModelMap, r)

    // Per-user aggregation
    const entry = userMap.get(r.userId)
    if (entry) {
      entry.stats.inputTokens += r.inputTokens
      entry.stats.outputTokens += r.outputTokens
      entry.stats.totalTokens += r.inputTokens + r.outputTokens
      entry.stats.requestCount += 1
      if (r.date > entry.stats.lastUsedAt) entry.stats.lastUsedAt = r.date
      upsertModelStats(entry.modelMap, r)
    } else {
      const modelMap = new Map<string, ModelStats>()
      upsertModelStats(modelMap, r)
      userMap.set(r.userId, {
        stats: {
          userId: r.userId,
          userEmail: r.userEmail,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          totalTokens: r.inputTokens + r.outputTokens,
          requestCount: 1,
          lastUsedAt: r.date,
          byModel: [],
        },
        modelMap,
      })
    }
  }

  // Attach per-user model breakdown
  const byUser: UserTokenStats[] = [...userMap.values()]
    .map(({ stats, modelMap }) => ({
      ...stats,
      byModel: [...modelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens),
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens)

  const totalTokens = totalInputTokens + totalOutputTokens

  return {
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    quota,
    remainingTokens: quota !== null ? Math.max(0, quota - totalTokens) : null,
    requestCount: records.length,
    byUser,
    byModel: [...globalModelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens),
    recentRecords: [...records].reverse().slice(0, RECENT_RECORDS),
  }
}
