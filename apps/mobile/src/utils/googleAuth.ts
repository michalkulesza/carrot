import { GoogleSignin } from '@react-native-google-signin/google-signin'

export const configureGoogleSignin = (): void => {
  GoogleSignin.configure({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  })
}

export const signInWithGoogle = async (): Promise<string> => {
  await GoogleSignin.hasPlayServices()
  const result = await GoogleSignin.signIn()
  const idToken = result.data?.idToken
  if (!idToken) throw new Error('GOOGLE_SIGNIN_NO_TOKEN')
  return idToken
}

// Best-effort: revokes the app's Google OAuth grant so the account can't be
// used to sign back in without fresh consent. No-ops harmlessly if the user
// never signed in with Google, so callers don't need to know their auth method.
export const revokeGoogleSignin = async (): Promise<void> => {
  try {
    await GoogleSignin.revokeAccess()
    await GoogleSignin.signOut()
  } catch {
    /* not signed in with Google, or already revoked — nothing to do */
  }
}
