import { Component } from 'react'

/**
 * Catches unhandled render errors and shows a recoverable fallback UI
 * instead of crashing the entire React tree. Wrap route outlets and
 * isolated UI sections to limit blast radius. See project review
 * Phase 1, item 2.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback({ error: this.state.error, reset: this.handleReset })
      }

      return (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <h2 className="text-lg font-semibold text-zinc-50">Algo salió mal</h2>
          <p className="max-w-md text-sm text-zinc-400">
            Ocurrió un error inesperado. Podés intentar de nuevo o volver al inicio.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
            >
              Intentar de nuevo
            </button>
            <a
              href="/"
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500"
            >
              Ir al inicio
            </a>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mt-4 max-w-lg overflow-auto rounded-xl bg-zinc-900 p-4 text-left text-xs text-rose-400">
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack}
            </pre>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
