import type {
  DealInput,
  ExpertAnalysis,
  Scenario,
  RiskRow,
  AnalysisResult,
  IncomeStatement,
} from './types'
import { pmt, loanBalance, safeNum, sanitizeString } from './utils'

// ─── Financing Defaults ───────────────────────────────────────────────────────
const LTC_DEFAULT = 0.75           // 75% Loan-to-Cost
const RATE_DEFAULT = 0.068
const AMORT_MONTHS = 360
const HOLD_YEARS = 5
const DESIRED_CAP_DEFAULT = 0.09   // 9% target all-in yield
const POST_OPT_UPLIFT = 1.30
const EXIT_CAP_COMPRESSION = 0.015

// ─── Income Loss Defaults ─────────────────────────────────────────────────────
const LOSS_TO_LEASE_DEFAULT = 0.03
const VACANCY_DEFAULT = 0.04
const DELINQUENCY_DEFAULT = 0.02

// ─── Expense Defaults ─────────────────────────────────────────────────────────
const MGMT_FEE_PCT = 0.05
const RESERVE_PER_UNIT = 150
const RM_PER_UNIT_DEFAULT = 500
const CAPEX_MULTIPLIER = 1.18       // 10% contingency + 8% construction mgmt
const CAPEX_PER_UNIT_DEFAULT = 10_000

// ─── Scenario Definitions ─────────────────────────────────────────────────────
const SCENARIO_CAPS = [0.085, 0.080, 0.075]
const SCENARIO_LABELS = ['Sc1 — 8.5%', 'Sc2 — 8.0%', 'Sc3 — 7.5%']

// ─── Income Helpers ───────────────────────────────────────────────────────────

function zeroIncomeStatement(): IncomeStatement {
  return {
    gross_rental_income: 0,
    utility_reimbursement: 0,
    other_income: 0,
    gpi: 0,
    vacancy_bad_debt: 0,
    egi: 0,
    opex: 0,
    noi: 0,
    expense_ratio: 0,
  }
}

function totalReportedExpenses(deal: DealInput): number {
  return (
    safeNum(deal.property_taxes) +
    safeNum(deal.insurance) +
    safeNum(deal.management_fee) +
    safeNum(deal.utilities) +
    safeNum(deal.reserves) +
    safeNum(deal.payroll) +
    safeNum(deal.repairs_maintenance) +
    safeNum(deal.admin_fees)
  )
}

// ─── T-12 / Broker Income Statements ─────────────────────────────────────────

function t12IncomeStatement(deal: DealInput): IncomeStatement {
  const gri = safeNum(deal.gross_rental_income)
  const util = safeNum(deal.utility_reimbursement)
  const other = safeNum(deal.other_income)
  const gpi = gri + util + other
  const egi = gpi // vacancy already baked into T-12
  const opex = totalReportedExpenses(deal)
  const noi = egi - opex
  return {
    gross_rental_income: gri,
    utility_reimbursement: util,
    other_income: other,
    gpi,
    vacancy_bad_debt: 0,
    egi,
    opex,
    noi,
    expense_ratio: egi > 0 ? opex / egi : 0,
  }
}

function brokerT2IncomeStatement(deal: DealInput): IncomeStatement {
  const gri = safeNum(deal.t2_gross_rental)
  const util = safeNum(deal.t2_utility_reimb)
  const other = safeNum(deal.t2_other_income)
  if (gri === 0 && util === 0 && other === 0) return zeroIncomeStatement()
  const gpi = gri + util + other
  const egi = gpi
  const opex = totalReportedExpenses(deal)
  const noi = egi - opex
  return {
    gross_rental_income: gri,
    utility_reimbursement: util,
    other_income: other,
    gpi,
    vacancy_bad_debt: 0,
    egi,
    opex,
    noi,
    expense_ratio: egi > 0 ? opex / egi : 0,
  }
}

function pfIncomeStatement(deal: DealInput): IncomeStatement {
  const gri = safeNum(deal.pf_gross_rental || deal.gross_rental_income)
  const util = safeNum(deal.pf_utility_reimb || deal.utility_reimbursement)
  const other = safeNum(deal.pf_other_income || deal.other_income)
  const gpi = gri + util + other
  const vacancyLoss = gri * VACANCY_DEFAULT
  const egi = gpi - vacancyLoss
  const opex = totalReportedExpenses(deal)
  const noi = egi - opex
  return {
    gross_rental_income: gri,
    utility_reimbursement: util,
    other_income: other,
    gpi,
    vacancy_bad_debt: -vacancyLoss,
    egi,
    opex,
    noi,
    expense_ratio: egi > 0 ? opex / egi : 0,
  }
}

// ─── Expert Income (GPR → LTL → Vacancy → Delinquency → EGI) ─────────────────

function currentGrossRent(deal: DealInput): number {
  if (deal.unit_mix && deal.unit_mix.length > 0) {
    const mixTotal = deal.unit_mix.reduce(
      (sum, u) => sum + safeNum(u.unit_count) * safeNum(u.actual_rent),
      0
    )
    if (mixTotal > 0) return mixTotal * 12
  }
  return safeNum(deal.gross_rental_income)
}

function grossPotentialRent(deal: DealInput): number {
  if (deal.unit_mix && deal.unit_mix.length > 0) {
    const mixTotal = deal.unit_mix.reduce(
      (sum, u) => sum + safeNum(u.unit_count) * safeNum(u.market_rent),
      0
    )
    if (mixTotal > 0) return mixTotal * 12
  }
  const gri = safeNum(deal.gross_rental_income)
  if (gri > 0) {
    // Reverse-engineer GPR from T-12 collected rent assuming LTL + vacancy
    const ltlRate = safeNum(deal.loss_to_lease_pct, LOSS_TO_LEASE_DEFAULT)
    const vacRate = safeNum(deal.vacancy_pct, VACANCY_DEFAULT)
    return gri / (1 - ltlRate - vacRate)
  }
  return 0
}

interface ExpertIncomeBreakdown {
  gpr: number
  loss_to_lease: number
  vacancy_loss: number
  delinquency_loss: number
  gross_collected_income: number
  egi: number
}

function expertIncomeBreakdown(deal: DealInput): ExpertIncomeBreakdown {
  const gpr = grossPotentialRent(deal)
  const ltlRate = safeNum(deal.loss_to_lease_pct, LOSS_TO_LEASE_DEFAULT)
  const vacRate = safeNum(deal.vacancy_pct, VACANCY_DEFAULT)
  const delinqRate = safeNum(deal.delinquency_pct, DELINQUENCY_DEFAULT)

  const loss_to_lease = gpr * ltlRate
  const gross_collected_rent = gpr - loss_to_lease
  const vacancy_loss = gross_collected_rent * vacRate
  const after_vacancy = gross_collected_rent - vacancy_loss
  const delinquency_loss = after_vacancy * delinqRate
  const net_collected_rent = after_vacancy - delinquency_loss

  const util = safeNum(deal.utility_reimbursement)
  const other = safeNum(deal.other_income)
  const gross_collected_income = net_collected_rent + util + other

  return {
    gpr,
    loss_to_lease,
    vacancy_loss,
    delinquency_loss,
    gross_collected_income,
    egi: gross_collected_income,
  }
}

function expertIncomeStatement(deal: DealInput, opex: number): IncomeStatement {
  const { gpr, loss_to_lease, vacancy_loss, delinquency_loss, egi } = expertIncomeBreakdown(deal)
  const util = safeNum(deal.utility_reimbursement)
  const other = safeNum(deal.other_income)
  const noi = egi - opex
  return {
    gross_rental_income: gpr,
    utility_reimbursement: util,
    other_income: other,
    gpi: gpr,
    vacancy_bad_debt: -(loss_to_lease + vacancy_loss + delinquency_loss),
    egi,
    opex,
    noi,
    expense_ratio: egi > 0 ? opex / egi : 0,
  }
}

// ─── Expert Expenses (8 categories) ──────────────────────────────────────────

function expertOpEx(deal: DealInput, egi: number, units: number): number {
  const taxes = safeNum(deal.property_taxes)
  const insurance = safeNum(deal.insurance)
  const utilities = safeNum(deal.utilities)
  const rm = safeNum(deal.repairs_maintenance) > 0
    ? safeNum(deal.repairs_maintenance)
    : RM_PER_UNIT_DEFAULT * units
  const mgmt = Math.max(safeNum(deal.management_fee), egi * MGMT_FEE_PCT)
  const payroll = safeNum(deal.payroll)
  const admin = safeNum(deal.admin_fees)
  const reserves = Math.max(safeNum(deal.reserves), RESERVE_PER_UNIT * units)
  return taxes + insurance + utilities + rm + mgmt + payroll + admin + reserves
}

// ─── Scenario Computation ─────────────────────────────────────────────────────

function computeScenario(
  label: string,
  entryCap: number,
  noi: number,
  postOptNoi: number,
  units: number,
  capexBudget: number,
  rate: number
): Scenario {
  const exitCap = entryCap - EXIT_CAP_COMPRESSION
  const mao = entryCap > 0 ? noi / entryCap : 0
  const maoPerUnit = units > 0 ? mao / units : 0
  const allInBasis = mao + capexBudget

  // LTC-based loan: 75% of all-in basis (purchase + capex)
  const loanAmount = allInBasis * LTC_DEFAULT
  const monthlyRate = rate / 12
  const monthlyPayment = pmt(monthlyRate, AMORT_MONTHS, loanAmount)
  const annualDebtService = monthlyPayment * 12
  const dscr = annualDebtService > 0 ? noi / annualDebtService : 0

  // Total equity needed (includes transaction costs)
  const acquisitionCost = mao * 0.02
  const opexReserve = mao * 0.015
  const acquisitionFee = mao * 0.04
  const totalUses = mao + capexBudget + acquisitionCost + opexReserve + acquisitionFee
  const equityRequired = Math.max(0, totalUses - loanAmount)

  // Exit valuation
  const exitValue = exitCap > 0 ? postOptNoi / exitCap : 0
  const equityCreated = exitValue - allInBasis

  // Equity multiple: (exit_value - loan_balance_5yr + cumulative_CF) / equity_required
  const loanBalance5yr = loanBalance(monthlyRate, AMORT_MONTHS, loanAmount, HOLD_YEARS * 12)
  const annualCF = noi - annualDebtService
  const cumCF = annualCF * HOLD_YEARS
  const equityMultiple = equityRequired > 0
    ? (exitValue - loanBalance5yr + cumCF) / equityRequired
    : 0

  return {
    label,
    cap_rate: entryCap,
    exit_cap_rate: exitCap,
    mao,
    mao_per_unit: maoPerUnit,
    capex_budget: capexBudget,
    all_in_basis: allInBasis,
    loan_amount: loanAmount,
    annual_debt_service: annualDebtService,
    dscr,
    dscr_pass: dscr >= 1.25,
    equity_required: equityRequired,
    post_opt_noi: postOptNoi,
    exit_value: exitValue,
    equity_created: equityCreated,
    equity_multiple: equityMultiple,
  }
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

function verdictFromGap(gapPct: number): { label: string; bg: string; fg: string } {
  if (gapPct >= 0) return { label: 'PROCEED', bg: '#16a34a', fg: '#ffffff' }
  if (gapPct > -0.1) return { label: 'NEGOTIATE', bg: '#d97706', fg: '#ffffff' }
  if (gapPct > -0.2) return { label: 'PASS', bg: '#ea580c', fg: '#ffffff' }
  return { label: 'DO NOT PROCEED', bg: '#dc2626', fg: '#ffffff' }
}

// ─── Risk Register ────────────────────────────────────────────────────────────

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
      notes: `DSCR ${expert.dscr.toFixed(2)}x < 1.25 minimum. Lender may decline or require higher down payment.`,
    })
  } else if (expert.dscr < 1.4) {
    rows.push({
      risk: 'Thin Debt Coverage',
      severity: 3,
      likelihood: 2,
      score: 6,
      notes: `DSCR ${expert.dscr.toFixed(2)}x passes but leaves little buffer for expense spikes.`,
    })
  }

  rows.push({
    risk: 'Interest Rate / Refinance Risk',
    severity: 3,
    likelihood: 3,
    score: 9,
    notes: 'Rising rates at refi could compress cash flow. Stress-test at +200 bps.',
  })

  rows.push({
    risk: 'Vacancy & Bad Debt',
    severity: 3,
    likelihood: 3,
    score: 9,
    notes: `LJM underwrites ${(VACANCY_DEFAULT * 100).toFixed(0)}% vacancy + ${(DELINQUENCY_DEFAULT * 100).toFixed(0)}% delinquency. Any increase directly reduces NOI.`,
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
    notes: 'If exit cap rises 50–100 bps above projected, exit value drops materially.',
  })

  rows.push({
    risk: 'Rent Growth Stagnation',
    severity: 2,
    likelihood: 2,
    score: 4,
    notes: `Post-optimization NOI assumes ${((POST_OPT_UPLIFT - 1) * 100).toFixed(0)}% uplift. New supply or slowdown could limit upside.`,
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

  rows.push({
    risk: 'Tax Reassessment',
    severity: 3,
    likelihood: 3,
    score: 9,
    notes: 'Sale event may trigger reassessment at purchase price. Verify millage rate and appeal process.',
  })

  return rows.sort((a, b) => b.score - a.score)
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

export function runDealEngine(deal: DealInput): AnalysisResult {
  const askingPrice = safeNum(deal.asking_price)
  const units = Math.max(safeNum(deal.units, 1), 1)
  const rate = safeNum(deal.interest_rate, RATE_DEFAULT)
  const capexPerUnit = safeNum(deal.capex_per_unit, CAPEX_PER_UNIT_DEFAULT)
  const total_capex = capexPerUnit * units * CAPEX_MULTIPLIER

  // ── Expert Income ────────────────────────────────────────────────────────────
  const {
    gpr,
    loss_to_lease,
    vacancy_loss,
    delinquency_loss,
    gross_collected_income,
    egi,
  } = expertIncomeBreakdown(deal)

  const total_opex = expertOpEx(deal, egi, units)
  const noi = egi - total_opex
  const expense_ratio = egi > 0 ? total_opex / egi : 0

  // ── Post-Optimization NOI ────────────────────────────────────────────────────
  const postOptNoi = safeNum(deal.post_opt_noi_override) > 0
    ? safeNum(deal.post_opt_noi_override)
    : noi * POST_OPT_UPLIFT

  // ── Max Offer (NOI / desired_cap − CapEx) ────────────────────────────────────
  const desiredCap = safeNum(deal.desired_cap_rate, DESIRED_CAP_DEFAULT)
  const all_in_cost = desiredCap > 0 ? noi / desiredCap : 0
  const max_offer = all_in_cost - total_capex
  const cost_per_door = units > 0 ? all_in_cost / units : 0

  // ── Uses & Sources ───────────────────────────────────────────────────────────
  const purchase_price = max_offer
  const acquisition_cost = purchase_price > 0 ? purchase_price * 0.02 : 0
  const opex_cash_reserve = purchase_price > 0 ? purchase_price * 0.015 : 0
  const acquisition_fee = purchase_price > 0 ? purchase_price * 0.04 : 0
  const total_uses = purchase_price + total_capex + acquisition_cost + opex_cash_reserve + acquisition_fee

  // LTC: 75% of all-in cost (purchase + capex)
  const loan_amount_ltc = all_in_cost * LTC_DEFAULT
  const seller_carry = safeNum(deal.seller_carry)

  // ── Debt Service ─────────────────────────────────────────────────────────────
  const monthlyRate = rate / 12
  const monthlyPayment = pmt(monthlyRate, AMORT_MONTHS, loan_amount_ltc)
  const annual_debt_service_amort = monthlyPayment * 12
  const dscr_amort = annual_debt_service_amort > 0 ? noi / annual_debt_service_amort : 0
  const annual_cash_flow_amort = noi - annual_debt_service_amort

  const annual_debt_service_io = loan_amount_ltc * rate
  const dscr_io = annual_debt_service_io > 0 ? noi / annual_debt_service_io : 0

  // ── Current Income (actual rents with same waterfall) ────────────────────────
  const ltlRate = safeNum(deal.loss_to_lease_pct, LOSS_TO_LEASE_DEFAULT)
  const vacRate = safeNum(deal.vacancy_pct, VACANCY_DEFAULT)
  const delinqRate = safeNum(deal.delinquency_pct, DELINQUENCY_DEFAULT)
  const currentGpr = currentGrossRent(deal)
  const currentLtl = currentGpr * ltlRate
  const currentAfterLtl = currentGpr - currentLtl
  const currentVac = currentAfterLtl * vacRate
  const currentAfterVac = currentAfterLtl - currentVac
  const currentDelinq = currentAfterVac * delinqRate
  const currentNetRent = currentAfterVac - currentDelinq
  const currentGci = currentNetRent + safeNum(deal.utility_reimbursement) + safeNum(deal.other_income)
  const current_noi = currentGci - totalReportedExpenses(deal)

  // ── Partner Equity & Pref Return ─────────────────────────────────────────────
  const prefRate = safeNum(deal.pref_return_rate, 0.07)
  const equitySharePct = safeNum(deal.equity_share_pct, 0.20)
  // partner_equity = total_uses - loan - seller_carry (can be negative if over-funded)
  const partner_equity = total_uses - loan_amount_ltc - seller_carry
  const annual_pref_return = partner_equity * prefRate

  // ── Three Cash Flows ─────────────────────────────────────────────────────────
  const annual_cash_flow_current_io = current_noi - annual_debt_service_io - annual_pref_return
  const annual_cash_flow_proforma_io = noi - annual_debt_service_io - annual_pref_return
  const annual_cash_flow_proforma_amort = noi - annual_debt_service_amort - annual_pref_return

  // ── Three DSCR rows ──────────────────────────────────────────────────────────
  const dscr_current_io = annual_debt_service_io > 0 ? current_noi / annual_debt_service_io : 0

  // ── Exit & Equity Multiple ───────────────────────────────────────────────────
  const exitCap = desiredCap - EXIT_CAP_COMPRESSION
  const exitValue = exitCap > 0 ? postOptNoi / exitCap : 0
  const loanBalance5yr = loanBalance(monthlyRate, AMORT_MONTHS, loan_amount_ltc, HOLD_YEARS * 12)
  const cumCF = (noi - annual_debt_service_amort) * HOLD_YEARS
  const absEquity = Math.abs(partner_equity)
  const equityMultiple = absEquity > 0
    ? (exitValue - loanBalance5yr + cumCF) / absEquity
    : 0
  const cashOnCash = absEquity > 0 ? (noi - annual_debt_service_amort) / absEquity : 0
  const cap_rate = askingPrice > 0 ? noi / askingPrice : 0

  // ── Refinance Analysis ───────────────────────────────────────────────────────
  const TIME_MONTHS = safeNum(deal.time_to_proforma_months, 24)
  const refiMarketCap = safeNum(deal.market_cap_rate, 0.06)
  const refiLTV = safeNum(deal.refi_ltv, 0.75)
  const refiCostPct = safeNum(deal.refi_cost_pct, 0.015)
  const refi_value = refiMarketCap > 0 ? noi / refiMarketCap : 0
  const refi_loan = refi_value * refiLTV
  const refi_cost_amount = refi_loan * refiCostPct
  const ioMonths = safeNum(deal.io_months, 0)
  const amortMonthsAtRefi = Math.max(0, TIME_MONTHS - ioMonths)
  const refi_loan_payoff = loanBalance(monthlyRate, AMORT_MONTHS, loan_amount_ltc, amortMonthsAtRefi)
  const refi_net_proceeds = refi_loan - refi_cost_amount - refi_loan_payoff
  const refi_investor_capital_return = Math.min(Math.max(refi_net_proceeds, 0), absEquity)
  const refi_investor_remaining = absEquity - refi_investor_capital_return
  const refi_net_cash = refi_net_proceeds

  // ── Sale Analysis ────────────────────────────────────────────────────────────
  const saleCap = safeNum(deal.sale_cap_rate, 0.065)
  const salesCostPct = safeNum(deal.sales_cost_pct, 0.02)
  const sale_value = saleCap > 0 ? noi / saleCap : 0
  const sale_cost_amount = sale_value * salesCostPct
  const sale_loan_payoff = refi_loan_payoff  // same payoff date
  const sale_net_proceeds = sale_value - sale_cost_amount - sale_loan_payoff
  const partner_capital_return = absEquity
  const projected_gain = sale_net_proceeds + partner_capital_return

  // ── Partner Return on Sale ───────────────────────────────────────────────────
  const equity_distributions = equitySharePct * projected_gain
  const holdYears = TIME_MONTHS / 12
  const partner_pref_returns_total = Math.abs(annual_pref_return) * holdYears
  const partner_total_return = equity_distributions + partner_pref_returns_total
  const annualized_return = absEquity > 0 && holdYears > 0
    ? partner_total_return / absEquity / holdYears
    : 0

  const expert: ExpertAnalysis = {
    egi,
    total_opex,
    noi,
    expense_ratio,
    cap_rate,
    mao: max_offer,
    mao_per_unit: units > 0 ? max_offer / units : 0,
    capex_budget: total_capex,
    all_in_basis: all_in_cost,
    post_opt_noi: postOptNoi,
    dscr: dscr_amort,
    dscr_pass: dscr_amort >= 1.25,
    equity_required: Math.max(0, partner_equity),
    exit_value: exitValue,
    equity_multiple: equityMultiple,
    annual_cash_flow: noi - annual_debt_service_amort,
    cash_on_cash: cashOnCash,
    loan_amount: loan_amount_ltc,
    annual_debt_service: annual_debt_service_amort,
    // Income breakdown
    gross_collected_income,
    loss_to_lease: -loss_to_lease,
    vacancy_loss: -vacancy_loss,
    delinquency_loss: -delinquency_loss,
    gpi: gpr,
    // Offer & cost
    max_offer,
    all_in_cost,
    total_capex,
    cost_per_door,
    // Uses
    purchase_price,
    acquisition_cost,
    opex_cash_reserve,
    acquisition_fee,
    total_uses,
    // Sources
    loan_amount_ltc,
    equity_required_ltc: Math.max(0, partner_equity),
    // Debt
    annual_debt_service_io,
    dscr_io,
    annual_cash_flow_io: noi - annual_debt_service_io,
    annual_cash_flow_amort: noi - annual_debt_service_amort,
    dscr_amort,
    // Current income
    current_gpr: currentGpr,
    current_gci: currentGci,
    current_noi,
    dscr_current_io,
    annual_cash_flow_current_io,
    annual_cash_flow_proforma_io,
    annual_cash_flow_proforma_amort,
    // Partner equity & pref return
    pref_return_rate: prefRate,
    annual_pref_return,
    partner_equity,
    // Refinance
    refi_market_cap: refiMarketCap,
    refi_value,
    refi_loan,
    refi_cost_amount,
    refi_loan_payoff,
    refi_net_proceeds,
    refi_investor_capital_return,
    refi_investor_remaining,
    refi_net_cash,
    // Sale
    sale_cap: saleCap,
    sale_value,
    sale_cost_amount,
    sale_loan_payoff,
    sale_net_proceeds,
    partner_capital_return,
    projected_gain,
    // Partner return on sale
    equity_share_pct: equitySharePct,
    equity_distributions,
    partner_pref_returns_total,
    partner_total_return,
    annualized_return,
  }

  // ── Scenarios ────────────────────────────────────────────────────────────────
  const scenarios = SCENARIO_CAPS.map((cap, i) =>
    computeScenario(SCENARIO_LABELS[i], cap, noi, postOptNoi, units, total_capex, rate)
  )

  // ── Verdict (max_offer vs asking price) ──────────────────────────────────────
  const gap = max_offer - askingPrice
  const gapPct = askingPrice > 0 ? gap / askingPrice : 0

  // ── Income Statements ─────────────────────────────────────────────────────────
  const t12 = t12IncomeStatement(deal)
  const broker_t2 = brokerT2IncomeStatement(deal)
  const pf = pfIncomeStatement(deal)
  const expert_income = expertIncomeStatement(deal, total_opex)

  // ── Property Display ──────────────────────────────────────────────────────────
  const occupancyDisplay = deal.occupied_pct != null
    ? `${(deal.occupied_pct * 100).toFixed(0)}%`
    : deal.occupancy_pct != null
    ? `${(deal.occupancy_pct * 100).toFixed(0)}%`
    : '—'

  const propertyDisplay: Record<string, string> = {
    Property: sanitizeString(deal.property_name) || '—',
    Address: sanitizeString(deal.address) || '—',
    'City / State / ZIP':
      [deal.city, deal.state, deal.zip_code].filter(Boolean).map(sanitizeString).join(', ') || '—',
    'Year Built': deal.year_built?.toString() || '—',
    'Renovation': sanitizeString(deal.renovation_status) || '—',
    Submarket: sanitizeString(deal.submarket) || '—',
    MSA: sanitizeString(deal.msa) || '—',
    Units: deal.units?.toString() || '—',
    'Total SF': deal.total_sf ? deal.total_sf.toLocaleString() + ' sf' : '—',
    Occupancy: occupancyDisplay,
    'Sale Type': sanitizeString(deal.sale_type) || '—',
    'Broker Cap Rate':
      deal.broker_cap_rate != null ? `${(deal.broker_cap_rate * 100).toFixed(2)}%` : '—',
  }

  return {
    verdict: verdictFromGap(gapPct),
    asking: { price: askingPrice, gap_to_sc2_mao: gap, gap_to_sc2_mao_pct: gapPct },
    property: propertyDisplay,
    t12,
    broker_t2,
    pf,
    expert_income,
    expert,
    scenarios,
    risk_register: generateRiskRegister(deal, expert),
    units,
  }
}
