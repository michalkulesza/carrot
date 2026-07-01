import { webClient } from './client'

export type { AuthUser, RegisterData } from '@platekeeper/shared/types'

export const { register, logout, getMe, verifyCode, requestVerifyCode } = webClient

export async function login(email: string, password: string): Promise<void> {
  await webClient.login(email, password)
}
