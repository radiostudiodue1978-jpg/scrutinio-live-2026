'use client'

import { useEffect, useMemo, useState } from 'react'

const API_BASE = 'https://diretta-radio-api.francesco-statello88.workers.dev'
const TOTAL_SECTIONS = 6
const RADIO_REFRESH_MS = 14 * 60 * 1000

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

type ConfigData = {
  sindaco1: string
  sindaco2: string
  lista1: string
  lista2: string
  consiglieri1: string[]
  consiglieri2: string[]
  elettoriSezioni?: number[]
}

type EnrichedRow = {
  raw: LiveRow | null
  sezione: number
  plesso: string
  elettori: number
  votanti: number
  affluenza: string | null
  sindaco1: number
  sindaco2: number
  lista1: number
  lista2: number
  bianche: number
  nulle: number
  stato: 'vuota' | 'parziale' | 'completa'
  updatedAt: string | null
  updatedBy: string | null
  consiglieri1: number[]
  consiglieri2: number[]
  percentSindaco1: string | null
  percentSindaco2: string | null
  percentLista1: string | null
  percentLista2: string | null
}

type MainTab = `sezione-${number}` | 'riepilogo-consiglieri'
type SectionInnerTab = 'risultati' | 'consiglieri'
type SummaryConsiglieriTab = 'lista1' | 'lista2'

export default function RadioPage() {
  const [rows, setRows] = useState<LiveRow[]>([])
  const [config, setConfig] = useState<ConfigData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [lastSync, setLastSync] = useState<string>('')
  const [mainTab, setMainTab] = useState<MainTab>('sezione-1')
  const [summaryConsiglieriTab, setSummaryConsiglieriTab] =
    useState<SummaryConsiglieriTab>('lista1')
  const [sectionInnerTabs, setSectionInnerTabs] = useState<Record<number, SectionInnerTab>>({
    1: 'risultati',
    2: 'risultati',
    3: 'risultati',
    4: 'risultati',
    5: 'risultati',
    6: 'risultati',
  })

  useEffect(() => {
    loadConfig()
    loadLive()

    const onFocus = () => {
      loadConfig()
      loadLive()
    }

    window.addEventListener('focus', onFocus)

    const interval = setInterval(() => {
      loadLive()
    }, RADIO_REFRESH_MS)

    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(interval)
    }
  }, [])

  function loadConfig() {
    try {
      const raw = localStorage.getItem('config')
      if (!raw) {
        setConfig(null)
        return
      }

      const parsed = JSON.parse(raw) as ConfigData

      setConfig({
        sindaco1: parsed.sindaco1 || '',
        sindaco2: parsed.sindaco2 || '',
        lista1: parsed.lista1 || '',
        lista2: parsed.lista2 || '',
        consiglieri1: Array.isArray(parsed.consiglieri1)
          ? [...parsed.consiglieri1, ...Array(12).fill('')].slice(0, 12)
          : Array(12).fill(''),
        consiglieri2: Array.isArray(parsed.consiglieri2)
          ? [...parsed.consiglieri2, ...Array(12).fill('')].slice(0, 12)
          : Array(12).fill(''),
        elettoriSezioni: Array.isArray(parsed.elettoriSezioni)
          ? parsed.elettoriSezioni
          : Array(6).fill(0),
      })
    } catch {
      setConfig(null)
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
      setLoadError('')
      setLastSync(
        new Date().toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      )
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Errore caricamento live')
    } finally {
      setLoading(false)
    }
  }

  const enrichedRows = useMemo<EnrichedRow[]>(() => {
    return Array.from({ length: TOTAL_SECTIONS }, (_, index) => {
      const sectionNumber = index + 1
      const existing = rows.find((row) => row.sezione === sectionNumber) || null

      const elettoriConfig = Array.isArray(config?.elettoriSezioni)
        ? Number(config?.elettoriSezioni?.[index] || 0)
        : 0

      const elettori = Number(existing?.elettori || elettoriConfig || 0)
      const votanti = Number(existing?.votanti || 0)
      const affluenza =
        elettori > 0 && votanti > 0 ? ((votanti / elettori) * 100).toFixed(2) : null

      const sindaco1 = Number(existing?.sindaco1 || 0)
      const sindaco2 = Number(existing?.sindaco2 || 0)
      const lista1 = Number(existing?.lista1 || 0)
      const lista2 = Number(existing?.lista2 || 0)
      const bianche = Number(existing?.schede_bianche || 0)
      const nulle = Number(existing?.schede_nulle || 0)

      const totalSindaci = sindaco1 + sindaco2
      const totalListe = lista1 + lista2

      const hasAnyData =
        !!existing &&
        (
          existing.sindaco1 !== null ||
          existing.sindaco2 !== null ||
          existing.lista1 !== null ||
          existing.lista2 !== null ||
          existing.schede_bianche !== null ||
          existing.schede_nulle !== null ||
          existing.votanti !== null ||
          (Array.isArray(existing.consiglieri_lista1) &&
            existing.consiglieri_lista1.some((v) => v !== null && v !== 0)) ||
          (Array.isArray(existing.consiglieri_lista2) &&
            existing.consiglieri_lista2.some((v) => v !== null && v !== 0))
        )

      let stato: 'vuota' | 'parziale' | 'completa' = 'vuota'
      if (existing?.is_completed) stato = 'completa'
      else if (hasAnyData) stato = 'parziale'

      return {
        raw: existing,
        sezione: sectionNumber,
        plesso: existing?.plesso || '-',
        elettori,
        votanti,
        affluenza,
        sindaco1,
        sindaco2,
        lista1,
        lista2,
        bianche,
        nulle,
        stato,
        updatedAt: existing?.updated_at || null,
        updatedBy: existing?.updated_by || null,
        consiglieri1: normalizePreferenceArray(existing?.consiglieri_lista1, 12),
        consiglieri2: normalizePreferenceArray(existing?.consiglieri_lista2, 12),
        percentSindaco1: totalSindaci > 0 ? ((sindaco1 / totalSindaci) * 100).toFixed(2) : null,
        percentSindaco2: totalSindaci > 0 ? ((sindaco2 / totalSindaci) * 100).toFixed(2) : null,
        percentLista1: totalListe > 0 ? ((lista1 / totalListe) * 100).toFixed(2) : null,
        percentLista2: totalListe > 0 ? ((lista2 / totalListe) * 100).toFixed(2) : null,
      }
    })
  }, [rows, config])

  const stats = useMemo(() => {
    const completed = enrichedRows.filter((row) => row.stato === 'completa').length
    const partial = enrichedRows.filter((row) => row.stato === 'parziale').length
    const empty = enrichedRows.filter((row) => row.stato === 'vuota').length

    const totalElettori = enrichedRows.reduce((sum, row) => sum + row.elettori, 0)
    const totalVotanti = enrichedRows.reduce((sum, row) => sum + row.votanti, 0)
    const totalBianche = enrichedRows.reduce((sum, row) => sum + row.bianche, 0)
    const totalNulle = enrichedRows.reduce((sum, row) => sum + row.nulle, 0)
    const totalSindaco1 = enrichedRows.reduce((sum, row) => sum + row.sindaco1, 0)
    const totalSindaco2 = enrichedRows.reduce((sum, row) => sum + row.sindaco2, 0)
    const totalLista1 = enrichedRows.reduce((sum, row) => sum + row.lista1, 0)
    const totalLista2 = enrichedRows.reduce((sum, row) => sum + row.lista2, 0)

    const affluenzaTotale =
      totalElettori > 0 && totalVotanti > 0
        ? ((totalVotanti / totalElettori) * 100).toFixed(2)
        : null

    const last = [...enrichedRows]
      .filter((row) => row.updatedAt)
      .sort(
        (a, b) =>
          new Date(b.updatedAt || 0).getTime() -
          new Date(a.updatedAt || 0).getTime()
      )[0]

    return {
      completed,
      partial,
      empty,
      totalElettori,
      totalVotanti,
      totalBianche,
      totalNulle,
      totalSindaco1,
      totalSindaco2,
      totalLista1,
      totalLista2,
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
  }, [enrichedRows])

  const percentSindaco1 = useMemo(() => {
    const total = stats.totalSindaco1 + stats.totalSindaco2
    if (!total) return null
    return ((stats.totalSindaco1 / total) * 100).toFixed(2)
  }, [stats.totalSindaco1, stats.totalSindaco2])

  const percentSindaco2 = useMemo(() => {
    const total = stats.totalSindaco1 + stats.totalSindaco2
    if (!total) return null
    return ((stats.totalSindaco2 / total) * 100).toFixed(2)
  }, [stats.totalSindaco1, stats.totalSindaco2])

  const percentLista1 = useMemo(() => {
    const total = stats.totalLista1 + stats.totalLista2
    if (!total) return null
    return ((stats.totalLista1 / total) * 100).toFixed(2)
  }, [stats.totalLista1, stats.totalLista2])

  const percentLista2 = useMemo(() => {
    const total = stats.totalLista1 + stats.totalLista2
    if (!total) return null
    return ((stats.totalLista2 / total) * 100).toFixed(2)
  }, [stats.totalLista1, stats.totalLista2])

  const consiglieriMatrixLista1 = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) => {
      const sezioni = enrichedRows.map((row) => row.consiglieri1[index] || 0)
      const totale = sezioni.reduce((sum, value) => sum + value, 0)

      return {
        nome: config?.consiglieri1?.[index] || `Cons. ${index + 1}`,
        sezioni,
        totale,
      }
    })
  }, [enrichedRows, config])

  const consiglieriMatrixLista2 = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) => {
      const sezioni = enrichedRows.map((row) => row.consiglieri2[index] || 0)
      const totale = sezioni.reduce((sum, value) => sum + value, 0)

      return {
        nome: config?.consiglieri2?.[index] || `Cons. ${index + 1}`,
        sezioni,
        totale,
      }
    })
  }, [enrichedRows, config])

  const activeSectionNumber =
    mainTab.startsWith('sezione-') ? Number(mainTab.replace('sezione-', '')) : null

  const activeSection =
    activeSectionNumber && activeSectionNumber >= 1 && activeSectionNumber <= TOTAL_SECTIONS
      ? enrichedRows[activeSectionNumber - 1]
      : null

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="text-sm font-bold text-slate-600">Caricamento dashboard radio...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Punto di accesso radio</h1>
            <div className="mt-1 text-sm text-slate-500">
              Lettura dati scrutinio in tempo reale
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-400">
              Auto refresh ogni 14 minuti
            </div>
          </div>

          <button
            onClick={loadLive}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
          >
            Aggiorna ora
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <CompactInfoBox label="Complete" value={`${stats.completed}/${TOTAL_SECTIONS}`} />
          <CompactInfoBox label="Parziali" value={String(stats.partial)} />
          <CompactInfoBox label="Vuote" value={String(stats.empty)} />
          <CompactInfoBox label="Ultimo sync" value={lastSync || '-'} />
        </div>

        {loadError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            Errore caricamento live: {loadError}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-base font-bold text-slate-900">Riepilogo generale</div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <CompactInfoBox label="Elettori" value={String(stats.totalElettori)} />
            <CompactInfoBox label="Votanti" value={String(stats.totalVotanti)} />
            <CompactInfoBox
              label="Affluenza"
              value={stats.affluenzaTotale ? `${stats.affluenzaTotale}%` : '-'}
            />
            <CompactInfoBox label="Bianche" value={String(stats.totalBianche)} />
            <CompactInfoBox label="Nulle" value={String(stats.totalNulle)} />
            <CompactInfoBox label="Ultima sez." value={String(stats.lastSection)} />
            <CompactInfoBox label="Ora" value={stats.lastTime} />
            <CompactInfoBox label="Operatore" value={stats.lastUser} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-base font-bold text-slate-900">Sindaci e liste</div>

          <div className="grid gap-2 lg:grid-cols-2">
            <CompactResultCard
              title={config?.sindaco1 || 'Sindaco 1'}
              votes={stats.totalSindaco1}
              percent={percentSindaco1}
            />
            <CompactResultCard
              title={config?.sindaco2 || 'Sindaco 2'}
              votes={stats.totalSindaco2}
              percent={percentSindaco2}
            />
            <CompactResultCard
              title={config?.lista1 || 'Lista X'}
              votes={stats.totalLista1}
              percent={percentLista1}
            />
            <CompactResultCard
              title={config?.lista2 || 'Lista Y'}
              votes={stats.totalLista2}
              percent={percentLista2}
            />
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-2">
          {Array.from({ length: TOTAL_SECTIONS }, (_, index) => {
            const sezione = index + 1
            const key = `sezione-${sezione}` as MainTab
            return (
              <MainTabButton
                key={key}
                active={mainTab === key}
                onClick={() => setMainTab(key)}
                label={`Sez. ${sezione}`}
              />
            )
          })}

          <MainTabButton
            active={mainTab === 'riepilogo-consiglieri'}
            onClick={() => setMainTab('riepilogo-consiglieri')}
            label="Riepilogo consiglieri"
          />
        </div>

        {mainTab === 'riepilogo-consiglieri' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <InnerTabButton
                active={summaryConsiglieriTab === 'lista1'}
                onClick={() => setSummaryConsiglieriTab('lista1')}
                label={config?.lista1 || 'Lista X'}
              />
              <InnerTabButton
                active={summaryConsiglieriTab === 'lista2'}
                onClick={() => setSummaryConsiglieriTab('lista2')}
                label={config?.lista2 || 'Lista Y'}
              />
            </div>

            {summaryConsiglieriTab === 'lista1' ? (
              <ConsiglieriSummaryTable
                title={`Riepilogo complessivo consiglieri - ${config?.lista1 || 'Lista X'}`}
                rows={consiglieriMatrixLista1}
              />
            ) : (
              <ConsiglieriSummaryTable
                title={`Riepilogo complessivo consiglieri - ${config?.lista2 || 'Lista Y'}`}
                rows={consiglieriMatrixLista2}
              />
            )}
          </div>
        ) : activeSection ? (
          <SectionDetailCard
            row={activeSection}
            config={config}
            activeTab={sectionInnerTabs[activeSection.sezione] || 'risultati'}
            onChangeTab={(tab) =>
              setSectionInnerTabs((prev) => ({
                ...prev,
                [activeSection.sezione]: tab,
              }))
            }
          />
        ) : null}
      </section>
    </div>
  )
}

function MainTabButton({
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
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
        active
          ? 'bg-slate-900 text-white'
          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
      }`}
    >
      {label}
    </button>
  )
}

function CompactInfoBox({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 break-words text-base font-bold text-slate-900">{value}</div>
    </div>
  )
}

function CompactResultCard({
  title,
  votes,
  percent,
}: {
  title: string
  votes: number
  percent: string | null
}) {
  const width = percent ? Math.max(2, Math.min(100, Number(percent))) : 0

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-slate-900">{title}</div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-base font-bold text-slate-900">{votes}</div>
          <div className="text-[11px] font-semibold text-slate-500">
            {percent ? `${percent}%` : '-'}
          </div>
        </div>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-blue-600"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

function SectionDetailCard({
  row,
  config,
  activeTab,
  onChangeTab,
}: {
  row: EnrichedRow
  config: ConfigData | null
  activeTab: SectionInnerTab
  onChangeTab: (tab: SectionInnerTab) => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-xl font-bold text-slate-900">Sezione {row.sezione}</div>
            <div className="mt-1 text-sm text-slate-500">Plesso: {row.plesso}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge stato={row.stato} />
            <div className="rounded-xl bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              {row.updatedAt
                ? new Date(row.updatedAt).toLocaleTimeString('it-IT', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : 'Nessun invio'}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <CompactInfoBox label="Elettori" value={String(row.elettori || 0)} />
          <CompactInfoBox label="Votanti" value={String(row.votanti || 0)} />
          <CompactInfoBox label="Affluenza" value={row.affluenza ? `${row.affluenza}%` : '-'} />
          <CompactInfoBox label="Operatore" value={row.updatedBy || '-'} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <InnerTabButton
            active={activeTab === 'risultati'}
            onClick={() => onChangeTab('risultati')}
            label="Risultati"
          />
          <InnerTabButton
            active={activeTab === 'consiglieri'}
            onClick={() => onChangeTab('consiglieri')}
            label="Consiglieri"
          />
        </div>

        {activeTab === 'risultati' ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
              <thead className="bg-slate-100">
                <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Voce</th>
                  <th className="px-3 py-3 text-right">Voti</th>
                  <th className="px-3 py-3 text-right">Percentuale</th>
                </tr>
              </thead>
              <tbody>
                <DetailRow
                  label={config?.sindaco1 || 'Sindaco 1'}
                  votes={row.sindaco1}
                  percent={row.percentSindaco1}
                />
                <DetailRow
                  label={config?.sindaco2 || 'Sindaco 2'}
                  votes={row.sindaco2}
                  percent={row.percentSindaco2}
                />
                <DetailRow
                  label={config?.lista1 || 'Lista X'}
                  votes={row.lista1}
                  percent={row.percentLista1}
                />
                <DetailRow
                  label={config?.lista2 || 'Lista Y'}
                  votes={row.lista2}
                  percent={row.percentLista2}
                />
                <DetailRow label="Schede bianche" votes={row.bianche} percent={null} />
                <DetailRow label="Schede nulle" votes={row.nulle} percent={null} />
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <PreferenceTableCompact
              title={`Consiglieri ${config?.lista2 || 'Lista Y'}`}
              labels={config?.consiglieri2 || Array(12).fill('')}
              values={row.consiglieri2}
            />
            <PreferenceTableCompact
              title={`Consiglieri ${config?.lista1 || 'Lista X'}`}
              labels={config?.consiglieri1 || Array(12).fill('')}
              values={row.consiglieri1}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function InnerTabButton({
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
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
        active
          ? 'bg-slate-900 text-white'
          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
      }`}
    >
      {label}
    </button>
  )
}

function DetailRow({
  label,
  votes,
  percent,
}: {
  label: string
  votes: number
  percent: string | null
}) {
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-3 text-sm font-semibold text-slate-800">{label}</td>
      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{votes}</td>
      <td className="px-3 py-3 text-right text-sm font-semibold text-slate-600">
        {percent ? `${percent}%` : '-'}
      </td>
    </tr>
  )
}

function PreferenceTableCompact({
  title,
  labels,
  values,
}: {
  title: string
  labels: string[]
  values: number[]
}) {
  const rows = values.map((value, index) => ({
    label: labels[index] || `Cons. ${index + 1}`,
    value,
  }))

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-sm font-bold text-slate-900">
        {title}
      </div>

      <div className="overflow-hidden">
        <table className="min-w-full table-fixed">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <th className="w-[75%] px-4 py-3">Consigliere</th>
              <th className="w-[25%] px-4 py-3 text-right">Preferenze</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, index) => (
              <tr key={`${item.label}-${index}`} className="border-t border-slate-100">
                <td className="px-4 py-2.5 text-sm font-medium text-slate-800">
                  <div className="truncate" title={item.label}>
                    {item.label}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-bold text-slate-900">
                  {item.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ConsiglieriSummaryTable({
  title,
  rows,
}: {
  title: string
  rows: { nome: string; sezioni: number[]; totale: number }[]
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-sm font-bold text-slate-900">
        {title}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Consigliere</th>
              {Array.from({ length: TOTAL_SECTIONS }, (_, index) => (
                <th key={index} className="px-4 py-3 text-right">
                  Sez. {index + 1}
                </th>
              ))}
              <th className="px-4 py-3 text-right">Totale</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.nome}-${index}`} className="border-t border-slate-100">
                <td className="px-4 py-3 text-sm font-medium text-slate-800">{row.nome}</td>
                {row.sezioni.map((value, sectionIndex) => (
                  <td
                    key={sectionIndex}
                    className="px-4 py-3 text-right text-sm font-bold text-slate-900"
                  >
                    {value}
                  </td>
                ))}
                <td className="px-4 py-3 text-right text-sm font-extrabold text-slate-900">
                  {row.totale}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusBadge({
  stato,
}: {
  stato: 'vuota' | 'parziale' | 'completa'
}) {
  const map = {
    vuota: 'bg-slate-200 text-slate-700',
    parziale: 'bg-amber-100 text-amber-700',
    completa: 'bg-green-100 text-green-700',
  }

  const label = {
    vuota: 'Vuota',
    parziale: 'Parziale',
    completa: 'Completa',
  }

  return (
    <span className={`rounded-xl px-3 py-1 text-xs font-bold ${map[stato]}`}>
      {label[stato]}
    </span>
  )
}

function normalizePreferenceArray(
  values: Array<number | null> | null | undefined,
  length: number
) {
  const arr = Array.isArray(values) ? values : []
  return Array.from({ length }, (_, index) => Number(arr[index] || 0))
}