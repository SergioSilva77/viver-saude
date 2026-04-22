// ── Types ──────────────────────────────────────────────────

export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | ''
export type Gender = 'masculino' | 'feminino' | 'outro' | ''

export interface FamilyEntry {
  id: string
  relation: string
  notes: string
}

export interface HealthProfile {
  name: string
  gender: Gender
  age: number | ''
  weightKg: number | ''
  heightCm: number | ''
  bloodType: BloodType
  goals: string[]
  familyHistory: FamilyEntry[]
}

// ── Defaults ───────────────────────────────────────────────

export const DEFAULT_HEALTH_PROFILE: HealthProfile = {
  name: '',
  gender: '',
  age: '',
  weightKg: '',
  heightCm: '',
  bloodType: '',
  goals: [],
  familyHistory: [],
}

// ── localStorage ───────────────────────────────────────────

const HEALTH_PROFILE_KEY = 'vs_health_profile'

export function loadHealthProfile(): HealthProfile {
  try {
    const raw = localStorage.getItem(HEALTH_PROFILE_KEY)
    if (!raw) return { ...DEFAULT_HEALTH_PROFILE }
    return { ...DEFAULT_HEALTH_PROFILE, ...JSON.parse(raw) } as HealthProfile
  } catch {
    return { ...DEFAULT_HEALTH_PROFILE }
  }
}

export function saveHealthProfile(profile: HealthProfile): void {
  localStorage.setItem(HEALTH_PROFILE_KEY, JSON.stringify(profile))
}
