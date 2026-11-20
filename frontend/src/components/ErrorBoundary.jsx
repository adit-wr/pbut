import { Component } from 'react'
import { getLang, t } from '../lib/i18n'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unexpected UI error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-screen place-items-center bg-neutral-950 p-6 text-neutral-50">
          <div className="max-w-md border border-neutral-800 p-6">
            <p className="text-[10px] font-bold uppercase leading-none tracking-[0.22em] text-pink-300">
              {t(getLang(), 'error.label')}
            </p>
            <h1 className="mt-3 text-xl font-bold">{t(getLang(), 'error.title')}</h1>
            <p className="mt-2 break-words text-sm text-neutral-400">
              {this.state.error?.message || t(getLang(), 'error.unknown')}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 border border-pink-300 px-4 py-2 text-xs font-bold uppercase leading-none tracking-[0.18em] text-pink-300 transition hover:bg-pink-300 hover:text-neutral-950"
            >
              {t(getLang(), 'error.reload')}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
