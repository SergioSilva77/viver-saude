import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Types ──────────────────────────────────────────────────

export interface Recipe {
  id: string
  title: string
  /** Short subtitle shown in the list */
  description: string
  /** Full markdown content */
  content: string
  /** Plan IDs that can see this recipe. Empty array = all authenticated users. */
  audience: string[]
  createdAt: string
  updatedAt: string
}

export type RecipeMeta = Omit<Recipe, 'content'>

// ── Storage ────────────────────────────────────────────────

const RECIPES_PATH = resolve(process.cwd(), 'recipes.json')

function readRecipes(): Recipe[] {
  try {
    if (!existsSync(RECIPES_PATH)) return []
    return JSON.parse(readFileSync(RECIPES_PATH, 'utf-8')) as Recipe[]
  } catch {
    return []
  }
}

function writeRecipes(recipes: Recipe[]): void {
  writeFileSync(RECIPES_PATH, JSON.stringify(recipes, null, 2), 'utf-8')
}

// ── Public API ─────────────────────────────────────────────

/** Returns full recipe list (admin use). */
export function listRecipes(): Recipe[] {
  return readRecipes()
}

/** Returns only metadata — no content — for the public listing endpoint. */
export function listRecipesMeta(): RecipeMeta[] {
  return readRecipes().map(({ content: _c, ...meta }) => meta)
}

export function getRecipeById(id: string): Recipe | undefined {
  return readRecipes().find((r) => r.id === id)
}

export function upsertRecipe(data: Omit<Recipe, 'createdAt' | 'updatedAt'> & { createdAt?: string }): Recipe {
  const recipes = readRecipes()
  const idx = recipes.findIndex((r) => r.id === data.id)
  const now = new Date().toISOString()

  const recipe: Recipe = {
    ...data,
    createdAt: data.createdAt ?? (idx !== -1 ? recipes[idx].createdAt : now),
    updatedAt: now,
  }

  if (idx !== -1) {
    recipes[idx] = recipe
  } else {
    recipes.push(recipe)
  }

  writeRecipes(recipes)
  return recipe
}

export function removeRecipe(id: string): void {
  writeRecipes(readRecipes().filter((r) => r.id !== id))
}
