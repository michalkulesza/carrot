export type PasswordScore = 0 | 1 | 2 | 3 | 4

export const MIN_PASSWORD_LENGTH = 8

export const getPasswordScore = (password: string): PasswordScore => {
  if (!password) return 0
  if (password.length < MIN_PASSWORD_LENGTH) return 1

  const hasMixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password)
  const hasDigit = /\d/.test(password)
  const hasSymbol = /[^A-Za-z0-9]/.test(password)

  return (1 +
    (hasMixedCase ? 1 : 0) +
    (hasDigit ? 1 : 0) +
    (hasSymbol ? 1 : 0)) as PasswordScore
}
