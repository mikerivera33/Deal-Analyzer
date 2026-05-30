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
const LTV_DEFAULT = 0.65
const RATE_DEFAULT = 0.068
const AMORT_MONTHS = 360  // 30 years
const POST_OPT_UPLIFT = 1.30  // 30% NOI uplift for exit valuation

// ─── Underwriting Assumptions (template defaults) ─────────────────────────────
const LTL_DEFAULT = 0.03       // loss to lease
const VACANCY_DEFAULT = 0.04   // vacancy
const DELINQ_DEFAULT = 0.02    // delinquency on collected rent after LTL+vac
const BROKER_VACANCY_ASSUMED = 0.05  // used only to derive GPI from broker T-12
const CAPEX_PER_UNIT_DEFAULT = 10_000
const DESIRED_CAP_RATE_DEFAULT = 0.09
// Per-unit expense defaults
const INSURANCE_PER_UNIT = 1200
const UTILITIES_PER_UNIT = 1456
const RM_PER_UNIT = 750
const MGMT_FEE_PCT = 0.05
const PAYROLL_PER_UNIT = 1100
const ADMIN_PER_UNIT = 250
const RESERVE_PER_UNIT = 250
const CAPEX_CONTINGENCY_FACTOR = 1.18  // +10% contingency +8% construction mgmt

// ─── Scenario Definitions ─────────────────────────────────────────────────────
// Sc1 = Conservative (highest cap → lowest price)
// Sc2 = Moderate (main MAO)
// Sc3 = Aggressive (lowest cap → highest price)
const SCENARIO_CAPS = [0.085, 0.080, 0.075]
const SCENARIO_LABELS = ['Sc1 — 8.5%', 'Sc2 — 8.0%', 'Sc3 — 7.5%']
// Exit cap = entry cap - 1.5% compression
const EXIT_CAP_COMPRESSION = 0.015
const HOLD_YEARS = 5

// ─── Income Statement Builders ────────────────────────────────────────────────

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

/** T-12 actuals: vacancy already baked in, so no subtraction. GPI = reported GRI + util + other. */
function t12IncomeStatement(deal: DealInput): IncomeStatement {
  const gri = safeNum(deal.gross_rental_income)
  const util = safeNum(deal.utility_reimbursement)
  const other = safeNum(deal.other_income)
  const gpi = gri + util + other
  // T-12 actuals — vacancy already included in reported numbers
  const egi = gpi
  const opex =
    safeNum(deal.property_taxes) +
    safeNum(deal.insurance) +
    safeNum(deal.management_fee) +
    safeNum(deal.utilities) +
    safeNum(deal.reserves) +
    safeNum(deal.payroll) +
    safeNum(deal.repairs_maintenance) +
    safeNum(deal.admin_fees)
  const noi = egi - opex
  return {
    gross_rental_income: gri,
    utility_reimbursement: util,
    other_income: other,
    gpi,
    vacancy_bad_debt: 0,  // baked in for T-12
    egi,
    opex,
    noi,
    expense_ratio: egi > 0 ? opex / egi : 0,
  }
}

/** Broker T-2 (trailing 2-month annualized). Returns zeroes if no T-2 data provided. */
function brokerT2IncomeStatement(deal: DealInput): IncomeStatement {
  const gri = safeNum(deal.t2_gross_rental)
  const util = safeNum(deal.t2_utility_reimb)
  const other = safeNum(deal.t2_other_income)
  if (gri === 0 && util === 0 && other === 0) return zeroIncomeStatement()
  const gpi = gri + util + other
  const egi = gpi  // T-2 actuals — no vacancy adjustment
  const opex =
    safeNum(deal.property_taxes) +
    safeNum(deal.insurance) +
    safeNum(deal.management_fee) +
    safeNum(deal.utilities) +
    safeNum(deal.reserves) +
    safeNum(deal.payroll) +
    safeNum(deal.repairs_maintenance) +
    safeNum(deal.admin_fees)
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

/** Broker Pro-Forma income statement */
function pfIncomeStatement(deal: DealInput): IncomeStatement {
  const gri = safeNum(deal.pf_gross_rental || deal.gross_rental_income)
  const util = safeNum(deal.pf_utility_reimb || deal.utility_reimbursement)
  const other = safeNum(deal.pf_other_income || deal.other_income)
  const gpi = gri + util + other
  // Broker PF applies a lower vacancy assumption
  const vacancyLoss = gri * BROKER_VACANCY_ASSUMED
  const egi = gpi - vacancyLoss
  const opex =
    safeNum(deal.property_taxes) +
    safeNum(deal.insurance) +
    safeNum(deal.management_fee) +
    safeNum(deal.utilities) +
    safeNum(deal.reserves) +
    safeNum(deal.payroll) +
    safeNum(deal.repairs_maintenance) +
    safeNum(deal.admin_fees)
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

// ─── Expert Underwriting ──────────────────────────────────────────────────────

/**
 * Derive Gross Potential Rent (GPR) from available data.
 * Priority: unit_mix MARKET rent → reverse-engineer from T-12 (5% vacancy assumed)
 */
function grossPotentialRent(deal: DealInput): number {
  if (deal.unit_mix && deal.unit_mix.length > 0) {
    const mixTotal = deal.unit_mix.reduce(
      (sum, u) => sum + safeNum(u.unit_count) * safeNum(u.market_rent),  // MARKET not actual
      0
    )
    if (mixTotal > 0) return mixTotal * 12
  }
  const gri = safeNum(deal.gross_rental_income)
  return gri > 0 ? gri / (1 - BROKER_VACANCY_ASSUMED) : 0
}

/**
 * Compute gross collected income using 3-tier loss waterfall.
 * Returns { gpr, otherIncome, gpi, ltl, vac, delinq, grossCollected }
 */
function computeGrossCollected(deal: DealInput) {
  const gpr = grossPotentialRent(deal)
  const util = safeNum(deal.utility_reimbursement)
  const other = safeNum(deal.other_income)
  const otherIncome = util + other
  const gpi = gpr + otherIncome

  const ltlPct = safeNum(deal.loss_to_lease_pct, LTL_DEFAULT)
  const vacPct = safeNum(deal.vacancy_pct, VACANCY_DEFAULT)
  const delinqPct = safeNum(deal.delinquency_pct, DELINQ_DEFAULT)

  const ltl = gpr * ltlPct
  const vac = gpr * vacPct
  const delinq = (gpr - ltl - vac) * delinqPct
  const grossCollected = gpi - ltl - vac - delinq

  return { gpr, otherIncome, gpi, ltl, vac, delinq, grossCollected }
}

/** Full expert income statement breakdown for display. */
function expertIncomeStatement(deal: DealInput, opex: number): IncomeStatement {
  const { gpr, gpi, ltl, vac, delinq, grossCollected } = computeGrossCollected(deal)
  const util = safeNum(deal.utility_reimbursement)
  const other = safeNum(deal.other_income)
  const totalVacancy = ltl + vac + delinq
  const noi = grossCollected - opex
  return {
    gross_rental_income: gpr,
    utility_reimbursement: util,
    other_income: other,
    gpi,
    vacancy_bad_debt: -totalVacancy,
    egi: grossCollected,
    opex,
    noi,
    expense_ratio: grossCollected > 0 ? opex / grossCollected : 0,
  }
}

/**
 * All 8 expense categories with per-unit defaults.
 * Management is 5% of Gross Collected Income.
 */
function expertOpEx(deal: DealInput, grossCollected: number, units: number): number {
  const insurance = Math.max(safeNum(deal.insurance), INSURANCE_PER_UNIT * units)
  const taxes = safeNum(deal.property_taxes)
  const utilities = safeNum(deal.utilities) || UTILITIES_PER_UNIT * units
  const rm = safeNum(deal.repairs_maintenance) || RM_PER_UNIT * units
  const mgmt = Math.max(safeNum(deal.management_fee), grossCollected * MGMT_FEE_PCT)
  const payroll = safeNum(deal.payroll) || PAYROLL_PER_UNIT * units
  const admin = safeNum(deal.admin_fees) || ADMIN_PER_UNIT * units
  const reserve = Math.max(safeNum(deal.reserves), RESERVE_PER_UNIT * units)
  return insurance + taxes + utilities + rm + mgmt + payroll + admin + reserve
}

// ─── Scenario Computation ─────────────────────────────────────────────────────

function computeScenario(
  label: string,
  entryCap: number,
  noi: number,
  postOptNoi: number,
  units: number,
  capexBudget: number,
  ltv: number,
  rate: number
): Scenario {
  const exitCap = entryCap - EXIT_CAP_COMPRESSION
  const mao = entryCap > 0 ? noi / entryCap : 0
  const maoPerUnit = units > 0 ? mao / units : 0
  const allInBasis = mao + capexBudget
  // Loan is on MAO (not all-in basis) per LJM framework
  const loanAmount = mao * ltv
  const monthlyRate = rate / 12
  const monthlyPayment = pmt(monthlyRate, AMORT_MONTHS, loanAmount)
  const annualDebtService = monthlyPayment * 12
  const dscr = annualDebtService > 0 ? noi / annualDebtService : 0
  const equityRequired = allInBasis - loanAmount
  // Exit valuation uses post-optimization NOI / exit cap
  const exitValue = exitCap > 0 ? postOptNoi / exitCap : 0
  // Equity Created = Exit Sale Value - All-in Basis
  const equityCreated = exitValue - allInBasis
  // Corrected equity multiple formula:
  // (exit_value - loan_balance_after_hold + cumulative_cash_flow) / equity_invested
  const annualCF = noi - annualDebtService
  const cumCF = annualCF * HOLD_YEARS
  const loanBal = monthlyRate > 0
    ? loanBalance(monthlyRate, AMORT_MONTHS, loanAmount, HOLD_YEARS * 12)
    : loanAmount - (loanAmount / AMORT_MONTHS) * (HOLD_YEARS * 12)
  const equityMultiple = equityRequired > 0
    ? (exitValue - loanBal + cumCF) / equityRequired
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

/**
 * gapPct = (Sc2_MAO - asking) / asking
 * Positive  = asking is BELOW MAO → PROCEED
 * 0 to -0.1 = asking up to 10% above MAO → NEGOTIATE
 * -0.1 to -0.2 = 10-20% over MAO → PASS
 * < -0.2     = >20% over MAO → DO NOT PROCEED
 */
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
    notes: `LJM underwrites ${(VACANCY_DEFAULT * 100).toFixed(0)}% vacancy + ${(LTL_DEFAULT * 100).toFixed(0)}% LTL + ${(DELINQ_DEFAULT * 100).toFixed(0)}% delinquency. Any increase directly reduces NOI.`,
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
    notes: 'If exit cap rises 50–100 bps above projected exit cap, exit value drops materially.',
  })

  rows.push({
    risk: 'Rent Growth Stagnation',
    severity: 2,
    likelihood: 2,
    score: 4,
    notes: 'Post-optimization NOI assumes 30% uplift. New supply or economic slowdown could limit upside.',
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
  const ltv = safeNum(deal.ltv, LTV_DEFAULT)
  const rate = safeNum(deal.interest_rate, RATE_DEFAULT)
  const capexPerUnit = safeNum(deal.capex_per_unit, CAPEX_PER_UNIT_DEFAULT)
  const capexBudget = capexPerUnit * units  // raw capex (for scenarios)

  // ── Expert Income: 3-tier loss waterfall ────────────────────────────────────
  const { gpi, ltl, vac, delinq, grossCollected } = computeGrossCollected(deal)

  // ── Expert OpEx (8 categories) ──────────────────────────────────────────────
  const total_opex = expertOpEx(deal, grossCollected, units)
  const noi = grossCollected - total_opex
  const expense_ratio = grossCollected > 0 ? total_opex / grossCollected : 0

  // ── Post-Optimization NOI (for exit valuation) ──────────────────────────────
  const postOptNoi = safeNum(deal.post_opt_noi_override) > 0
    ? safeNum(deal.post_opt_noi_override)
    : noi * POST_OPT_UPLIFT

  // ── Sc2 (Moderate) MAO used as primary expert reference ─────────────────────
  const sc2Cap = SCENARIO_CAPS[1]
  const sc2ExitCap = sc2Cap - EXIT_CAP_COMPRESSION
  const mao = sc2Cap > 0 ? noi / sc2Cap : 0
  const maoPerUnit = units > 0 ? mao / units : 0
  const allInBasis = mao + capexBudget

  // Loan on MAO (not all-in basis) — LJM framework
  const loanAmount = mao * ltv
  const monthlyRate = rate / 12
  const monthlyPayment = pmt(monthlyRate, AMORT_MONTHS, loanAmount)
  const annualDebtService = monthlyPayment * 12
  const dscr = annualDebtService > 0 ? noi / annualDebtService : 0
  const equityRequired = allInBasis - loanAmount
  const cap_rate = askingPrice > 0 ? noi / askingPrice : 0
  const exitValue = sc2ExitCap > 0 ? postOptNoi / sc2ExitCap : 0
  const annualCashFlow = noi - annualDebtService
  const cashOnCash = equityRequired > 0 ? annualCashFlow / equityRequired : 0
  // Corrected equity multiple
  const cumCF = annualCashFlow * HOLD_YEARS
  const loanBal = monthlyRate > 0
    ? loanBalance(monthlyRate, AMORT_MONTHS, loanAmount, HOLD_YEARS * 12)
    : loanAmount - (loanAmount / AMORT_MONTHS) * (HOLD_YEARS * 12)
  const equityMultiple = equityRequired > 0
    ? (exitValue - loanBal + cumCF) / equityRequired
    : 0

  // ── Max Offer / Uses / Sources / Debt (Winding Creek template) ─────────────
  const desiredCap = safeNum(deal.desired_cap_rate, DESIRED_CAP_RATE_DEFAULT)
  const totalCapex = capexBudget * CAPEX_CONTINGENCY_FACTOR  // +10% contingency +8% mgmt
  const allInCost = desiredCap > 0 ? noi / desiredCap : 0
  const maxOffer = Math.round((allInCost - totalCapex) / 1000) * 1000
  const costPerDoor = units > 0 ? maxOffer / units : 0

  // Uses
  const purchasePrice = maxOffer
  const acqCost = purchasePrice * 0.02
  const opexReserve = purchasePrice * 0.015
  const acqFee = purchasePrice * 0.04
  const totalUses = purchasePrice + totalCapex + acqCost + opexReserve + acqFee

  // Sources (LTC basis: 75% of purchase + capex)
  const loanLTC = (purchasePrice + totalCapex) * 0.75
  const sellerCarry = safeNum(deal.seller_carry)
  const equityLTC = totalUses - loanLTC - sellerCarry

  // Debt / IO
  const annualDsIo = loanLTC * rate
  const monthlyPaymentLTC = pmt(rate / 12, AMORT_MONTHS, loanLTC)
  const annualDsAmort = monthlyPaymentLTC * 12
  const dscrIo = annualDsIo > 0 ? noi / annualDsIo : 0
  const dscrAmort = annualDsAmort > 0 ? noi / annualDsAmort : 0
  const cfIo = noi - annualDsIo
  const cfAmort = noi - annualDsAmort

  const expert: ExpertAnalysis = {
    egi: grossCollected,
    total_opex,
    noi,
    expense_ratio,
    cap_rate,
    mao,
    mao_per_unit: maoPerUnit,
    capex_budget: capexBudget,
    all_in_basis: allInBasis,
    post_opt_noi: postOptNoi,
    dscr,
    dscr_pass: dscr >= 1.25,
    equity_required: equityRequired,
    exit_value: exitValue,
    equity_multiple: equityMultiple,
    annual_cash_flow: annualCashFlow,
    cash_on_cash: cashOnCash,
    loan_amount: loanAmount,
    annual_debt_service: annualDebtService,
    // New XLSX fields
    gross_collected_income: grossCollected,
    loss_to_lease: -ltl,
    vacancy_loss: -vac,
    delinquency_loss: -delinq,
    gpi,
    max_offer: maxOffer,
    all_in_cost: allInCost,
    total_capex: totalCapex,
    cost_per_door: costPerDoor,
    purchase_price: purchasePrice,
    acquisition_cost: acqCost,
    opex_cash_reserve: opexReserve,
    acquisition_fee: acqFee,
    total_uses: totalUses,
    loan_amount_ltc: loanLTC,
    equity_required_ltc: equityLTC,
    annual_debt_service_io: annualDsIo,
    dscr_io: dscrIo,
    annual_cash_flow_io: cfIo,
    annual_cash_flow_amort: cfAmort,
    dscr_amort: dscrAmort,
  }

  // ── 3 Scenarios ─────────────────────────────────────────────────────────────
  const scenarios = SCENARIO_CAPS.map((cap, i) =>
    computeScenario(SCENARIO_LABELS[i], cap, noi, postOptNoi, units, capexBudget, ltv, rate)
  )

  // ── Verdict (based on gap between asking and Sc2 MAO) ───────────────────────
  const sc2Mao = scenarios[1].mao
  const gap = sc2Mao - askingPrice
  const gapPct = askingPrice > 0 ? gap / askingPrice : 0

  // ── Income Statements ───────────────────────────────────────────────────────
  const t12 = t12IncomeStatement(deal)
  const broker_t2 = brokerT2IncomeStatement(deal)
  const pf = pfIncomeStatement(deal)
  // expert_income uses same opex and 3-tier loss waterfall values computed above
  const expert_income = expertIncomeStatement(deal, total_opex)

  // ── Property Display ─────────────────────────────────────────────────────────
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
