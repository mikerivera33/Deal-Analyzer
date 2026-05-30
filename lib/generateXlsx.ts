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
  const t12 = analysis.t12
  const units = analysis.units
  const rate = deal.interest_rate ?? 0.068
  const ltlPct = deal.loss_to_lease_pct ?? 0.03
  const vacPct = deal.vacancy_pct ?? 0.04
  const delinqPct = deal.delinquency_pct ?? 0.02
  const ioMonths = deal.io_months ?? 0
  const timeToProforma = deal.time_to_proforma_months ?? 24

  // ── Pro-Forma Analysis Sheet (Winding Creek template layout) ────────────────
  // Col layout: A=Description, B=Benchmark, C=Rate/Unit, D=POTENTIAL, E=CURRENT (T-12)
  const rows: Row[] = []

  rows.push(['MULTIFAMILY ANALYSIS'])
  rows.push([])
  rows.push(['PRO-FORMA ANALYSIS'])

  // Property header with unit mix table in cols E+
  rows.push(['Property Name:', deal.property_name || '—', '', '', 'UNIT-MIX RENT TABLE'])
  rows.push([
    'Property Address:',
    [deal.address, deal.city, deal.state].filter(Boolean).join(', ') || '—',
    '', '',
    'Bedrooms', 'Bathrooms', '# Units', 'Market Rent/Unit', 'Monthly', 'Annual',
  ])

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
      ? [
          `${u.bed_count}BR`,
          u.bath_count,
          u.unit_count,
          u.market_rent,
          u.unit_count * u.market_rent,
          u.unit_count * u.market_rent * 12,
        ]
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
  // POTENTIAL: market rents from unit mix
  // CURRENT: actual rents from unit mix (or gross_rental_income fallback)
  const potentialGpr = ex.gpi  // market-rent GPR
  const currentGpr = ex.current_gpr

  // Potential other income: other_income_per_unit * units (annual)
  const otherIncomePerUnit = deal.other_income_per_unit ?? 200
  const potentialOtherIncome = otherIncomePerUnit * units
  const currentOtherIncome = Math.round((deal.other_income ?? 0) + (deal.utility_reimbursement ?? 0))

  const potentialGpi = potentialGpr + potentialOtherIncome
  const currentGpi = currentGpr + currentOtherIncome

  // Apply waterfall to POTENTIAL
  const potLtl = potentialGpr * ltlPct
  const potAfterLtl = potentialGpr - potLtl
  const potVac = potAfterLtl * vacPct
  const potAfterVac = potAfterLtl - potVac
  const potDelinq = potAfterVac * delinqPct
  const potNetRent = potAfterVac - potDelinq
  const potGci = potNetRent + potentialOtherIncome

  // Apply waterfall to CURRENT
  const curLtl = currentGpr * ltlPct
  const curAfterLtl = currentGpr - curLtl
  const curVac = curAfterLtl * vacPct
  const curAfterVac = curAfterLtl - curVac
  const curDelinq = curAfterVac * delinqPct
  const curNetRent = curAfterVac - curDelinq
  const curGci = curNetRent + currentOtherIncome

  rows.push(['INCOME', '', '', 'POTENTIAL', 'CURRENT'])
  rows.push(['Gross Potential Rent', '', '', Math.round(potentialGpr), Math.round(currentGpr)])
  rows.push([
    'Other Income',
    '$200-$400/Unit',
    `$${Math.round(otherIncomePerUnit)}/Unit`,
    Math.round(potentialOtherIncome),
    Math.round(currentOtherIncome),
  ])
  rows.push(['Gross Potential Income', '', '', Math.round(potentialGpi), Math.round(currentGpi)])
  rows.push(['Loss to Lease', '0%-5%', pct(ltlPct), -Math.round(potLtl), -Math.round(curLtl)])
  rows.push(['Vacancy Rate', '4%-8%', pct(vacPct), -Math.round(potVac), -Math.round(curVac)])
  rows.push(['Delinquency', '4%-6%', pct(delinqPct), -Math.round(potDelinq), -Math.round(curDelinq)])
  rows.push(['Gross Collected Income', '', '', Math.round(potGci), Math.round(curGci)])
  rows.push([])

  // ── EXPENSES ────────────────────────────────────────────────────────────────
  // POTENTIAL: expertOpEx logic (floors applied)
  // CURRENT: T-12 actuals as reported
  const gci = potGci  // potential GCI for mgmt pct calc
  const expPot = {
    insurance: deal.insurance ?? 0,
    taxes: deal.property_taxes ?? 0,
    utilities: deal.utilities ?? 0,
    rm: (deal.repairs_maintenance ?? 0) > 0 ? (deal.repairs_maintenance ?? 0) : 500 * units,
    mgmt: Math.max(deal.management_fee ?? 0, gci * 0.05),
    payroll: deal.payroll ?? 0,
    admin: deal.admin_fees ?? 0,
    reserve: Math.max(deal.reserves ?? 0, 150 * units),
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

  rows.push(['EXPENSES', '', '', 'POTENTIAL', 'CURRENT'])
  rows.push([
    'Insurance', '$450-$700/unit', perUnit(expPot.insurance),
    Math.round(expPot.insurance), Math.round(expCur.insurance),
  ])
  rows.push([
    'Taxes', '0.5%-2.5% of PP',
    deal.asking_price ? pct(expPot.taxes / deal.asking_price, 2) : '',
    Math.round(expPot.taxes), Math.round(expCur.taxes),
  ])
  rows.push([
    'Utilities', '$700-$800/unit', perUnit(expPot.utilities),
    Math.round(expPot.utilities), Math.round(expCur.utilities),
  ])
  rows.push([
    'Repairs & Maintenance', '$700-$1,000/unit', perUnit(expPot.rm),
    Math.round(expPot.rm), Math.round(expCur.rm),
  ])
  rows.push([
    'Management', '3%-5%', pct(expPot.mgmt / Math.max(gci, 1), 2),
    Math.round(expPot.mgmt), Math.round(expCur.mgmt),
  ])
  rows.push([
    'Payroll', '$800-$1,100/unit', perUnit(expPot.payroll),
    Math.round(expPot.payroll), Math.round(expCur.payroll),
  ])
  rows.push([
    'General & Admin', '$200-$300/unit', perUnit(expPot.admin),
    Math.round(expPot.admin), Math.round(expCur.admin),
  ])
  rows.push([
    'Replacement Reserve', '$100-$250/unit', perUnit(expPot.reserve),
    Math.round(expPot.reserve), Math.round(expCur.reserve),
  ])
  rows.push(['Other Expenses', '', '', 0, 0])

  const totalExpPot = Object.values(expPot).reduce((s, v) => s + v, 0)
  const totalExpCur = Object.values(expCur).reduce((s, v) => s + v, 0)
  rows.push(['Total Expenses', '', '', Math.round(totalExpPot), Math.round(totalExpCur)])
  rows.push([])

  const expRatioPot = potGci > 0 ? totalExpPot / potGci : 0
  const expRatioCur = curGci > 0 ? totalExpCur / curGci : 0
  rows.push(['Expense Ratio', '', '', pct(expRatioPot), pct(expRatioCur)])
  rows.push([])

  const potNoi = potGci - totalExpPot
  const curNoi = curGci - totalExpCur
  rows.push(['Net Operating Income (NOI)', '', '', Math.round(potNoi), Math.round(curNoi)])
  rows.push([])

  // ── OFFER ───────────────────────────────────────────────────────────────────
  const desiredCap = deal.desired_cap_rate ?? 0.09
  rows.push(['All In Cost (Desired Cap Rate)', 'market cap + 1.5-3%', pct(desiredCap), Math.round(ex.all_in_cost), ''])
  rows.push([])
  rows.push(['Improvements/CapEx Cost:', '', '', Math.round(ex.total_capex), ''])
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
  rows.push(['Seller Carry', '', '', Math.round(deal.seller_carry ?? 0), ''])
  rows.push(['Equity Required', '', '', Math.round(ex.partner_equity), ''])
  rows.push(['Total Funding', '', '', Math.round(ex.total_uses), ''])
  rows.push([])

  // ── DEBT ────────────────────────────────────────────────────────────────────
  rows.push(['DEBT', '', '', '', ''])
  rows.push(['Interest Rate', '', pct(rate, 2), '', ''])
  rows.push(['Term (months)', '', '360', '', ''])
  rows.push(['Annual Debt Service', '', '', Math.round(ex.annual_debt_service), ''])
  rows.push([
    'Annual Debt Service w/ I/O', '',
    ioMonths > 0 ? `${ioMonths} months` : '',
    Math.round(ex.annual_debt_service_io), '',
  ])
  rows.push([])

  // ── PARTNER EQUITY ───────────────────────────────────────────────────────────
  rows.push(['PARTNER EQUITY', '', '', '', ''])
  rows.push(['Partner Equity', '', '', Math.round(ex.partner_equity), ''])
  rows.push(['Pref Return on Equity', '', pct(ex.pref_return_rate, 1), '', ''])
  rows.push(['Annual Pref Return', '', '', Math.round(ex.annual_pref_return), ''])
  rows.push([])

  // ── CASH FLOW ────────────────────────────────────────────────────────────────
  rows.push(['CASH FLOW', '', '', '', ''])
  rows.push([
    'Annual Cash Flow - current post closing w/ I/O', '', '',
    Math.round(ex.annual_cash_flow_current_io), '',
  ])
  rows.push([
    'Annual Cash Flow - proforma with I/O', '', '',
    Math.round(ex.annual_cash_flow_proforma_io), '',
  ])
  rows.push([
    'Annual Cash Flow - proforma after I/O', '', '',
    Math.round(ex.annual_cash_flow_proforma_amort), '',
  ])
  rows.push([])

  // ── DSCR ────────────────────────────────────────────────────────────────────
  rows.push(['DSCR (Current - assuming I/O)', '', '', ex.dscr_current_io.toFixed(2) + 'x', ''])
  rows.push(['DSCR (Proforma) w/ I/O', '', '', ex.dscr_io.toFixed(2) + 'x', ''])
  rows.push(['DSCR (Proforma) after I/O', '', '', ex.dscr_amort.toFixed(2) + 'x', ''])
  rows.push([])
  rows.push(['Time Period to Reach Potential Rents (months)', '', '', timeToProforma, ''])
  rows.push([])

  // ── REFINANCE OPTION AT PROFORMA ─────────────────────────────────────────────
  rows.push(['REFINANCE OPTION AT PROFORMA', '', '', '', ''])
  rows.push([
    'Stabilized value (Enter market CAP rate)', '',
    pct(ex.refi_market_cap, 2),
    Math.round(ex.refi_value), '',
  ])
  rows.push(['Loan Amount (Enter LTV)', '', '75.00%', Math.round(ex.refi_loan), ''])
  rows.push(['Refinance Cost', '1%-2%', pct(deal.refi_cost_pct ?? 0.015, 1), -Math.round(ex.refi_cost_amount), ''])
  rows.push(['Loan payoff', '', '', -Math.round(ex.refi_loan_payoff), ''])
  rows.push(['Net Proceeds', '', '', Math.round(ex.refi_net_proceeds), ''])
  rows.push(['Investor capital return', '', '', Math.round(ex.refi_investor_capital_return), ''])
  rows.push(['Investor capital remaining', '', '', Math.round(ex.refi_investor_remaining), ''])
  rows.push(['Net cash proceeds', '', '', Math.round(ex.refi_net_cash), ''])
  rows.push([])

  // ── SALE OPTION AT PROFORMA ───────────────────────────────────────────────────
  rows.push(['SALE OPTION AT PROFORMA', '', '', '', ''])
  rows.push([
    'Stabilized value (CAP rate)', '',
    pct(ex.sale_cap, 2),
    Math.round(ex.sale_value), '',
  ])
  rows.push(['Sales Cost', '2%-4%', pct(deal.sales_cost_pct ?? 0.02, 1), -Math.round(ex.sale_cost_amount), ''])
  rows.push(['Loan payoff', '', '', -Math.round(ex.sale_loan_payoff), ''])
  rows.push(['Net Proceeds', '', '', Math.round(ex.sale_net_proceeds), ''])
  rows.push(['Return of Partner Capital', '', '', Math.round(ex.partner_capital_return), ''])
  rows.push(['Projected Gain', '', '', Math.round(ex.projected_gain), ''])
  rows.push([])

  // ── PARTNER RETURN ON SALE AT PROFORMA ───────────────────────────────────────
  rows.push(['PARTNER RETURN ON SALE AT PROFORMA', '', '', '', ''])
  rows.push([
    'Equity Distributions', '',
    pct(ex.equity_share_pct, 1),
    Math.round(ex.equity_distributions), '',
  ])
  rows.push(['Preferred Returns', '', '', -Math.round(ex.partner_pref_returns_total), ''])
  rows.push(['Total', '', '', Math.round(ex.partner_total_return), ''])
  rows.push(['Annualized Return', '', '', pct(ex.annualized_return, 1), ''])
  rows.push([])

  rows.push([FOOTER])

  const ws1 = XLSX.utils.aoa_to_sheet(rows)
  ws1['!cols'] = [{ wch: 42 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 16 }]
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
    ['Loan Amount (75% LTC)', sc[0].loan_amount, sc[1].loan_amount, sc[2].loan_amount],
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
    ['Asking Price', analysis.asking.price > 0 ? analysis.asking.price : '(call for offers)'],
    ['LJM Max Offer (NOI / 9% cap − CapEx)', Math.round(analysis.expert.max_offer)],
    ['Gap (Max Offer − Asking)', analysis.asking.price > 0 ? Math.round(analysis.asking.gap_to_sc2_mao) : '—'],
    ['Gap %', analysis.asking.price > 0 ? pct(analysis.asking.gap_to_sc2_mao_pct) : '—'],
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
