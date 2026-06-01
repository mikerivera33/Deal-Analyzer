export interface AirtableDeal {
  id: string
  jobId: string
  propertyName: string
  address: string
  units: number
  yearBuilt: number
  askingPrice: number
  brokerCapRate: number
  expertCapRate: number
  expertNoi: number
  maoBase: number
  dscr: number
  dscrPass: boolean
  verdict: string
  gapToMao: number
  gapToMaoPct: number
  equityRequired: number
  equityMultiple: number
  annualCashFlow: number
  cashOnCashReturn: number
  exitValue: number
  expenseRatio: number
  loanAmount: number
  annualDebtService: number
  t12Egi: number
  t12Noi: number
  expertEgi: number
  expertTotalOpex: number
  notes: string
  analyzedAt: string
}

interface AirtableRecord {
  id: string
  fields: Record<string, unknown>
}

function toNum(v: unknown): number {
  return typeof v === 'number' ? v : 0
}

function mapRecord(r: AirtableRecord): AirtableDeal {
  const f = r.fields
  return {
    id: r.id,
    jobId: String(f['Job ID'] ?? ''),
    propertyName: String(f['Property Name'] ?? ''),
    address: String(f['Address'] ?? ''),
    units: toNum(f['Units']),
    yearBuilt: toNum(f['Year Built']),
    askingPrice: toNum(f['Asking Price']),
    brokerCapRate: toNum(f['Broker Cap Rate']),
    expertCapRate: toNum(f['Expert Cap Rate']),
    expertNoi: toNum(f['Expert NOI']),
    maoBase: toNum(f['MAO Base']),
    dscr: toNum(f['DSCR']),
    dscrPass: Boolean(f['DSCR Pass']),
    verdict: String(f['Verdict'] ?? ''),
    gapToMao: toNum(f['Gap to MAO']),
    gapToMaoPct: toNum(f['Gap to MAO Pct']),
    equityRequired: toNum(f['Equity Required']),
    equityMultiple: toNum(f['Equity Multiple']),
    annualCashFlow: toNum(f['Annual Cash Flow']),
    cashOnCashReturn: toNum(f['Cash on Cash Return']),
    exitValue: toNum(f['Exit Value']),
    expenseRatio: toNum(f['Expense Ratio']),
    loanAmount: toNum(f['Loan Amount']),
    annualDebtService: toNum(f['Annual Debt Service']),
    t12Egi: toNum(f['T12 EGI']),
    t12Noi: toNum(f['T12 NOI']),
    expertEgi: toNum(f['Expert EGI']),
    expertTotalOpex: toNum(f['Expert Total OpEx']),
    notes: String(f['Notes'] ?? ''),
    analyzedAt: String(f['Analyzed At'] ?? ''),
  }
}

export async function getDeals(): Promise<AirtableDeal[]> {
  const apiKey = process.env.AIRTABLE_API_KEY
  const baseId = process.env.AIRTABLE_BASE_ID
  if (!apiKey || !baseId) return []

  const headers = { Authorization: `Bearer ${apiKey}` }
  const records: AirtableDeal[] = []
  let offset: string | undefined

  try {
    do {
      const params = new URLSearchParams({
        sort: JSON.stringify([{ field: 'Analyzed At', direction: 'desc' }]),
        pageSize: '100',
      })
      if (offset) params.set('offset', offset)

      const res = await fetch(
        `https://api.airtable.com/v0/${baseId}/Deals?${params}`,
        { headers, next: { revalidate: 60 } }
      )
      if (!res.ok) break

      const data = await res.json() as { records: AirtableRecord[]; offset?: string }
      for (const r of data.records) records.push(mapRecord(r))
      offset = data.offset
    } while (offset)
  } catch {
    return records
  }

  return records
}

export function hasAirtableConfig(): boolean {
  return Boolean(process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID)
}
