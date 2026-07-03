import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import './i18n'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'

Sentry.init({
  dsn: 'https://c99c9d4ee4dcc9a6b30e23963716751d@o4511350064611328.ingest.de.sentry.io/4511571143295056',
  tracesSampleRate: 1.0,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.feedbackIntegration({
      autoInject: true,
      showName: false,
      enableScreenshot: true,
      colorScheme: 'system',
    }),
  ],
})

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'TIMER_NAVIGATE') {
      window.location.href = event.data.url
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
