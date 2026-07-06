import { webClient } from './client'

export type { AuthUser } from '@platekeeper/shared/types'

export const {
  logout,
  getMe,
  requestSignupCode,
  verifySignupCode,
  completeSignup,
} = webClient

export async function login(email: string, password: string): Promise<void> {
  await webClient.login(email, password)
}

export async function loginWithGoogle(idToken: string): Promise<void> {
  await webClient.googleLogin(idToken)
}
