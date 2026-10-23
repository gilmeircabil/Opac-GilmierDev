import { create } from 'zustand'
import type { AdminUser, SettingsMap, AppPaths, AppMode, InstallInfo, ConnectionConfig } from '@shared/types'

interface AppState {
  user: AdminUser | null
  settings: SettingsMap
  paths: AppPaths | null
  mode: AppMode | null
  installInfo: InstallInfo | null
  connection: ConnectionConfig | null
  ready: boolean
  initialized: boolean
  refreshKey: number
  setUser: (user: AdminUser | null) => void
  setSettings: (settings: SettingsMap) => void
  setPaths: (paths: AppPaths) => void
  setMode: (mode: AppMode) => void
  setInstallInfo: (info: InstallInfo) => void
  setConnection: (connection: ConnectionConfig | null) => void
  setReady: (ready: boolean) => void
  setInitialized: (value: boolean) => void
  triggerRefresh: () => void
}

const DEFAULT_SETTINGS: SettingsMap = {
  library_name: 'OPAC Library',
  library_logo: null,
  library_address: '',
  contact_info: '',
  theme: 'light'
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  settings: DEFAULT_SETTINGS,
  paths: null,
  mode: null,
  installInfo: null,
  connection: null,
  ready: false,
  initialized: false,
  refreshKey: 0,
  setUser: (user) => set({ user }),
  setSettings: (settings) => set({ settings }),
  setPaths: (paths) => set({ paths }),
  setMode: (mode) => set({ mode }),
  setInstallInfo: (info) => set({ installInfo: info }),
  setConnection: (connection) => set({ connection }),
  setReady: (ready) => set({ ready }),
  setInitialized: (value) => set({ initialized: value }),
  triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 }))
}))

export function applyTheme(_theme?: string): void {
  const root = document.documentElement
  root.classList.remove('dark')
}

export async function bootstrapApp(): Promise<void> {
  const store = useAppStore.getState()
  try {
    const [paths, mode, installInfo] = await Promise.all([
      window.api.paths(),
      window.api.mode(),
      window.api.installInfo()
    ])
    store.setPaths(paths)
    store.setMode(mode)
    store.setInstallInfo(installInfo)

    if (mode === 'user') {
      let connection = await window.api.connection.get()
      if (!connection || !connection.host) {
        connection = { host: '127.0.0.1', port: 47821 }
      }
      store.setConnection(connection)
      try {
        const settings = await window.api.settings.getAll()
        store.setSettings(settings)
        applyTheme(settings.theme)
      } catch {
        // Server might be starting up; will retry on refresh
      }
    } else {
      const connection = await window.api.connection.get().catch(() => null)
      if (connection) store.setConnection(connection)
      try {
        const session = await window.api.auth.session()
        store.setUser(session)
        const settings = await window.api.settings.getAll()
        store.setSettings(settings)
        applyTheme(settings.theme)
      } catch {
        // Server or MongoDB may need configuration on the Login screen
      }

      window.api.onSessionChanged(() => {
        void (async () => {
          try {
            const s = await window.api.auth.session()
            useAppStore.getState().setUser(s)
          } catch {
            // ignore
          }
        })()
      })
    }

    window.api.onSettingsChanged((next) => {
      if (next) {
        useAppStore.getState().setSettings(next)
        applyTheme(next.theme ?? 'light')
      }
    })
    store.setInitialized(true)
  } finally {
    store.setReady(true)
  }
}