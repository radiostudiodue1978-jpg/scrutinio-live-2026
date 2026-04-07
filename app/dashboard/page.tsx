'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

const API_BASE = 'https://diretta-radio-api.francesco-statello88.workers.dev'
const TOTAL_SECTIONS = 6
const OFFLINE_QUEUE_KEY = 'offline-queue'

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

type ConfigData = {
  sindaco1: string
  sindaco2: string
  lista1: string
  lista2: string
  consiglieri1: string[]
  consiglieri2: string[]
  elettoriSezioni?: number[]
}

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
  elettori?: number | null
  updated_at: string | null
  updated_by: string | null
  is_completed: boolean
  completed_at: string | null
}

type SectionStatus = 'vuota' | 'parziale' | 'completa'

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

export default function DashboardPage() {
  const router = useRouter()

  const [authChecked, setAuthChecked] = useState(false)
  const [rows, setRows] = useState<LiveRow[]>([])
  const [config, setConfig] = useState<ConfigData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [offlineQueueCount, setOfflineQueueCount] = useState(0)

  useEffect(() => {
    const session = normalizeSession(localStorage.getItem('session'))

    if (!session) {
      localStorage.removeItem('session')
      router.replace('/login')
      return
    }

    if (session.role !== 'admin') {
      router.replace('/seggi')
      return
    }

    setAuthChecked(true)
    loadConfig()
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)
    setOfflineQueueCount(getOfflineQueueCount())
    loadLive()

    const onFocus = () => {
      loadConfig()
      loadLive()
      setOfflineQueueCount(getOfflineQueueCount())
      setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)
    }

    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)

    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    const interval = setInterval(() => {
      loadLive()
      setOfflineQueueCount(getOfflineQueueCount())
      setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)
    }, 10000)

    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(interval)
    }
  }, [router])

  function loadConfig() {
    const savedConfig = localStorage.getItem('config')
    if (savedConfig) {
      try {
        setConfig(JSON.parse(savedConfig) as ConfigData)
      } catch {
        setConfig(null)
      }
    } else {
      setConfig(null)
    }
  }

  function getOfflineQueueCount() {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY)
      if (!raw) return 0
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.length : 0
    } catch {
      return 0
    }
  }

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
      setError('')
      setLastSync(
        new Date().toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore caricamento live')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  const sections = useMemo(() => {
    return Array.from({ length: TOTAL_SECTIONS }, (_, index) => {
      const sezione = index + 1
      const row = rows.find((item) => item.sezione === sezione) || null

      const elettoriConfig = Array.isArray(config?.elettoriSezioni)
        ? Number(config.elettoriSezioni[index] || 0)
        : 0

      const elettori = Number(row?.elettori || elettoriConfig || 0)
      const votanti = Number(row?.votanti || 0)
      const affluenza =
        elettori > 0 && votanti > 0 ? ((votanti / elettori) * 100).toFixed(2) : null

      const hasAnyData =
        !!row &&
        (
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
        )

      let stato: SectionStatus = 'vuota'
      if (row?.is_completed) stato = 'completa'
      else if (hasAnyData) stato = 'parziale'

      return {
        sezione,
        row,
        stato,
        elettori,
        votanti,
        affluenza,
        updatedAt: row?.updated_at || null,
        updatedBy: row?.updated_by || null,
      }
    })
  }, [rows, config])

  const stats = useMemo(() => {
    const complete = sections.filter((item) => item.stato === 'completa').length
    const partial = sections.filter((item) => item.stato === 'parziale').length
    const empty = sections.filter((item) => item.stato === 'vuota').length

    const totalElettori = sections.reduce((sum, item) => sum + item.elettori, 0)
    const totalVotanti = sections.reduce((sum, item) => sum + item.votanti, 0)

    const affluenzaTotale =
      totalElettori > 0 && totalVotanti > 0
        ? ((totalVotanti / totalElettori) * 100).toFixed(2)
        : null

    const last = [...sections]
      .filter((item) => item.updatedAt)
      .sort(
        (a, b) =>
          new Date(b.updatedAt || 0).getTime() -
          new Date(a.updatedAt || 0).getTime()
      )[0]

    return {
      complete,
      partial,
      empty,
      totalElettori,
      totalVotanti,
      affluenzaTotale,
      lastSection: last?.sezione ?? '-',
      lastTime: last?.updatedAt
        ? new Date(last.updatedAt).toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        : '-',
      lastUser: last?.updatedBy ?? '-',
    }
  }, [sections])

  function goToSection(sezione: number) {
    router.push(`/seggi/${sezione}`)
  }

  function handleExcelExport() {
    window.open(`${API_BASE}/api/export-excel`, '_blank')
  }

  function handlePdfExport() {
    window.open(`${API_BASE}/api/export-pdf`, '_blank')
  }

  if (!authChecked) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="text-sm font-bold text-slate-600">
          Controllo accessi amministratore...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          Errore caricamento live: {error}
        </div>
      )}

      {loading && !error && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm">
          Caricamento dati live...
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Box title="Stato generale sistema" color="blue">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard label="Sezioni complete" value={`${stats.complete}/${TOTAL_SECTIONS}`} />
            <InfoCard label="Sezioni parziali" value={String(stats.partial)} />
            <InfoCard label="Sezioni vuote" value={String(stats.empty)} />
            <InfoCard
              label="Affluenza totale"
              value={stats.affluenzaTotale ? `${stats.affluenzaTotale}%` : '-'}
            />
            <InfoCard label="Elettori totali" value={String(stats.totalElettori)} />
            <InfoCard label="Votanti totali" value={String(stats.totalVotanti)} />
            <InfoCard label="Ultima sezione" value={String(stats.lastSection)} />
            <InfoCard label="Ultimo operatore" value={stats.lastUser} />
          </div>
        </Box>

        <Box title="Controllo tecnico" color="amber">
          <div className="grid gap-3 md:grid-cols-2">
            <TechCard
              label="Connessione"
              value={isOnline ? 'Online' : 'Offline'}
              tone={isOnline ? 'green' : 'red'}
            />
            <TechCard
              label="Coda offline"
              value={offlineQueueCount > 0 ? `${offlineQueueCount} invii` : 'Nessun invio'}
              tone={offlineQueueCount > 0 ? 'yellow' : 'green'}
            />
            <TechCard
              label="Ultimo sync live"
              value={lastSync || '-'}
              tone="blue"
            />
            <TechCard
              label="Ultimo aggiornamento dati"
              value={stats.lastTime}
              tone="violet"
            />
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {offlineQueueCount > 0
              ? 'Attenzione: ci sono dati in coda offline da sincronizzare.'
              : 'Sistema pronto. Nessun invio pendente in coda offline.'}
          </div>
        </Box>
      </div>

      <Box title="Esportazione report" color="rose">
        <div className="grid gap-3 md:grid-cols-2">
          <ActionButton
            label="Esporta Excel"
            onClick={handleExcelExport}
            tone="green"
          />
          <ActionButton
            label="Esporta PDF"
            onClick={handlePdfExport}
            tone="red"
          />
        </div>
      </Box>

      <Box title="Situazione sezioni" color="blue">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((item) => (
            <SectionCard
              key={item.sezione}
              sezione={item.sezione}
              stato={item.stato}
              votanti={item.votanti}
              affluenza={item.affluenza}
              updatedAt={item.updatedAt}
              updatedBy={item.updatedBy}
              onOpen={() => goToSection(item.sezione)}
            />
          ))}
        </div>
      </Box>
    </div>
  )
}

function Box({
  title,
  color,
  children,
}: {
  title: string
  color: 'blue' | 'amber' | 'rose'
  children: React.ReactNode
}) {
  const map = {
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`px-4 py-3 font-bold ${map[color]}`}>{title}</div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function InfoCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-4">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
    </div>
  )
}

function TechCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'green' | 'red' | 'yellow' | 'blue' | 'violet'
}) {
  const map = {
    green: 'border-green-200 bg-green-50 text-green-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    yellow: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
  }

  return (
    <div className={`rounded-xl border px-4 py-4 ${map[tone]}`}>
      <div className="text-xs font-bold uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  )
}

function ActionButton({
  label,
  onClick,
  tone,
}: {
  label: string
  onClick: () => void
  tone: 'green' | 'red'
}) {
  const map = {
    green: 'bg-green-600 hover:bg-green-700 text-white',
    red: 'bg-red-600 hover:bg-red-700 text-white',
  }

  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-4 text-sm font-bold shadow-sm transition ${map[tone]}`}
    >
      {label}
    </button>
  )
}

function SectionCard({
  sezione,
  stato,
  votanti,
  affluenza,
  updatedAt,
  updatedBy,
  onOpen,
}: {
  sezione: number
  stato: 'vuota' | 'parziale' | 'completa'
  votanti: number
  affluenza: string | null
  updatedAt: string | null
  updatedBy: string | null
  onOpen: () => void
}) {
  const statusMap = {
    vuota: 'bg-slate-100 text-slate-700',
    parziale: 'bg-amber-100 text-amber-700',
    completa: 'bg-green-100 text-green-700',
  }

  const labelMap = {
    vuota: 'Vuota',
    parziale: 'Parziale',
    completa: 'Completa',
  }

  const barWidth =
    stato === 'completa' ? '100%' : stato === 'parziale' ? '60%' : '20%'

  const barColor =
    stato === 'completa'
      ? 'bg-green-500'
      : stato === 'parziale'
        ? 'bg-amber-500'
        : 'bg-red-500'

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-bold text-slate-900">Sezione {sezione}</div>
          <div className="mt-1 text-sm text-slate-500">
            {updatedAt
              ? new Date(updatedAt).toLocaleTimeString('it-IT', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : 'Nessun invio'}
          </div>
        </div>

        <span className={`rounded-xl px-3 py-1 text-xs font-bold ${statusMap[stato]}`}>
          {labelMap[stato]}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <MiniStat label="Votanti" value={votanti > 0 ? String(votanti) : '-'} />
        <MiniStat label="Affluenza" value={affluenza ? `${affluenza}%` : '-'} />
        <MiniStat label="Operatore" value={updatedBy || '-'} />
        <MiniStat label="Stato" value={labelMap[stato]} />
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${barColor}`} style={{ width: barWidth }} />
      </div>

      <button
        onClick={onOpen}
        className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800"
      >
        Apri sezione
      </button>
    </div>
  )
}

function MiniStat({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl bg-white px-3 py-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-bold text-slate-900">{value}</div>
    </div>
  )
}