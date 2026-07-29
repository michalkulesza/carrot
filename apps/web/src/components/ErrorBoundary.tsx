import { Component, type ErrorInfo, type ReactNode } from 'react'
import * as Sentry from '@sentry/react'
import i18n from '../i18n'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    })
  }

  handleRetry = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    if (this.props.fallback) {
      return this.props.fallback
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
        <p className="text-lg font-semibold text-zinc-800">
          {i18n.t('common.somethingWentWrong')}
        </p>
        <button
          type="button"
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm"
          onClick={this.handleRetry}
        >
          {i18n.t('common.tryAgain')}
        </button>
      </div>
    )
  }
}

export default ErrorBoundary
