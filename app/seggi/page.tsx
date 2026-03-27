'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

const API_BASE = 'https://diretta-radio-api.francesco-statello88.workers.dev'

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

type SectionState = 'empty' | 'partial' | 'complete'

type Plesso = {
  id: string
  nome: string
  sottotitolo: string
  sezioni: number[]
}

type ElectionSettings = {
  totaleSezioni?: string
  annoElezione?: string
  plesso1Nome?: string
  plesso1Sezioni?: string
  plesso2Nome?: string
  plesso2Sezioni?: string
}

export default function SeggiPage() {
  const router = useRouter()

  const [session, setSession] = useState<SessionUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [openPlesso, setOpenPlesso] = useState<string | null>(null)
  const [rows, setRows] = useState<LiveRow[]>([])
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<ElectionSettings | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('session')

    if (!raw) {
      router.replace('/login')
      return
    }

    try {
      const parsed = JSON.parse(raw) as SessionUser
      setSession({
        ...parsed,
        sezioni: Array.isArray(parsed.sezioni) ? parsed.sezioni : [],
      })
      setAuthChecked(true)

      const savedSettings = localStorage.getItem('election-settings')
      if (savedSettings) {
        try {
          setSettings(JSON.parse(savedSettings) as ElectionSettings)
        } catch {
          setSettings(null)
        }
      } else {
        setSettings(null)
      }
    } catch {
      localStorage.removeItem('session')
      router.replace('/login')
    }
  }, [router])

  const plessi: Plesso[] = useMemo(() => {
    const parseSezioni = (value: string | undefined, fallback: number[]) => {
      if (!value || !value.trim()) return fallback

      const parsed = value
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isInteger(item) && item > 0)

      return parsed.length > 0 ? parsed : fallback
    }

    const p1 = parseSezioni(settings?.plesso1Sezioni, [1, 2, 3, 4])
    const p2 = parseSezioni(settings?.plesso2Sezioni, [5, 6])

    return [
      {
        id: 'elementare',
        nome: settings?.plesso1Nome || 'Scuola Elementare',
        sottotitolo: `Sezioni ${p1.join(' - ')}`,
        sezioni: p1,
      },
      {
        id: 'asilo-via-napoli',
        nome: settings?.plesso2Nome || 'Asilo Via Napoli',
        sottotitolo: `Sezioni ${p2.join(' - ')}`,
        sezioni: p2,
      },
    ]
  }, [settings])

  useEffect(() => {
    if (!authChecked || !session) return

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
  }, [authChecked, session])

  useEffect(() => {
    if (!session) return

    if (session.role === 'admin') {
      setOpenPlesso((prev) => prev ?? plessi[0]?.id ?? null)
      return
    }

    const accessiblePlessi = plessi.filter((plesso) =>
      plesso.sezioni.some((n) => session.sezioni.includes(n))
    )

    if (accessiblePlessi.length === 1) {
      setOpenPlesso(accessiblePlessi[0].id)
    } else if (accessiblePlessi.length > 1) {
      setOpenPlesso((prev) => prev ?? accessiblePlessi[0].id)
    } else {
      setOpenPlesso(null)
    }
  }, [session, plessi])

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
    } catch (err) {
      setRows([])
      setError(err instanceof Error ? err.message : 'Errore caricamento live')
    }
  }

  const sectionStatus = useMemo(() => {
    const result: Record<string, SectionState> = {}

    rows.forEach((row) => {
      const hasCons1 =
        Array.isArray(row.consiglieri_lista1) &&
        row.consiglieri_lista1.some((v) => v !== null && v !== 0)

      const hasCons2 =
        Array.isArray(row.consiglieri_lista2) &&
        row.consiglieri_lista2.some((v) => v !== null && v !== 0)

      const hasAnything =
        row.sindaco1 !== null ||
        row.sindaco2 !== null ||
        row.lista1 !== null ||
        row.lista2 !== null ||
        row.schede_bianche !== null ||
        row.schede_nulle !== null ||
        row.votanti !== null ||
        hasCons1 ||
        hasCons2

      if (row.is_completed) {
        result[String(row.sezione)] = 'complete'
      } else if (hasAnything) {
        result[String(row.sezione)] = 'partial'
      } else {
        result[String(row.sezione)] = 'empty'
      }
    })

    return result
  }, [rows])

  const visiblePlessi = useMemo(() => {
    if (!session) return []

    if (session.role === 'admin') return plessi

    return plessi
      .map((plesso) => ({
        ...plesso,
        sezioni: plesso.sezioni.filter((n) => session.sezioni.includes(n)),
      }))
      .filter((plesso) => plesso.sezioni.length > 0)
  }, [session, plessi])

  function togglePlesso(plessoId: string) {
    setOpenPlesso((prev) => (prev === plessoId ? null : plessoId))
  }

  function getPlessoStats(sezioni: number[]) {
    let complete = 0
    let partial = 0
    let empty = 0

    sezioni.forEach((num) => {
      const status = sectionStatus[String(num)] || 'empty'

      if (status === 'complete') complete += 1
      else if (status === 'partial') partial += 1
      else empty += 1
    })

    return { complete, partial, empty }
  }

  if (!authChecked) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="text-sm font-bold text-slate-600">Caricamento accessi...</div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className="space-y-4">
      {session.role === 'operatore' && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <div className="font-bold">Accesso operatore</div>
          <div className="mt-1">
            Visualizzi solo le sezioni a te assegnate:{' '}
            <span className="font-bold">
              {session.sezioni.length > 0 ? session.sezioni.join(', ') : '-'}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          Errore caricamento live: {error}
        </div>
      )}

      {visiblePlessi.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          <div className="font-bold">Nessuna sezione assegnata</div>
          <div className="mt-1">
            Questo utente operatore non ha sezioni disponibili. Controlla la configurazione utenti.
          </div>
        </div>
      )}

      {visiblePlessi.map((plesso) => {
        const isOpen = openPlesso === plesso.id
        const stats = getPlessoStats(plesso.sezioni)

        return (
          <div
            key={plesso.id}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-2xl font-bold text-slate-900">
                  Seggio {plesso.nome}
                </div>
                <div className="mt-1 text-sm font-medium text-slate-500">
                  {plesso.sottotitolo}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <MiniBadge label="Complete" value={String(stats.complete)} tone="green" />
                  <MiniBadge label="Parziali" value={String(stats.partial)} tone="yellow" />
                  <MiniBadge label="Vuote" value={String(stats.empty)} tone="red" />
                </div>
              </div>

              <button
                onClick={() => togglePlesso(plesso.id)}
                className={`rounded-xl px-5 py-3 text-sm font-bold text-white transition ${
                  isOpen ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isOpen ? 'Chiudi' : 'Apri'}
              </button>
            </div>

            {isOpen && (
              <div className="border-t border-slate-200 bg-slate-50 px-5 py-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {plesso.sezioni.map((sezione) => {
                    const status = sectionStatus[String(sezione)] || 'empty'

                    return (
                      <button
                        key={sezione}
                        onClick={() => router.push(`/seggi/${sezione}`)}
                        className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xl font-bold text-slate-900">
                              Sezione {sezione}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              Apri inserimento dati
                            </div>
                          </div>

                          <SectionBadge status={status} />
                        </div>

                        <div className="mt-4">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-2 rounded-full ${
                                status === 'complete'
                                  ? 'w-full bg-green-500'
                                  : status === 'partial'
                                    ? 'w-1/2 bg-yellow-500'
                                    : 'w-1/5 bg-red-500'
                              }`}
                            />
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function MiniBadge({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'green' | 'yellow' | 'red'
}) {
  const toneMap = {
    green: 'rounded-xl border bg-green-50 text-green-700 border-green-200',
    yellow: 'rounded-xl border bg-yellow-50 text-yellow-700 border-yellow-200',
    red: 'rounded-xl border bg-red-50 text-red-700 border-red-200',
  }

  return (
    <div className={`px-3 py-2 ${toneMap[tone]}`}>
      <div className="text-[10px] font-bold uppercase tracking-wide">{label}</div>
      <div className="mt-0.5 text-sm font-bold">{value}</div>
    </div>
  )
}

function SectionBadge({
  status,
}: {
  status: 'empty' | 'partial' | 'complete'
}) {
  const map = {
    complete: {
      text: 'Completa',
      className: 'rounded-xl bg-green-100 text-green-700',
    },
    partial: {
      text: 'Parziale',
      className: 'rounded-xl bg-yellow-100 text-yellow-700',
    },
    empty: {
      text: 'Vuota',
      className: 'rounded-xl bg-red-100 text-red-700',
    },
  }

  return (
    <div className={`px-3 py-2 text-xs font-bold ${map[status].className}`}>
      {map[status].text}
    </div>
  )
}