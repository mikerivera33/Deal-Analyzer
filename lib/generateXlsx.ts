import type { AnalysisResult, DealInput } from './types'

function numFmt(n: number | undefined, fmt = '#,##0'): string | number {
  return n ?? 0
}

export async function generateUnderwritingXlsx(
  deal: DealInput,
  analysis: AnalysisResult
): Promise<Buffer> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  // ── Summary Sheet ────────────────────────────────────────
  const summaryData = [
    ['LJM HOMES LLC — DEAL UNDERWRITING'],
    [],
    ['Property', deal.property_name || ''],
    ['Address', [deal.address, deal.city, deal.state, deal.zip_code].filter(Boolean).join(', ')],
    ['Units', deal.units],
    ['Year Built', deal.year_built],
    ['Total SF', deal.total_sf],
    ['Asking Price', deal.asking_price],
    ['Broker Cap Rate', deal.broker_cap_rate ? `${(deal.broker_cap_rate * 100).toFixed(2)}%` : ''],
    [],
    ['VERDICT', analysis.verdict.label],
    ['Expert Cap Rate', `${(analysis.expert.cap_rate * 100).toFixed(2)}%`],
    ['Expert NOI', analysis.expert.noi],
    ['MAO (Base 8%)', analysis.expert.mao],
    ['Gap to MAO', analysis.asking.gap_to_sc2_mao],
    ['DSCR', analysis.expert.dscr.toFixed(3)],
    ['DSCR Pass', analysis.expert.dscr_pass ? 'PASS' : 'FAIL'],
    ['Equity Required', analysis.expert.equity_required],
    ['Equity Multiple', analysis.expert.equity_multiple.toFixed(2) + 'x'],
    ['Exit Value (Base)', analysis.expert.exit_value],
  ]
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  // ── Income Analysis Sheet ────────────────────────────────
  const incomeData = [
    ['', 'T-12 (Broker)', 'Pro-Forma (Broker)', 'Expert (LJM)'],
    ['EGI', analysis.t12.egi, analysis.pf.egi, analysis.expert.egi],
    ['OpEx', analysis.t12.opex, analysis.pf.opex, analysis.expert.total_opex],
    ['NOI', analysis.t12.noi, analysis.pf.noi, analysis.expert.noi],
    [],
    ['Expense Ratio (Expert)', '', '', `${(analysis.expert.expense_ratio * 100).toFixed(1)}%`],
  ]
  const wsIncome = XLSX.utils.aoa_to_sheet(incomeData)
  XLSX.utils.book_append_sheet(wb, wsIncome, 'Income Analysis')

  // ── Expense Breakdown Sheet ──────────────────────────────
  const expenseData = [
    ['Expense Item', 'Annual Amount'],
    ['Property Taxes', deal.property_taxes || 0],
    ['Insurance', deal.insurance || 0],
    ['Management Fee (8% EGI)', analysis.expert.total_opex - (deal.property_taxes || 0) - (deal.insurance || 0) - (deal.utilities || 0) - (deal.reserves || 0)],
    ['Utilities', deal.utilities || 0],
    ['Reserves', deal.reserves || 0],
    ['Total OpEx', analysis.expert.total_opex],
    [],
    ['EGI', analysis.expert.egi],
    ['NOI', analysis.expert.noi],
    ['Expense Ratio', `${(analysis.expert.expense_ratio * 100).toFixed(1)}%`],
  ]
  const wsExpenses = XLSX.utils.aoa_to_sheet(expenseData)
  XLSX.utils.book_append_sheet(wb, wsExpenses, 'Expense Breakdown')

  // ── Unit Mix Sheet ───────────────────────────────────────
  const unitHeaders = ['Beds', 'Baths', 'Units', 'Avg SF', 'Market Rent', 'Actual Rent', 'Monthly Income']
  const unitRows = (deal.unit_mix || []).map((u) => [
    u.bed_count,
    u.bath_count,
    u.unit_count,
    u.avg_sf,
    u.market_rent,
    u.actual_rent,
    u.unit_count * u.actual_rent,
  ])
  const unitData = [unitHeaders, ...unitRows]
  const wsUnits = XLSX.utils.aoa_to_sheet(unitData)
  XLSX.utils.book_append_sheet(wb, wsUnits, 'Unit Mix')

  // ── Scenarios Sheet ──────────────────────────────────────
  const scenarioHeaders = ['Metric', ...analysis.scenarios.map((s) => s.label)]
  const scenarioRows = [
    ['Exit Cap Rate', ...analysis.scenarios.map((s) => `${(s.cap_rate * 100).toFixed(2)}%`)],
    ['MAO', ...analysis.scenarios.map((s) => s.mao)],
    ['MAO / Unit', ...analysis.scenarios.map((s) => s.mao_per_unit)],
    ['DSCR', ...analysis.scenarios.map((s) => s.dscr.toFixed(3))],
    ['DSCR Pass', ...analysis.scenarios.map((s) => (s.dscr_pass ? 'PASS' : 'FAIL'))],
    ['Equity Required', ...analysis.scenarios.map((s) => s.equity_required)],
    ['Exit Value', ...analysis.scenarios.map((s) => s.exit_value)],
    ['Equity Multiple', ...analysis.scenarios.map((s) => s.equity_multiple.toFixed(2) + 'x')],
  ]
  const wsScenarios = XLSX.utils.aoa_to_sheet([scenarioHeaders, ...scenarioRows])
  XLSX.utils.book_append_sheet(wb, wsScenarios, 'Scenarios')

  // ── Risk Register Sheet ──────────────────────────────────
  const riskHeaders = ['Risk', 'Severity', 'Likelihood', 'Score', 'Notes']
  const riskRows = analysis.risk_register.map((r) => [
    r.risk,
    r.severity,
    r.likelihood,
    r.score,
    r.notes,
  ])
  const wsRisk = XLSX.utils.aoa_to_sheet([riskHeaders, ...riskRows])
  XLSX.utils.book_append_sheet(wb, wsRisk, 'Risk Register')

  // ── Financing Sheet ──────────────────────────────────────
  const financeData = [
    ['Financing Assumptions', ''],
    ['LTV', '75%'],
    ['Interest Rate', '7.5%'],
    ['Amortization', '30 years'],
    ['Hold Period', '5 years'],
    [],
    ['Loan Amount', analysis.expert.loan_amount],
    ['Annual Debt Service', analysis.expert.annual_debt_service],
    ['Annual Cash Flow', analysis.expert.annual_cash_flow],
    ['Cash-on-Cash Return', `${(analysis.expert.cash_on_cash * 100).toFixed(1)}%`],
    ['Equity Required', analysis.expert.equity_required],
  ]
  const wsFinance = XLSX.utils.aoa_to_sheet(financeData)
  XLSX.utils.book_append_sheet(wb, wsFinance, 'Financing')

  // ── Notes Sheet ──────────────────────────────────────────
  const notesData = [
    ['Notes'],
    [deal.notes || 'No notes provided.'],
    [],
    ['Generated by LJM Deal Analyzer — LJM Homes LLC'],
    [`Date: ${new Date().toLocaleDateString()}`],
  ]
  const wsNotes = XLSX.utils.aoa_to_sheet(notesData)
  XLSX.utils.book_append_sheet(wb, wsNotes, 'Notes')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(buf)
}

export async function generateSynthesisXlsx(
  deal: DealInput,
  analysis: AnalysisResult
): Promise<Buffer> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  const rows = [
    ['LJM HOMES LLC — BROKER vs EXPERT SYNTHESIS'],
    [],
    ['Metric', 'T-12 (Broker)', 'Pro-Forma (Broker)', 'Expert (LJM)', 'Notes'],
    [
      'EGI',
      analysis.t12.egi,
      analysis.pf.egi,
      analysis.expert.egi,
      'LJM uses 7% vacancy vs broker 5%',
    ],
    [
      'OpEx',
      analysis.t12.opex,
      analysis.pf.opex,
      analysis.expert.total_opex,
      'LJM includes 8% mgmt + $150/unit reserves',
    ],
    [
      'NOI',
      analysis.t12.noi,
      analysis.pf.noi,
      analysis.expert.noi,
      '',
    ],
    ['Expense Ratio', '', '', `${(analysis.expert.expense_ratio * 100).toFixed(1)}%`, ''],
    [],
    ['SCENARIO SUMMARY', '', '', '', ''],
    ['', 'Bear (9% Cap)', 'Base (8% Cap)', 'Bull (7.5% Cap)', ''],
    [
      'MAO',
      ...analysis.scenarios.map((s) => s.mao),
      '',
    ],
    [
      'DSCR',
      ...analysis.scenarios.map((s) => s.dscr.toFixed(3)),
      '',
    ],
    [
      'Exit Value',
      ...analysis.scenarios.map((s) => s.exit_value),
      '',
    ],
    [
      'Equity Multiple',
      ...analysis.scenarios.map((s) => s.equity_multiple.toFixed(2) + 'x'),
      '',
    ],
    [],
    ['VERDICT', analysis.verdict.label, '', '', `Gap to MAO: ${analysis.asking.gap_to_sc2_mao >= 0 ? '+' : ''}${analysis.asking.gap_to_sc2_mao.toFixed(0)} (${(analysis.asking.gap_to_sc2_mao_pct * 100).toFixed(1)}%)`],
    [],
    ['Asking Price', deal.asking_price, '', '', ''],
    ['Base MAO (8%)', analysis.expert.mao, '', '', ''],
    ['Gap', analysis.asking.gap_to_sc2_mao, '', '', ''],
  ]

  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Synthesis')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(buf)
}
