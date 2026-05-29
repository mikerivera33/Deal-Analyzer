import type {
  DealInput,
  ExpertAnalysis,
  Scenario,
  RiskRow,
  AnalysisResult,
  IncomeStatement,
} from './types'
import { pmt, loanBalance, safeNum, sanitizeString } from './utils'

const LTV = 0.75
const INTEREST_RATE = 0.075
const AMORT_YEARS = 30
const HOLD_YEARS = 5
const NOI_GROWTH = 0.02
const CLOSING_COST_PCT = 0.03
const EXPERT_VACANCY = 0.07
const BROKER_VACANCY = 0.05
const MGMT_FEE_PCT = 0.08
const RESERVE_PER_UNIT = 150

const SCENARIO_CAPS = [0.09, 0.08, 0.075]
const SCENARIO_LABELS = ['Bear', 'Base', 'Bull']

/**
 * Derive annual Gross Potential Rent (GPR) from whatever income data is available.
 * Priority: unit_mix actual_rent sum → gross_rental_income (un-vacancied from broker 5%) → 0
 */
function grossPotentialRent(deal: DealInput): number {
  // If unit mix is provided with actual rents, derive GPR directly
  if (deal.unit_mix && deal.unit_mix.length > 0) {
    const mixTotal = deal.unit_mix.reduce(
      (sum, u) => sum + safeNum(u.unit_count) * safeNum(u.actual_rent),
      0
    )
    if (mixTotal > 0) return mixTotal * 12
  }
  // Otherwise reverse-engineer GPR from broker T-12 (which is net of 5% vacancy)
  const gri = safeNum(deal.gross_rental_income)
  if (gri > 0) {
    return gri / (1 - BROKER_VACANCY)
  }
  return 0
}

function expertEgi(deal: DealInput): number {
  const gpr = grossPotentialRent(deal)
  const egi = gpr * (1 - EXPERT_VACANCY)
  return egi + safeNum(deal.other_income) + safeNum(deal.utility_reimbursement)
}

function expertOpEx(deal: DealInput, egi: number): number {
  const taxes = safeNum(deal.property_taxes)
  const insurance = safeNum(deal.insurance)
  const mgmt = Math.max(safeNum(deal.management_fee), egi * MGMT_FEE_PCT)
  const utilities = safeNum(deal.utilities)
  const units = Math.max(safeNum(deal.units, 1), 1)
  const reserves = Math.max(safeNum(deal.reserves), RESERVE_PER_UNIT * units)
  return taxes + insurance + mgmt + utilities + reserves
}

function brokerIncomeStatement(deal: DealInput): IncomeStatement {
  const egi =
    safeNum(deal.gross_rental_income) +
    safeNum(deal.other_income) +
    safeNum(deal.utility_reimbursement)
  const opex =
    safeNum(deal.property_taxes) +
    safeNum(deal.insurance) +
    safeNum(deal.management_fee) +
    safeNum(deal.utilities) +
    safeNum(deal.reserves)
  return { egi, opex, noi: egi - opex }
}

function pfIncomeStatement(deal: DealInput): IncomeStatement {
  const egi =
    safeNum(deal.pf_gross_rental || deal.gross_rental_income) +
    safeNum(deal.pf_other_income || deal.other_income) +
    safeNum(deal.pf_utility_reimb || deal.utility_reimbursement)
  const opex =
    safeNum(deal.property_taxes) +
    safeNum(deal.insurance) +
    safeNum(deal.management_fee) +
    safeNum(deal.utilities) +
    safeNum(deal.reserves)
  return { egi, opex, noi: egi - opex }
}

function computeScenario(
  label: string,
  noi: number,
  exitCap: number,
  askingPrice: number,
  units: number
): Scenario {
  const loan = askingPrice * LTV
  const monthlyRate = INTEREST_RATE / 12
  const nper = AMORT_YEARS * 12
  const monthlyPayment = pmt(monthlyRate, nper, loan)
  const annualDebtService = monthlyPayment * 12
  const dscr = annualDebtService > 0 ? noi / annualDebtService : 0
  const mao = exitCap > 0 ? noi / exitCap : 0
  const noiAtExit = noi * Math.pow(1 + NOI_GROWTH, HOLD_YEARS)
  const exitValue = exitCap > 0 ? noiAtExit / exitCap : 0
  const equityReq = askingPrice * (1 - LTV) + askingPrice * CLOSING_COST_PCT
  const kPayments = HOLD_YEARS * 12
  const remainingBalance = loanBalance(monthlyRate, nper, loan, kPayments)
  const cumulativeCF = (noi - annualDebtService) * HOLD_YEARS
  const equityMultiple =
    equityReq > 0 ? (exitValue - remainingBalance + cumulativeCF) / equityReq : 0

  return {
    label,
    cap_rate: askingPrice > 0 ? noi / askingPrice : 0,
    mao,
    mao_per_unit: units > 0 ? mao / units : 0,
    dscr,
    dscr_pass: dscr >= 1.25,
    equity_required: equityReq,
    exit_value: exitValue,
    equity_multiple: equityMultiple,
  }
}

function verdictFromGap(gapPct: number): { label: string; bg: string; fg: string } {
  if (gapPct >= 0) return { label: 'ACQUIRE', bg: '#16a34a', fg: '#ffffff' }
  if (gapPct > -0.1) return { label: 'NEGOTIATE', bg: '#d97706', fg: '#ffffff' }
  if (gapPct > -0.2) return { label: 'PASS', bg: '#ea580c', fg: '#ffffff' }
  return { label: 'AVOID', bg: '#dc2626', fg: '#ffffff' }
}

function generateRiskRegister(deal: DealInput, expert: ExpertAnalysis): RiskRow[] {
  const rows: RiskRow[] = []
  const yr = safeNum(deal.year_built, 1990)

  if (yr > 0 && yr < 1985) {
    rows.push({
      risk: 'Deferred Maintenance / Cap-Ex',
      severity: 4,
      likelihood: 4,
      score: 16,
      notes: `Built ${yr}. Expect roof, HVAC, plumbing replacements. Budget $8–15k/unit.`,
    })
  } else if (yr > 0 && yr < 2000) {
    rows.push({
      risk: 'Deferred Maintenance / Cap-Ex',
      severity: 3,
      likelihood: 3,
      score: 9,
      notes: `Built ${yr}. Moderate cap-ex exposure. Inspect mechanicals closely.`,
    })
  }

  if (!expert.dscr_pass) {
    rows.push({
      risk: 'Debt Service Coverage',
      severity: 4,
      likelihood: 5,
      score: 20,
      notes: `DSCR ${expert.dscr.toFixed(2)} < 1.25 minimum. Lender may decline or require higher down.`,
    })
  } else if (expert.dscr < 1.4) {
    rows.push({
      risk: 'Thin Debt Coverage',
      severity: 3,
      likelihood: 2,
      score: 6,
      notes: `DSCR ${expert.dscr.toFixed(2)} passes but leaves little buffer for expense spikes.`,
    })
  }

  rows.push({
    risk: 'Interest Rate / Refinance Risk',
    severity: 3,
    likelihood: 3,
    score: 9,
    notes: 'Rising rates at refi could compress cash flow. Stress-test at +200 bps.',
  })

  // Broker uses 5% vacancy; LJM uses 7% — always flag this discrepancy
  rows.push({
    risk: 'Vacancy Overstatement',
    severity: 3,
    likelihood: 3,
    score: 9,
    notes: `Broker underwrites ${(BROKER_VACANCY * 100).toFixed(0)}% vacancy; LJM uses ${(EXPERT_VACANCY * 100).toFixed(0)}% for stabilized market.`,
  })

  rows.push({
    risk: 'Expense Inflation',
    severity: 3,
    likelihood: 3,
    score: 9,
    notes: 'Insurance and property taxes rising 5–10%/yr in most markets.',
  })

  rows.push({
    risk: 'Market Cap Rate Expansion',
    severity: 4,
    likelihood: 2,
    score: 8,
    notes: 'If exit cap rises 50–100 bps, exit value drops materially.',
  })

  rows.push({
    risk: 'Rent Growth Stagnation',
    severity: 2,
    likelihood: 2,
    score: 4,
    notes: 'Pro-forma assumes 2% NOI growth. New supply or economic slowdown could stall this.',
  })

  if (safeNum(deal.asking_price) > 2_000_000) {
    rows.push({
      risk: 'Financing Execution',
      severity: 3,
      likelihood: 2,
      score: 6,
      notes: 'Larger loan size may require agency financing; longer lead time to close.',
    })
  }

  return rows.sort((a, b) => b.score - a.score)
}

export function runDealEngine(deal: DealInput): AnalysisResult {
  const askingPrice = safeNum(deal.asking_price)
  const units = Math.max(safeNum(deal.units, 1), 1)

  const egi = expertEgi(deal)
  const total_opex = expertOpEx(deal, egi)
  const noi = egi - total_opex
  const expense_ratio = egi > 0 ? total_opex / egi : 0

  const loan = askingPrice * LTV
  const monthlyRate = INTEREST_RATE / 12
  const nper = AMORT_YEARS * 12
  const monthlyPayment = pmt(monthlyRate, nper, loan)
  const annual_debt_service = monthlyPayment * 12
  const dscr = annual_debt_service > 0 ? noi / annual_debt_service : 0
  const cap_rate = askingPrice > 0 ? noi / askingPrice : 0
  const baseCap = SCENARIO_CAPS[1]
  const mao = baseCap > 0 ? noi / baseCap : 0
  const noiAtExit = noi * Math.pow(1 + NOI_GROWTH, HOLD_YEARS)
  const exit_value = baseCap > 0 ? noiAtExit / baseCap : 0
  const equity_required = askingPrice * (1 - LTV) + askingPrice * CLOSING_COST_PCT
  const kPayments = HOLD_YEARS * 12
  const remainingBalance = loanBalance(monthlyRate, nper, loan, kPayments)
  const annual_cash_flow = noi - annual_debt_service
  const cumulative_cf = annual_cash_flow * HOLD_YEARS
  const equity_multiple =
    equity_required > 0 ? (exit_value - remainingBalance + cumulative_cf) / equity_required : 0
  const cash_on_cash = equity_required > 0 ? annual_cash_flow / equity_required : 0
  const mao_per_unit = units > 0 ? mao / units : 0

  const expert: ExpertAnalysis = {
    egi,
    total_opex,
    noi,
    expense_ratio,
    cap_rate,
    mao,
    mao_per_unit,
    dscr,
    dscr_pass: dscr >= 1.25,
    equity_required,
    exit_value,
    equity_multiple,
    annual_cash_flow,
    cash_on_cash,
    loan_amount: loan,
    annual_debt_service,
  }

  const scenarios: Scenario[] = SCENARIO_CAPS.map((cap, i) =>
    computeScenario(SCENARIO_LABELS[i], noi, cap, askingPrice, units)
  )

  const baseMao = scenarios[1].mao
  const gap = baseMao - askingPrice
  const gapPct = askingPrice > 0 ? gap / askingPrice : 0

  const t12 = brokerIncomeStatement(deal)
  const pf = pfIncomeStatement(deal)

  const propertyDisplay: Record<string, string> = {
    Property: sanitizeString(deal.property_name) || '—',
    Address: sanitizeString(deal.address) || '—',
    'City / State / ZIP':
      [deal.city, deal.state, deal.zip_code].filter(Boolean).map(sanitizeString).join(', ') || '—',
    'Year Built': deal.year_built?.toString() || '—',
    Units: deal.units?.toString() || '—',
    'Total SF': deal.total_sf ? deal.total_sf.toLocaleString() + ' sf' : '—',
    Occupancy: deal.occupancy_pct != null ? `${(deal.occupancy_pct * 100).toFixed(0)}%` : '—',
    'Sale Type': sanitizeString(deal.sale_type) || '—',
    'Broker Cap Rate':
      deal.broker_cap_rate != null ? `${(deal.broker_cap_rate * 100).toFixed(2)}%` : '—',
  }

  return {
    verdict: verdictFromGap(gapPct),
    asking: { price: askingPrice, gap_to_sc2_mao: gap, gap_to_sc2_mao_pct: gapPct },
    property: propertyDisplay,
    t12,
    pf,
    expert,
    scenarios,
    risk_register: generateRiskRegister(deal, expert),
    units,
  }
}
