export interface AuthUser {
  id: string
  email: string
  nickname: string | null
  is_active: boolean
  is_verified: boolean
  is_superuser: boolean
  active_household_id: string | null
}

export interface RegisterData {
  email: string
  password: string
  nickname?: string
}

const ERROR_MESSAGES: Record<string, string> = {
  LOGIN_BAD_CREDENTIALS: 'Invalid email or password.',
  REGISTER_USER_ALREADY_EXISTS: 'An account with this email already exists.',
  REGISTER_INVALID_PASSWORD: 'Password must be at least 3 characters.',
}

function parseError(detail: unknown): string {
  if (typeof detail === 'string') return ERROR_MESSAGES[detail] ?? detail

  return 'Something went wrong.'
}

export async function login(email: string, password: string): Promise<void> {
  const body = new URLSearchParams({ username: email, password })
  const res = await fetch('/api/auth/cookie/login', {
    method: 'POST',
    body,
    credentials: 'include',
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: unknown }
    throw new Error(parseError(data.detail))
  }
}

export async function register(data: RegisterData): Promise<AuthUser> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: unknown }
    throw new Error(parseError(err.detail))
  }

  return res.json() as Promise<AuthUser>
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/cookie/logout', {
    method: 'POST',
    credentials: 'include',
  })
}

export async function getMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/users/me', { credentials: 'include' })
  if (!res.ok) return null

  return res.json() as Promise<AuthUser>
}
