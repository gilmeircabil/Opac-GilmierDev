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
  ExternalLink,
  ShieldCheck
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
    items: [{ to: '/admin/borrowings', label: 'Borrowings & Returns', icon: Repeat, end: false }]
  },
  {
    label: 'System',
    items: [{ to: '/admin/settings', label: 'Settings', icon: Settings, end: false }]
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
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200/80 bg-white shadow-sm">
        <Link
          to="/"
          className="ring-focus flex items-center gap-3 border-b border-slate-100 bg-gradient-to-br from-indigo-50/50 to-transparent px-5 py-4.5 transition-colors hover:bg-slate-50/80"
        >
          <img
            src={logo}
            alt="Library logo"
            className="h-10 w-10 rounded-xl object-cover shadow-sm ring-1 ring-slate-200/80"
          />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-bold text-slate-900 tracking-tight">{settings.library_name}</span>
            <span className="text-[11px] font-medium text-indigo-700">Admin Console</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4 scrollbar-thin">
          {NAV.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      classNames(
                        'ring-focus relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150',
                        isActive
                          ? 'bg-indigo-50 font-semibold text-indigo-950 shadow-sm ring-1 ring-indigo-200/60'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon className={classNames('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-indigo-600' : 'text-slate-400')} />
                        <span>{label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-1 border-t border-slate-100 p-3 bg-slate-50/50">
          <Link
            to="/catalog"
            className="ring-focus flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-600 hover:bg-white hover:text-slate-900 transition"
          >
            <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            <span>Open public catalog</span>
          </Link>
          {user && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-sm">
              <div className="min-w-0 flex-1 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {user.full_name || user.username}
                  </p>
                  <p className="truncate text-[10px] text-slate-400 font-mono">@{user.username}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="ring-focus rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 transition"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-64 flex-1 min-h-screen p-8 max-w-7xl">
        <Outlet />
      </main>
    </div>
  )
}
