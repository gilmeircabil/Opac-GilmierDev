import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Lock, X, BookMarked, RefreshCw, Server, Library } from 'lucide-react'
import { useAppStore } from '../stores/app'
import { imageUrl } from '../lib/utils'
import ServerConnectionModal from '../components/ServerConnectionModal'
import appLogo from '../assets/logo.png'

interface PublicLayoutProps {
  children: ReactNode
  showBack?: boolean
}

export default function PublicLayout({ children, showBack = false }: PublicLayoutProps) {
  const settings = useAppStore((s) => s.settings)
  const mode = useAppStore((s) => s.mode)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const logo = imageUrl(settings.library_logo) || appLogo
  const location = useLocation()
  const isUser = mode === 'user'
  const [refreshing, setRefreshing] = useState(false)
  const [connOpen, setConnOpen] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const updated = await window.api.settings.getAll()
      useAppStore.getState().setSettings(updated)
    } catch {
      // ignore
    }
    triggerRefresh()
    setTimeout(() => setRefreshing(false), 500)
  }

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/catalog" className="ring-focus group flex items-center gap-3">
            <img
              src={logo}
              alt={`${settings.library_name} logo`}
              className="h-10 w-10 rounded-xl object-cover shadow-sm ring-1 ring-slate-200/80 transition-transform group-hover:scale-102"
            />
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-slate-900 tracking-tight">{settings.library_name}</span>
              <span className="flex items-center gap-1 text-[11px] font-medium text-indigo-700">
                <BookMarked className="h-3 w-3" />
                Online Catalog
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            {showBack && (
              <button
                onClick={() => history.back()}
                className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
              >
                <X className="mr-1 h-3.5 w-3.5" /> Back
              </button>
            )}
            {isUser ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConnOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition"
                  title="Configure Library Server URL"
                >
                  <Server className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Server</span>
                </button>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 disabled:opacity-60 transition"
                  title="Refresh catalog data"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-slate-600 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            ) : (
              <Link
                to="/admin/login"
                state={{ from: location.pathname }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-800 transition"
              >
                <Lock className="h-3.5 w-3.5" />
                Admin Console
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <ServerConnectionModal
        open={connOpen}
        onClose={() => setConnOpen(false)}
        isAdmin={false}
        onConnected={() => void handleRefresh()}
      />
      {isUser && (
        <footer className="border-t border-slate-200/80 bg-white">
          <p className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-4 text-center text-xs text-muted sm:px-6">
            <Library className="h-3.5 w-3.5 text-indigo-500" />
            © 2026 GilmierDev · Powered by OPAC Library System
          </p>
        </footer>
      )}
    </div>
  )
}
