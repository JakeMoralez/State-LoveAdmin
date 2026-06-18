import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportClientError } from '../lib/errorReporter'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError({
      message: error.message,
      stack: error.stack,
      source: 'react',
      context: { componentStack: info.componentStack },
    })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-full flex flex-col items-center justify-center gap-3 p-8 text-center animate-fade-in">
          <p className="text-lg font-semibold text-white">Что-то пошло не так</p>
          <p className="text-sm text-white/45 max-w-md">{this.state.error.message}</p>
          <button
            type="button"
            className="btn-primary mt-2"
            onClick={() => {
              this.setState({ error: null })
              window.location.reload()
            }}
          >
            Перезагрузить
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
