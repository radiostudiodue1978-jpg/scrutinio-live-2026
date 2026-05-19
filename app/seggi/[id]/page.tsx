'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'

const API_BASE = 'https://diretta-radio-api.francesco-statello88.workers.dev'
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
  consiglieri_lista1?: string[]
  consiglieri_lista2?: string[]
  elettoriSezioni?: number[]
  elettori_sezioni?: number[]
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
  elettori: number | null
  updated_at: string | null
  updated_by: string | null
  is_completed: boolean
  completed_at: string | null
}

type DraftData = {
  votanti: string
  schedeBianche: string
  schedeNulle: string
  sindaco1: string
  sindaco2: string
  lista1: string
  lista2: string
  consiglieriLista1: string[]
  consiglieriLista2: string[]
}

type SendAction =
  | 'affluenza'
  | 'sindaco'
  | 'liste'
  | 'lista1'
  | 'lista2'
  | 'all'
  | 'completa'
  | 'riapri'

type OfflineQueueItem = {
  id: string
  path: string
  payload: Record<string, unknown>
  sectionNumber: number
  createdAt: string
  action: SendAction
}

type TabKey = 'affluenza' | 'sindaco' | 'liste' | 'lista1' | 'lista2'
type StatusType = 'idle' | 'success' | 'error' | 'warning'

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

function safeNumberArray(value: unknown, length = 6) {
  if (!Array.isArray(value)) return Array(length).fill(0)
  return [...value.map((v) => Number(v || 0)), ...Array(length).fill(0)].slice(0, length)
}

function normalizeServerConfig(raw: unknown): ConfigData | null {
  const wrapper = raw as { config?: unknown } | null
  const source = wrapper && typeof wrapper === 'object' && 'config' in wrapper ? wrapper.config : raw

  if (!source || typeof source !== 'object') return null

  const obj = source as Record<string, unknown>

  const consiglieri1 = safeStringArray(obj.consiglieri_lista1 || obj.consiglieri1, 12)
  const consiglieri2 = safeStringArray(obj.consiglieri_lista2 || obj.consiglieri2, 12)
  const elettori = safeNumberArray(obj.elettori_sezioni || obj.elettoriSezioni, 6)

  return {
    sindaco1: safeString(obj.sindaco1),
    sindaco2: safeString(obj.sindaco2),
    lista1: safeString(obj.lista1),
    lista2: safeString(obj.lista2),
    consiglieri1,
    consiglieri2,
    consiglieri_lista1: consiglieri1,
    consiglieri_lista2: consiglieri2,
    elettoriSezioni: elettori,
    elettori_sezioni: elettori,
  }
}

export default function SezionePage() {
  const params = useParams()
  const router = useRouter()
  const rawId = params.id
  const id = Array.isArray(rawId) ? rawId[0] : String(rawId)
  const sectionNumber = Number(id)

  const [session, setSession] = useState<SessionUser | null>(null)
  const [token, setToken] = useState<string>('')
  const [authChecked, setAuthChecked] = useState(false)

  const [config, setConfig] = useState<ConfigData | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('affluenza')

  const [votanti, setVotanti] = useState('')
  const [schedeBianche, setSchedeBianche] = useState('')
  const [schedeNulle, setSchedeNulle] = useState('')
  const [elettoriSezione, setElettoriSezione] = useState<number>(0)

  const [sindaco1, setSindaco1] = useState('')
  const [sindaco2, setSindaco2] = useState('')
  const [lista1, setLista1] = useState('')
  const [lista2, setLista2] = useState('')

  const [consiglieriLista1, setConsiglieriLista1] = useState<string[]>(Array(12).fill(''))
  const [consiglieriLista2, setConsiglieriLista2] = useState<string[]>(Array(12).fill(''))

  const [status, setStatus] = useState<StatusType>('idle')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const [liveRow, setLiveRow] = useState<LiveRow | null>(null)

  const [openSentConsiglieri1, setOpenSentConsiglieri1] = useState(false)
  const [openSentConsiglieri2, setOpenSentConsiglieri2] = useState(false)

  const [showQueueSentModal, setShowQueueSentModal] = useState(false)
  const [queueSentMessage, setQueueSentMessage] = useState('')
  const [offlineQueueCount, setOfflineQueueCount] = useState(0)

  const draftKey = `draft-sezione-${id}`

  useEffect(() => {
    const parsedUser = normalizeSession(localStorage.getItem('session'))
    const savedToken = localStorage.getItem('auth_token') || ''

    if (!parsedUser) {
      localStorage.removeItem('session')
      localStorage.removeItem('auth_token')
      router.replace('/login')
      return
    }

    if (!savedToken) {
      router.replace('/login')
      return
    }

    if (
      parsedUser.role === 'operatore' &&
      (!Number.isFinite(sectionNumber) || !parsedUser.sezioni.includes(sectionNumber))
    ) {
      router.replace('/seggi')
      return
    }

    setSession(parsedUser)
    setToken(savedToken)
    setAuthChecked(true)
  }, [router, sectionNumber])

  useEffect(() => {
    if (!authChecked) return

    loadConfigFromServer()
    loadDraftOnly()
    loadLiveSection()
    setOfflineQueueCount(getOfflineQueue().length)

    const onFocus = () => {
      loadConfigFromServer()
      loadLiveSection()
      processOfflineQueue({ silentSuccess: true })
    }

    window.addEventListener('focus', onFocus)

    const interval = setInterval(() => {
      processOfflineQueue({ silentSuccess: false })
    }, 10000)

    const onlineHandler = () => {
      processOfflineQueue({ silentSuccess: false })
    }

    window.addEventListener('online', onlineHandler)

    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onlineHandler)
      clearInterval(interval)
    }
  }, [authChecked, id])

  useEffect(() => {
    if (!config || !Number.isFinite(sectionNumber)) return

    const elettoriArray =
      Array.isArray(config.elettoriSezioni)
        ? config.elettoriSezioni
        : Array.isArray(config.elettori_sezioni)
          ? config.elettori_sezioni
          : []

    const value = Number(elettoriArray[sectionNumber - 1] || 0)
    setElettoriSezione(value)
  }, [config, sectionNumber])

  useEffect(() => {
    if (!authChecked) return
    saveDraftLocally()
  }, [
    authChecked,
    votanti,
    schedeBianche,
    schedeNulle,
    sindaco1,
    sindaco2,
    lista1,
    lista2,
    consiglieriLista1,
    consiglieriLista2,
  ])

  async function loadConfigFromServer() {
    try {
      const res = await fetch(`${API_BASE}/api/config`, {
        method: 'GET',
        cache: 'no-store',
      })

      const data = await res.json().catch(() => null)
      const normalized = normalizeServerConfig(data)

      if (res.ok && normalized) {
        setConfig(normalized)
        localStorage.setItem('config', JSON.stringify(normalized))
        return
      }

      loadConfigFromLocalStorage()
    } catch {
      loadConfigFromLocalStorage()
    }
  }

  function loadConfigFromLocalStorage() {
    try {
      const savedConfig = localStorage.getItem('config')
      if (!savedConfig) {
        setConfig(null)
        return
      }

      const parsed = JSON.parse(savedConfig)
      const normalized = normalizeServerConfig(parsed)

      setConfig(normalized)
    } catch {
      setConfig(null)
    }
  }

  function emptyDraft(): DraftData {
    return {
      votanti: '',
      schedeBianche: '',
      schedeNulle: '',
      sindaco1: '',
      sindaco2: '',
      lista1: '',
      lista2: '',
      consiglieriLista1: Array(12).fill(''),
      consiglieriLista2: Array(12).fill(''),
    }
  }

  function loadDraftOnly() {
    try {
      const rawDraft = localStorage.getItem(draftKey)
      if (!rawDraft) {
        const draft = emptyDraft()
        setVotanti(draft.votanti)
        setSchedeBianche(draft.schedeBianche)
        setSchedeNulle(draft.schedeNulle)
        setSindaco1(draft.sindaco1)
        setSindaco2(draft.sindaco2)
        setLista1(draft.lista1)
        setLista2(draft.lista2)
        setConsiglieriLista1(draft.consiglieriLista1)
        setConsiglieriLista2(draft.consiglieriLista2)
        return
      }

      const draft = JSON.parse(rawDraft) as Partial<DraftData>

      setVotanti(draft.votanti || '')
      setSchedeBianche(draft.schedeBianche || '')
      setSchedeNulle(draft.schedeNulle || '')
      setSindaco1(draft.sindaco1 || '')
      setSindaco2(draft.sindaco2 || '')
      setLista1(draft.lista1 || '')
      setLista2(draft.lista2 || '')
      setConsiglieriLista1(
        Array.isArray(draft.consiglieriLista1)
          ? [...draft.consiglieriLista1, ...Array(12).fill('')].slice(0, 12)
          : Array(12).fill('')
      )
      setConsiglieriLista2(
        Array.isArray(draft.consiglieriLista2)
          ? [...draft.consiglieriLista2, ...Array(12).fill('')].slice(0, 12)
          : Array(12).fill('')
      )
    } catch {
      const draft = emptyDraft()
      setVotanti(draft.votanti)
      setSchedeBianche(draft.schedeBianche)
      setSchedeNulle(draft.schedeNulle)
      setSindaco1(draft.sindaco1)
      setSindaco2(draft.sindaco2)
      setLista1(draft.lista1)
      setLista2(draft.lista2)
      setConsiglieriLista1(draft.consiglieriLista1)
      setConsiglieriLista2(draft.consiglieriLista2)
    }
  }

  async function loadLiveSection() {
    try {
      const res = await fetch(`${API_BASE}/api/live`, {
        cache: 'no-store',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Errore caricamento live')
      }

      const row = Array.isArray(data)
        ? (data.find((item: LiveRow) => String(item.sezione) === id) ?? null)
        : null

      setLiveRow(row)
      setIsCompleted(Boolean(row?.is_completed))
    } catch {
      setLiveRow(null)
      setIsCompleted(false)
    }
  }

  function saveDraftLocally() {
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          votanti,
          schedeBianche,
          schedeNulle,
          sindaco1,
          sindaco2,
          lista1,
          lista2,
          consiglieriLista1,
          consiglieriLista2,
        })
      )
    } catch {}
  }

  function persistCurrentDraft(next: Partial<DraftData> = {}) {
    try {
      const current: DraftData = {
        votanti,
        schedeBianche,
        schedeNulle,
        sindaco1,
        sindaco2,
        lista1,
        lista2,
        consiglieriLista1,
        consiglieriLista2,
      }

      const merged: DraftData = {
        ...current,
        ...next,
      }

      localStorage.setItem(draftKey, JSON.stringify(merged))
    } catch {}
  }

  function clearDraftLocally() {
    try {
      localStorage.removeItem(draftKey)
    } catch {}
  }

  function applyLocalSuccess(action: SendAction) {
    switch (action) {
      case 'affluenza':
        setVotanti('')
        setSchedeBianche('')
        setSchedeNulle('')
        persistCurrentDraft({
          votanti: '',
          schedeBianche: '',
          schedeNulle: '',
        })
        break

      case 'sindaco':
        setSindaco1('')
        setSindaco2('')
        persistCurrentDraft({
          sindaco1: '',
          sindaco2: '',
        })
        break

      case 'liste':
        setLista1('')
        setLista2('')
        persistCurrentDraft({
          lista1: '',
          lista2: '',
        })
        break

      case 'lista1':
        setConsiglieriLista1(Array(12).fill(''))
        persistCurrentDraft({
          consiglieriLista1: Array(12).fill(''),
        })
        break

      case 'lista2':
        setConsiglieriLista2(Array(12).fill(''))
        persistCurrentDraft({
          consiglieriLista2: Array(12).fill(''),
        })
        break

      case 'all':
        setVotanti('')
        setSchedeBianche('')
        setSchedeNulle('')
        setSindaco1('')
        setSindaco2('')
        setLista1('')
        setLista2('')
        setConsiglieriLista1(Array(12).fill(''))
        setConsiglieriLista2(Array(12).fill(''))
        persistCurrentDraft({
          votanti: '',
          schedeBianche: '',
          schedeNulle: '',
          sindaco1: '',
          sindaco2: '',
          lista1: '',
          lista2: '',
          consiglieriLista1: Array(12).fill(''),
          consiglieriLista2: Array(12).fill(''),
        })
        break

      case 'completa':
      case 'riapri':
      default:
        break
    }
  }

  function clearDraftFields() {
    setVotanti('')
    setSchedeBianche('')
    setSchedeNulle('')
    setSindaco1('')
    setSindaco2('')
    setLista1('')
    setLista2('')
    setConsiglieriLista1(Array(12).fill(''))
    setConsiglieriLista2(Array(12).fill(''))
    clearDraftLocally()
  }

  function setFeedback(type: StatusType, text: string) {
    setStatus(type)
    setMessage(text)

    if (type === 'success' || type === 'warning') {
      setTimeout(() => {
        setStatus('idle')
        setMessage('')
      }, 2600)
    }
  }

  async function postToApi(path: string, payload: Record<string, unknown>) {
    if (!token) {
      throw new Error('Token mancante. Effettua di nuovo il login.')
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
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
            : 'Errore di invio'
      )
    }

    return data
  }

  function getUpdatedBy() {
    return session?.username || 'tablet'
  }

  function isStrictIntegerString(value: string) {
    return /^\d+$/.test(value.trim())
  }

  function validateSingleNumber(value: string, label: string) {
    if (value === '') return null
    if (!isStrictIntegerString(value)) return `${label} non è valido`
    return null
  }

  function validateArrayNumbers(values: string[], listLabel: string) {
    for (let i = 0; i < values.length; i += 1) {
      const value = values[i]
      if (value === '') continue
      if (!isStrictIntegerString(value)) {
        return `${listLabel} - consigliere ${i + 1}: valore non valido`
      }
    }
    return null
  }

  function toNumber(value: string) {
    return Number(value)
  }

  function getEffectiveNumber(localValue: string, liveValue: number | null | undefined) {
    if (localValue !== '') return Number(localValue)
    if (liveValue === null || liveValue === undefined) return null
    return Number(liveValue)
  }

  function isSameScalarDraftLive(draftValue: string, liveValue: number | null | undefined) {
    if (draftValue === '') return true
    if (liveValue === null || liveValue === undefined) return false
    return Number(draftValue) === Number(liveValue)
  }

  function hasPendingConsiglieri(
    draftValues: string[],
    liveValues: Array<number | null> | null | undefined
  ) {
    return draftValues.some((value, index) => {
      if (value === '') return false
      const liveValue = liveValues?.[index]
      if (liveValue === null || liveValue === undefined) return true
      return Number(value) !== Number(liveValue)
    })
  }

  function scrollTopSmooth() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function afterSuccessfulSend(successMessage: string, action: SendAction) {
    applyLocalSuccess(action)
    await loadLiveSection()
    setFeedback('success', successMessage)
    scrollTopSmooth()
  }

  function ensureSectionOpen() {
    if (isCompleted) {
      setFeedback('warning', 'La sezione è chiusa. Riaprila prima di trasmettere nuovi dati.')
      scrollTopSmooth()
      return false
    }
    return true
  }

  function getOfflineQueue(): OfflineQueueItem[] {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function saveOfflineQueue(queue: OfflineQueueItem[]) {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue))
      setOfflineQueueCount(queue.length)
    } catch {}
  }

  function addToOfflineQueue(
    path: string,
    payload: Record<string, unknown>,
    action: SendAction
  ) {
    const queue = getOfflineQueue()

    const item: OfflineQueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      path,
      payload,
      sectionNumber,
      createdAt: new Date().toISOString(),
      action,
    }

    queue.push(item)
    saveOfflineQueue(queue)
  }

  async function processOfflineQueue({
    silentSuccess,
  }: {
    silentSuccess: boolean
  }) {
    const queue = getOfflineQueue()
    if (queue.length === 0) {
      setOfflineQueueCount(0)
      return
    }

    const remaining: OfflineQueueItem[] = []
    let sentCount = 0
    let sentLastSection: number | null = null
    const successfulForCurrentSection: SendAction[] = []

    for (const item of queue) {
      try {
        await postToApi(item.path, item.payload)
        sentCount += 1
        sentLastSection = item.sectionNumber

        if (item.sectionNumber === sectionNumber) {
          successfulForCurrentSection.push(item.action)
        }
      } catch (error) {
        remaining.push(item)
        console.error('Errore replay coda offline:', error)
      }
    }

    saveOfflineQueue(remaining)

    if (sentCount > 0) {
      successfulForCurrentSection.forEach((action) => {
        applyLocalSuccess(action)
      })

      await loadLiveSection()

      if (!silentSuccess) {
        setQueueSentMessage(
          sentLastSection
            ? `Ultimi dati in coda inviati con successo (sezione ${sentLastSection}).`
            : 'Ultimi dati in coda inviati con successo.'
        )
        setShowQueueSentModal(true)
      }
    }
  }

  async function trySendOrQueue(
    path: string,
    payload: Record<string, unknown>,
    successMessage: string,
    action: SendAction
  ) {
    try {
      setIsSending(true)
      await postToApi(path, payload)
      await afterSuccessfulSend(successMessage, action)
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : ''

      const isNetworkLikeError =
        message.includes('failed to fetch') ||
        message.includes('network') ||
        message.includes('timeout') ||
        !navigator.onLine

      if (isNetworkLikeError) {
        addToOfflineQueue(path, payload, action)
        setFeedback(
          'warning',
          'Connessione assente. Dati salvati e in attesa di invio automatico.'
        )
      } else {
        setFeedback(
          'error',
          error instanceof Error ? error.message : 'Errore di invio'
        )
      }

      scrollTopSmooth()
      console.error(error)
    } finally {
      setIsSending(false)
    }
  }

  const effectiveVotanti = useMemo(
    () => getEffectiveNumber(votanti, liveRow?.votanti),
    [votanti, liveRow]
  )

  const effectiveSindaco1 = useMemo(
    () => getEffectiveNumber(sindaco1, liveRow?.sindaco1),
    [sindaco1, liveRow]
  )

  const effectiveSindaco2 = useMemo(
    () => getEffectiveNumber(sindaco2, liveRow?.sindaco2),
    [sindaco2, liveRow]
  )

  const effectiveLista1 = useMemo(
    () => getEffectiveNumber(lista1, liveRow?.lista1),
    [lista1, liveRow]
  )

  const effectiveLista2 = useMemo(
    () => getEffectiveNumber(lista2, liveRow?.lista2),
    [lista2, liveRow]
  )

  const effectiveBianche = useMemo(
    () => getEffectiveNumber(schedeBianche, liveRow?.schede_bianche),
    [schedeBianche, liveRow]
  )

  const effectiveNulle = useMemo(
    () => getEffectiveNumber(schedeNulle, liveRow?.schede_nulle),
    [schedeNulle, liveRow]
  )

  const totaleSindaciEffettivo = useMemo(
    () => (effectiveSindaco1 ?? 0) + (effectiveSindaco2 ?? 0),
    [effectiveSindaco1, effectiveSindaco2]
  )

  const totaleListeEffettivo = useMemo(
    () => (effectiveLista1 ?? 0) + (effectiveLista2 ?? 0),
    [effectiveLista1, effectiveLista2]
  )

  const totaleSchedeEffettivo = useMemo(
    () => totaleSindaciEffettivo + (effectiveBianche ?? 0) + (effectiveNulle ?? 0),
    [totaleSindaciEffettivo, effectiveBianche, effectiveNulle]
  )

  const affluenzaDraft = useMemo(() => {
    if (!elettoriSezione || effectiveVotanti === null) return null
    const value = (effectiveVotanti / elettoriSezione) * 100
    return Number.isFinite(value) ? value.toFixed(2) : null
  }, [effectiveVotanti, elettoriSezione])

  const controlloVerbale = useMemo(() => {
    const hasVotanti = effectiveVotanti !== null
    const hasSindaci = effectiveSindaco1 !== null && effectiveSindaco2 !== null
    const hasBiancheNulle = effectiveBianche !== null && effectiveNulle !== null
    const hasListe = effectiveLista1 !== null && effectiveLista2 !== null

    const controlloVotantiOk =
      hasVotanti && hasSindaci && hasBiancheNulle
        ? totaleSchedeEffettivo === effectiveVotanti
        : null

    const controlloListeOk =
      hasSindaci && hasListe
        ? totaleListeEffettivo === totaleSindaciEffettivo
        : null

    return {
      votantiNum: effectiveVotanti,
      totaleSindaci: totaleSindaciEffettivo,
      totaleListe: totaleListeEffettivo,
      totaleSchede: totaleSchedeEffettivo,
      controlloVotantiOk,
      controlloListeOk,
    }
  }, [
    effectiveVotanti,
    effectiveSindaco1,
    effectiveSindaco2,
    effectiveBianche,
    effectiveNulle,
    effectiveLista1,
    effectiveLista2,
    totaleSindaciEffettivo,
    totaleListeEffettivo,
    totaleSchedeEffettivo,
  ])

  function validateVotantiRequired() {
    if (effectiveVotanti === null) {
      return 'Trasmetti prima i votanti della sezione'
    }
    return null
  }

  function validateAffluenzaBlock() {
    const errVotanti = validateSingleNumber(votanti, 'Votanti')
    const errBianche = validateSingleNumber(schedeBianche, 'Schede bianche')
    const errNulle = validateSingleNumber(schedeNulle, 'Schede nulle')

    if (errVotanti || errBianche || errNulle) {
      return errVotanti || errBianche || errNulle || 'Valore non valido'
    }

    if (votanti !== '' && elettoriSezione > 0 && Number(votanti) > elettoriSezione) {
      return `I votanti non possono superare gli elettori della sezione (${elettoriSezione})`
    }

    if (effectiveVotanti !== null && totaleSchedeEffettivo > effectiveVotanti) {
      return 'Sindaci + bianche + nulle non possono superare i votanti'
    }

    return null
  }

  function validateSindacoBlock() {
    const err1 = validateSingleNumber(sindaco1, config?.sindaco1 || 'Sindaco 1')
    const err2 = validateSingleNumber(sindaco2, config?.sindaco2 || 'Sindaco 2')

    if (err1 || err2) {
      return err1 || err2 || 'Valore non valido'
    }

    const errVotanti = validateVotantiRequired()
    if (errVotanti) return errVotanti

    if (effectiveVotanti !== null && totaleSindaciEffettivo > effectiveVotanti) {
      return 'Il totale voti sindaco non può superare i votanti'
    }

    if (effectiveVotanti !== null && totaleSchedeEffettivo > effectiveVotanti) {
      return 'Sindaci + bianche + nulle non possono superare i votanti'
    }

    return null
  }

  function validateListeBlock() {
    const err1 = validateSingleNumber(lista1, config?.lista1 || 'Lista X')
    const err2 = validateSingleNumber(lista2, config?.lista2 || 'Lista Y')

    if (err1 || err2) {
      return err1 || err2 || 'Valore non valido'
    }

    const errVotanti = validateVotantiRequired()
    if (errVotanti) return errVotanti

    if (effectiveVotanti !== null && totaleListeEffettivo > effectiveVotanti) {
      return 'Il totale liste non può superare i votanti'
    }

    return null
  }

  async function transmitAffluenza() {
    if (!ensureSectionOpen()) return

    if (votanti === '' && schedeBianche === '' && schedeNulle === '') {
      setFeedback('error', 'Inserisci almeno votanti, bianche o nulle')
      scrollTopSmooth()
      return
    }

    const validationError = validateAffluenzaBlock()
    if (validationError) {
      setFeedback('error', validationError)
      scrollTopSmooth()
      return
    }

    const payload: Record<string, unknown> = {
      sezione: sectionNumber,
      updated_by: getUpdatedBy(),
    }

    if (votanti !== '') payload.votanti = toNumber(votanti)
    if (schedeBianche !== '') payload.schede_bianche = toNumber(schedeBianche)
    if (schedeNulle !== '') payload.schede_nulle = toNumber(schedeNulle)
    if (elettoriSezione > 0) payload.elettori = elettoriSezione

    await trySendOrQueue('/api/invia', payload, 'Dati affluenza trasmessi', 'affluenza')
  }

  async function transmitSindaco() {
    if (!ensureSectionOpen()) return

    const hasSindaco1 = sindaco1 !== ''
    const hasSindaco2 = sindaco2 !== ''

    if (!hasSindaco1 && !hasSindaco2) {
      setFeedback('error', 'Inserisci almeno un dato sindaco')
      scrollTopSmooth()
      return
    }

    const validationError = validateSindacoBlock()
    if (validationError) {
      setFeedback('error', validationError)
      scrollTopSmooth()
      return
    }

    const payload: Record<string, unknown> = {
      sezione: sectionNumber,
      updated_by: getUpdatedBy(),
    }

    if (hasSindaco1) payload.sindaco1 = toNumber(sindaco1)
    if (hasSindaco2) payload.sindaco2 = toNumber(sindaco2)

    await trySendOrQueue('/api/invia', payload, 'Dati sindaco trasmessi', 'sindaco')
  }

  async function transmitListe() {
    if (!ensureSectionOpen()) return

    const hasLista1 = lista1 !== ''
    const hasLista2 = lista2 !== ''

    if (!hasLista1 && !hasLista2) {
      setFeedback('error', 'Inserisci almeno un dato lista')
      scrollTopSmooth()
      return
    }

    const validationError = validateListeBlock()
    if (validationError) {
      setFeedback('error', validationError)
      scrollTopSmooth()
      return
    }

    const payload: Record<string, unknown> = {
      sezione: sectionNumber,
      updated_by: getUpdatedBy(),
    }

    if (hasLista1) payload.lista1 = toNumber(lista1)
    if (hasLista2) payload.lista2 = toNumber(lista2)

    await trySendOrQueue('/api/invia', payload, 'Dati liste trasmessi', 'liste')
  }

  async function transmitConsiglieriLista1() {
    if (!ensureSectionOpen()) return

    const filled = consiglieriLista1.some((value) => value !== '')
    if (!filled) {
      setFeedback('error', 'Inserisci almeno un consigliere')
      scrollTopSmooth()
      return
    }

    const err = validateArrayNumbers(consiglieriLista1, config?.lista1 || 'Lista X')
    if (err) {
      setFeedback('error', err)
      scrollTopSmooth()
      return
    }

    const payload = {
      sezione: sectionNumber,
      updated_by: getUpdatedBy(),
      consiglieri_lista1: consiglieriLista1.map((value) =>
        value === '' ? null : toNumber(value)
      ),
    }

    await trySendOrQueue(
      '/api/invia',
      payload,
      `Consiglieri ${config?.lista1 || 'Lista X'} trasmessi`,
      'lista1'
    )
  }

  async function transmitConsiglieriLista2() {
    if (!ensureSectionOpen()) return

    const filled = consiglieriLista2.some((value) => value !== '')
    if (!filled) {
      setFeedback('error', 'Inserisci almeno un consigliere')
      scrollTopSmooth()
      return
    }

    const err = validateArrayNumbers(consiglieriLista2, config?.lista2 || 'Lista Y')
    if (err) {
      setFeedback('error', err)
      scrollTopSmooth()
      return
    }

    const payload = {
      sezione: sectionNumber,
      updated_by: getUpdatedBy(),
      consiglieri_lista2: consiglieriLista2.map((value) =>
        value === '' ? null : toNumber(value)
      ),
    }

    await trySendOrQueue(
      '/api/invia',
      payload,
      `Consiglieri ${config?.lista2 || 'Lista Y'} trasmessi`,
      'lista2'
    )
  }

  async function transmitAll() {
    if (!ensureSectionOpen()) return

    const hasVotanti = votanti !== ''
    const hasBianche = schedeBianche !== ''
    const hasNulle = schedeNulle !== ''

    const hasSindaco1 = sindaco1 !== ''
    const hasSindaco2 = sindaco2 !== ''
    const hasLista1 = lista1 !== ''
    const hasLista2 = lista2 !== ''
    const hasCons1 = consiglieriLista1.some((v) => v !== '')
    const hasCons2 = consiglieriLista2.some((v) => v !== '')

    if (
      !hasVotanti &&
      !hasBianche &&
      !hasNulle &&
      !hasSindaco1 &&
      !hasSindaco2 &&
      !hasLista1 &&
      !hasLista2 &&
      !hasCons1 &&
      !hasCons2
    ) {
      setFeedback('error', 'Nessun dato da trasmettere')
      scrollTopSmooth()
      return
    }

    const singleErrors = [
      validateSingleNumber(votanti, 'Votanti'),
      validateSingleNumber(schedeBianche, 'Schede bianche'),
      validateSingleNumber(schedeNulle, 'Schede nulle'),
      validateSingleNumber(sindaco1, config?.sindaco1 || 'Sindaco 1'),
      validateSingleNumber(sindaco2, config?.sindaco2 || 'Sindaco 2'),
      validateSingleNumber(lista1, config?.lista1 || 'Lista X'),
      validateSingleNumber(lista2, config?.lista2 || 'Lista Y'),
      validateArrayNumbers(consiglieriLista1, config?.lista1 || 'Lista X'),
      validateArrayNumbers(consiglieriLista2, config?.lista2 || 'Lista Y'),
    ].filter(Boolean)

    if (singleErrors.length > 0) {
      setFeedback('error', String(singleErrors[0]))
      scrollTopSmooth()
      return
    }

    const validationErrorAffluenza = validateAffluenzaBlock()
    if (validationErrorAffluenza) {
      setFeedback('error', validationErrorAffluenza)
      scrollTopSmooth()
      return
    }

    const wantsSindaci = hasSindaco1 || hasSindaco2
    const wantsListe = hasLista1 || hasLista2

    if (wantsSindaci) {
      const validationErrorSindaco = validateSindacoBlock()
      if (validationErrorSindaco) {
        setFeedback('error', validationErrorSindaco)
        scrollTopSmooth()
        return
      }
    }

    if (wantsListe) {
      const validationErrorListe = validateListeBlock()
      if (validationErrorListe) {
        setFeedback('error', validationErrorListe)
        scrollTopSmooth()
        return
      }
    }

    const payload: Record<string, unknown> = {
      sezione: sectionNumber,
      updated_by: getUpdatedBy(),
    }

    if (hasVotanti) payload.votanti = toNumber(votanti)
    if (hasBianche) payload.schede_bianche = toNumber(schedeBianche)
    if (hasNulle) payload.schede_nulle = toNumber(schedeNulle)
    if (elettoriSezione > 0) payload.elettori = elettoriSezione

    if (hasSindaco1) payload.sindaco1 = toNumber(sindaco1)
    if (hasSindaco2) payload.sindaco2 = toNumber(sindaco2)
    if (hasLista1) payload.lista1 = toNumber(lista1)
    if (hasLista2) payload.lista2 = toNumber(lista2)

    if (hasCons1) {
      payload.consiglieri_lista1 = consiglieriLista1.map((value) =>
        value === '' ? null : toNumber(value)
      )
    }

    if (hasCons2) {
      payload.consiglieri_lista2 = consiglieriLista2.map((value) =>
        value === '' ? null : toNumber(value)
      )
    }

    await trySendOrQueue('/api/invia', payload, 'Sezione trasmessa', 'all')
  }

  async function completeSection() {
    if (isCompleted) {
      setFeedback('warning', 'La sezione risulta già chiusa')
      scrollTopSmooth()
      return
    }

    const confirmClose = window.confirm(
      `Confermi di segnare la sezione ${id} come completa e chiusa?`
    )
    if (!confirmClose) return

    try {
      setIsSending(true)
      await postToApi('/api/completa', {
        sezione: sectionNumber,
      })
      await loadLiveSection()
      setFeedback('success', 'Sezione segnata come completa')
      scrollTopSmooth()
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : ''

      const isNetworkLikeError =
        message.includes('failed to fetch') ||
        message.includes('network') ||
        message.includes('timeout') ||
        !navigator.onLine

      if (isNetworkLikeError) {
        addToOfflineQueue(
          '/api/completa',
          {
            sezione: sectionNumber,
          },
          'completa'
        )
        setFeedback(
          'warning',
          'Connessione assente. Chiusura sezione salvata e in attesa di invio automatico.'
        )
      } else {
        setFeedback(
          'error',
          error instanceof Error ? error.message : 'Errore chiusura sezione'
        )
      }

      scrollTopSmooth()
      console.error(error)
    } finally {
      setIsSending(false)
    }
  }

  async function reopenSection() {
    const confirmOpen = window.confirm(`Vuoi riaprire la sezione ${id}?`)
    if (!confirmOpen) return

    try {
      setIsSending(true)
      await postToApi('/api/riapri', {
        sezione: sectionNumber,
      })
      await loadLiveSection()
      setFeedback('success', 'Sezione riaperta')
      scrollTopSmooth()
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : ''

      const isNetworkLikeError =
        message.includes('failed to fetch') ||
        message.includes('network') ||
        message.includes('timeout') ||
        !navigator.onLine

      if (isNetworkLikeError) {
        addToOfflineQueue(
          '/api/riapri',
          {
            sezione: sectionNumber,
          },
          'riapri'
        )
        setFeedback(
          'warning',
          'Connessione assente. Riapertura sezione salvata e in attesa di invio automatico.'
        )
      } else {
        setFeedback(
          'error',
          error instanceof Error ? error.message : 'Errore riapertura sezione'
        )
      }

      scrollTopSmooth()
      console.error(error)
    } finally {
      setIsSending(false)
    }
  }

  const affluenzaLive = useMemo(() => {
    const elettori = Number(liveRow?.elettori || elettoriSezione || 0)
    const votantiLive = Number(liveRow?.votanti ?? 0)
    if (liveRow?.votanti === null || liveRow?.votanti === undefined) return null
    if (elettori <= 0) return null
    return ((votantiLive / elettori) * 100).toFixed(2)
  }, [liveRow, elettoriSezione])

  const statusClasses =
    status === 'success'
      ? 'border-green-200 bg-green-50 text-green-800'
      : status === 'error'
        ? 'border-red-200 bg-red-50 text-red-800'
        : status === 'warning'
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-slate-200 bg-slate-50 text-slate-700'

  const statusIcon =
    status === 'success' ? '✓' : status === 'error' ? '!' : status === 'warning' ? '⚠' : 'i'

  const statusTitle =
    status === 'success'
      ? 'Operazione completata'
      : status === 'error'
        ? 'Controlla i dati'
        : status === 'warning'
          ? 'Attenzione'
          : 'Stato sezione'

  const sectionBadge = useMemo(() => {
    if (isCompleted) {
      return {
        text: 'Chiusa / completa',
        className: 'rounded-xl bg-green-100 text-green-700 ring-1 ring-green-200',
      }
    }

    return {
      text: 'Aperta / in lavorazione',
      className: 'rounded-xl bg-amber-100 text-amber-700 ring-1 ring-amber-200',
    }
  }, [isCompleted])

  const transmittedSummary = useMemo(() => {
    if (!liveRow) return null

    const hasCons1 =
      Array.isArray(liveRow.consiglieri_lista1) &&
      liveRow.consiglieri_lista1.some((v) => v !== null && v !== 0)

    const hasCons2 =
      Array.isArray(liveRow.consiglieri_lista2) &&
      liveRow.consiglieri_lista2.some((v) => v !== null && v !== 0)

    const hasAnything =
      liveRow.votanti !== null ||
      liveRow.schede_bianche !== null ||
      liveRow.schede_nulle !== null ||
      liveRow.sindaco1 !== null ||
      liveRow.sindaco2 !== null ||
      liveRow.lista1 !== null ||
      liveRow.lista2 !== null ||
      hasCons1 ||
      hasCons2

    if (!hasAnything) return null

    return {
      votanti: liveRow.votanti,
      elettori: liveRow.elettori ?? elettoriSezione ?? null,
      schedeBianche: liveRow.schede_bianche,
      schedeNulle: liveRow.schede_nulle,
      affluenza: affluenzaLive,
      sindaco1: liveRow.sindaco1,
      sindaco2: liveRow.sindaco2,
      lista1: liveRow.lista1,
      lista2: liveRow.lista2,
      consiglieri1: liveRow.consiglieri_lista1,
      consiglieri2: liveRow.consiglieri_lista2,
      updatedAt: liveRow.updated_at,
      updatedBy: liveRow.updated_by,
    }
  }, [liveRow, elettoriSezione, affluenzaLive])

  const localDraftSummary = useMemo(() => {
    const pendingVotanti = !isSameScalarDraftLive(votanti, liveRow?.votanti)
    const pendingSchedeBianche = !isSameScalarDraftLive(schedeBianche, liveRow?.schede_bianche)
    const pendingSchedeNulle = !isSameScalarDraftLive(schedeNulle, liveRow?.schede_nulle)
    const pendingSindaco1 = !isSameScalarDraftLive(sindaco1, liveRow?.sindaco1)
    const pendingSindaco2 = !isSameScalarDraftLive(sindaco2, liveRow?.sindaco2)
    const pendingLista1 = !isSameScalarDraftLive(lista1, liveRow?.lista1)
    const pendingLista2 = !isSameScalarDraftLive(lista2, liveRow?.lista2)

    const pendingCons1 = hasPendingConsiglieri(consiglieriLista1, liveRow?.consiglieri_lista1)
    const pendingCons2 = hasPendingConsiglieri(consiglieriLista2, liveRow?.consiglieri_lista2)

    const hasAnything =
      pendingVotanti ||
      pendingSchedeBianche ||
      pendingSchedeNulle ||
      pendingSindaco1 ||
      pendingSindaco2 ||
      pendingLista1 ||
      pendingLista2 ||
      pendingCons1 ||
      pendingCons2

    if (!hasAnything) return null

    return {
      votanti: pendingVotanti ? votanti : '',
      elettori: pendingVotanti && elettoriSezione > 0 ? String(elettoriSezione) : null,
      schedeBianche: pendingSchedeBianche ? schedeBianche : '',
      schedeNulle: pendingSchedeNulle ? schedeNulle : '',
      affluenza:
        pendingVotanti && votanti !== '' && elettoriSezione > 0
          ? ((Number(votanti) / elettoriSezione) * 100).toFixed(2)
          : null,
      sindaco1: pendingSindaco1 ? sindaco1 : '',
      sindaco2: pendingSindaco2 ? sindaco2 : '',
      lista1: pendingLista1 ? lista1 : '',
      lista2: pendingLista2 ? lista2 : '',
      consiglieri1: pendingCons1 ? consiglieriLista1 : Array(12).fill(''),
      consiglieri2: pendingCons2 ? consiglieriLista2 : Array(12).fill(''),
    }
  }, [
    votanti,
    schedeBianche,
    schedeNulle,
    sindaco1,
    sindaco2,
    lista1,
    lista2,
    consiglieriLista1,
    consiglieriLista2,
    elettoriSezione,
    liveRow,
  ])

  const inputsDisabled = isSending || isCompleted

  if (!authChecked) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="text-sm font-bold text-slate-600">Controllo accessi...</div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-4 ${statusClasses}`}>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-base font-bold shadow-sm">
            {statusIcon}
          </div>

          <div className="min-w-0">
            <div className="text-sm font-bold">{statusTitle}</div>
            <div className="mt-0.5 text-sm">
              {message ||
                (isCompleted
                  ? 'La sezione risulta chiusa. Puoi riaprirla se è stata chiusa per errore.'
                  : 'Inserisci i dati comunicati dal presidente e trasmetti quando sono corretti.')}
            </div>
          </div>
        </div>
      </div>

      {offlineQueueCount > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          Dati in coda offline: {offlineQueueCount}. Verranno inviati automaticamente appena torna la connessione.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="text-sm font-medium text-slate-500">Sezione</div>
        <div className="text-3xl font-bold text-slate-900">{id}</div>
        <div className={`px-3 py-2 text-xs font-bold ${sectionBadge.className}`}>
          {sectionBadge.text}
        </div>
        <div className="ml-auto text-right text-xs text-slate-500">
          <div>
            Utente: <span className="font-bold text-slate-700">{session.username}</span>
          </div>
          <div>
            Ruolo: <span className="font-bold text-slate-700">{session.role}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-blue-900">Bozza locale</h2>
            <span className="rounded-xl bg-white px-3 py-1 text-xs font-bold text-blue-800 ring-1 ring-blue-200">
              Non ancora trasmessa
            </span>
          </div>

          {!localDraftSummary ? (
            <div className="text-sm text-blue-800/80">Nessuna bozza presente.</div>
          ) : (
            <div className="space-y-4">
              <SummaryBox
                title="Affluenza"
                rows={[
                  { label: 'Elettori', value: localDraftSummary.elettori },
                  { label: 'Votanti', value: localDraftSummary.votanti || null },
                  { label: 'Schede bianche', value: localDraftSummary.schedeBianche || null },
                  { label: 'Schede nulle', value: localDraftSummary.schedeNulle || null },
                  { label: 'Affluenza %', value: localDraftSummary.affluenza || null },
                ]}
                stringMode
              />

              <SummaryBox
                title="Sindaco"
                rows={[
                  { label: config?.sindaco1 || 'Sindaco 1', value: localDraftSummary.sindaco1 || null },
                  { label: config?.sindaco2 || 'Sindaco 2', value: localDraftSummary.sindaco2 || null },
                ]}
                stringMode
              />

              <SummaryBox
                title="Liste"
                rows={[
                  { label: config?.lista1 || 'Lista X', value: localDraftSummary.lista1 || null },
                  { label: config?.lista2 || 'Lista Y', value: localDraftSummary.lista2 || null },
                ]}
                stringMode
              />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">Dati già trasmessi</h2>
            <span className="rounded-xl bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
              Stato salvato su live
            </span>
          </div>

          {!transmittedSummary ? (
            <div className="text-sm text-slate-500">Nessun dato ancora trasmesso.</div>
          ) : (
            <div className="space-y-4">
              <div className="text-xs font-semibold text-slate-500">
                {transmittedSummary.updatedAt
                  ? `Ultimo invio: ${new Date(transmittedSummary.updatedAt).toLocaleTimeString('it-IT', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}`
                  : '-'}
                {transmittedSummary.updatedBy ? ` • da ${transmittedSummary.updatedBy}` : ''}
              </div>

              <SummaryBox
                title="Affluenza"
                rows={[
                  { label: 'Elettori', value: transmittedSummary.elettori },
                  { label: 'Votanti', value: transmittedSummary.votanti },
                  { label: 'Schede bianche', value: transmittedSummary.schedeBianche },
                  { label: 'Schede nulle', value: transmittedSummary.schedeNulle },
                  { label: 'Affluenza %', value: transmittedSummary.affluenza },
                ]}
                stringMode
              />

              <SummaryBox
                title="Sindaco"
                rows={[
                  { label: config?.sindaco1 || 'Sindaco 1', value: transmittedSummary.sindaco1 },
                  { label: config?.sindaco2 || 'Sindaco 2', value: transmittedSummary.sindaco2 },
                ]}
              />

              <SummaryBox
                title="Liste"
                rows={[
                  { label: config?.lista1 || 'Lista X', value: transmittedSummary.lista1 },
                  { label: config?.lista2 || 'Lista Y', value: transmittedSummary.lista2 },
                ]}
              />
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <TabButton active={activeTab === 'affluenza'} onClick={() => setActiveTab('affluenza')} label="Affluenza" />
        <TabButton active={activeTab === 'sindaco'} onClick={() => setActiveTab('sindaco')} label="Sindaco" />
        <TabButton active={activeTab === 'liste'} onClick={() => setActiveTab('liste')} label="Liste" />
        <TabButton active={activeTab === 'lista1'} onClick={() => setActiveTab('lista1')} label={config?.lista1 || 'Lista X'} />
        <TabButton active={activeTab === 'lista2'} onClick={() => setActiveTab('lista2')} label={config?.lista2 || 'Lista Y'} />
      </div>

      {activeTab === 'affluenza' && (
        <Card title="Affluenza" action={<SmallTransmitButton onClick={transmitAffluenza} disabled={inputsDisabled} />}>
          <div className="grid gap-3 md:grid-cols-2">
            <ReadOnlyInput label="Elettori sezione" value={elettoriSezione > 0 ? String(elettoriSezione) : 'Non configurati'} />
            <NumberInput label="Votanti" value={votanti} onChange={setVotanti} disabled={inputsDisabled} />
            <NumberInput label="Schede bianche" value={schedeBianche} onChange={setSchedeBianche} disabled={inputsDisabled} />
            <NumberInput label="Schede nulle" value={schedeNulle} onChange={setSchedeNulle} disabled={inputsDisabled} />
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 text-sm font-bold text-slate-800">Controllo verbale</div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MiniInfoCard label="Votanti dichiarati" value={controlloVerbale.votantiNum !== null ? String(controlloVerbale.votantiNum) : '-'} />
              <MiniInfoCard label="Totale voti sindaci" value={String(controlloVerbale.totaleSindaci)} />
              <MiniInfoCard label="Schede totali" value={String(controlloVerbale.totaleSchede)} />
              <MiniInfoCard label="Affluenza %" value={affluenzaDraft ? `${affluenzaDraft}%` : '-'} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <ControlResult
                label="Controllo votanti"
                ok={controlloVerbale.controlloVotantiOk}
                okText="OK: sindaci + bianche + nulle = votanti"
                errorText="Errore: sindaci + bianche + nulle NON coincide con i votanti"
                idleText="Inserisci o trasmetti votanti, sindaci, bianche e nulle"
              />

              <ControlResult
                label="Controllo liste"
                ok={controlloVerbale.controlloListeOk}
                okText="OK: liste = totale voti sindaci"
                errorText="Errore: totale liste NON coincide con totale voti sindaci"
                idleText="Inserisci o trasmetti sindaci e liste"
              />
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'sindaco' && (
        <Card title="Sindaco" action={<SmallTransmitButton onClick={transmitSindaco} disabled={inputsDisabled} />}>
          <div className="grid gap-3 md:grid-cols-2">
            <NumberInput label={config?.sindaco1 || 'Sindaco 1'} value={sindaco1} onChange={setSindaco1} disabled={inputsDisabled} />
            <NumberInput label={config?.sindaco2 || 'Sindaco 2'} value={sindaco2} onChange={setSindaco2} disabled={inputsDisabled} />
          </div>
        </Card>
      )}

      {activeTab === 'liste' && (
        <Card title="Liste" action={<SmallTransmitButton onClick={transmitListe} disabled={inputsDisabled} />}>
          <div className="grid gap-3 md:grid-cols-2">
            <NumberInput label={config?.lista1 || 'Lista X'} value={lista1} onChange={setLista1} disabled={inputsDisabled} />
            <NumberInput label={config?.lista2 || 'Lista Y'} value={lista2} onChange={setLista2} disabled={inputsDisabled} />
          </div>
        </Card>
      )}

      {activeTab === 'lista1' && (
        <Card title={config?.lista1 || 'Consiglieri Lista X'} action={<SmallTransmitButton onClick={transmitConsiglieriLista1} disabled={inputsDisabled} />}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {consiglieriLista1.map((value, index) => (
              <NumberInput
                key={index}
                label={config?.consiglieri1?.[index] || `Cons. ${index + 1}`}
                value={value}
                onChange={(newValue) => {
                  const copy = [...consiglieriLista1]
                  copy[index] = newValue
                  setConsiglieriLista1(copy)
                }}
                disabled={inputsDisabled}
              />
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'lista2' && (
        <Card title={config?.lista2 || 'Consiglieri Lista Y'} action={<SmallTransmitButton onClick={transmitConsiglieriLista2} disabled={inputsDisabled} />}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {consiglieriLista2.map((value, index) => (
              <NumberInput
                key={index}
                label={config?.consiglieri2?.[index] || `Cons. ${index + 1}`}
                value={value}
                onChange={(newValue) => {
                  const copy = [...consiglieriLista2]
                  copy[index] = newValue
                  setConsiglieriLista2(copy)
                }}
                disabled={inputsDisabled}
              />
            ))}
          </div>
        </Card>
      )}

      {transmittedSummary && (
        <div className="grid gap-4 md:grid-cols-2">
          <SentConsiglieriBox
            title={config?.lista1 || 'Consiglieri Lista X'}
            labels={config?.consiglieri1 || Array.from({ length: 12 }, (_, i) => `Cons. ${i + 1}`)}
            values={transmittedSummary.consiglieri1}
            isOpen={openSentConsiglieri1}
            onToggle={() => setOpenSentConsiglieri1((prev) => !prev)}
          />

          <SentConsiglieriBox
            title={config?.lista2 || 'Consiglieri Lista Y'}
            labels={config?.consiglieri2 || Array.from({ length: 12 }, (_, i) => `Cons. ${i + 1}`)}
            values={transmittedSummary.consiglieri2}
            isOpen={openSentConsiglieri2}
            onToggle={() => setOpenSentConsiglieri2((prev) => !prev)}
          />
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {isCompleted ? (
          <button
            onClick={reopenSection}
            disabled={isSending}
            className={`rounded-xl px-8 py-3 text-base font-bold text-white ${
              isSending ? 'cursor-not-allowed bg-slate-400' : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            Riapri sezione
          </button>
        ) : (
          <button
            onClick={completeSection}
            disabled={isSending}
            className={`rounded-xl px-8 py-3 text-base font-bold text-white ${
              isSending ? 'cursor-not-allowed bg-slate-400' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            Segna sezione completa
          </button>
        )}

        <button
          onClick={transmitAll}
          disabled={inputsDisabled}
          className={`rounded-xl px-8 py-3 text-base font-bold text-white ${
            inputsDisabled ? 'cursor-not-allowed bg-slate-400' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {isSending ? 'Invio in corso...' : 'Trasmetti sezione completa'}
        </button>

        <button
          onClick={clearDraftFields}
          disabled={isSending}
          className={`rounded-xl px-8 py-3 text-base font-bold ${
            isSending
              ? 'cursor-not-allowed bg-slate-200 text-slate-400'
              : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
          }`}
        >
          Svuota bozza locale
        </button>
      </div>

      {showQueueSentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-2 text-2xl">✅</div>
            <div className="text-lg font-bold text-slate-900">Invio automatico completato</div>
            <div className="mt-2 text-sm text-slate-600">{queueSentMessage}</div>

            <div className="mt-5">
              <button
                onClick={() => setShowQueueSentModal(false)}
                className="w-full rounded-xl bg-green-600 px-4 py-3 font-bold text-white hover:bg-green-700"
              >
                OK operatore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-3 text-sm font-bold transition ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
      }`}
    >
      {label}
    </button>
  )
}

function Card({
  title,
  action,
  children,
}: {
  title: string
  action: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function SmallTransmitButton({
  onClick,
  disabled = false,
}: {
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2 text-sm font-bold text-white ${
        disabled ? 'cursor-not-allowed bg-slate-400' : 'bg-violet-600 hover:bg-violet-700'
      }`}
    >
      Trasmetti
    </button>
  )
}

function NumberInput({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^\d]/g, '')
          onChange(cleaned)
        }}
        placeholder=""
        className={`w-full rounded-xl border px-4 py-3 text-lg outline-none ${
          disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
            : 'border-slate-300 bg-white focus:border-blue-500'
        }`}
      />
    </div>
  )
}

function ReadOnlyInput({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
      <div className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-lg text-slate-700">
        {value}
      </div>
    </div>
  )
}

function MiniInfoCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
    </div>
  )
}

function ControlResult({
  label,
  ok,
  okText,
  errorText,
  idleText,
}: {
  label: string
  ok: boolean | null
  okText: string
  errorText: string
  idleText: string
}) {
  const className =
    ok === true
      ? 'border-green-200 bg-green-50 text-green-800'
      : ok === false
        ? 'border-red-200 bg-red-50 text-red-800'
        : 'border-slate-200 bg-slate-50 text-slate-700'

  const title = ok === true ? 'OK' : ok === false ? 'Errore' : 'In attesa dati'
  const text = ok === true ? okText : ok === false ? errorText : idleText

  return (
    <div className={`rounded-xl border px-4 py-3 ${className}`}>
      <div className="text-xs font-bold uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-sm font-bold">{title}</div>
      <div className="mt-1 text-sm">{text}</div>
    </div>
  )
}

function SummaryBox({
  title,
  rows,
  stringMode = false,
}: {
  title: string
  rows: { label: string; value: number | string | null }[]
  stringMode?: boolean
}) {
  const visible = rows.filter((row) => {
    if (stringMode) return row.value !== null && row.value !== ''
    return row.value !== null
  })

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="mb-3 text-sm font-bold text-slate-800">{title}</div>
      {visible.length === 0 ? (
        <div className="text-sm text-slate-500">Nessun dato disponibile</div>
      ) : (
        <div className="space-y-2">
          {visible.map((row, index) => (
            <div key={index} className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
              <span className="text-sm font-medium text-slate-700">{row.label}</span>
              <span className="text-base font-bold text-slate-900">{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SentConsiglieriBox({
  title,
  labels,
  values,
  isOpen,
  onToggle,
}: {
  title: string
  labels: string[]
  values: Array<number | null> | null | undefined
  isOpen: boolean
  onToggle: () => void
}) {
  const rows = (values || [])
    .map((value, index) => ({
      label: labels[index] || `Cons. ${index + 1}`,
      value,
    }))
    .filter((row) => row.value !== null && row.value !== 0)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-slate-800">{title}</div>
          <div className="text-xs text-slate-500">
            {rows.length > 0 ? `${rows.length} nominativi trasmessi` : 'Nessun dato trasmesso'}
          </div>
        </div>

        <button
          onClick={onToggle}
          className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-200"
        >
          {isOpen ? '▲ Chiudi' : '▼ Apri'}
        </button>
      </div>

      {isOpen && (
        <div className="mt-3 space-y-2">
          {rows.length === 0 ? (
            <div className="text-sm text-slate-500">Nessun dato trasmesso</div>
          ) : (
            rows.map((row, index) => (
              <div key={index} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <span className="text-sm font-medium text-slate-700">{row.label}</span>
                <span className="text-base font-bold text-slate-900">{row.value}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}