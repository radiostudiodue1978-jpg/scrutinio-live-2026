'use client'

import './globals.css'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const API_BASE = 'https://diretta-radio-api.francesco-statello88.workers.dev'
const TOTAL_SECTIONS = 6

type LiveRow = {
  id: string
  anno: number
  sezione: number
  plesso: string | null
  sindaco1: number | null
  sindaco2: number | null
  lista1: number | null
  lista2: number | null
  consiglieri_lista1: Array<number | null> | null
  consiglieri_lista2: Array<number | null> | null
  schede_bianche: number | null
  schede_nulle: number | null
  votanti: number | null
  elettori: number | null
  updated_at: string | null
  updated_by: string | null
  is_completed: boolean
  completed_at: string | null
}

type SessionUser = {
  id: string
  username: string
  role: 'admin' | 'operatore'
  sezioni: number[]
}

type StoredSession =
  | SessionUser
  | {
      token?: string
      user?: SessionUser
    }

function normalizeSession(raw: string | null): SessionUser | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as StoredSession

    if (
      parsed &&
      typeof parsed === 'object' &&
      'user' in parsed &&
      parsed.user &&
      typeof parsed.user === 'object'
    ) {
      const user = parsed.user

      if (
        typeof user.id === 'string' &&
        typeof user.username === 'string' &&
        (user.role === 'admin' || user.role === 'operatore')
      ) {
        return {
          id: user.id,
          username: user.username,
          role: user.role,
          sezioni: Array.isArray(user.sezioni)
            ? user.sezioni.map(Number).filter((n) => Number.isInteger(n) && n > 0)
            : [],
        }
      }
    }

    if (
      parsed &&
      typeof parsed === 'object' &&
      'id' in parsed &&
      'username' in parsed &&
      'role' in parsed
    ) {
      const user = parsed as SessionUser

      if (
        typeof user.id === 'string' &&
        typeof user.username === 'string' &&
        (user.role === 'admin' || user.role === 'operatore')
      ) {
        return {
          id: user.id,
          username: user.username,
          role: user.role,
          sezioni: Array.isArray(user.sezioni)
            ? user.sezioni.map(Number).filter((n) => Number.isInteger(n) && n > 0)
            : [],
        }
      }
    }

    return null
  } catch {
    return null
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const [rows, setRows] = useState<LiveRow[]>([])
  const [loadError, setLoadError] = useState(false)
  const [session, setSession] = useState<SessionUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [logoError, setLogoError] = useState(false)

  const isLoginPage = pathname === '/login'
  const isSezioneDetailPage = pathname.startsWith('/seggi/')
  const showBackButton = isSezioneDetailPage

  useEffect(() => {
    const normalized = normalizeSession(localStorage.getItem('session'))

    if (!normalized) {
      localStorage.removeItem('session')
      setSession(null)
      setAuthChecked(true)

      if (!isLoginPage) {
        router.replace('/login')
      }
      return
    }

    setSession(normalized)
    setAuthChecked(true)

    if (isLoginPage) {
      if (normalized.role === 'admin') {
        router.replace('/dashboard')
      } else {
        router.replace('/seggi')
      }
    }
  }, [isLoginPage, router])

  useEffect(() => {
    if (!authChecked || !session || isLoginPage) return

    const blockedDashboard =
      pathname === '/dashboard' && session.role !== 'admin'

    const blockedConfig =
      pathname === '/configurazione' && session.role !== 'admin'

    const blockedRadio =
      pathname === '/radio' && session.role !== 'admin'

    if (blockedDashboard || blockedConfig || blockedRadio) {
      router.replace('/seggi')
      return
    }

    if (pathname.startsWith('/seggi/')) {
      const id = Number(pathname.split('/')[2])

      if (
        session.role === 'operatore' &&
        (!Number.isFinite(id) || !session.sezioni.includes(id))
      ) {
        router.replace('/seggi')
      }
    }
  }, [authChecked, session, pathname, router, isLoginPage])

  useEffect(() => {
    if (!authChecked || !session || isLoginPage) return

    loadLive()

    const onFocus = () => loadLive()

    window.addEventListener('focus', onFocus)

    const interval = setInterval(() => {
      loadLive()
    }, 10000)

    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(interval)
    }
  }, [authChecked, session, isLoginPage])

  async function loadLive() {
    try {
      const res = await fetch(`${API_BASE}/api/live`, {
        cache: 'no-store',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Errore caricamento live')
      }

      setRows(Array.isArray(data) ? data : [])
      setLoadError(false)
    } catch {
      setRows([])
      setLoadError(true)
    }
  }

  function handleLogout() {
    localStorage.removeItem('session')
    router.replace('/login')
  }

  function handleBack() {
    if (pathname.startsWith('/seggi/')) {
      router.push('/seggi')
      return
    }

    router.back()
  }

  const sectionStats = useMemo(() => {
    const completedCount = rows.filter((row) => row.is_completed).length

    const partialCount = rows.filter((row) => {
      if (row.is_completed) return false

      const hasData =
        row.sindaco1 !== null ||
        row.sindaco2 !== null ||
        row.lista1 !== null ||
        row.lista2 !== null ||
        row.schede_bianche !== null ||
        row.schede_nulle !== null ||
        row.votanti !== null ||
        (Array.isArray(row.consiglieri_lista1) &&
          row.consiglieri_lista1.some((v) => v !== null && v !== 0)) ||
        (Array.isArray(row.consiglieri_lista2) &&
          row.consiglieri_lista2.some((v) => v !== null && v !== 0))

      return hasData
    }).length

    const emptyCount = Math.max(
      0,
      TOTAL_SECTIONS - completedCount - partialCount
    )

    const last = [...rows]
      .filter((row) => row.updated_at)
      .sort(
        (a, b) =>
          new Date(b.updated_at || 0).getTime() -
          new Date(a.updated_at || 0).getTime()
      )[0]

    return {
      totalSections: TOTAL_SECTIONS,
      completedCount,
      partialCount,
      emptyCount,
      lastSection: last?.sezione ?? null,
      lastTime: last?.updated_at
        ? new Date(last.updated_at).toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        : null,
    }
  }, [rows])

  function isActive(path: string) {
    if (path === '/dashboard') return pathname === '/dashboard'
    if (path === '/seggi') {
      return pathname === '/seggi' || pathname.startsWith('/seggi/')
    }
    if (path === '/configurazione') return pathname === '/configurazione'
    if (path === '/radio') return pathname === '/radio'
    return false
  }

  function getPageMeta() {
    if (pathname === '/dashboard') {
      return {
        title: 'Dashboard',
        subtitle: 'Monitoraggio risultati live',
      }
    }

    if (pathname === '/radio') {
      return {
        title: 'Punto Radio',
        subtitle: 'Lettura dati scrutinio in tempo reale',
      }
    }

    if (pathname === '/seggi') {
      return {
        title: 'Scrutinio',
        subtitle:
          session?.role === 'operatore'
            ? 'Visualizzi solo le sezioni a te assegnate'
            : 'Seleziona il plesso e apri la sezione da aggiornare',
      }
    }

    if (pathname.startsWith('/seggi/')) {
      return {
        title: 'Scrutinio',
        subtitle: 'Inserimento dati della sezione selezionata',
      }
    }

    if (pathname === '/configurazione') {
      return {
        title: 'Configurazione',
        subtitle: 'Gestione nomi, accessi, elezione e controlli sistema',
      }
    }

    return {
      title: 'Raccolta Dati',
      subtitle: 'Radio StudioDue',
    }
  }

  function NavItem({
    label,
    path,
  }: {
    label: string
    path: string
  }) {
    const active = isActive(path)

    return (
      <button
        onClick={() => router.push(path)}
        className={`block w-full py-3 pr-4 text-left text-sm font-bold transition ${
          active
            ? 'border-l-4 border-violet-500 bg-slate-800 pl-4 text-white'
            : 'border-l-4 border-transparent pl-5 text-slate-200 hover:bg-slate-800 hover:text-white'
        }`}
      >
        {label}
      </button>
    )
  }

  const pageMeta = getPageMeta()

  if (!authChecked) {
    return (
      <html lang="it">
        <body className="bg-slate-100">
          <div className="flex min-h-screen items-center justify-center">
            <div className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-slate-600 shadow">
              Caricamento...
            </div>
          </div>
        </body>
      </html>
    )
  }

  if (isLoginPage) {
    return (
      <html lang="it">
        <body className="bg-slate-100">{children}</body>
      </html>
    )
  }

  if (!session) {
    return (
      <html lang="it">
        <body className="bg-slate-100">
          <div className="flex min-h-screen items-center justify-center">
            <div className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-slate-600 shadow">
              Reindirizzamento al login...
            </div>
          </div>
        </body>
      </html>
    )
  }

  const canSeeDashboard = session.role === 'admin'
  const canSeeConfig = session.role === 'admin'
  const canSeeRadio = session.role === 'admin'

  return (
    <html lang="it">
      <body className="bg-slate-900 text-slate-900">
        <div className="flex min-h-screen bg-slate-900">
          <aside className="relative w-80 bg-slate-900 text-white">
            <div className="border-b border-slate-800 px-5 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-violet-600 shadow-lg">
                  {!logoError ? (
                    <img
                      src="/logo-radiostudiodue.png"
                      alt="Logo Radio StudioDue"
                      className="h-full w-full object-contain"
                      onError={() => setLogoError(true)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl font-bold text-white">
                      RS2
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-2xl font-bold leading-tight">
                    Raccolta Dati
                  </div>
                  <div className="mt-1 text-base font-semibold leading-tight text-white">
                    Radio StudioDue
                  </div>
                  <div className="mt-2 text-sm leading-snug text-slate-300">
                    Elezioni Amministrative
                    <br />
                    Centuripe 2026
                  </div>
                </div>
              </div>
            </div>

            <div className="border-b border-slate-800 px-5 py-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Accesso attivo
              </div>
              <div className="mt-2 text-sm font-bold text-white">
                {session.username}
              </div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-violet-300">
                {session.role === 'admin' ? 'Amministratore' : 'Operatore'}
              </div>
              {session.role === 'operatore' && (
                <div className="mt-2 text-xs text-slate-300">
                  Sezioni assegnate:{' '}
                  {session.sezioni.length > 0 ? session.sezioni.join(', ') : '-'}
                </div>
              )}
            </div>

            <nav className="space-y-1 py-4">
              {canSeeDashboard && (
                <NavItem label="Dashboard" path="/dashboard" />
              )}

              {canSeeRadio && (
                <NavItem label="Punto Radio" path="/radio" />
              )}

              <NavItem label="Scrutinio" path="/seggi" />

              {canSeeConfig && (
                <NavItem label="Configurazione" path="/configurazione" />
              )}
            </nav>

            <div className="px-4 pb-4">
              <div className="rounded-lg bg-slate-800 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Stato sezioni
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <StatusPill
                    title="Complete"
                    value={`${sectionStats.completedCount}/${sectionStats.totalSections}`}
                    tone="green"
                  />
                  <StatusPill
                    title="Parziali"
                    value={String(sectionStats.partialCount)}
                    tone="yellow"
                  />
                  <StatusPill
                    title="Vuote"
                    value={String(sectionStats.emptyCount)}
                    tone="red"
                  />
                </div>

                <div className="mt-4 rounded-lg bg-slate-700/50 px-3 py-3">
                  <div className="text-xs text-slate-400">
                    Ultima:{' '}
                    {sectionStats.lastSection
                      ? `Sez. ${sectionStats.lastSection}`
                      : '-'}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Aggiornamento: {sectionStats.lastTime || '-'}
                  </div>
                  {loadError && (
                    <div className="mt-2 text-[11px] font-semibold text-red-300">
                      Errore sync live
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute right-0 top-0 h-full w-5">
              <div className="h-full w-px bg-slate-700/70" />
              <div className="absolute right-0 top-0 h-full w-4 bg-gradient-to-r from-violet-500/10 via-violet-400/5 to-transparent blur-sm" />
            </div>
          </aside>

          <div className="flex min-h-screen flex-1 flex-col bg-slate-100">
            <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold">{pageMeta.title}</h1>
                  <div className="mt-1 text-sm text-slate-300">
                    {pageMeta.subtitle}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {showBackButton && (
                    <button
                      onClick={handleBack}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
                    >
                      Indietro
                    </button>
                  )}

                  <button
                    onClick={handleLogout}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
                  >
                    Esci
                  </button>
                </div>
              </div>
            </header>

            <main className="flex-1 p-4 md:p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  )
}

function StatusPill({
  title,
  value,
  tone,
}: {
  title: string
  value: string
  tone: 'green' | 'yellow' | 'red'
}) {
  const toneMap = {
    green:
      'rounded-lg bg-green-500/15 text-green-300 ring-1 ring-green-500/30',
    yellow:
      'rounded-lg bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-500/30',
    red: 'rounded-lg bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
  }

  return (
    <div className={`px-2 py-3 text-center ${toneMap[tone]}`}>
      <div className="text-[10px] font-bold uppercase tracking-wide">
        {title}
      </div>
      <div className="mt-1 text-sm font-bold">{value}</div>
    </div>
  )
}