import { useEffect, useState } from 'react'
import {
  Server,
  Database,
  CheckCircle2,
  AlertCircle,
  Globe,
  Laptop,
  RotateCcw,
  ShieldAlert,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  Radio
} from 'lucide-react'
import Modal from './ui/Modal'
import Input from './ui/Input'
import Button from './ui/Button'
import { useAppStore } from '../stores/app'
import { errorMessage } from '../lib/utils'
import { DEVELOPER_RECOVERY_PIN } from '@shared/constants'

interface ServerConnectionModalProps {
  open: boolean
  onClose: () => void
  isAdmin?: boolean
  onConnected?: () => void
}

export default function ServerConnectionModal({
  open,
  onClose,
  isAdmin = false,
  onConnected
}: ServerConnectionModalProps) {
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const setConnection = useAppStore((s) => s.setConnection)
  const setSettings = useAppStore((s) => s.setSettings)

  const [tab, setTab] = useState<'server' | 'mongodb'>(isAdmin ? 'mongodb' : 'server')

  // Authorization gate for non-admin callers (e.g. public kiosk / user view)
  const [isAuthorized, setIsAuthorized] = useState(isAdmin)
  const [adminPin, setAdminPin] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [showPin, setShowPin] = useState(false)

  // Remote Server connection state
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState('47821')
  const [remoteTunnelUrl, setRemoteTunnelUrl] = useState('')
  const [discoverBusy, setDiscoverBusy] = useState(false)
  const [serverBusy, setServerBusy] = useState(false)
  const [serverStatus, setServerStatus] = useState<{ ok: boolean; text: string } | null>(null)

  // MongoDB URI state (Admin only)
  const [mongoUri, setMongoUri] = useState('mongodb://127.0.0.1:27017/opac')
  const [mongoDbName, setMongoDbName] = useState('opac')
  const [mongoBusy, setMongoBusy] = useState(false)
  const [mongoStatus, setMongoStatus] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!open) {
      setIsAuthorized(isAdmin)
      setAdminPin('')
      setAuthError(null)
      setShowPin(false)
      return
    }

    setIsAuthorized(isAdmin)
    setAdminPin('')
    setAuthError(null)
    setShowPin(false)
    setServerStatus(null)
    setMongoStatus(null)

    void window.api.connection
      .get()
      .then((c) => {
        if (c && c.host) {
          setHost(c.host)
          setPort(String(c.port || 47821))
          setRemoteTunnelUrl(c.remote_url || '')
        } else {
          setHost('127.0.0.1')
          setPort('47821')
          setRemoteTunnelUrl('')
        }
      })
      .catch(() => undefined)

    if (isAdmin && window.api.database?.getMongoConfig) {
      void window.api.database
        .getMongoConfig()
        .then((cfg) => {
          if (cfg) {
            setMongoUri(cfg.mongoUri || 'mongodb://127.0.0.1:27017/opac')
            setMongoDbName(cfg.mongoDbName || 'opac')
          }
        })
        .catch(() => undefined)
    }
  }, [open, isAdmin])

  const handleAuthorize = async (e: React.FormEvent) => {
    e.preventDefault()
    const secret = adminPin.trim()
    if (!secret) return

    setAuthBusy(true)
    setAuthError(null)

    try {
      // 1. Check developer recovery PIN (always works offline)
      if (secret === DEVELOPER_RECOVERY_PIN) {
        setIsAuthorized(true)
        return
      }

      // 2. Check custom Admin Security PIN via backend
      try {
        const isValidPin = await window.api.auth.verifyPin(secret)
        if (isValidPin) {
          setIsAuthorized(true)
          return
        }
      } catch {
        // Backend might be offline or still pointing to previous IP
      }

      // 3. Check admin password against backend (if online)
      try {
        await window.api.auth.login('admin', secret)
        setIsAuthorized(true)
        return
      } catch {
        // failed online login
      }

      setAuthError('Access denied. Incorrect administrator password or PIN.')
    } catch {
      setAuthError('Access denied. Incorrect administrator password or PIN.')
    } finally {
      setAuthBusy(false)
    }
  }

  const isUrlWithScheme = /^https?:\/\//i.test(host.trim())

  const handleTestServer = async () => {
    setServerBusy(true)
    setServerStatus(null)
    try {
      const parsedPort = isUrlWithScheme && host.trim().startsWith('https://') ? 443 : Number(port) || 47821
      const res = await window.api.connection.test({
        host: host.trim() || '127.0.0.1',
        port: parsedPort
      })
      if (res.ok) {
        setServerStatus({
          ok: true,
          text: `Connected to "${res.library_name || 'OPAC Library'}" (API v${res.api_version || '2.0.0'})`
        })
      } else {
        setServerStatus({
          ok: false,
          text: res.error || 'Could not reach the OPAC server at this address.'
        })
      }
    } catch (err) {
      setServerStatus({ ok: false, text: errorMessage(err) })
    } finally {
      setServerBusy(false)
    }
  }

  const handleAutoDiscover = async () => {
    setDiscoverBusy(true)
    setServerStatus(null)
    try {
      const res = await window.api.connection.discover()
      if (res.found && res.servers.length > 0) {
        const target = res.servers.find((s) => s.host !== '127.0.0.1') || res.servers[0]
        
        // If Cloudflare URL is broadcasted and user previously used trycloudflare, or LAN
        if (target.remote_url && /trycloudflare\.com/i.test(host)) {
          setHost(target.remote_url)
        } else {
          setHost(target.host)
          setPort(String(target.port || 47821))
        }

        if (target.remote_url) {
          setRemoteTunnelUrl(target.remote_url)
        }

        setServerStatus({
          ok: true,
          text: `Found "${target.library_name}" at ${target.host}:${target.port}${target.remote_url ? ` · Tunnel: ${target.remote_url}` : ''}`
        })
      } else {
        setServerStatus({
          ok: false,
          text: 'No active OPAC library server detected on the local network. Make sure the server is turned on.'
        })
      }
    } catch (err) {
      setServerStatus({ ok: false, text: errorMessage(err) })
    } finally {
      setDiscoverBusy(false)
    }
  }

  const handleSaveServer = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerBusy(true)
    setServerStatus(null)
    try {
      const cleanHost = host.trim() || '127.0.0.1'
      const parsedPort = isUrlWithScheme && cleanHost.startsWith('https://') ? 443 : Number(port) || 47821
      const cfg = {
        host: cleanHost,
        port: parsedPort,
        remote_url: remoteTunnelUrl.trim() || undefined
      }
      await window.api.connection.save(cfg)
      if (isAdmin && window.api.connection.setRemoteUrl) {
        await window.api.connection.setRemoteUrl(remoteTunnelUrl.trim() || null)
      }
      setConnection(cfg)

      try {
        const freshSettings = await window.api.settings.getAll()
        setSettings(freshSettings)
      } catch {
        // ignore if server not yet responding
      }

      triggerRefresh()
      setServerStatus({ ok: true, text: 'Server connection saved!' })
      onConnected?.()
      setTimeout(() => onClose(), 800)
    } catch (err) {
      setServerStatus({ ok: false, text: errorMessage(err) })
    } finally {
      setServerBusy(false)
    }
  }

  const handleResetServer = async () => {
    setServerBusy(true)
    setServerStatus(null)
    try {
      await window.api.connection.reset()
      setHost('127.0.0.1')
      setPort('47821')
      setConnection({ host: '127.0.0.1', port: 47821 })
      triggerRefresh()
      setServerStatus({ ok: true, text: 'Reset to local computer server (127.0.0.1:47821).' })
      onConnected?.()
    } catch (err) {
      setServerStatus({ ok: false, text: errorMessage(err) })
    } finally {
      setServerBusy(false)
    }
  }

  const handleTestMongo = async () => {
    setMongoBusy(true)
    setMongoStatus(null)
    try {
      const res = await window.api.database.testMongoUri({
        mongoUri: mongoUri.trim(),
        mongoDbName: mongoDbName.trim() || 'opac'
      })
      if (res.ok) {
        setMongoStatus({ ok: true, text: 'MongoDB connection verified successfully!' })
      } else {
        setMongoStatus({ ok: false, text: res.error || 'Could not connect to MongoDB.' })
      }
    } catch (err) {
      setMongoStatus({ ok: false, text: errorMessage(err) })
    } finally {
      setMongoBusy(false)
    }
  }

  const handleSaveMongo = async (e: React.FormEvent) => {
    e.preventDefault()
    setMongoBusy(true)
    setMongoStatus(null)
    try {
      const input = {
        mongoUri: mongoUri.trim(),
        mongoDbName: mongoDbName.trim() || 'opac'
      }
      await window.api.database.setMongoConfig(input)
      setMongoStatus({ ok: true, text: 'MongoDB configuration saved and reconnecting...' })
      triggerRefresh()
      onConnected?.()
      setTimeout(() => onClose(), 800)
    } catch (err) {
      setMongoStatus({ ok: false, text: errorMessage(err) })
    } finally {
      setMongoBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        !isAuthorized
          ? 'Administrator Authorization'
          : isAdmin
          ? 'Database & Remote Server Connection'
          : 'Connect to Library Server'
      }
      maxWidth="md"
    >
      {!isAuthorized ? (
        <form onSubmit={handleAuthorize} className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-950">
                Restricted to Administrators
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
                Changing server connection settings can disconnect or disrupt the public catalog. Please enter the administrator password or recovery PIN to continue.
              </p>
            </div>
          </div>

          <div className="relative">
            <Input
              label="Admin Password or Developer Recovery PIN *"
              name="adminAuthSecret"
              type={showPin ? 'text' : 'password'}
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              placeholder="••••••••••••"
              required
              autoFocus
              icon={<KeyRound className="h-4 w-4" />}
            />
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              className="ring-focus absolute right-3 top-[34px] text-muted hover:text-foreground"
              aria-label={showPin ? 'Hide password' : 'Show password'}
            >
              {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {authError && (
            <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-600">
              {authError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={authBusy}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={authBusy}
              icon={<Lock className="h-4 w-4" />}
            >
              Unlock Server Settings
            </Button>
          </div>
        </form>
      ) : (
        <>
          {isAdmin && (
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setTab('mongodb')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
                  tab === 'mongodb'
                    ? 'bg-white text-primary-900 shadow-sm'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                <Database className="h-3.5 w-3.5" />
                MongoDB Database
              </button>
              <button
                type="button"
                onClick={() => setTab('server')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
                  tab === 'server'
                    ? 'bg-white text-primary-900 shadow-sm'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                Remote OPAC Server
              </button>
            </div>
          )}

          {tab === 'mongodb' && isAdmin ? (
            <form onSubmit={handleSaveMongo} className="space-y-4">
              <div className="rounded-xl border border-primary-100 bg-primary-50/60 p-3.5 text-xs text-primary-900">
                <p className="flex items-center gap-1.5 font-semibold">
                  <Database className="h-4 w-4 text-primary-600" /> Local MongoDB or MongoDB Atlas ($0 Free)
                </p>
                <p className="mt-1 text-muted">
                  Use <code className="font-mono text-[11px]">mongodb://127.0.0.1:27017/opac</code> for a local MongoDB on this PC, or paste a <code className="font-mono text-[11px]">mongodb+srv://...</code> URI to work from anywhere via MongoDB Atlas.
                </p>
              </div>

              <Input
                label="MongoDB Connection URI *"
                name="mongoUri"
                value={mongoUri}
                onChange={(e) => setMongoUri(e.target.value)}
                placeholder="mongodb://127.0.0.1:27017/opac or mongodb+srv://..."
                required
              />

              <Input
                label="Database Name"
                name="mongoDbName"
                value={mongoDbName}
                onChange={(e) => setMongoDbName(e.target.value)}
                placeholder="opac"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMongoUri('mongodb://127.0.0.1:27017/opac')
                    setMongoDbName('opac')
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-slate-100"
                >
                  <Laptop className="h-3 w-3" /> Use Local PC (127.0.0.1:27017)
                </button>
              </div>

              {mongoStatus && (
                <div
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
                    mongoStatus.ok
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-600'
                  }`}
                >
                  {mongoStatus.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  )}
                  <span>{mongoStatus.text}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <Button type="button" variant="outline" size="sm" onClick={handleTestMongo} loading={mongoBusy}>
                  Test MongoDB
                </Button>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={mongoBusy}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={mongoBusy} icon={<Database className="h-4 w-4" />}>
                    Save & Connect
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSaveServer} className="space-y-4">
              <div className="rounded-xl border border-primary-100 bg-primary-50/60 p-3.5 text-xs text-primary-900">
                <p className="flex items-center gap-1.5 font-semibold">
                  <Server className="h-4 w-4 text-primary-600" /> Connect from Anywhere (Home PC, LAN, or Tunnel)
                </p>
                <p className="mt-1 text-muted">
                  Enter your Home PC’s Cloudflare Tunnel URL (<code className="font-mono text-[11px]">https://...trycloudflare.com</code>), Tailscale IP (<code className="font-mono text-[11px]">100.x.y.z</code>), or LAN IP (<code className="font-mono text-[11px]">192.168.x.x</code>).
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-semibold text-foreground">Server Host / Tunnel URL *</span>
                <button
                  type="button"
                  onClick={handleAutoDiscover}
                  disabled={discoverBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100/80 active:scale-95 transition disabled:opacity-60"
                  title="Scan local network for active OPAC servers"
                >
                  <Radio className={`h-3 w-3 ${discoverBusy ? 'animate-pulse text-indigo-500' : 'text-indigo-600'}`} />
                  <span>{discoverBusy ? 'Scanning Network...' : 'Auto-Detect Server'}</span>
                </button>
              </div>

              <Input
                name="host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="127.0.0.1, 192.168.1.50, or https://your-tunnel.trycloudflare.com"
                required
              />

              {isAdmin && (
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <Globe className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Cloudflare Tunnel URL (Broadcast to All User Clients)</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Paste your active Cloudflare Tunnel URL here. The server will broadcast this to all user clients so they automatically reconnect when the tunnel restarts!
                  </p>
                  <Input
                    name="remoteTunnelUrl"
                    value={remoteTunnelUrl}
                    onChange={(e) => setRemoteTunnelUrl(e.target.value)}
                    placeholder="https://...trycloudflare.com"
                  />
                </div>
              )}

              {!isUrlWithScheme && (
                <Input
                  label="Server Port"
                  name="port"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="47821"
                  required
                />
              )}

              {serverStatus && (
                <div
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
                    serverStatus.ok
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-600'
                  }`}
                >
                  {serverStatus.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  )}
                  <span>{serverStatus.text}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleTestServer} loading={serverBusy}>
                    Test Server
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResetServer}
                    disabled={serverBusy}
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                  >
                    Local Default
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={serverBusy}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={serverBusy} icon={<Server className="h-4 w-4" />}>
                    Save Server
                  </Button>
                </div>
              </div>
            </form>
          )}
        </>
      )}
    </Modal>
  )
}
