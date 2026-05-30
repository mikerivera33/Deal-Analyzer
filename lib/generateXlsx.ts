import type { AnalysisResult, DealInput } from './types'

const FOOTER = 'LJM DEAL ANALYZER  |  LJM Homes LLC  |  Methodology: Michael Rivera Advisor Framework'

function pct(n: number, d = 1) {
  return `${(n * 100).toFixed(d)}%`
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

type Row = (string | number)[]

export async function generateUnderwritingXlsx(
  deal: DealInput,
  analysis: AnalysisResult
): Promise<Buffer> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  const sc = analysis.scenarios
  const ex = analysis.expert
  const exi = analysis.expert_income
  const t12 = analysis.t12
  const units = analysis.units
  const rate = deal.interest_rate ?? 0.068
  const ltlPct = deal.loss_to_lease_pct ?? 0.03
  const vacPct = deal.vacancy_pct ?? 0.04
  const delinqPct = deal.delinquency_pct ?? 0.02

  // ── Pro-Forma Analysis Sheet (Winding Creek template layout) ────────────────
  // Col layout: A=Description, B=Benchmark, C=Rate/Unit, D=POTENTIAL, E=CURRENT (T-12)
  const rows: Row[] = []

  rows.push(['MULTIFAMILY ANALYSIS'])
  rows.push([])
  rows.push(['PRO-FORMA ANALYSIS'])

  // Property header with unit mix table in cols E+
  rows.push(['Property Name:', deal.property_name || '—', '', '', 'UNIT-MIX RENT TABLE'])
  rows.push(['Property Address:', [deal.address, deal.city, deal.state].filter(Boolean).join(', ') || '—', '', '', 'Bedrooms', 'Bathrooms', '# Units', 'Potential Rent', 'Monthly', 'Annual'])

  // Unit mix rows alongside property details
  const unitMix = deal.unit_mix || []
  const propDetails: Row[] = [
    ['Year Built:', deal.year_built || '—'],
    ['Total Sq Ft:', deal.total_sf ? deal.total_sf.toLocaleString() + ' sf' : '—'],
    ['Number of Units:', units],
    ['Occupancy:', deal.occupancy_pct != null ? pct(deal.occupancy_pct, 0) : '—'],
    ['Proposed Price:', fmtMoney(ex.max_offer)],
    ['Broker Asking Price:', deal.asking_price ? fmtMoney(deal.asking_price) : '—'],
  ]

  const maxPropRows = Math.max(propDetails.length, unitMix.length)
  for (let i = 0; i < maxPropRows; i++) {
    const pd = propDetails[i] || ['', '']
    const u = unitMix[i]
    const uRow: Row = u
      ? [`${u.bed_count}BR`, u.bath_count, u.unit_count, u.market_rent, u.unit_count * u.market_rent, u.unit_count * u.market_rent * 12]
      : []
    rows.push([...pd, '', '', ...uRow])
  }

  // Unit mix totals
  const totalUnits = unitMix.reduce((s, u) => s + u.unit_count, 0)
  const totalMonthly = unitMix.reduce((s, u) => s + u.unit_count * u.market_rent, 0)
  const totalAnnual = totalMonthly * 12
  rows.push(['', '', '', '', 'TOTAL', '', totalUnits, '', totalMonthly, totalAnnual])
  rows.push([])

  // ── INCOME ──────────────────────────────────────────────────────────────────
  rows.push(['INCOME', '', '', 'POTENTIAL', 'CURRENT (T-12)'])
  rows.push(['Gross Potential Rent', '', '', Math.round(exi.gross_rental_income), Math.round(t12.gross_rental_income)])
  const otherPotential = Math.round(exi.utility_reimbursement + exi.other_income)
  const otherCurrent = Math.round(t12.utility_reimbursement + t12.other_income)
  rows.push(['Other Income', '$200-$400/unit', `$${Math.round(otherPotential / Math.max(units, 1))}/unit`, otherPotential, otherCurrent])
  rows.push(['Gross Potential Income', '', '', Math.round(exi.gpi), Math.round(t12.gpi)])
  rows.push(['Loss to Lease', '0%-5%', pct(ltlPct), Math.round(ex.loss_to_lease), ''])
  rows.push(['Vacancy Rate', '4%-8%', pct(vacPct), Math.round(ex.vacancy_loss), ''])
  rows.push(['Delinquency', '2%-4%', pct(delinqPct), Math.round(ex.delinquency_loss), ''])
  rows.push(['Gross Collected Income', '', '', Math.round(ex.gross_collected_income), Math.round(t12.egi)])
  rows.push([])

  // ── EXPENSES ────────────────────────────────────────────────────────────────
  const gci = ex.gross_collected_income
  const expPot = {
    insurance: Math.max(deal.insurance ?? 0, 1200 * units),
    taxes: deal.property_taxes ?? 0,
    utilities: deal.utilities || 1456 * units,
    rm: deal.repairs_maintenance || 750 * units,
    mgmt: Math.max(deal.management_fee ?? 0, gci * 0.05),
    payroll: deal.payroll || 1100 * units,
    admin: deal.admin_fees || 250 * units,
    reserve: Math.max(deal.reserves ?? 0, 250 * units),
  }
  const expCur = {
    insurance: deal.insurance ?? 0,
    taxes: deal.property_taxes ?? 0,
    utilities: deal.utilities ?? 0,
    rm: deal.repairs_maintenance ?? 0,
    mgmt: deal.management_fee ?? 0,
    payroll: deal.payroll ?? 0,
    admin: deal.admin_fees ?? 0,
    reserve: deal.reserves ?? 0,
  }
  const perUnit = (v: number) => units > 0 ? `$${Math.round(v / units)}/unit` : ''

  rows.push(['EXPENSES', '', '', 'POTENTIAL', 'CURRENT (T-12)'])
  rows.push(['Insurance', '$450-$700/unit', perUnit(expPot.insurance), Math.round(expPot.insurance), Math.round(expCur.insurance)])
  rows.push(['Taxes', '0.5%-2.5% of PP', deal.asking_price ? pct(expPot.taxes / deal.asking_price, 2) : '', Math.round(expPot.taxes), Math.round(expCur.taxes)])
  rows.push(['Utilities', '$700-$800/unit', perUnit(expPot.utilities), Math.round(expPot.utilities), Math.round(expCur.utilities)])
  rows.push(['Repairs & Maintenance', '$700-$1,000/unit', perUnit(expPot.rm), Math.round(expPot.rm), Math.round(expCur.rm)])
  rows.push(['Management', '3%-5%', pct(expPot.mgmt / Math.max(gci, 1), 2), Math.round(expPot.mgmt), Math.round(expCur.mgmt)])
  rows.push(['Payroll', '$800-$1,100/unit', perUnit(expPot.payroll), Math.round(expPot.payroll), Math.round(expCur.payroll)])
  rows.push(['General & Admin', '$200-$300/unit', perUnit(expPot.admin), Math.round(expPot.admin), Math.round(expCur.admin)])
  rows.push(['Replacement Reserve', '$100-$250/unit', perUnit(expPot.reserve), Math.round(expPot.reserve), Math.round(expCur.reserve)])
  rows.push(['Other Expenses', '', '', 0, 0])
  const totalExpPot = Object.values(expPot).reduce((s, v) => s + v, 0)
  const totalExpCur = Object.values(expCur).reduce((s, v) => s + v, 0)
  rows.push(['Total Expenses', '', '', Math.round(totalExpPot), Math.round(totalExpCur)])
  rows.push([])

  const expRatioPot = gci > 0 ? totalExpPot / gci : 0
  const expRatioCur = t12.egi > 0 ? totalExpCur / t12.egi : 0
  rows.push(['Expense Ratio', '', '', pct(expRatioPot), pct(expRatioCur)])
  rows.push([])

  rows.push(['Net Operating Income (NOI)', '', '', Math.round(ex.noi), Math.round(t12.noi)])
  rows.push([])

  // ── MAX OFFER ───────────────────────────────────────────────────────────────
  const desiredCap = deal.desired_cap_rate ?? 0.09
  rows.push(['All In Cost (Desired Cap Rate)', 'market cap + 1.5-3%', pct(desiredCap), Math.round(ex.all_in_cost), ''])
  rows.push([])
  rows.push(['Improvements/CapEx Cost', '', '', Math.round(ex.total_capex), ''])
  rows.push(['Max Offer Amount', '', '', Math.round(ex.max_offer), ''])
  rows.push(['Cost Per Door', '', '', Math.round(ex.cost_per_door), ''])
  rows.push([])

  // ── USES ────────────────────────────────────────────────────────────────────
  rows.push(['USES', '', '', '', ''])
  rows.push(['Purchase Price', '', '', Math.round(ex.purchase_price), ''])
  rows.push(['Cap Ex', '', '', Math.round(ex.total_capex), ''])
  rows.push(['Acquisition Cost', '1%-2%', '2.00%', Math.round(ex.acquisition_cost), ''])
  rows.push(['Opex/Cash Reserves', '0.5%-1.5%', '1.50%', Math.round(ex.opex_cash_reserve), ''])
  rows.push(['Acquisition Fee', '2%-3%', '4.00%', Math.round(ex.acquisition_fee), ''])
  rows.push(['Total Funding', '', '', Math.round(ex.total_uses), ''])
  rows.push([])

  // ── SOURCES ─────────────────────────────────────────────────────────────────
  rows.push(['SOURCES', '', '', '', ''])
  rows.push(['Loan Amount (75% LTC)', '', '75.00%', Math.round(ex.loan_amount_ltc), ''])
  if ((deal.seller_carry ?? 0) > 0) {
    rows.push(['Seller Carry', '', '', Math.round(deal.seller_carry ?? 0), ''])
  } else {
    rows.push(['Seller Carry (if applicable)', '', '', 0, ''])
  }
  rows.push(['Equity Required', '', '', Math.round(ex.equity_required_ltc), ''])
  rows.push(['Total Funding', '', '', Math.round(ex.total_uses), ''])
  rows.push([])

  // ── DEBT ────────────────────────────────────────────────────────────────────
  const annualDsAmortDisplay = Math.round(ex.noi - ex.annual_cash_flow_amort)
  const annualDsIoDisplay = Math.round(ex.annual_debt_service_io)
  rows.push(['DEBT', '', '', '', ''])
  rows.push(['Interest Rate', '', pct(rate, 2), '', ''])
  rows.push(['Term (months)', '', '360', '', ''])
  rows.push(['Annual Debt Service (amortized)', '', '', annualDsAmortDisplay, ''])
  if ((deal.io_months ?? 0) > 0) {
    rows.push(['Annual Debt Service (I/O)', '', `${deal.io_months} months`, annualDsIoDisplay, ''])
  } else {
    rows.push(['Annual Debt Service (I/O)', '', '', annualDsIoDisplay, ''])
  }
  rows.push([])

  rows.push(['Annual Cash Flow (I/O)', '', '', Math.round(ex.annual_cash_flow_io), ''])
  rows.push(['Annual Cash Flow (amortized)', '', '', Math.round(ex.annual_cash_flow_amort), ''])
  rows.push([])

  rows.push(['DSCR (I/O)', '', '', ex.dscr_io.toFixed(2) + 'x', ''])
  rows.push(['DSCR (amortized)', '', '', ex.dscr_amort.toFixed(2) + 'x', ''])
  rows.push([])

  rows.push([FOOTER])

  const ws1 = XLSX.utils.aoa_to_sheet(rows)
  ws1['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Pro-Forma Analysis')

  // ── Scenarios Sheet ──────────────────────────────────────────────────────────
  const scenRows: Row[] = [
    [`${deal.property_name || 'Property'} — Scenario Analysis`],
    [],
    ['Metric', sc[0].label, sc[1].label, sc[2].label],
    ['Entry Cap Rate', pct(sc[0].cap_rate), pct(sc[1].cap_rate), pct(sc[2].cap_rate)],
    ['MAO (NOI / Cap Rate)', sc[0].mao, sc[1].mao, sc[2].mao],
    ['MAO per Unit', sc[0].mao_per_unit, sc[1].mao_per_unit, sc[2].mao_per_unit],
    ['All-in Basis (MAO + CapEx)', sc[0].all_in_basis, sc[1].all_in_basis, sc[2].all_in_basis],
    ['Loan Amount (65% of MAO)', sc[0].loan_amount, sc[1].loan_amount, sc[2].loan_amount],
    ['Annual Debt Service', sc[0].annual_debt_service, sc[1].annual_debt_service, sc[2].annual_debt_service],
    ['DSCR', `${sc[0].dscr.toFixed(2)}x`, `${sc[1].dscr.toFixed(2)}x`, `${sc[2].dscr.toFixed(2)}x`],
    ['DSCR Pass (>=1.25x)', sc[0].dscr_pass ? 'PASS' : 'FAIL', sc[1].dscr_pass ? 'PASS' : 'FAIL', sc[2].dscr_pass ? 'PASS' : 'FAIL'],
    ['Equity Required', sc[0].equity_required, sc[1].equity_required, sc[2].equity_required],
    [],
    ['Exit Cap (entry - 1.5%)', pct(sc[0].exit_cap_rate), pct(sc[1].exit_cap_rate), pct(sc[2].exit_cap_rate)],
    ['Post-Opt NOI (NOI x 1.30)', sc[0].post_opt_noi, sc[1].post_opt_noi, sc[2].post_opt_noi],
    ['Exit Sale Value', sc[0].exit_value, sc[1].exit_value, sc[2].exit_value],
    ['Equity Created (Exit - All-in)', sc[0].equity_created, sc[1].equity_created, sc[2].equity_created],
    ['Equity Multiple (5-yr hold)', sc[0].equity_multiple.toFixed(2) + 'x', sc[1].equity_multiple.toFixed(2) + 'x', sc[2].equity_multiple.toFixed(2) + 'x'],
    [],
    ['GAP TO ASKING PRICE'],
    ['Asking Price', analysis.asking.price],
    ['Gap to Sc2 MAO', analysis.asking.price - sc[1].mao],
    ['Gap %', analysis.asking.price > 0 ? pct((analysis.asking.price - sc[1].mao) / analysis.asking.price) : '—'],
    ['Verdict', analysis.verdict.label],
    [],
    [FOOTER],
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(scenRows)
  ws2['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 18 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Scenarios')

  // ── Risk Register Sheet ──────────────────────────────────────────────────────
  const riskRows = analysis.risk_register.map((r, i) => {
    const level = r.score >= 16 ? 'RED' : r.score >= 10 ? 'ORANGE' : r.score >= 5 ? 'YELLOW' : 'GREEN'
    return [i + 1, r.risk, r.severity, r.likelihood, r.score, level, r.notes]
  })
  const ws3 = XLSX.utils.aoa_to_sheet([
    ['#', 'Risk', 'Severity', 'Likelihood', 'Score', 'Level', 'Notes'],
    ...riskRows,
    [],
    [FOOTER],
  ])
  ws3['!cols'] = [{ wch: 4 }, { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 60 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Risk Register')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(buf)
}
