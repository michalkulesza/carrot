import GoogleSignInButton from '../../GoogleSignInButton'

interface GoogleSectionProps {
  loading: boolean
  loadingLabel: string
  onCredential: (idToken: string) => void
  onError: () => void
}

const GoogleSection = ({
  loading,
  loadingLabel,
  onCredential,
  onError,
}: GoogleSectionProps) => {
  if (loading) {
    return <p className="text-center text-sm text-ink-muted">{loadingLabel}</p>
  }

  return <GoogleSignInButton onCredential={onCredential} onError={onError} />
}

export default GoogleSection
