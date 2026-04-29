// ── Types ──────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface StoredChat {
  id: string
  /** Auto-derived from first user message (truncated to 60 chars). */
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

// ── Constants ──────────────────────────────────────────────

const MAX_CHATS = 50

// ── Key helpers (scoped per user) ─────────────────────────

function chatsKey(userId?: string): string {
  return userId ? `vs_guardiao_chats_${userId}` : 'vs_guardiao_chats'
}

function activeChatKey(userId?: string): string {
  return userId ? `vs_guardiao_active_chat_${userId}` : 'vs_guardiao_active_chat'
}

// ── Helpers ────────────────────────────────────────────────

function deriveTitle(firstUserMessage: string): string {
  const trimmed = firstUserMessage.trim()
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed
}

// ── CRUD ───────────────────────────────────────────────────

export function loadChats(userId?: string): StoredChat[] {
  try {
    const raw = localStorage.getItem(chatsKey(userId))
    if (!raw) return []
    return (JSON.parse(raw) as StoredChat[]).sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function persistChats(chats: StoredChat[], userId?: string): void {
  // Keep only the most recent MAX_CHATS to avoid unbounded growth.
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)
  localStorage.setItem(chatsKey(userId), JSON.stringify(sorted.slice(0, MAX_CHATS)))
}

export function createChat(userId?: string): StoredChat {
  const now = Date.now()
  const chat: StoredChat = {
    id: `chat-${now}`,
    title: 'Nova conversa',
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
  const chats = loadChats(userId)
  persistChats([chat, ...chats], userId)
  return chat
}

export function updateChat(chatId: string, messages: ChatMessage[], userId?: string): void {
  const chats = loadChats(userId)
  const idx = chats.findIndex((c) => c.id === chatId)
  if (idx === -1) return

  const firstUserMsg = messages.find((m) => m.role === 'user')
  chats[idx] = {
    ...chats[idx],
    title: firstUserMsg ? deriveTitle(firstUserMsg.content) : chats[idx].title,
    messages,
    updatedAt: Date.now(),
  }
  persistChats(chats, userId)
}

export function deleteChat(chatId: string, userId?: string): void {
  const chats = loadChats(userId).filter((c) => c.id !== chatId)
  persistChats(chats, userId)
}

/** Removes all chat data for a given user (called on logout). */
export function clearChats(userId?: string): void {
  localStorage.removeItem(chatsKey(userId))
  localStorage.removeItem(activeChatKey(userId))
}

// ── Active chat pointer ─────────────────────────────────────

export function loadActiveChatId(userId?: string): string | null {
  return localStorage.getItem(activeChatKey(userId))
}

export function saveActiveChatId(chatId: string | null, userId?: string): void {
  if (chatId === null) {
    localStorage.removeItem(activeChatKey(userId))
  } else {
    localStorage.setItem(activeChatKey(userId), chatId)
  }
}

// ── Context window ──────────────────────────────────────────

/** Returns the last N messages to send to the API, keeping context bounded. */
export function getContextWindow(messages: ChatMessage[], limit = 10): ChatMessage[] {
  return messages.slice(-limit)
}
