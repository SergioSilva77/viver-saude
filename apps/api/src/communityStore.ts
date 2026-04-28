import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Types ──────────────────────────────────────────────────

export type CommunityPlatform = 'whatsapp' | 'telegram' | 'youtube' | 'discord' | 'other'

export interface CommunityLink {
  id: string
  title: string
  platform: CommunityPlatform
  /** Plan IDs that can see this link. Empty array = visible to all authenticated users. */
  audience: string[]
  href: string
  /** ISO date of creation */
  createdAt: string
}

// ── Storage ────────────────────────────────────────────────

const COMMUNITY_PATH = resolve(process.cwd(), 'community-links.json')

function readLinks(): CommunityLink[] {
  try {
    if (!existsSync(COMMUNITY_PATH)) return []
    return JSON.parse(readFileSync(COMMUNITY_PATH, 'utf-8')) as CommunityLink[]
  } catch {
    return []
  }
}

function writeLinks(links: CommunityLink[]): void {
  writeFileSync(COMMUNITY_PATH, JSON.stringify(links, null, 2), 'utf-8')
}

// ── Public API ─────────────────────────────────────────────

export function listCommunityLinks(): CommunityLink[] {
  return readLinks()
}

export function upsertCommunityLink(data: Omit<CommunityLink, 'createdAt'> & { createdAt?: string }): CommunityLink {
  const links = readLinks()
  const idx = links.findIndex((l) => l.id === data.id)

  const link: CommunityLink = {
    ...data,
    createdAt: data.createdAt ?? (idx !== -1 ? links[idx].createdAt : new Date().toISOString()),
  }

  if (idx !== -1) {
    links[idx] = link
  } else {
    links.push(link)
  }

  writeLinks(links)
  return link
}

export function removeCommunityLink(id: string): void {
  writeLinks(readLinks().filter((l) => l.id !== id))
}
