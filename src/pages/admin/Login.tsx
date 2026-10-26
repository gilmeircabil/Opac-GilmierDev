import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { KeyRound, UserRound, Eye, EyeOff, ShieldCheck, LibraryBig, Key, CheckCircle2, Database } from 'lucide-react'
import { useAppStore } from '../../stores/app'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import ServerConnectionModal from '../../components/ServerConnectionModal'
import { imageUrl, errorMessage } from '../../lib/utils'
import appLogo from '../../assets/logo.png'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string } }
  const settings = useAppStore((s) => s.settings)
  const user = useAppStore((s) => s.user)

  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'loading' | 'setup' | 'login'>('loading')

  useEffect(() => {
    if (user) {
      navigate('/admin', { replace: true })
    }
  }, [user, navigate])

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Forgot password / Developer recovery states
  const [forgotOpen, setForgotOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [forgotUsername, setForgotUsername] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmNewPass, setConfirmNewPass] = useState('')
  const [forgotBusy, setForgotBusy] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null)
  const [connModalOpen, setConnModalOpen] = useState(false)

  const checkSetupMode = () => {
    void window.api.auth
      .needsSetup()
      .then((needsSetup) => {
        setMode(needsSetup ? 'setup' : 'login')
        setError(null)
      })
      .catch(() => setMode('login'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    checkSetupMode()
  }, [])

  const logo = imageUrl(settings.library_logo) || appLogo

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'setup') {
        if (password.length < 8) {
          setError('Password must be at least 8 characters.')
          return
        }
        if (password !== confirm) {
          setError('Passwords do not match.')
          return
        }
        const user = await window.api.auth.setup({ username, password, full_name: fullName || null })
        useAppStore.getState().setUser(user)
      } else {
        const user = await window.api.auth.login(username, password)
        useAppStore.getState().setUser(user)
      }
      navigate(location.state?.from ?? '/admin', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleRecoverPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotError(null)
    setForgotSuccess(null)
    if (!pin.trim()) {
      setForgotError('Please enter the developer recovery PIN.')
      return
    }
    if (newPass.length < 8) {
      setForgotError('New password must be at least 8 characters.')
      return
    }
    if (newPass !== confirmNewPass) {
      setForgotError('Passwords do not match.')
      return
    }
    setForgotBusy(true)
    try {
      if (typeof window.api?.auth?.recoverPassword !== 'function') {
        throw new Error('Please restart the application to apply the new recovery update.')
      }
      const res = await window.api.auth.recoverPassword({
        pin: pin.trim(),
        newPassword: newPass,
        username: forgotUsername.trim() || undefined
      })
      setForgotSuccess(`Password for "${res.username}" has been reset successfully! You can now sign in with your new password.`)
      setUsername(res.username)
      setPassword(newPass)
      setTimeout(() => {
        setForgotOpen(false)
      }, 1800)
    } catch (err) {
      setForgotError(errorMessage(err))
    } finally {
      setForgotBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <Spinner label="Loading..." />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-6">
      <div className="w-full max-w-sm animate-rise-in">
        <div className="mb-6 flex flex-col items-center text-center">
          {logo ? (
            <img src={logo} alt="Library logo" className="h-20 w-20 rounded-2xl object-cover shadow-lifted ring-1 ring-slate-900/10" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-800 to-primary-950 shadow-glow">
              <LibraryBig className="h-10 w-10 text-white" />
            </div>
          )}
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{settings.library_name}</h1>
          <p className="mt-1 text-sm font-medium text-primary-700">
            {mode === 'setup' ? 'Create the administrator account' : 'Administrator sign in'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-slate-200/80 bg-surface p-7 shadow-lifted"
        >
          {mode === 'setup' && (
            <Input
              label="Full Name"
              name="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Librarian name (optional)"
              autoComplete="name"
            />
          )}
          <Input
            label="Username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            required
            autoComplete="username"
            icon={<UserRound className="h-4 w-4" />}
          />
          <div className="relative">
            <Input
              label="Password"
              name="password"
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'setup' ? 'At least 8 characters' : '••••••••'}
              required
              autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
              icon={<KeyRound className="h-4 w-4" />}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="ring-focus absolute right-3 top-[34px] text-muted hover:text-foreground"
              aria-label={showPass ? 'Hide password' : 'Show password'}
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {mode === 'login' && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => {
                  setForgotOpen(true)
                  setForgotError(null)
                  setForgotSuccess(null)
                  setPin('')
                  setForgotUsername(username || 'admin')
                  setNewPass('')
                  setConfirmNewPass('')
                }}
                className="ring-focus text-xs font-semibold text-primary-700 hover:underline"
              >
                Forgot password?
              </button>
            </div>
          )}
          {mode === 'setup' && (
            <Input
              label="Confirm Password"
              name="confirm"
              type={showPass ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
              required
              autoComplete="new-password"
            />
          )}

          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
              {error}
            </p>
          )}

          <Button type="submit" className="mt-5 w-full" disabled={busy} icon={<ShieldCheck className="h-4 w-4" />}>
            {busy ? 'Please wait…' : mode === 'setup' ? 'Create Account & Continue' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-xs text-muted">
          <Link to="/catalog" className="ring-focus inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
            <LibraryBig className="h-3.5 w-3.5 text-primary-600" /> View public catalog
          </Link>
          <span>·</span>
          <button
            type="button"
            onClick={() => setConnModalOpen(true)}
            className="ring-focus inline-flex items-center gap-1.5 font-medium text-primary-700 hover:underline"
          >
            <Database className="h-3.5 w-3.5" /> MongoDB / Remote Server
          </button>
        </div>

        <ServerConnectionModal
          open={connModalOpen}
          onClose={() => setConnModalOpen(false)}
          isAdmin
          onConnected={checkSetupMode}
        />

        <Modal
          open={forgotOpen}
          onClose={() => setForgotOpen(false)}
          title="Recover Administrator Access"
          maxWidth="md"
        >
          <form onSubmit={handleRecoverPassword} className="space-y-4">
            <div className="rounded-xl border border-primary-100 bg-primary-50/60 p-3.5 text-xs text-primary-800">
              <p className="font-semibold flex items-center gap-1.5">
                <Key className="h-4 w-4 text-primary-600" /> Developer Emergency Recovery
              </p>
              <p className="mt-1 text-muted">
                Enter your configured Developer Recovery PIN to verify authorized access and set a new password.
              </p>
            </div>

            <Input
              label="Developer PIN *"
              name="pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter developer PIN"
              required
              autoFocus
            />

            <Input
              label="Username (optional)"
              name="forgotUsername"
              value={forgotUsername}
              onChange={(e) => setForgotUsername(e.target.value)}
              placeholder="admin (defaults to primary administrator)"
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="New Password *"
                name="newPass"
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="At least 8 characters"
                required
              />
              <Input
                label="Confirm Password *"
                name="confirmNewPass"
                type="password"
                value={confirmNewPass}
                onChange={(e) => setConfirmNewPass(e.target.value)}
                placeholder="Re-enter password"
                required
              />
            </div>

            {forgotError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                {forgotError}
              </p>
            )}

            {forgotSuccess && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                <span>{forgotSuccess}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <Button type="button" variant="outline" onClick={() => setForgotOpen(false)} disabled={forgotBusy}>
                Cancel
              </Button>
              <Button type="submit" loading={forgotBusy} icon={<KeyRound className="h-4 w-4" />}>
                Reset Password
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </div>
  )
}