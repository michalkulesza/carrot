import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const GOOGLE_CLIENT_ID =
  (import.meta as unknown as { env: Record<string, string> }).env
    .VITE_GOOGLE_CLIENT_ID ?? ''

interface GoogleCredentialResponse {
  credential: string
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: GoogleCredentialResponse) => void
          }) => void
          renderButton: (
            parent: HTMLElement,
            options: Record<string, unknown>
          ) => void
        }
      }
    }
  }
}

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void
  onError: () => void
}

export default function GoogleSignInButton({
  onCredential,
  onError,
}: GoogleSignInButtonProps) {
  const { i18n } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  // Keep latest callbacks in refs so the load-poll/init effects don't need to
  // depend on (and re-run for) new function identities from the parent.
  const onCredentialRef = useRef(onCredential)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onCredentialRef.current = onCredential
    onErrorRef.current = onError
  })

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let cancelled = false
    let attempts = 0
    const poll = () => {
      if (cancelled) return
      if (window.google?.accounts?.id) {
        setReady(true)

        return
      }
      attempts += 1
      if (attempts > 100) {
        onErrorRef.current()

        return
      }
      setTimeout(poll, 100)
    }
    poll()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready || !containerRef.current || !window.google) return
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        if (response.credential) {
          onCredentialRef.current(response.credential)
        } else {
          onErrorRef.current()
        }
      },
    })
    containerRef.current.innerHTML = ''
    window.google.accounts.id.renderButton(containerRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      width: 320,
      locale: i18n.language,
      text: 'continue_with',
    })
  }, [ready, i18n.language])

  if (!GOOGLE_CLIENT_ID) return null

  return <div ref={containerRef} className="flex justify-center" />
}
