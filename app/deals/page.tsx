import Link from 'next/link'
import { getDeals, hasAirtableConfig, type AirtableDeal } from '@/lib/airtableClient'

const fmt$ = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`

const verdictColors: Record<string, string> = {
  ACQUIRE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  NEGOTIATE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  PASS: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  AVOID: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const cls = verdictColors[verdict] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${cls}`}>
      {verdict}
    </span>
  )
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-bold text-[var(--foreground)]">{value}</span>
      {sub && <span className="text-xs text-[var(--muted-foreground)]">{sub}</span>}
    </div>
  )
}

export default async function DealsPage() {
  if (!hasAirtableConfig()) {
    return (
      <main className="min-h-screen bg-[var(--background)] p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">Deal History</h1>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-3">Airtable Not Configured</h2>
            <p className="text-[var(--muted-foreground)] mb-4">
              To enable the deal history dashboard, add these environment variables to your Vercel project:
            </p>
            <div className="bg-[var(--muted)] rounded-lg p-4 font-mono text-sm space-y-1">
              <div><span className="text-[var(--primary)] font-semibold">AIRTABLE_API_KEY</span>=your_personal_access_token</div>
              <div><span className="text-[var(--primary)] font-semibold">AIRTABLE_BASE_ID</span>=appXXXXXXXXXXXXXX</div>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-4">
              Create a base named &quot;LJM Deals&quot; in Airtable with a table named &quot;Deals&quot;.
              Columns are created automatically when the first deal is analyzed.
            </p>
          </div>
        </div>
      </main>
    )
  }

  const deals = await getDeals()

  if (deals.length === 0) {
    return (
      <main className="min-h-screen bg-[var(--background)] p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">Deal History</h1>
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center">
            <p className="text-[var(--muted-foreground)] text-lg">No deals analyzed yet.</p>
            <Link href="/" className="mt-4 inline-block text-[var(--primary)] font-medium hover:underline">
              Analyze your first deal →
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // KPI calculations
  const total = deals.length
  const avgCapRate = deals.reduce((s, d) => s + d.expertCapRate, 0) / total
  const avgDscr = deals.reduce((s, d) => s + d.dscr, 0) / total
  const verdictCounts = deals.reduce<Record<string, number>>((acc, d) => {
    acc[d.verdict] = (acc[d.verdict] ?? 0) + 1
    return acc
  }, {})

  return (
    <main className="min-h-screen bg-[var(--background)] p-6 md:p-10">
      <div className="max-w-screen-xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--foreground)]">Deal History</h1>
            <p className="text-[var(--muted-foreground)] mt-1">All analyzed deals synced from LJM Deal Analyzer</p>
          </div>
          <Link
            href="/"
            className="rounded-lg bg-[var(--primary)] text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + New Deal
          </Link>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <KpiCard label="Total Deals" value={total} />
          <KpiCard label="Avg Cap Rate" value={fmtPct(avgCapRate)} />
          <KpiCard label="Avg DSCR" value={avgDscr.toFixed(3)} />
          <KpiCard
            label="ACQUIRE"
            value={verdictCounts['ACQUIRE'] ?? 0}
            sub={`${(((verdictCounts['ACQUIRE'] ?? 0) / total) * 100).toFixed(0)}%`}
          />
          <KpiCard
            label="NEGOTIATE"
            value={verdictCounts['NEGOTIATE'] ?? 0}
            sub={`${(((verdictCounts['NEGOTIATE'] ?? 0) / total) * 100).toFixed(0)}%`}
          />
          <KpiCard
            label="PASS"
            value={verdictCounts['PASS'] ?? 0}
            sub={`${(((verdictCounts['PASS'] ?? 0) / total) * 100).toFixed(0)}%`}
          />
          <KpiCard
            label="AVOID"
            value={verdictCounts['AVOID'] ?? 0}
            sub={`${(((verdictCounts['AVOID'] ?? 0) / total) * 100).toFixed(0)}%`}
          />
        </div>

        {/* Deals Table */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                  {[
                    'Property',
                    'Address',
                    'Units',
                    'Asking Price',
                    'Expert Cap',
                    'MAO (Base)',
                    'DSCR',
                    'Verdict',
                    'Gap to MAO',
                    'Eq. Multiple',
                    'Analyzed',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deals.map((deal: AirtableDeal, i: number) => (
                  <tr
                    key={deal.id}
                    className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)] transition-colors ${i % 2 === 1 ? 'bg-[var(--muted)]/40' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-[var(--foreground)] whitespace-nowrap">
                      {deal.jobId ? (
                        <Link href={`/analyze/${deal.jobId}`} className="hover:text-[var(--primary)] transition-colors">
                          {deal.propertyName || '(Unnamed)'}
                        </Link>
                      ) : (
                        deal.propertyName || '(Unnamed)'
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)] max-w-[200px] truncate">
                      {deal.address || '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--foreground)]">
                      {deal.units || '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--foreground)] whitespace-nowrap">
                      {deal.askingPrice ? fmt$(deal.askingPrice) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--foreground)]">
                      {deal.expertCapRate ? fmtPct(deal.expertCapRate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--foreground)] whitespace-nowrap">
                      {deal.maoBase ? fmt$(deal.maoBase) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--foreground)]">
                      <span className={deal.dscrPass ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
                        {deal.dscr.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {deal.verdict ? <VerdictBadge verdict={deal.verdict} /> : '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className={deal.gapToMao >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
                        {deal.gapToMaoPct !== 0
                          ? `${deal.gapToMao >= 0 ? '+' : ''}${(deal.gapToMaoPct * 100).toFixed(1)}%`
                          : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--foreground)]">
                      {deal.equityMultiple ? `${deal.equityMultiple.toFixed(2)}x` : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)] whitespace-nowrap text-xs">
                      {deal.analyzedAt
                        ? new Date(deal.analyzedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  )
}
