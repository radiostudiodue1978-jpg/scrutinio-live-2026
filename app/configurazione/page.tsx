'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'

const API_BASE = 'https://diretta-radio-api.francesco-statello88.workers.dev'

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

type ConfigSection = 'nomi' | 'login' | 'elezione' | 'critica'

type UserItem = {
  id: string
  username: string
  password: string
  role: 'admin' | 'operatore'
  sezioni: number[]
}

type ConfigData = {
  sindaco1: string
  sindaco2: string
  lista1: string
  lista2: string
  consiglieri1: string[]
  consiglieri2: string[]
  elettoriSezioni: number[]
}

type DbUserRow = {
  id: string
  username: string
  password: string
  role: 'admin' | 'operatore'
  sezioni: number[] | null
}

type ServerConfig = {
  anno?: number | string | null
  totale_sezioni?: number | string | null
  sindaco1?: string | null
  sindaco2?: string | null
  lista1?: string | null
  lista2?: string | null

  // Compatibilità doppia: Worker attuale + nomi vecchi
  consiglieri1?: string[] | null
  consiglieri2?: string[] | null
  consiglieri_lista1?: string[] | null
  consiglieri_lista2?: string[] | null

  elettori_sezioni?: number[] | null
  plesso1_nome?: string | null
  plesso1_sezioni?: number[] | string | null
  plesso2_nome?: string | null
  plesso2_sezioni?: number[] | string | null
}

type ServerConfigResponse = {
  ok?: boolean
  config?: ServerConfig | null
}

type WorkerErrorResponse = {
  ok?: boolean
  error?: string
  details?: string
}

const EMPTY_12 = Array(12).fill('')
const EMPTY_6_STR = Array(6).fill('')
const EMPTY_6_NUM = Array(6).fill(0)

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

function safeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function safeStringArray(value: unknown, length: number) {
  if (!Array.isArray(value)) return Array(length).fill('')
  return [...value.map((v) => (typeof v === 'string' ? v : '')), ...Array(length).fill('')].slice(0, length)
}

function safeNumberArrayToString(value: unknown, length: number) {
  if (!Array.isArray(value)) return Array(length).fill('')
  return [...value.map((v) => String(v ?? '')), ...Array(length).fill('')].slice(0, length)
}

function normalizeSezioniText(value: unknown, fallback: string) {
  if (Array.isArray(value)) {
    const arr = value
      .map((v) => Number(v))
      .filter((v) => Number.isInteger(v) && v > 0)

    return arr.length > 0 ? arr.join(',') : fallback
  }

  if (typeof value === 'string' && value.trim()) return value

  return fallback
}

function uniqNumbers(values: number[]) {
  return Array.from(new Set(values)).sort((a, b) => a - b)
}

function parseSezioniInput(value: string) {
  return uniqNumbers(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0)
  )
}

export default function ConfigurazionePage() {
  const router = useRouter()

  const [authChecked, setAuthChecked] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [token, setToken] = useState('')

  const [section, setSection] = useState<ConfigSection>('nomi')

  const [sindaco1, setSindaco1] = useState('')
  const [sindaco2, setSindaco2] = useState('')
  const [lista1, setLista1] = useState('')
  const [lista2, setLista2] = useState('')

  const [consiglieri1, setConsiglieri1] = useState<string[]>([...EMPTY_12])
  const [consiglieri2, setConsiglieri2] = useState<string[]>([...EMPTY_12])

  const [elettoriSezioni, setElettoriSezioni] = useState<string[]>([...EMPTY_6_STR])

  const [totaleSezioni, setTotaleSezioni] = useState('6')
  const [annoElezione, setAnnoElezione] = useState('2026')
  const [plesso1Nome, setPlesso1Nome] = useState('Scuola Elementare')
  const [plesso1Sezioni, setPlesso1Sezioni] = useState('1,2,3,4')
  const [plesso2Nome, setPlesso2Nome] = useState('Asilo Via Napoli')
  const [plesso2Sezioni, setPlesso2Sezioni] = useState('5,6')

  const [users, setUsers] = useState<UserItem[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')

  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'operatore'>('operatore')
  const [newSezioni, setNewSezioni] = useState('')

  const [showSaved, setShowSaved] = useState(false)
  const [showDeleteConfig, setShowDeleteConfig] = useState(false)
  const [showDangerConfirm, setShowDangerConfirm] = useState(false)
  const [dangerText, setDangerText] = useState('')
  const [dangerLoading, setDangerLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      const session = normalizeSession(localStorage.getItem('session'))
      const authToken = localStorage.getItem('auth_token') || ''

      if (!session || !authToken) {
        localStorage.removeItem('session')
        localStorage.removeItem('auth_token')
        router.replace('/login')
        return
      }

      if (session.role !== 'admin') {
        router.replace('/seggi')
        return
      }

      if (!mounted) return

      setToken(authToken)
      setAuthChecked(true)
      setPageError('')

      loadLocalConfig()
      loadElectionSettings()

      await Promise.allSettled([loadServerConfig(), loadUsers(authToken)])

      if (mounted) setPageLoading(false)
    }

    bootstrap().catch((err) => {
      if (mounted) {
        setPageError(err instanceof Error ? err.message : 'Errore caricamento configurazione')
        setPageLoading(false)
      }
    })

    return () => {
      mounted = false
    }
  }, [router])

  function syncConfigWithLocalStorage(partial: Partial<ConfigData>) {
    try {
      const raw = localStorage.getItem('config')
      const existing: ConfigData = raw
        ? JSON.parse(raw)
        : {
            sindaco1: '',
            sindaco2: '',
            lista1: '',
            lista2: '',
            consiglieri1: [...EMPTY_12],
            consiglieri2: [...EMPTY_12],
            elettoriSezioni: [...EMPTY_6_NUM],
          }

      const updated: ConfigData = {
        ...existing,
        ...partial,
      }

      localStorage.setItem('config', JSON.stringify(updated))
    } catch {
      // ignore
    }
  }

  function loadLocalConfig() {
    const saved = localStorage.getItem('config')
    if (!saved) return

    try {
      const parsed = JSON.parse(saved) as Partial<ConfigData>

      setSindaco1(safeString(parsed.sindaco1))
      setSindaco2(safeString(parsed.sindaco2))
      setLista1(safeString(parsed.lista1))
      setLista2(safeString(parsed.lista2))
      setConsiglieri1(safeStringArray(parsed.consiglieri1, 12))
      setConsiglieri2(safeStringArray(parsed.consiglieri2, 12))
      setElettoriSezioni(safeNumberArrayToString(parsed.elettoriSezioni, 6))
    } catch {
      // ignore
    }
  }

  function loadElectionSettings() {
    const saved = localStorage.getItem('election-settings')
    if (!saved) return

    try {
      const parsed = JSON.parse(saved) as {
        totaleSezioni?: string
        annoElezione?: string
        plesso1Nome?: string
        plesso1Sezioni?: string
        plesso2Nome?: string
        plesso2Sezioni?: string
        elettoriSezioni?: number[]
      }

      setTotaleSezioni(safeString(parsed.totaleSezioni, '6'))
      setAnnoElezione(safeString(parsed.annoElezione, '2026'))
      setPlesso1Nome(safeString(parsed.plesso1Nome, 'Scuola Elementare'))
      setPlesso1Sezioni(safeString(parsed.plesso1Sezioni, '1,2,3,4'))
      setPlesso2Nome(safeString(parsed.plesso2Nome, 'Asilo Via Napoli'))
      setPlesso2Sezioni(safeString(parsed.plesso2Sezioni, '5,6'))

      if (Array.isArray(parsed.elettoriSezioni)) {
        setElettoriSezioni(safeNumberArrayToString(parsed.elettoriSezioni, 6))
      }
    } catch {
      // ignore
    }
  }

  async function loadServerConfig() {
    try {
      const res = await fetch(`${API_BASE}/api/config`, {
        method: 'GET',
        cache: 'no-store',
      })

      const data = (await res.json().catch(() => ({}))) as ServerConfigResponse

      if (!res.ok || !data?.ok || !data?.config) return

      const config = data.config

      const serverSindaco1 = safeString(config.sindaco1)
      const serverSindaco2 = safeString(config.sindaco2)
      const serverLista1 = safeString(config.lista1)
      const serverLista2 = safeString(config.lista2)

      const serverConsiglieri1 = safeStringArray(
        config.consiglieri_lista1 || config.consiglieri1,
        12
      )

      const serverConsiglieri2 = safeStringArray(
        config.consiglieri_lista2 || config.consiglieri2,
        12
      )

      const serverElettori = Array.isArray(config.elettori_sezioni)
        ? config.elettori_sezioni.map((v) => Number(v || 0))
        : elettoriSezioni.map((v) => Number(v || 0))

      setSindaco1((prev) => serverSindaco1 || prev)
      setSindaco2((prev) => serverSindaco2 || prev)
      setLista1((prev) => serverLista1 || prev)
      setLista2((prev) => serverLista2 || prev)

      setConsiglieri1((prev) => (serverConsiglieri1.some(Boolean) ? serverConsiglieri1 : prev))
      setConsiglieri2((prev) => (serverConsiglieri2.some(Boolean) ? serverConsiglieri2 : prev))

      if (Array.isArray(config.elettori_sezioni)) {
        setElettoriSezioni(safeNumberArrayToString(config.elettori_sezioni, 6))
      }

      setAnnoElezione((prev) => {
        const value = config.anno
        return value == null || value === '' ? prev : String(value)
      })

      setTotaleSezioni((prev) => {
        const value = config.totale_sezioni
        return value == null || value === '' ? prev : String(value)
      })

      setPlesso1Nome((prev) => safeString(config.plesso1_nome, prev))
      setPlesso2Nome((prev) => safeString(config.plesso2_nome, prev))
      setPlesso1Sezioni((prev) => normalizeSezioniText(config.plesso1_sezioni, prev))
      setPlesso2Sezioni((prev) => normalizeSezioniText(config.plesso2_sezioni, prev))

      // IMPORTANTISSIMO: aggiorna anche localStorage con i dati veri del server
      syncConfigWithLocalStorage({
        sindaco1: serverSindaco1,
        sindaco2: serverSindaco2,
        lista1: serverLista1,
        lista2: serverLista2,
        consiglieri1: serverConsiglieri1,
        consiglieri2: serverConsiglieri2,
        elettoriSezioni: serverElettori,
      })
    } catch {
      // keep local defaults
    }
  }

  async function loadUsers(authTokenOverride?: string) {
    try {
      setUsersLoading(true)
      setUsersError('')

      const currentToken = authTokenOverride || token || localStorage.getItem('auth_token') || ''
      if (!currentToken) throw new Error('Token mancante. Effettua di nuovo il login.')

      const res = await fetch(`${API_BASE}/api/utenti`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        cache: 'no-store',
      })

      const data = await res.json().catch(() => [])

      if (!res.ok) {
        const err = data as WorkerErrorResponse
        throw new Error(
          typeof err?.details === 'string'
            ? err.details
            : typeof err?.error === 'string'
              ? err.error
              : 'Errore caricamento utenti'
        )
      }

      const normalized: UserItem[] = (Array.isArray(data) ? data : []).map((user: DbUserRow) => ({
        id: user.id,
        username: user.username,
        password: user.password,
        role: user.role,
        sezioni: user.role === 'admin' ? [] : uniqNumbers(user.sezioni || []),
      }))

      setUsers(normalized)
    } catch (err) {
      setUsers([])
      setUsersError(err instanceof Error ? err.message : 'Errore caricamento utenti')
    } finally {
      setUsersLoading(false)
    }
  }

  function updateCons1(index: number, value: string) {
    setConsiglieri1((prev) => {
      const copy = [...prev]
      copy[index] = value
      return copy
    })
  }

  function updateCons2(index: number, value: string) {
    setConsiglieri2((prev) => {
      const copy = [...prev]
      copy[index] = value
      return copy
    })
  }

  function updateElettori(index: number, value: string) {
    setElettoriSezioni((prev) => {
      const copy = [...prev]
      copy[index] = value.replace(/[^\d]/g, '')
      return copy
    })
  }

  function pulseSaved() {
    setShowSaved(true)
    setTimeout(() => setShowSaved(false), 1800)
  }

  async function saveConfigToServer(payloadOverride?: Partial<Record<string, unknown>>) {
    const currentToken = token || localStorage.getItem('auth_token') || ''
    if (!currentToken) throw new Error('Token mancante. Effettua di nuovo il login.')

    const normalizedConsiglieri1 = safeStringArray(consiglieri1, 12)
    const normalizedConsiglieri2 = safeStringArray(consiglieri2, 12)

    const payload = {
      anno: Number(annoElezione || 2026),
      totale_sezioni: Number(totaleSezioni || 6),
      sindaco1,
      sindaco2,
      lista1,
      lista2,

      // Salvo entrambi i formati per sicurezza
      consiglieri1: normalizedConsiglieri1,
      consiglieri2: normalizedConsiglieri2,
      consiglieri_lista1: normalizedConsiglieri1,
      consiglieri_lista2: normalizedConsiglieri2,

      elettori_sezioni: elettoriSezioni.map((v) => Number(v || 0)),
      plesso1_nome: plesso1Nome,
      plesso1_sezioni: parseSezioniInput(plesso1Sezioni),
      plesso2_nome: plesso2Nome,
      plesso2_sezioni: parseSezioniInput(plesso2Sezioni),
      ...payloadOverride,
    }

    const res = await fetch(`${API_BASE}/api/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok || !data?.ok) {
      throw new Error(
        typeof data?.details === 'string'
          ? data.details
          : typeof data?.error === 'string'
            ? data.error
            : 'Errore salvataggio configurazione server'
      )
    }

    return data
  }

  async function handleSaveNames() {
    const data: ConfigData = {
      sindaco1,
      sindaco2,
      lista1,
      lista2,
      consiglieri1: safeStringArray(consiglieri1, 12),
      consiglieri2: safeStringArray(consiglieri2, 12),
      elettoriSezioni: elettoriSezioni.map((v) => Number(v || 0)),
    }

    try {
      localStorage.setItem('config', JSON.stringify(data))
      await saveConfigToServer()
      await loadServerConfig()
      pulseSaved()
    } catch (err) {
      alert(`Salvataggio configurazione server fallito: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleDeleteConfig() {
    const emptyConfig: ConfigData = {
      sindaco1: '',
      sindaco2: '',
      lista1: '',
      lista2: '',
      consiglieri1: [...EMPTY_12],
      consiglieri2: [...EMPTY_12],
      elettoriSezioni: elettoriSezioni.map((v) => Number(v || 0)),
    }

    try {
      localStorage.setItem('config', JSON.stringify(emptyConfig))

      await saveConfigToServer({
        sindaco1: '',
        sindaco2: '',
        lista1: '',
        lista2: '',
        consiglieri1: [...EMPTY_12],
        consiglieri2: [...EMPTY_12],
        consiglieri_lista1: [...EMPTY_12],
        consiglieri_lista2: [...EMPTY_12],
      })

      setSindaco1('')
      setSindaco2('')
      setLista1('')
      setLista2('')
      setConsiglieri1([...EMPTY_12])
      setConsiglieri2([...EMPTY_12])

      setShowDeleteConfig(false)
      pulseSaved()
    } catch (err) {
      alert(`Cancellazione configurazione fallita: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleSaveElectionSettings() {
    const normalizedElettori = elettoriSezioni.map((v) => Number(v || 0))

    try {
      localStorage.setItem(
        'election-settings',
        JSON.stringify({
          totaleSezioni,
          annoElezione,
          plesso1Nome,
          plesso1Sezioni,
          plesso2Nome,
          plesso2Sezioni,
          elettoriSezioni: normalizedElettori,
        })
      )

      syncConfigWithLocalStorage({
        elettoriSezioni: normalizedElettori,
      })

      await saveConfigToServer()
      await loadServerConfig()
      pulseSaved()
    } catch (err) {
      alert(`Salvataggio impostazioni elezione fallito: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleAddUser() {
    if (!newUsername.trim() || !newPassword.trim()) return

    try {
      setUsersError('')

      const currentToken = token || localStorage.getItem('auth_token') || ''
      if (!currentToken) throw new Error('Token mancante. Effettua di nuovo il login.')

      const parsedSezioni = newRole === 'admin' ? [] : parseSezioniInput(newSezioni)

      const res = await fetch(`${API_BASE}/api/utenti`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword.trim(),
          role: newRole,
          sezioni: parsedSezioni,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          typeof data?.details === 'string'
            ? data.details
            : typeof data?.error === 'string'
              ? data.error
              : 'Creazione utente fallita'
        )
      }

      setNewUsername('')
      setNewPassword('')
      setNewRole('operatore')
      setNewSezioni('')

      await loadUsers(currentToken)
      pulseSaved()
    } catch (err) {
      alert(`Creazione utente fallita: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleDeleteUser(id: string) {
    try {
      setUsersError('')

      const currentToken = token || localStorage.getItem('auth_token') || ''
      if (!currentToken) throw new Error('Token mancante. Effettua di nuovo il login.')

      const res = await fetch(`${API_BASE}/api/utenti/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          typeof data?.details === 'string'
            ? data.details
            : typeof data?.error === 'string'
              ? data.error
              : 'Eliminazione utente fallita'
        )
      }

      await loadUsers(currentToken)
      pulseSaved()
    } catch (err) {
      alert(`Eliminazione utente fallita: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleDangerReset() {
    if (dangerText !== 'CANCELLA TUTTO') return

    try {
      setDangerLoading(true)

      const resetKey = process.env.NEXT_PUBLIC_ADMIN_RESET_KEY || ''

      const res = await fetch(`${API_BASE}/api/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-admin-reset-key': resetKey,
        },
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Errore reset database')

      localStorage.removeItem('successful-submissions')

      const total = Number(totaleSezioni || 6)
      for (let i = 1; i <= total; i += 1) {
        localStorage.removeItem(`draft-sezione-${i}`)
      }

      setDangerText('')
      setShowDangerConfirm(false)
      pulseSaved()
    } catch (err) {
      alert(`Reset fallito: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDangerLoading(false)
    }
  }

  const totaleElettoriConfigurati = useMemo(() => {
    return elettoriSezioni.reduce((sum, value) => sum + Number(value || 0), 0)
  }, [elettoriSezioni])

  if (!authChecked || pageLoading) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="text-sm font-bold text-slate-600">
          Caricamento configurazione amministratore...
        </div>
      </div>
    )
  }

  if (pageError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <div className="text-lg font-bold text-red-700">Errore pagina configurazione</div>
        <div className="mt-2 text-sm text-slate-600">{pageError}</div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-2">
          <ConfigMenuButton active={section === 'nomi'} onClick={() => setSection('nomi')} label="Imposta nomi" tone="blue" />
          <ConfigMenuButton active={section === 'login'} onClick={() => setSection('login')} label="Login e permessi" tone="violet" />
          <ConfigMenuButton active={section === 'elezione'} onClick={() => setSection('elezione')} label="Impostazioni elezione" tone="amber" />
          <ConfigMenuButton active={section === 'critica'} onClick={() => setSection('critica')} label="Area critica" tone="red" />
        </div>
      </aside>

      <main className="space-y-4">
        {section === 'nomi' && (
          <>
            <Box title="Sindaci e Liste" color="blue">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Sindaci</div>
                  <div className="space-y-2">
                    <TextInput value={sindaco1} onChange={setSindaco1} placeholder="Nome Sindaco 1" />
                    <TextInput value={sindaco2} onChange={setSindaco2} placeholder="Nome Sindaco 2" />
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Liste</div>
                  <div className="space-y-2">
                    <TextInput value={lista1} onChange={setLista1} placeholder="Nome Lista X" />
                    <TextInput value={lista2} onChange={setLista2} placeholder="Nome Lista Y" />
                  </div>
                </div>
              </div>
            </Box>

            <Box title="Consiglieri Lista X" color="amber">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {consiglieri1.map((value, index) => (
                  <TextInput key={index} value={value} onChange={(v) => updateCons1(index, v)} placeholder={`Cons. ${index + 1}`} />
                ))}
              </div>
            </Box>

            <Box title="Consiglieri Lista Y" color="rose">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {consiglieri2.map((value, index) => (
                  <TextInput key={index} value={value} onChange={(v) => updateCons2(index, v)} placeholder={`Cons. ${index + 1}`} />
                ))}
              </div>
            </Box>

            <div className="grid gap-3 md:grid-cols-2">
              <button onClick={handleSaveNames} className="w-full rounded-xl bg-green-600 py-4 text-lg font-bold text-white shadow-sm hover:bg-green-700">
                Salva configurazione
              </button>

              <button onClick={() => setShowDeleteConfig(true)} className="w-full rounded-xl bg-red-600 py-4 text-lg font-bold text-white shadow-sm hover:bg-red-700">
                Cancella configurazione
              </button>
            </div>
          </>
        )}

        {section === 'login' && (
          <>
            <Box title="Crea utente" color="blue">
              <div className="grid gap-3 md:grid-cols-2">
                <TextInput value={newUsername} onChange={setNewUsername} placeholder="Username" />
                <TextInput value={newPassword} onChange={setNewPassword} placeholder="Password" />
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <SelectInput
                  value={newRole}
                  onChange={(v) => setNewRole(v as 'admin' | 'operatore')}
                  options={[
                    { label: 'Operatore', value: 'operatore' },
                    { label: 'Admin', value: 'admin' },
                  ]}
                />

                <TextInput value={newSezioni} onChange={setNewSezioni} placeholder="Sezioni assegnate es. 1,2,3,4" />

                <button onClick={handleAddUser} className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-violet-700">
                  Aggiungi utente
                </button>
              </div>
            </Box>

            <Box title="Utenti creati" color="amber">
              {usersError && (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  Errore utenti: {usersError}
                </div>
              )}

              {usersLoading ? (
                <div className="text-sm text-slate-500">Caricamento utenti...</div>
              ) : users.length === 0 ? (
                <div className="text-sm text-slate-500">Nessun utente creato</div>
              ) : (
                <div className="space-y-2">
                  {users.map((user) => (
                    <div key={user.id} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-bold text-slate-900">{user.username}</div>
                        <div className="text-sm text-slate-500">
                          Ruolo: {user.role}
                          {user.role === 'operatore'
                            ? ` • Sezioni: ${user.sezioni.length > 0 ? user.sezioni.join(', ') : '-'}`
                            : ' • Accesso completo'}
                        </div>
                      </div>

                      <button onClick={() => handleDeleteUser(user.id)} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">
                        Elimina
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Box>
          </>
        )}

        {section === 'elezione' && (
          <>
            <Box title="Impostazioni generali elezione" color="blue">
              <div className="grid gap-3 md:grid-cols-2">
                <TextInput value={annoElezione} onChange={setAnnoElezione} placeholder="Anno elezione" />
                <TextInput value={totaleSezioni} onChange={setTotaleSezioni} placeholder="Totale sezioni" />
              </div>
            </Box>

            <Box title="Plesso 1" color="amber">
              <div className="grid gap-3 md:grid-cols-2">
                <TextInput value={plesso1Nome} onChange={setPlesso1Nome} placeholder="Nome plesso 1" />
                <TextInput value={plesso1Sezioni} onChange={setPlesso1Sezioni} placeholder="Sezioni plesso 1 es. 1,2,3,4" />
              </div>
            </Box>

            <Box title="Plesso 2" color="rose">
              <div className="grid gap-3 md:grid-cols-2">
                <TextInput value={plesso2Nome} onChange={setPlesso2Nome} placeholder="Nome plesso 2" />
                <TextInput value={plesso2Sezioni} onChange={setPlesso2Sezioni} placeholder="Sezioni plesso 2 es. 5,6" />
              </div>
            </Box>

            <Box title="Elettori per sezione" color="blue">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <NumberInput
                    key={index}
                    value={elettoriSezioni[index] || ''}
                    onChange={(v) => updateElettori(index, v)}
                    placeholder={`Elettori sezione ${index + 1}`}
                    label={`Sezione ${index + 1}`}
                  />
                ))}
              </div>

              <div className="mt-4 rounded-xl bg-slate-50 px-4 py-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Totale elettori configurati</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{totaleElettoriConfigurati}</div>
              </div>
            </Box>

            <button onClick={handleSaveElectionSettings} className="w-full rounded-xl bg-green-600 py-4 text-lg font-bold text-white shadow-sm hover:bg-green-700">
              Salva impostazioni elezione
            </button>
          </>
        )}

        {section === 'critica' && (
          <Box title="Area critica" color="red">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="text-lg font-bold text-red-800">Zona pericolosa</div>
              <p className="mt-2 text-sm text-red-700">
                Qui puoi cancellare tutti i dati test locali e il database live 2026. Usa questo comando solo quando sei sicuro.
              </p>

              <div className="mt-4">
                <button onClick={() => setShowDangerConfirm(true)} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-red-700">
                  Reset completo dati test
                </button>
              </div>
            </div>
          </Box>
        )}
      </main>

      {showSaved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-2xl bg-white px-8 py-7 text-center shadow-2xl">
            <div className="mb-2 text-3xl">✅</div>
            <div className="text-lg font-bold text-slate-800">Operazione salvata</div>
          </div>
        </div>
      )}

      {showDeleteConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="text-xl font-bold text-slate-900">Sei sicuro?</div>
            <p className="mt-2 text-sm text-slate-600">
              Vuoi cancellare tutti i dati della configurazione candidati, liste e consiglieri?
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={() => setShowDeleteConfig(false)} className="rounded-xl bg-slate-200 px-4 py-3 font-bold text-slate-800 hover:bg-slate-300">
                Annulla
              </button>

              <button onClick={handleDeleteConfig} className="rounded-xl bg-red-600 px-4 py-3 font-bold text-white hover:bg-red-700">
                Sì, cancella
              </button>
            </div>
          </div>
        </div>
      )}

      {showDangerConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="text-xl font-bold text-slate-900">Conferma reset completo</div>
            <p className="mt-2 text-sm text-slate-600">
              Per continuare scrivi esattamente:
              <span className="ml-1 font-bold text-red-700">CANCELLA TUTTO</span>
            </p>

            <div className="mt-4">
              <TextInput value={dangerText} onChange={setDangerText} placeholder="Scrivi CANCELLA TUTTO" />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setShowDangerConfirm(false)
                  setDangerText('')
                }}
                className="rounded-xl bg-slate-200 px-4 py-3 font-bold text-slate-800 hover:bg-slate-300"
              >
                Annulla
              </button>

              <button
                onClick={handleDangerReset}
                disabled={dangerText !== 'CANCELLA TUTTO' || dangerLoading}
                className={`rounded-xl px-4 py-3 font-bold text-white ${
                  dangerText !== 'CANCELLA TUTTO' || dangerLoading
                    ? 'cursor-not-allowed bg-slate-400'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {dangerLoading ? 'Reset in corso...' : 'Conferma reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ConfigMenuButton({
  active,
  onClick,
  label,
  tone,
}: {
  active: boolean
  onClick: () => void
  label: string
  tone: 'blue' | 'violet' | 'amber' | 'red'
}) {
  const tones = {
    blue: 'border-blue-500',
    violet: 'border-violet-500',
    amber: 'border-amber-500',
    red: 'border-red-500',
  }

  return (
    <button
      onClick={onClick}
      className={`block w-full rounded-xl border-l-4 px-4 py-3 text-left text-sm font-bold transition ${
        active
          ? `bg-slate-900 text-white ${tones[tone]}`
          : 'border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
    />
  )
}

function NumberInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
      />
    </div>
  )
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { label: string; value: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
    >
      {options.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  )
}

function Box({
  title,
  color,
  children,
}: {
  title: string
  color: 'blue' | 'amber' | 'rose' | 'red'
  children: ReactNode
}) {
  const map = {
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    red: 'bg-red-100 text-red-700',
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`px-4 py-3 font-bold ${map[color]}`}>{title}</div>
      <div className="p-4">{children}</div>
    </div>
  )
}