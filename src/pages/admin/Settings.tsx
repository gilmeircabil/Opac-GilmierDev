import { useEffect, useState } from 'react'
import {
  Settings as SettingsIcon,
  Save,
  Upload,
  Trash2,
  DatabaseBackup,
  Download,
  FolderOpen,
  RefreshCcw,
  KeyRound,
  ImageIcon,
  Sparkles,
  Code2,
  Wand2,
  Database,
  Globe
} from 'lucide-react'
import { useAppStore } from '../../stores/app'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import GitHubConfirmModal from '../../components/ui/GitHubConfirmModal'
import Spinner from '../../components/ui/Spinner'
import ServerConnectionModal from '../../components/ServerConnectionModal'
import type { BackupFile, DatabaseStatus, ServerStatus } from '@shared/types'
import { errorMessage, formatDate, formatFileSize, imageUrl } from '../../lib/utils'
import appLogo from '../../assets/logo.png'

export default function SettingsPage() {
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const paths = useAppStore((s) => s.paths)
  const user = useAppStore((s) => s.user)

  const [libraryName, setLibraryName] = useState(settings.library_name)
  const [address, setAddress] = useState(settings.library_address)
  const [contact, setContact] = useState(settings.contact_info)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [backups, setBackups] = useState<BackupFile[]>([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<BackupFile | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [deleteDataOpen, setDeleteDataOpen] = useState(false)

  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null)
  const [netStatus, setNetStatus] = useState<ServerStatus | null>(null)
  const [connModalOpen, setConnModalOpen] = useState(false)

  const loadSystemStatus = async () => {
    try {
      const [db, net] = await Promise.all([
        window.api.database.status().catch(() => null),
        window.api.network.status().catch(() => null)
      ])
      if (db) setDbStatus(db)
      if (net) setNetStatus(net)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadBackups()
    void loadSystemStatus()
  }, [])

  const loadBackups = async () => {
    setLoadingBackups(true)
    try {
      setBackups(await window.api.backup.list())
    } catch (err) {
      setMsg(errorMessage(err))
    } finally {
      setLoadingBackups(false)
    }
  }

  const saveLibraryInfo = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await window.api.settings.set('library_name', libraryName.trim() || 'OPAC Library')
      await window.api.settings.set('library_address', address.trim())
      await window.api.settings.set('contact_info', contact.trim())
      const fresh = await window.api.settings.getAll()
      setSettings(fresh)
      setMsg('Library information saved.')
    } catch (err) {
      setMsg(`Error: ${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const pickLogo = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await window.api.images.pickLogo()
      if (res.filename) {
        await window.api.settings.set('library_logo', res.filename)
        const fresh = await window.api.settings.getAll()
        setSettings(fresh)
      } else if (res.error) {
        setMsg(`Error: ${res.error}`)
      }
    } catch (err) {
      setMsg(`Error: ${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const removeLogo = async () => {
    setBusy(true)
    setMsg(null)
    try {
      if (settings.library_logo) {
        try {
          await window.api.images.delete(settings.library_logo)
        } catch {
          // ignore cleanup errors
        }
      }
      await window.api.settings.set('library_logo', null)
      const fresh = await window.api.settings.getAll()
      setSettings(fresh)
    } catch (err) {
      setMsg(`Error: ${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }


  const createBackup = async () => {
    setCreatingBackup(true)
    setMsg(null)
    try {
      const file = await window.api.backup.create()
      setMsg(`Backup created: ${file.filename}`)
      await loadBackups()
    } catch (err) {
      setMsg(`Error: ${errorMessage(err)}`)
    } finally {
      setCreatingBackup(false)
    }
  }

  const pickAndRestore = async () => {
    setMsg(null)
    try {
      const res = await window.api.backup.pickAndRestore()
      if (res.error) {
        setMsg(`Restore error: ${res.error}`)
      } else {
        setMsg('Backup restored successfully. You can keep using the app.')
      }
      await loadBackups()
    } catch (err) {
      setMsg(`Restore error: ${errorMessage(err)}`)
    }
  }

  const handleClearCatalog = async () => {
    try {
      if (typeof window.api?.database?.clearCatalog !== 'function') {
        throw new Error('Please restart the application to apply the catalog clearing update.')
      }
      await window.api.database.clearCatalog()
      setMsg('All library catalog data (books, copies, authors, categories, publishers, borrowings) has been permanently deleted.')
    } catch (err) {
      setMsg(`Error deleting data: ${errorMessage(err)}`)
    }
  }

  const handleRestore = async () => {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      await window.api.backup.restore(restoreTarget.filename)
      setRestoreTarget(null)
      setMsg('Backup restored successfully. You can keep using the app.')
      await loadBackups()
    } catch (err) {
      setMsg(`Restore error: ${errorMessage(err)}`)
    } finally {
      setRestoring(false)
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwMsg(null)
    if (pwNew.length < 8) {
      setPwMsg({ type: 'error', text: 'New password must be at least 8 characters.' })
      return
    }
    if (pwNew !== pwConfirm) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' })
      return
    }
    setPwBusy(true)
    try {
      await window.api.auth.changePassword({ currentPassword: pwCurrent, newPassword: pwNew })
      setPwCurrent('')
      setPwNew('')
      setPwConfirm('')
      setPwMsg({ type: 'ok', text: 'Password changed successfully.' })
    } catch (err) {
      setPwMsg({ type: 'error', text: errorMessage(err) })
    } finally {
      setPwBusy(false)
    }
  }

  const logo = imageUrl(settings.library_logo) || appLogo

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <SettingsIcon className="h-6 w-6 text-primary-500" /> Settings
        </h1>
        <p className="text-sm text-muted">Manage your library, appearance, data and account.</p>
      </div>

      {msg && (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {msg}
        </p>
      )}

      {/* MongoDB & Remote Access */}
      <section className="rounded-xl border border-slate-200 bg-surface p-6 shadow-card dark:border-slate-700">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Database className="h-4 w-4 text-primary-500" /> MongoDB & Remote Access (Work from Anywhere)
            </h2>
            <p className="mt-1 text-sm text-muted">
              Connect to a local MongoDB on your PC, MongoDB Atlas free cloud, or a remote OPAC server via tunnel.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setConnModalOpen(true)}
            icon={<Globe className="h-4 w-4" />}
          >
            Configure Connection…
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Database Engine</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {dbStatus?.version || 'MongoDB'}
            </p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
              {dbStatus?.mongoUriMasked || 'mongodb://127.0.0.1:27017/opac'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">API Server Port</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              Port {netStatus?.apiPort || 47821} ({netStatus?.running ? 'Online' : 'Standby'})
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              Host: {netStatus?.host || '127.0.0.1'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">LAN / Local Access</p>
            <p className="mt-1 truncate font-mono text-xs font-semibold text-foreground">
              {netStatus?.lanAddresses?.length
                ? netStatus.lanAddresses.map((ip) => `${ip}:${netStatus.apiPort}`).join(', ')
                : `127.0.0.1:${netStatus?.apiPort || 47821}`}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              Expose via Cloudflare Tunnel or Tailscale for $0 internet access
            </p>
          </div>
        </div>
      </section>

      <ServerConnectionModal
        open={connModalOpen}
        onClose={() => setConnModalOpen(false)}
        isAdmin
        onConnected={() => void loadSystemStatus()}
      />

      {/* Library info */}
      <section className="rounded-xl border border-slate-200 bg-surface p-6 shadow-card dark:border-slate-700">
        <h2 className="mb-4 text-base font-semibold text-foreground">Library Information</h2>
        <div className="mb-5 flex items-start gap-4">
          {logo ? (
            <img src={logo} alt="Library logo" className="h-20 w-20 rounded-xl object-cover shadow-card" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-slate-300 text-muted dark:border-slate-600">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}
          <div className="flex flex-col gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={pickLogo} loading={busy} icon={<Upload className="h-4 w-4" />}>
              Upload logo
            </Button>
            {settings.library_logo && (
              <Button type="button" variant="ghost" size="sm" onClick={removeLogo} icon={<Trash2 className="h-4 w-4" />}>
                Reset to default logo
              </Button>
            )}
            <p className="max-w-xs text-xs text-muted">Shown on start screens, window header and public catalog. JPG, PNG or WEBP up to 12 MB.</p>
          </div>
        </div>
        <form onSubmit={saveLibraryInfo} className="space-y-4">
          <Input
            label="Library Name"
            name="library_name"
            value={libraryName}
            onChange={(e) => setLibraryName(e.target.value)}
            required
          />
          <Input
            label="Address"
            name="library_address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <Textarea
            label="Contact Information"
            name="contact_info"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            rows={2}
            placeholder="Phone, email, opening hours…"
          />
          <div className="flex justify-end">
            <Button type="submit" loading={busy} icon={<Save className="h-4 w-4" />}>Save Information</Button>
          </div>
        </form>
      </section>


      {/* Backup */}
      <section className="rounded-xl border border-slate-200 bg-surface p-6 shadow-card dark:border-slate-700">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-foreground">
          <DatabaseBackup className="h-4 w-4 text-primary-500" /> Backup & Restore
        </h2>
        <p className="mb-4 text-sm text-muted">
          Your data is stored locally at: <span className="font-mono text-xs">{paths?.dbPath ?? '…'}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={createBackup} loading={creatingBackup} icon={<Download className="h-4 w-4" />}>
            {creatingBackup ? 'Creating…' : 'Create Backup'}
          </Button>
          <Button variant="outline" onClick={pickAndRestore} icon={<RefreshCcw className="h-4 w-4" />}>
            Restore from File…
          </Button>
          {paths?.backupsDir && (
            <Button variant="secondary" onClick={() => void window.api.openPath(paths.backupsDir)} icon={<FolderOpen className="h-4 w-4" />}>
              Open Backups Folder
            </Button>
          )}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Saved Backups</h3>
            {paths?.dataDir && (
              <Button variant="ghost" size="sm" onClick={() => void window.api.openPath(paths.dataDir)} icon={<FolderOpen className="h-3.5 w-3.5" />}>
                Data folder
              </Button>
            )}
          </div>
          {loadingBackups ? (
            <Spinner label="Loading backups…" />
          ) : backups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-muted dark:border-slate-600">
              No backups yet. Create one to keep your catalog safe.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              {backups.map((b) => (
                <li key={b.filename} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-medium text-foreground">{b.filename}</p>
                    <p className="text-xs text-muted">
                      {formatDate(b.createdAt)} · {formatFileSize(b.size)}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setRestoreTarget(b)} disabled={restoring}>
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Account */}
      {user && (
        <section className="rounded-xl border border-slate-200 bg-surface p-6 shadow-card dark:border-slate-700">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
            <KeyRound className="h-4 w-4 text-primary-500" /> Change Password
          </h2>
          {pwMsg && (
            <p className={`mb-4 rounded-lg px-3 py-2 text-sm font-medium ${pwMsg.type === 'ok' ? 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300'}`}>
              {pwMsg.text}
            </p>
          )}
          <form onSubmit={changePassword} className="space-y-4">
            <Input
              label="Current Password"
              name="pw_current"
              type="password"
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              required
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="New Password" name="pw_new" type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} required placeholder="At least 8 characters" />
              <Input label="Confirm New Password" name="pw_confirm" type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} required />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={pwBusy}>{pwBusy ? 'Updating…' : 'Change Password'}</Button>
            </div>
          </form>
        </section>
      )}

      <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-surface p-6 shadow-card dark:border-slate-700">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br from-primary-200/50 to-primary-500/10 blur-2xl" />
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary-500" /> Publisher
        </h2>
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-lg font-bold text-white shadow-lg shadow-primary-500/30">
            GD
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">GilmierDev</p>
            <p className="text-sm text-muted">Creator of this software and your friendly neighborhood developer.</p>
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap gap-2">
          <Badge tone="primary" icon={Code2}>Software Developer</Badge>
          <Badge tone="info" icon={Sparkles}>AI Developer</Badge>
          <Badge tone="warning" icon={Wand2}>Prompt Engineer</Badge>
        </div>
      </section>

      {/* Danger Zone: Delete Data */}
      <section className="rounded-xl border border-red-200 bg-surface p-6 shadow-card">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-red-600">
          <Trash2 className="h-4 w-4 text-red-600" /> Danger Zone: Delete Catalog Data
        </h2>
        <p className="mb-4 text-sm text-muted">
          Permanently delete all catalog records including books, copies, authors, categories, publishers, and circulation logs. Administrator accounts and application settings will be preserved.
        </p>
        <Button
          variant="danger"
          onClick={() => setDeleteDataOpen(true)}
          icon={<Trash2 className="h-4 w-4" />}
        >
          Delete All Catalog Data…
        </Button>
      </section>

      <ConfirmDialog
        open={!!restoreTarget}
        title="Restore backup"
        message={
          restoreTarget
            ? `Restore "${restoreTarget.filename}"? Current data will be replaced. A safety copy of your current database will be kept. The catalog settings from that backup date will be applied.`
            : ''
        }
        confirmLabel="Restore Backup"
        danger
        loading={restoring}
        onConfirm={handleRestore}
        onCancel={() => setRestoreTarget(null)}
      />

      <GitHubConfirmModal
        open={deleteDataOpen}
        title="Delete All Library Catalog Data"
        description="This will permanently delete all books, borrowings, categories, authors, and publishers from your local database. Your administrator login will remain active. This action cannot be undone."
        matchText="delete all data"
        confirmButtonText="I understand the consequences, delete all data"
        onConfirm={handleClearCatalog}
        onClose={() => setDeleteDataOpen(false)}
      />
    </div>
  )
}