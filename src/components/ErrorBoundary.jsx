import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, showDetail: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      const { error, showDetail } = this.state
      return (
        <div className="border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-sm font-semibold text-rose-400">Algo salió mal — recargá la página</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 rounded-xl bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-white"
          >
            Recargar
          </button>
          <button
            type="button"
            onClick={() => this.setState((s) => ({ showDetail: !s.showDetail }))}
            className="ml-2 mt-3 text-xs text-zinc-500 hover:text-zinc-300"
          >
            {showDetail ? 'Ocultar detalle' : 'Ver detalle'}
          </button>
          {showDetail && (
            <pre className="mt-3 overflow-auto rounded border border-zinc-800 bg-zinc-900 p-3 text-[11px] text-zinc-400">
              {error?.message ?? String(error)}
            </pre>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
