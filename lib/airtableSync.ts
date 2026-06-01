import type { AnalysisResult, DealInput } from './types'

const AIRTABLE_API_BASE = 'https://api.airtable.com/v0'

function buildFields(deal: DealInput, analysis: AnalysisResult, jobId: string) {
  const baseSc = analysis.scenarios[1] ?? analysis.scenarios[0]
  const addr = [deal.address, deal.city, deal.state, deal.zip_code].filter(Boolean).join(', ')

  return {
    'Job ID': jobId,
    'Property Name': deal.property_name ?? '',
    'Address': addr,
    'Units': deal.units ?? 0,
    'Year Built': deal.year_built ?? 0,
    'Asking Price': deal.asking_price ?? 0,
    'Broker Cap Rate': deal.broker_cap_rate ?? 0,
    'Expert Cap Rate': analysis.expert.cap_rate,
    'Expert NOI': analysis.expert.noi,
    'MAO Base': baseSc?.mao ?? analysis.expert.mao,
    'DSCR': Math.round(analysis.expert.dscr * 1000) / 1000,
    'DSCR Pass': analysis.expert.dscr_pass,
    'Verdict': analysis.verdict.label,
    'Gap to MAO': analysis.asking.gap_to_sc2_mao,
    'Gap to MAO Pct': Math.round(analysis.asking.gap_to_sc2_mao_pct * 10000) / 10000,
    'Equity Required': analysis.expert.equity_required,
    'Equity Multiple': Math.round(analysis.expert.equity_multiple * 100) / 100,
    'Annual Cash Flow': analysis.expert.annual_cash_flow,
    'Cash on Cash Return': Math.round(analysis.expert.cash_on_cash * 10000) / 10000,
    'Exit Value': analysis.expert.exit_value,
    'Expense Ratio': Math.round(analysis.expert.expense_ratio * 10000) / 10000,
    'Loan Amount': analysis.expert.loan_amount,
    'Annual Debt Service': analysis.expert.annual_debt_service,
    'T12 EGI': analysis.t12.egi,
    'T12 NOI': analysis.t12.noi,
    'Expert EGI': analysis.expert.egi,
    'Expert Total OpEx': analysis.expert.total_opex,
    'Notes': deal.notes ?? '',
    'Analyzed At': new Date().toISOString(),
  }
}

export async function syncDealToAirtable(
  deal: DealInput,
  analysis: AnalysisResult,
  jobId: string
): Promise<void> {
  const apiKey = process.env.AIRTABLE_API_KEY
  const baseId = process.env.AIRTABLE_BASE_ID
  if (!apiKey || !baseId) return

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  const tableUrl = `${AIRTABLE_API_BASE}/${baseId}/Deals`

  // Search for existing record by Job ID to decide create vs update
  const searchUrl = `${tableUrl}?filterByFormula=${encodeURIComponent(`{Job ID}="${jobId}"`)}&maxRecords=1`
  const searchRes = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(10000) })
  if (!searchRes.ok) {
    // Proceed to create even if search fails
    await fetch(tableUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fields: buildFields(deal, analysis, jobId) }),
      signal: AbortSignal.timeout(10000),
    })
    return
  }

  const searchData = await searchRes.json() as { records?: { id: string }[] }
  const existing = searchData.records?.[0]

  if (existing) {
    await fetch(`${tableUrl}/${existing.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ fields: buildFields(deal, analysis, jobId) }),
      signal: AbortSignal.timeout(10000),
    })
  } else {
    await fetch(tableUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fields: buildFields(deal, analysis, jobId) }),
      signal: AbortSignal.timeout(10000),
    })
  }
}
