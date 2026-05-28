import type {
  DealInput,
  ExpertAnalysis,
  Scenario,
  RiskRow,
  AnalysisResult,
  IncomeStatement,
} from './types'
import { pmt, loanBalance } from './utils'

const LTV = 0.75
const INTEREST_RATE = 0.075
const AMORT_YEARS = 30
const HOLD_YEARS = 5
const NOI_GROWTH = 0.02
const CLOSING_COST_PCT = 0.03
const EXPERT_VACANCY = 0.07
const MGMT_FEE_PCT = 0.08
const RESERVE_PER_UNIT = 150

const SCENARIO_CAPS = [0.09, 0.08, 0.075]
const SCENARIO_LABELS = ['Bear', 'Base', 'Bull']

function grossRent(deal: DealInput): number {
  const gross = (deal.gross_rental_income || 0) / (1 - 0.05)
  return gross > 0 ? gross : (deal.gross_rental_income || 0)
}

function expertEgi(deal: DealInput): number {
  const gri = grossRent(deal) * (1 - EXPERT_VACANCY)
  return gri + (deal.other_income || 0) + (deal.utility_reimbursement || 0)
}

function expertOpEx(deal: DealInput, egi: number): number {
  const taxes = deal.property_taxes || 0
  const insurance = deal.insurance || 0
  const mgmt = Math.max(deal.management_fee || 0, egi * MGMT_FEE_PCT)
  const utilities = deal.utilities || 0
  const reserves = Math.max(deal.reserves || 0, RESERVE_PER_UNIT * (deal.units || 1))
  return taxes + insurance + mgmt + utilities + reserves
}

function brokerIncomeStatement(deal: DealInput): IncomeStatement {
  const egi = (deal.gross_rental_income || 0) + (deal.other_income || 0) + (deal.utility_reimbursement || 0)
  const opex =
    (deal.property_taxes || 0) +
    (deal.insurance || 0) +
    (deal.management_fee || 0) +
    (deal.utilities || 0) +
    (deal.reserves || 0)
  return { egi, opex, noi: egi - opex }
}

function pfIncomeStatement(deal: DealInput): IncomeStatement {
  const egi =
    (deal.pf_gross_rental || deal.gross_rental_income || 0) +
    (deal.pf_other_income || deal.other_income || 0) +
    (deal.pf_utility_reimb || deal.utility_reimbursement || 0)
  const opex =
    (deal.property_taxes || 0) +
    (deal.insurance || 0) +
    (deal.management_fee || 0) +
    (deal.utilities || 0) +
    (deal.reserves || 0)
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

function verdictFromGap(gap: number, gapPct: number): { label: string; bg: string; fg: string } {
  if (gapPct >= 0) return { label: 'ACQUIRE', bg: '#16a34a', fg: '#ffffff' }
  if (gapPct > -0.1) return { label: 'NEGOTIATE', bg: '#d97706', fg: '#ffffff' }
  if (gapPct > -0.2) return { label: 'PASS', bg: '#ea580c', fg: '#ffffff' }
  return { label: 'AVOID', bg: '#dc2626', fg: '#ffffff' }
}

function generateRiskRegister(deal: DealInput, expert: ExpertAnalysis): RiskRow[] {
  const rows: RiskRow[] = []
  const yr = deal.year_built || 1990

  if (yr < 1985) {
    rows.push({
      risk: 'Deferred Maintenance / Cap-Ex',
      severity: 4,
      likelihood: 4,
      score: 16,
      notes: `Built ${yr}. Expect roof, HVAC, plumbing replacements. Budget $8–15k/unit.`,
    })
  } else if (yr < 2000) {
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

  const brokerVacancy = 0.05
  if (brokerVacancy < EXPERT_VACANCY) {
    rows.push({
      risk: 'Vacancy Overstatement',
      severity: 3,
      likelihood: 3,
      score: 9,
      notes: `Broker underwrites ${(brokerVacancy * 100).toFixed(0)}% vacancy; LJM uses ${(EXPERT_VACANCY * 100).toFixed(0)}% for stabilized market.`,
    })
  }

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

  if ((deal.asking_price || 0) > 2_000_000) {
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
  const askingPrice = deal.asking_price || 0
  const units = deal.units || 1

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
  const mao = SCENARIO_CAPS[1] > 0 ? noi / SCENARIO_CAPS[1] : 0
  const noiAtExit = noi * Math.pow(1 + NOI_GROWTH, HOLD_YEARS)
  const exit_value = noiAtExit / SCENARIO_CAPS[1]
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
    Property: deal.property_name || '—',
    Address: deal.address || '—',
    'City / State / ZIP': [deal.city, deal.state, deal.zip_code].filter(Boolean).join(', ') || '—',
    'Year Built': deal.year_built?.toString() || '—',
    Units: deal.units?.toString() || '—',
    'Total SF': deal.total_sf ? deal.total_sf.toLocaleString() + ' sf' : '—',
    Occupancy: deal.occupancy_pct != null ? `${(deal.occupancy_pct * 100).toFixed(0)}%` : '—',
    'Sale Type': deal.sale_type || '—',
    'Broker Cap Rate':
      deal.broker_cap_rate != null ? `${(deal.broker_cap_rate * 100).toFixed(2)}%` : '—',
  }

  return {
    verdict: verdictFromGap(gap, gapPct),
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
