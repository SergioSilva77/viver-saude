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

const CHATS_KEY = 'vs_guardiao_chats'
const ACTIVE_CHAT_KEY = 'vs_guardiao_active_chat'
const MAX_CHATS = 50

// ── Helpers ────────────────────────────────────────────────

function deriveTitle(firstUserMessage: string): string {
  const trimmed = firstUserMessage.trim()
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed
}

// ── CRUD ───────────────────────────────────────────────────

export function loadChats(): StoredChat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY)
    if (!raw) return []
    return (JSON.parse(raw) as StoredChat[]).sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function persistChats(chats: StoredChat[]): void {
  // Keep only the most recent MAX_CHATS to avoid unbounded growth.
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)
  localStorage.setItem(CHATS_KEY, JSON.stringify(sorted.slice(0, MAX_CHATS)))
}

export function createChat(): StoredChat {
  const now = Date.now()
  const chat: StoredChat = {
    id: `chat-${now}`,
    title: 'Nova conversa',
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
  const chats = loadChats()
  persistChats([chat, ...chats])
  return chat
}

export function updateChat(chatId: string, messages: ChatMessage[]): void {
  const chats = loadChats()
  const idx = chats.findIndex((c) => c.id === chatId)
  if (idx === -1) return

  const firstUserMsg = messages.find((m) => m.role === 'user')
  chats[idx] = {
    ...chats[idx],
    title: firstUserMsg ? deriveTitle(firstUserMsg.content) : chats[idx].title,
    messages,
    updatedAt: Date.now(),
  }
  persistChats(chats)
}

export function deleteChat(chatId: string): void {
  const chats = loadChats().filter((c) => c.id !== chatId)
  persistChats(chats)
}

// ── Active chat pointer ─────────────────────────────────────

export function loadActiveChatId(): string | null {
  return localStorage.getItem(ACTIVE_CHAT_KEY)
}

export function saveActiveChatId(chatId: string | null): void {
  if (chatId === null) {
    localStorage.removeItem(ACTIVE_CHAT_KEY)
  } else {
    localStorage.setItem(ACTIVE_CHAT_KEY, chatId)
  }
}

// ── Context window ──────────────────────────────────────────

/** Returns the last N messages to send to the API, keeping context bounded. */
export function getContextWindow(messages: ChatMessage[], limit = 10): ChatMessage[] {
  return messages.slice(-limit)
}
