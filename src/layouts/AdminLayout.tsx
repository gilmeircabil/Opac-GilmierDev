import { useEffect } from 'react'
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Tags,
  Building2,
  Repeat,
  Settings,
  LogOut,
  LibraryBig,
  ExternalLink
} from 'lucide-react'
import { useAppStore } from '../stores/app'
import { classNames, imageUrl, errorMessage } from '../lib/utils'
import appLogo from '../assets/logo.png'

const NAV: { label: string; items: { to: string; label: string; icon: React.ElementType; end: boolean }[] }[] = [
  {
    label: 'Overview',
    items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }]
  },
  {
    label: 'Collection',
    items: [
      { to: '/admin/books', label: 'All Books', icon: BookOpen, end: false },
      { to: '/admin/authors', label: 'Authors', icon: Users, end: false },
      { to: '/admin/categories', label: 'Categories', icon: Tags, end: false },
      { to: '/admin/publishers', label: 'Publishers', icon: Building2, end: false }
    ]
  },
  {
    label: 'Circulation',
    items: [{ to: '/admin/borrowings', label: 'Borrowings', icon: Repeat, end: false }]
  },
  {
    label: 'System',
    items: [
      { to: '/admin/settings', label: 'Settings', icon: Settings, end: false }
    ]
  }
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const user = useAppStore((s) => s.user)
  const settings = useAppStore((s) => s.settings)
  const logo = imageUrl(settings.library_logo) || appLogo

  useEffect(() => {
    if (!user) {
      void window.api.auth.session().then((session) => {
        useAppStore.getState().setUser(session)
        if (!session) navigate('/admin/login', { replace: true })
      })
    }
  }, [user, navigate])

  const handleLogout = async () => {
    try {
      await window.api.auth.logout()
    } catch (err) {
      console.error(errorMessage(err))
    }
    useAppStore.getState().setUser(null)
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-app">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-surface dark:border-slate-700/70">
        <Link
          to="/"
          className="ring-focus flex items-center gap-3 border-b border-slate-100 bg-gradient-to-br from-primary-50/70 to-transparent px-5 py-4 dark:border-slate-800 dark:from-primary-900/20"
        >
          {logo ? (
            <img
              src={logo}
              alt="Library logo"
              className="h-10 w-10 rounded-xl object-cover shadow-card ring-1 ring-slate-200 dark:ring-slate-700"
            />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-800 shadow-glow">
              <LibraryBig className="h-5 w-5 text-white" />
            </span>
          )}
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-bold text-foreground">{settings.library_name}</span>
            <span className="text-[11px] font-medium text-primary-600 dark:text-primary-400">Admin Console</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-5 overflow-y-auto p-3 scrollbar-thin">
          {NAV.map((group) => (
            <div key={group.label}>
              <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted/70">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      classNames(
                        'ring-focus relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                        isActive
                          ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-foreground dark:text-slate-300 dark:hover:bg-slate-800'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary-600" />
                        )}
                        <Icon className={classNames('h-4 w-4 shrink-0', isActive ? 'text-primary-600 dark:text-primary-400' : 'opacity-80')} />
                        {label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-1 border-t border-slate-100 p-3">
          <Link
            to="/catalog"
            className="ring-focus flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <ExternalLink className="h-4 w-4" />
            Public catalog
          </Link>
          {user && (
            <div className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-slate-100/80 px-3 py-2 ring-1 ring-slate-200 dark:bg-slate-800/80 dark:ring-slate-700">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">
                  {user.full_name ?? user.username}
                </p>
                <p className="truncate text-[11px] text-muted">@{user.username}</p>
              </div>
              <button
                onClick={handleLogout}
                className="ring-focus shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/40"
                aria-label="Log out"
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="ml-60 flex-1">
        <main className="mx-auto max-w-6xl px-6 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}