/**
 * LJM Deal Analyzer — XLSX Generation
 *
 * generateUnderwritingXlsx  →  Institutional single-sheet underwriting model
 *                               with live Excel formula strings (E/F/G scenario
 *                               columns reference D-column hard-coded inputs).
 *
 * generateSynthesisXlsx     →  Multi-tab executive summary workbook.
 */

import type { AnalysisResult, DealInput, MarketData, CapRateSegment } from './types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FOOTER = 'LJM DEAL ANALYZER  |  LJM Homes LLC  |  Methodology: Michael Rivera Advisor Framework'

function pct(n: number, d = 1): string {
  return `${(n * 100).toFixed(d)}%`
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

type Row = (string | number)[]

// ─── Cell builder for the underwriting sheet ─────────────────────────────────

function cell(
  ws: Record<string, unknown>,
  r: number,
  c: number,
  value: string | number | null,
  formula?: string,
) {
  // Lazy-import XLSX.utils.encode_cell equivalent inline
  const col = c < 26 ? String.fromCharCode(65 + c) : String.fromCharCode(64 + Math.floor(c / 26)) + String.fromCharCode(65 + (c % 26))
  const addr = `${col}${r + 1}`

  if (formula) {
    ws[addr] = { f: formula, t: 'n' }
  } else if (typeof value === 'string') {
    ws[addr] = { v: value, t: 's' }
  } else if (typeof value === 'number') {
    ws[addr] = { v: value, t: 'n' }
  }
  // null → skip (leave cell empty)
}

// ─── generateUnderwritingXlsx ─────────────────────────────────────────────────

export async function generateUnderwritingXlsx(
  deal: DealInput,
  analysis: AnalysisResult,
  marketData?: MarketData,
): Promise<Buffer> {
  const XLSX = await import('xlsx')

  // ── Derived inputs ───────────────────────────────────────────────────────────
  const ex = analysis.expert
  const t12 = analysis.t12
  const pf = analysis.pf
  const units = analysis.units
  const rate = deal.interest_rate ?? 0.068
  const ltlPct = deal.loss_to_lease_pct ?? 0.03
  const vacPct = deal.vacancy_pct ?? 0.10
  const delinqPct = deal.delinquency_pct ?? 0.02
  const sellerCarry = deal.seller_carry ?? 0
  const holdMonths = deal.time_to_proforma_months ?? 36
  const refiMarketCap = ex.refi_market_cap ?? 0.065
  const prefReturnRate = ex.pref_return_rate ?? 0.08
  const lpShare = 0.70

  // Unit-mix derived values
  const unitMix = deal.unit_mix ?? []
  const totalMktMonthly = unitMix.reduce((s, u) => s + u.unit_count * u.market_rent, 0)
  const avgMarketRent = units > 0 && totalMktMonthly > 0
    ? totalMktMonthly / units
    : (deal.gross_rental_income ?? 0) / Math.max(units, 1) / 12

  // Expense inputs for D-column hard values
  const insuranceVal = deal.insurance ?? 0
  const taxesVal = deal.property_taxes ?? 0
  const utilitiesVal = deal.utilities ?? 0
  const rmPerUnit = deal.repairs_maintenance && units > 0
    ? Math.round(deal.repairs_maintenance / units)
    : 750
  const mgmtPct = deal.management_fee && ex.egi > 0
    ? deal.management_fee / ex.egi
    : 0.08
  const contractServicesVal = 0
  const gaVal = deal.admin_fees ?? 0
  const payrollVal = deal.payroll ?? 0
  const reservePerUnit = deal.reserves && units > 0
    ? Math.round(deal.reserves / units)
    : 250

  // CapEx — construct a simple line-item breakdown that sums to expert total_capex
  const totalCapex = ex.total_capex ?? (units * (deal.capex_per_unit ?? 10000))
  const askingPrice = deal.asking_price ?? 0

  // ── Build worksheet ──────────────────────────────────────────────────────────
  const ws: Record<string, unknown> = {}

  // We track the running maximum row so we can set !ref at the end
  let maxRow = 0
  const MAX_COL = 17  // cols A–R (0-indexed 0–17)

  function c(r: number, col: number, value: string | number | null, formula?: string) {
    cell(ws, r, col, value, formula)
    if (r > maxRow) maxRow = r
  }

  // ── Row indices (0-indexed, i.e. Excel row = index + 1) ─────────────────────
  //
  // SECTION 1: Title / Property info
  const R_TITLE = 0
  const R_PROP = 1
  const R_ADDR = 2
  const R_DATE = 3
  // R4 empty
  const R_HEADERS = 5

  // SECTION 2: Property overview
  const R_UNITS = 6       // Excel D7
  const R_AVG_RENT = 7    // Excel D8
  // R8 empty → Excel row 9
  const R_INC_HEAD = 9    // "INCOME" header  → Excel row 10

  // SECTION 3: Income
  const R_GPR = 10        // Excel row 11
  const R_RUBS = 11       // Excel row 12
  const R_OTHER = 12      // Excel row 13
  const R_GPI = 13        // Excel row 14
  const R_LTL = 14        // Excel row 15
  const R_VAC = 15        // Excel row 16
  const R_DELINQ = 16     // Excel row 17
  const R_EGI = 17        // Excel row 18
  // R18 empty
  const R_EXP_HEAD = 19   // Excel row 20

  // SECTION 4: Expenses
  const R_INS = 20        // Excel row 21
  const R_TAX = 21        // Excel row 22
  const R_UTIL = 22       // Excel row 23
  const R_RM = 23         // Excel row 24
  const R_MGMT = 24       // Excel row 25
  const R_CONTRACT = 25   // Excel row 26
  const R_GA = 26         // Excel row 27
  const R_PAYROLL = 27    // Excel row 28
  const R_RESERVE = 28    // Excel row 29
  const R_TOTAL_EXP = 29  // Excel row 30
  const R_EXP_RATIO = 30  // Excel row 31
  // R31 empty
  const R_NOI = 32        // Excel row 33
  const R_CUR_NOI = 33    // Excel row 34
  // R34 empty
  const R_OFFER_HEAD = 35 // Excel row 36
  const R_CAP_RATE = 36   // Excel row 37
  const R_VALUE = 37      // Excel row 38
  const R_CAPEX = 38      // Excel row 39
  const R_MAO = 39        // Excel row 40
  const R_MAO_UNIT = 40   // Excel row 41
  const R_ASKING = 41     // Excel row 42
  const R_GAP = 42        // Excel row 43
  const R_GAP_PCT = 43    // Excel row 44
  // R44 empty
  const R_USES_HEAD = 45  // Excel row 46
  const R_USES_PP = 46    // Excel row 47
  const R_USES_CAPEX = 47 // Excel row 48
  const R_USES_ACQ = 48   // Excel row 49
  const R_USES_OPEX = 49  // Excel row 50
  const R_USES_FEE = 50   // Excel row 51
  const R_USES_TOTAL = 51 // Excel row 52
  // R52 empty
  const R_SRC_HEAD = 53   // Excel row 54
  const R_SRC_LOAN = 54   // Excel row 55
  const R_SRC_CARRY = 55  // Excel row 56
  const R_SRC_EQ = 56     // Excel row 57
  const R_SRC_CHECK = 57  // Excel row 58
  // R58 empty
  const R_DEBT_HEAD = 59  // Excel row 60
  const R_INT_RATE = 60   // Excel row 61
  const R_AMORT = 61      // Excel row 62
  const R_MO_DS = 62      // Excel row 63
  const R_ANN_DS = 63     // Excel row 64
  const R_DSCR = 64       // Excel row 65
  const R_DSCR_PASS = 65  // Excel row 66
  // R66 empty
  const R_EXIT_HEAD = 67  // Excel row 68
  const R_HOLD = 68       // Excel row 69
  const R_EXIT_CAP = 69   // Excel row 70
  const R_OPT_NOI = 70    // Excel row 71
  const R_EXIT_VAL = 71   // Excel row 72
  const R_EQ_CREATED = 72 // Excel row 73
  const R_LOAN_PAYOFF = 73 // Excel row 74
  const R_NET_EQ = 74     // Excel row 75
  const R_EQ_MULT = 75    // Excel row 76
  // R76 empty
  const R_REFI_HEAD = 77  // Excel row 78
  const R_REFI_CAP = 78   // Excel row 79
  const R_REFI_LTV = 79   // Excel row 80
  const R_REFI_STAB = 80  // Excel row 81
  const R_REFI_LOAN = 81  // Excel row 82
  const R_REFI_COST = 82  // Excel row 83
  const R_REFI_PAYOFF = 83 // Excel row 84
  const R_REFI_NET = 84   // Excel row 85
  // R85 empty
  const R_WATER_HEAD = 86  // Excel row 87
  const R_PREF_RATE = 87   // Excel row 88
  const R_LP_SHARE = 88    // Excel row 89
  const R_PREF_RET = 89    // Excel row 90
  const R_LP_EQ = 90       // Excel row 91
  const R_LP_TOTAL = 91    // Excel row 92
  const R_IRR = 92         // Excel row 93
  // R93 empty
  const R_NOTES_HEAD = 94  // Excel row 95
  const R_NOTES_VAL = 95   // Excel row 96
  const R_FOOTER = 97      // Excel row 98

  // ── COLUMNS ──
  const C_LABEL = 0   // A
  const C_GUIDE = 1   // B
  const C_RATE = 2    // C
  const C_D = 3       // D — Expert hard-coded inputs (the "yellow" column)
  const C_E = 4       // E — Sc1 7.5% — formula column
  const C_F = 5       // F — Sc2 8.0% BASE — formula column
  const C_G = 6       // G — Sc3 8.5% — formula column
  const C_T12 = 7     // H — T-12 actuals
  const C_PF = 8      // I — Broker pro forma

  // Excel address helpers (1-indexed, used inside formula strings)
  function xl(r_idx: number, c_idx: number): string {
    const col = c_idx < 26
      ? String.fromCharCode(65 + c_idx)
      : String.fromCharCode(64 + Math.floor(c_idx / 26)) + String.fromCharCode(65 + (c_idx % 26))
    return `${col}${r_idx + 1}`
  }
  // Absolute column reference (locks column, not row)
  function xlAbs(r_idx: number, c_idx: number): string {
    const col = c_idx < 26
      ? String.fromCharCode(65 + c_idx)
      : String.fromCharCode(64 + Math.floor(c_idx / 26)) + String.fromCharCode(65 + (c_idx % 26))
    return `$${col}$${r_idx + 1}`
  }

  // Frequently referenced absolute addresses
  const dUnits = xlAbs(R_UNITS, C_D)       // $D$7
  const dAvgRent = xl(R_AVG_RENT, C_D)     // D8
  const dLtl = xl(R_LTL, C_D)              // D15
  const dVac = xl(R_VAC, C_D)              // D16
  const dDelinq = xl(R_DELINQ, C_D)        // D17
  const dMgmt = xl(R_MGMT, C_D)            // D25
  const dRmUnit = xl(R_RM, C_D)            // D24
  const dResUnit = xl(R_RESERVE, C_D)      // D29
  const dCapex = xl(R_CAPEX, C_D)          // D39
  const dSellerCarry = xl(R_SRC_CARRY, C_D) // D56
  const dIntRate = xl(R_INT_RATE, C_D)     // D61
  const dAmort = xl(R_AMORT, C_D)          // D62
  const dHold = xl(R_HOLD, C_D)            // D69
  const dRefiCap = xl(R_REFI_CAP, C_D)    // D79
  const dRefiLtv = xl(R_REFI_LTV, C_D)    // D80
  const dPrefRate = xl(R_PREF_RATE, C_D)  // D88
  const dLpShare = xl(R_LP_SHARE, C_D)    // D89

  // ─────────────────────────────────────────────────────────────────────────────
  // ROWS 0–4: Title & Property Info
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_TITLE, C_LABEL, 'LJM DEAL ANALYZER — UNDERWRITING MODEL')
  c(R_PROP, C_LABEL, 'Property:')
  c(R_PROP, C_GUIDE, deal.property_name || '—')
  c(R_ADDR, C_LABEL, 'Address:')
  c(R_ADDR, C_GUIDE, [deal.address, deal.city, deal.state, deal.zip_code].filter(Boolean).join(', ') || '—')
  c(R_DATE, C_LABEL, 'Date:')
  c(R_DATE, C_GUIDE, new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 5: Column Headers
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_HEADERS, C_LABEL, 'LINE ITEM')
  c(R_HEADERS, C_GUIDE, 'GUIDANCE')
  c(R_HEADERS, C_RATE, 'RATE / UNIT')
  c(R_HEADERS, C_D, 'EXPERT INPUT')
  c(R_HEADERS, C_E, 'Sc1 — 7.5%')
  c(R_HEADERS, C_F, 'Sc2 — 8.0% (BASE)')
  c(R_HEADERS, C_G, 'Sc3 — 8.5%')
  c(R_HEADERS, C_T12, 'T-12 ACTUALS')
  c(R_HEADERS, C_PF, 'BROKER PF')

  // ─────────────────────────────────────────────────────────────────────────────
  // ROWS 6–7: Property Overview
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_UNITS, C_LABEL, 'Number of Units')
  c(R_UNITS, C_D, units)
  c(R_UNITS, C_T12, units)
  c(R_UNITS, C_PF, units)

  c(R_AVG_RENT, C_LABEL, 'Avg Market Rent / Mo')
  c(R_AVG_RENT, C_GUIDE, '$900 – $1,400')
  c(R_AVG_RENT, C_D, Math.round(avgMarketRent))
  // Scenarios inherit from D-column (same GPR regardless of cap scenario)
  c(R_AVG_RENT, C_E, null, dAvgRent)
  c(R_AVG_RENT, C_F, null, dAvgRent)
  c(R_AVG_RENT, C_G, null, dAvgRent)
  c(R_AVG_RENT, C_T12, Math.round(
    t12.gross_rental_income > 0 && units > 0 ? t12.gross_rental_income / units / 12 : avgMarketRent,
  ))
  c(R_AVG_RENT, C_PF, Math.round(
    pf.gross_rental_income > 0 && units > 0 ? pf.gross_rental_income / units / 12 : avgMarketRent,
  ))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 9: INCOME header
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_INC_HEAD, C_LABEL, 'INCOME')

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 10: Gross Potential Rent (GPR)
  // ─────────────────────────────────────────────────────────────────────────────

  const gprVal = Math.round(avgMarketRent * units * 12)

  c(R_GPR, C_LABEL, 'Gross Potential Rent (GPR)')
  c(R_GPR, C_GUIDE, '100% of market rents')
  c(R_GPR, C_D, gprVal)
  // GPR is purely market-rent driven, identical across cap scenarios
  c(R_GPR, C_E, null, `${dAvgRent}*${dUnits}*12`)
  c(R_GPR, C_F, null, `${dAvgRent}*${dUnits}*12`)
  c(R_GPR, C_G, null, `${dAvgRent}*${dUnits}*12`)
  c(R_GPR, C_T12, Math.round(t12.gross_rental_income))
  c(R_GPR, C_PF, Math.round(pf.gross_rental_income))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 11: RUBS / Utility Reimbursements
  // ─────────────────────────────────────────────────────────────────────────────

  const rubsVal = Math.round(deal.utility_reimbursement ?? 0)
  const rubsRef = xl(R_RUBS, C_D)

  c(R_RUBS, C_LABEL, 'RUBS / Utility Reimbursements')
  c(R_RUBS, C_GUIDE, '$35/unit/month')
  c(R_RUBS, C_D, rubsVal)
  c(R_RUBS, C_E, null, rubsRef)
  c(R_RUBS, C_F, null, rubsRef)
  c(R_RUBS, C_G, null, rubsRef)
  c(R_RUBS, C_T12, Math.round(t12.utility_reimbursement))
  c(R_RUBS, C_PF, Math.round(pf.utility_reimbursement))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 12: Other Income
  // ─────────────────────────────────────────────────────────────────────────────

  const otherVal = Math.round(deal.other_income ?? 0)
  const otherRef = xl(R_OTHER, C_D)

  c(R_OTHER, C_LABEL, 'Other Income')
  c(R_OTHER, C_D, otherVal)
  c(R_OTHER, C_E, null, otherRef)
  c(R_OTHER, C_F, null, otherRef)
  c(R_OTHER, C_G, null, otherRef)
  c(R_OTHER, C_T12, Math.round(t12.other_income))
  c(R_OTHER, C_PF, Math.round(pf.other_income))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 13: Gross Potential Income (GPI)
  // ─────────────────────────────────────────────────────────────────────────────

  const dGPR = xl(R_GPR, C_D)
  const dRUBS = xl(R_RUBS, C_D)
  const dOther = xl(R_OTHER, C_D)

  c(R_GPI, C_LABEL, 'Gross Potential Income (GPI)')
  c(R_GPI, C_D, null, `${dGPR}+${dRUBS}+${dOther}`)

  for (const [sc_col, label_col] of [[C_E, C_E], [C_F, C_F], [C_G, C_G], [C_T12, C_T12], [C_PF, C_PF]] as [number, number][]) {
    const gpr = xl(R_GPR, sc_col)
    const rubs = xl(R_RUBS, sc_col)
    const other = xl(R_OTHER, sc_col)
    c(R_GPI, label_col, null, `${gpr}+${rubs}+${other}`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 14: Loss-to-Lease
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_LTL, C_LABEL, 'Less: Loss-to-Lease')
  c(R_LTL, C_GUIDE, '3% of GPR')
  c(R_LTL, C_RATE, pct(ltlPct))
  c(R_LTL, C_D, ltlPct)
  c(R_LTL, C_E, null, `-${dLtl}*${xl(R_GPR, C_E)}`)
  c(R_LTL, C_F, null, `-${dLtl}*${xl(R_GPR, C_F)}`)
  c(R_LTL, C_G, null, `-${dLtl}*${xl(R_GPR, C_G)}`)
  c(R_LTL, C_T12, 0)
  c(R_LTL, C_PF, 0)

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 15: Vacancy
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_VAC, C_LABEL, 'Less: Vacancy')
  c(R_VAC, C_GUIDE, '8%-12% typical')
  c(R_VAC, C_RATE, pct(vacPct))
  c(R_VAC, C_D, vacPct)
  c(R_VAC, C_E, null, `-${dVac}*${xl(R_GPR, C_E)}`)
  c(R_VAC, C_F, null, `-${dVac}*${xl(R_GPR, C_F)}`)
  c(R_VAC, C_G, null, `-${dVac}*${xl(R_GPR, C_G)}`)
  // T-12: vacancy_bad_debt is stored as negative, so use directly
  c(R_VAC, C_T12, Math.round(t12.vacancy_bad_debt))
  c(R_VAC, C_PF, Math.round(pf.vacancy_bad_debt))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 16: Bad Debt / Delinquency
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_DELINQ, C_LABEL, 'Less: Bad Debt / Delinquency')
  c(R_DELINQ, C_GUIDE, '1%-3% of GPR')
  c(R_DELINQ, C_RATE, pct(delinqPct))
  c(R_DELINQ, C_D, delinqPct)
  c(R_DELINQ, C_E, null, `-${dDelinq}*${xl(R_GPR, C_E)}`)
  c(R_DELINQ, C_F, null, `-${dDelinq}*${xl(R_GPR, C_F)}`)
  c(R_DELINQ, C_G, null, `-${dDelinq}*${xl(R_GPR, C_G)}`)
  c(R_DELINQ, C_T12, 0)
  c(R_DELINQ, C_PF, 0)

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 17: Effective Gross Income (EGI)
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_EGI, C_LABEL, 'Effective Gross Income (EGI)')
  // D-column EGI: hard-coded expert value
  c(R_EGI, C_D, Math.round(ex.egi))

  for (const sc_col of [C_E, C_F, C_G, C_T12, C_PF]) {
    const gpi = xl(R_GPI, sc_col)
    const ltl = xl(R_LTL, sc_col)
    const vac = xl(R_VAC, sc_col)
    const dlq = xl(R_DELINQ, sc_col)
    c(R_EGI, sc_col, null, `${gpi}+${ltl}+${vac}+${dlq}`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 19: EXPENSES header
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_EXP_HEAD, C_LABEL, 'EXPENSES')

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 20: Insurance
  // ─────────────────────────────────────────────────────────────────────────────

  const insRef = xl(R_INS, C_D)
  c(R_INS, C_LABEL, 'Insurance')
  c(R_INS, C_GUIDE, '$450 – $700/unit')
  c(R_INS, C_RATE, units > 0 ? `$${Math.round(insuranceVal / units)}/unit` : '')
  c(R_INS, C_D, Math.round(insuranceVal))
  c(R_INS, C_E, null, insRef)
  c(R_INS, C_F, null, insRef)
  c(R_INS, C_G, null, insRef)
  c(R_INS, C_T12, Math.round(insuranceVal))
  c(R_INS, C_PF, Math.round(insuranceVal))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 21: Property Taxes
  // ─────────────────────────────────────────────────────────────────────────────

  const taxRef = xl(R_TAX, C_D)
  c(R_TAX, C_LABEL, 'Property Taxes')
  c(R_TAX, C_GUIDE, '0.5% – 2.5% of value')
  c(R_TAX, C_D, Math.round(taxesVal))
  c(R_TAX, C_E, null, taxRef)
  c(R_TAX, C_F, null, taxRef)
  c(R_TAX, C_G, null, taxRef)
  c(R_TAX, C_T12, Math.round(taxesVal))
  c(R_TAX, C_PF, Math.round(taxesVal))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 22: Utilities
  // ─────────────────────────────────────────────────────────────────────────────

  const utilRef = xl(R_UTIL, C_D)
  c(R_UTIL, C_LABEL, 'Utilities')
  c(R_UTIL, C_GUIDE, '$700 – $800/unit')
  c(R_UTIL, C_D, Math.round(utilitiesVal))
  c(R_UTIL, C_E, null, utilRef)
  c(R_UTIL, C_F, null, utilRef)
  c(R_UTIL, C_G, null, utilRef)
  c(R_UTIL, C_T12, Math.round(utilitiesVal))
  c(R_UTIL, C_PF, Math.round(utilitiesVal))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 23: Repairs & Maintenance
  // ─────────────────────────────────────────────────────────────────────────────

  // D24 = $/unit, formula columns multiply by units
  c(R_RM, C_LABEL, 'Repairs & Maintenance')
  c(R_RM, C_GUIDE, '$500 – $750/unit')
  c(R_RM, C_RATE, `$${rmPerUnit}/unit`)
  c(R_RM, C_D, rmPerUnit)
  c(R_RM, C_E, null, `${dRmUnit}*${dUnits}`)
  c(R_RM, C_F, null, `${dRmUnit}*${dUnits}`)
  c(R_RM, C_G, null, `${dRmUnit}*${dUnits}`)
  c(R_RM, C_T12, Math.round(deal.repairs_maintenance ?? 0))
  c(R_RM, C_PF, Math.round(deal.repairs_maintenance ?? 0))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 24: Management Fee
  // ─────────────────────────────────────────────────────────────────────────────

  // D25 = % of EGI; formula columns apply to scenario EGI
  c(R_MGMT, C_LABEL, 'Management Fee')
  c(R_MGMT, C_GUIDE, '5% – 10% of EGI')
  c(R_MGMT, C_RATE, pct(mgmtPct))
  c(R_MGMT, C_D, mgmtPct)
  c(R_MGMT, C_E, null, `${dMgmt}*${xl(R_EGI, C_E)}`)
  c(R_MGMT, C_F, null, `${dMgmt}*${xl(R_EGI, C_F)}`)
  c(R_MGMT, C_G, null, `${dMgmt}*${xl(R_EGI, C_G)}`)
  c(R_MGMT, C_T12, Math.round(deal.management_fee ?? 0))
  c(R_MGMT, C_PF, Math.round(deal.management_fee ?? 0))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 25: Contract Services
  // ─────────────────────────────────────────────────────────────────────────────

  const contractRef = xl(R_CONTRACT, C_D)
  c(R_CONTRACT, C_LABEL, 'Contract Services')
  c(R_CONTRACT, C_D, contractServicesVal)
  c(R_CONTRACT, C_E, null, contractRef)
  c(R_CONTRACT, C_F, null, contractRef)
  c(R_CONTRACT, C_G, null, contractRef)
  c(R_CONTRACT, C_T12, 0)
  c(R_CONTRACT, C_PF, 0)

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 26: General & Administrative
  // ─────────────────────────────────────────────────────────────────────────────

  const gaRef = xl(R_GA, C_D)
  c(R_GA, C_LABEL, 'General & Administrative')
  c(R_GA, C_GUIDE, '$200 – $300/unit')
  c(R_GA, C_D, Math.round(gaVal))
  c(R_GA, C_E, null, gaRef)
  c(R_GA, C_F, null, gaRef)
  c(R_GA, C_G, null, gaRef)
  c(R_GA, C_T12, Math.round(gaVal))
  c(R_GA, C_PF, Math.round(gaVal))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 27: Payroll
  // ─────────────────────────────────────────────────────────────────────────────

  const payrollRef = xl(R_PAYROLL, C_D)
  c(R_PAYROLL, C_LABEL, 'Payroll / On-Site Staff')
  c(R_PAYROLL, C_GUIDE, '$800 – $1,100/unit')
  c(R_PAYROLL, C_D, Math.round(payrollVal))
  c(R_PAYROLL, C_E, null, payrollRef)
  c(R_PAYROLL, C_F, null, payrollRef)
  c(R_PAYROLL, C_G, null, payrollRef)
  c(R_PAYROLL, C_T12, Math.round(payrollVal))
  c(R_PAYROLL, C_PF, Math.round(payrollVal))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 28: Replacement Reserves
  // ─────────────────────────────────────────────────────────────────────────────

  // D29 = $/unit; formula columns multiply by units
  c(R_RESERVE, C_LABEL, 'Replacement Reserves')
  c(R_RESERVE, C_GUIDE, '$150 – $300/unit')
  c(R_RESERVE, C_RATE, `$${reservePerUnit}/unit`)
  c(R_RESERVE, C_D, reservePerUnit)
  c(R_RESERVE, C_E, null, `${dResUnit}*${dUnits}`)
  c(R_RESERVE, C_F, null, `${dResUnit}*${dUnits}`)
  c(R_RESERVE, C_G, null, `${dResUnit}*${dUnits}`)
  c(R_RESERVE, C_T12, Math.round(deal.reserves ?? 0))
  c(R_RESERVE, C_PF, Math.round(deal.reserves ?? 0))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 29: Total Expenses
  // ─────────────────────────────────────────────────────────────────────────────

  // D-column total: SUM of each D-column expense row
  // Note: R&M and Reserve D-cells are per-unit so the D-column total is wrong
  // unless we SUM the formula cells — but D-col is hard-coded. So we hard-code
  // the total from the engine and use SUM formulas for E/F/G which reference
  // formula cells (which correctly multiply per-unit by units).

  // D-column: hard-code total from engine (accounts for floored minimums)
  c(R_TOTAL_EXP, C_LABEL, 'Total Operating Expenses')
  c(R_TOTAL_EXP, C_D, Math.round(ex.total_opex))

  for (const sc_col of [C_E, C_F, C_G]) {
    const start = xl(R_INS, sc_col)
    const end = xl(R_RESERVE, sc_col)
    c(R_TOTAL_EXP, sc_col, null, `SUM(${start}:${end})`)
  }
  // T12 / PF totals
  c(R_TOTAL_EXP, C_T12, Math.round(t12.opex))
  c(R_TOTAL_EXP, C_PF, Math.round(pf.opex))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 30: Expense Ratio
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_EXP_RATIO, C_LABEL, 'Expense Ratio')
  c(R_EXP_RATIO, C_GUIDE, '35% – 55% typical')
  c(R_EXP_RATIO, C_D, null, `IF(${xl(R_EGI, C_D)}=0,0,${xl(R_TOTAL_EXP, C_D)}/${xl(R_EGI, C_D)})`)

  for (const sc_col of [C_E, C_F, C_G, C_T12, C_PF]) {
    const egi = xl(R_EGI, sc_col)
    const opex = xl(R_TOTAL_EXP, sc_col)
    c(R_EXP_RATIO, sc_col, null, `IF(${egi}=0,0,${opex}/${egi})`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 32: Net Operating Income (NOI)
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_NOI, C_LABEL, 'Net Operating Income (NOI)')
  c(R_NOI, C_D, Math.round(ex.noi))

  for (const sc_col of [C_E, C_F, C_G, C_T12, C_PF]) {
    c(R_NOI, sc_col, null, `${xl(R_EGI, sc_col)}-${xl(R_TOTAL_EXP, sc_col)}`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 33: Current NOI (T-12 basis for reference)
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_CUR_NOI, C_LABEL, 'Current NOI (T-12 Basis)')
  c(R_CUR_NOI, C_T12, Math.round(ex.current_noi ?? t12.noi))

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 35: OFFER / MAO section header
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_OFFER_HEAD, C_LABEL, 'OFFER / MAX ALLOWABLE OFFER (MAO)')

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 36: Going-in Cap Rate (hard-coded per scenario)
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_CAP_RATE, C_LABEL, 'Going-in Cap Rate')
  c(R_CAP_RATE, C_E, 0.075)
  c(R_CAP_RATE, C_F, 0.08)
  c(R_CAP_RATE, C_G, 0.085)

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 37: Value at Cap Rate (NOI ÷ Cap)
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_VALUE, C_LABEL, 'As-Is Value (NOI ÷ Cap Rate)')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_VALUE, sc_col, null, `${xl(R_NOI, sc_col)}/${xl(R_CAP_RATE, sc_col)}`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 38: CapEx Budget (D = hard-coded; E/F/G reference it)
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_CAPEX, C_LABEL, 'CapEx Budget')
  c(R_CAPEX, C_GUIDE, '$8,000 – $15,000/unit')
  c(R_CAPEX, C_D, Math.round(totalCapex))
  c(R_CAPEX, C_E, null, dCapex)
  c(R_CAPEX, C_F, null, dCapex)
  c(R_CAPEX, C_G, null, dCapex)

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 39: MAX ALLOWABLE OFFER (MAO = Value − CapEx)
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_MAO, C_LABEL, 'MAX ALLOWABLE OFFER (MAO)')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_MAO, sc_col, null, `${xl(R_VALUE, sc_col)}-${xl(R_CAPEX, sc_col)}`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 40: MAO per Unit
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_MAO_UNIT, C_LABEL, 'MAO per Unit')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_MAO_UNIT, sc_col, null, `${xl(R_MAO, sc_col)}/${dUnits}`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 41: Asking Price (hard-coded reference)
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_ASKING, C_LABEL, 'Broker Asking Price')
  c(R_ASKING, C_T12, askingPrice > 0 ? askingPrice : 0)

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 42: Gap (MAO − Asking)
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_GAP, C_LABEL, 'Gap (MAO − Asking)')
  const askingCell = xl(R_ASKING, C_T12)
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_GAP, sc_col, null, `${xl(R_MAO, sc_col)}-${askingCell}`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 43: Gap %
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_GAP_PCT, C_LABEL, 'Gap %')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_GAP_PCT, sc_col, null, `IF(${askingCell}=0,0,${xl(R_GAP, sc_col)}/${askingCell})`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 45: USES header
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_USES_HEAD, C_LABEL, 'USES OF FUNDS')

  // ─────────────────────────────────────────────────────────────────────────────
  // ROWS 46–51: Uses of Funds
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_USES_PP, C_LABEL, 'Purchase Price (MAO)')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_USES_PP, sc_col, null, xl(R_MAO, sc_col))
  }

  c(R_USES_CAPEX, C_LABEL, 'CapEx Budget')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_USES_CAPEX, sc_col, null, xl(R_CAPEX, sc_col))
  }

  c(R_USES_ACQ, C_LABEL, 'Acquisition Costs (2%)')
  c(R_USES_ACQ, C_RATE, '2.00%')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_USES_ACQ, sc_col, null, `${xl(R_USES_PP, sc_col)}*0.02`)
  }

  c(R_USES_OPEX, C_LABEL, 'OpEx / Cash Reserve (1.5%)')
  c(R_USES_OPEX, C_RATE, '1.50%')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_USES_OPEX, sc_col, null, `${xl(R_USES_PP, sc_col)}*0.015`)
  }

  c(R_USES_FEE, C_LABEL, 'Acquisition Fee (4%)')
  c(R_USES_FEE, C_RATE, '4.00%')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_USES_FEE, sc_col, null, `${xl(R_USES_PP, sc_col)}*0.04`)
  }

  c(R_USES_TOTAL, C_LABEL, 'TOTAL USES')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_USES_TOTAL, sc_col, null, `SUM(${xl(R_USES_PP, sc_col)}:${xl(R_USES_FEE, sc_col)})`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 53: SOURCES header
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_SRC_HEAD, C_LABEL, 'SOURCES OF FUNDS')

  // ─────────────────────────────────────────────────────────────────────────────
  // ROWS 54–57: Sources
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_SRC_LOAN, C_LABEL, 'Loan Amount (70% LTC)')
  c(R_SRC_LOAN, C_RATE, '70.00%')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_SRC_LOAN, sc_col, null, `0.70*${xl(R_USES_TOTAL, sc_col)}`)
  }

  c(R_SRC_CARRY, C_LABEL, 'Seller Carry / Assumable')
  c(R_SRC_CARRY, C_D, sellerCarry)

  c(R_SRC_EQ, C_LABEL, 'Equity Required')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_SRC_EQ, sc_col, null, `${xl(R_USES_TOTAL, sc_col)}-${xl(R_SRC_LOAN, sc_col)}-${dSellerCarry}`)
  }

  c(R_SRC_CHECK, C_LABEL, 'Sources Total (= Total Uses)')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_SRC_CHECK, sc_col, null, `${xl(R_SRC_LOAN, sc_col)}+${dSellerCarry}+${xl(R_SRC_EQ, sc_col)}`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 59: DEBT SERVICE header
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_DEBT_HEAD, C_LABEL, 'DEBT SERVICE')

  // ─────────────────────────────────────────────────────────────────────────────
  // ROWS 60–65: Debt Service
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_INT_RATE, C_LABEL, 'Interest Rate')
  c(R_INT_RATE, C_GUIDE, 'DSCR / agency rate')
  c(R_INT_RATE, C_D, rate)

  c(R_AMORT, C_LABEL, 'Amortization (months)')
  c(R_AMORT, C_D, 360)

  // Monthly debt service: PMT(rate/12, 360, -loan) → positive payment
  c(R_MO_DS, C_LABEL, 'Monthly Debt Service')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_MO_DS, sc_col, null, `PMT(${dIntRate}/12,${dAmort},-${xl(R_SRC_LOAN, sc_col)})`)
  }

  c(R_ANN_DS, C_LABEL, 'Annual Debt Service')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_ANN_DS, sc_col, null, `${xl(R_MO_DS, sc_col)}*12`)
  }

  c(R_DSCR, C_LABEL, 'DSCR (Debt Service Coverage)')
  c(R_DSCR, C_GUIDE, '≥ 1.25 required')
  for (const sc_col of [C_E, C_F, C_G]) {
    const ads = xl(R_ANN_DS, sc_col)
    c(R_DSCR, sc_col, null, `IF(${ads}=0,"",${xl(R_NOI, sc_col)}/${ads})`)
  }

  c(R_DSCR_PASS, C_LABEL, 'DSCR Pass / Fail')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_DSCR_PASS, sc_col, null, `IF(${xl(R_DSCR, sc_col)}>=1.25,"PASS","FAIL")`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 67: EXIT ANALYSIS header
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_EXIT_HEAD, C_LABEL, 'EXIT ANALYSIS')

  // ─────────────────────────────────────────────────────────────────────────────
  // ROWS 68–75: Exit
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_HOLD, C_LABEL, 'Hold Period (months)')
  c(R_HOLD, C_D, holdMonths)

  c(R_EXIT_CAP, C_LABEL, 'Exit Cap Rate (entry − 1.5%)')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_EXIT_CAP, sc_col, null, `${xl(R_CAP_RATE, sc_col)}-0.015`)
  }

  c(R_OPT_NOI, C_LABEL, 'Optimized NOI (+30% forced appreciation)')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_OPT_NOI, sc_col, null, `${xl(R_NOI, sc_col)}*1.30`)
  }

  c(R_EXIT_VAL, C_LABEL, 'Exit Property Value')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_EXIT_VAL, sc_col, null, `ROUND(${xl(R_OPT_NOI, sc_col)}/${xl(R_EXIT_CAP, sc_col)},-3)`)
  }

  c(R_EQ_CREATED, C_LABEL, 'Equity Created (Exit − As-Is Value)')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_EQ_CREATED, sc_col, null, `${xl(R_EXIT_VAL, sc_col)}-${xl(R_VALUE, sc_col)}`)
  }

  // Remaining loan balance at exit: -FV(rate/12, holdMonths, payment, -initialLoan)
  c(R_LOAN_PAYOFF, C_LABEL, 'Loan Payoff at Exit')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_LOAN_PAYOFF, sc_col, null,
      `-FV(${dIntRate}/12,${dHold},${xl(R_MO_DS, sc_col)},-${xl(R_SRC_LOAN, sc_col)})`,
    )
  }

  c(R_NET_EQ, C_LABEL, 'Net Equity at Exit (Value − Payoff)')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_NET_EQ, sc_col, null, `${xl(R_EXIT_VAL, sc_col)}-${xl(R_LOAN_PAYOFF, sc_col)}`)
  }

  c(R_EQ_MULT, C_LABEL, 'Equity Multiple (Net Equity ÷ Equity In)')
  for (const sc_col of [C_E, C_F, C_G]) {
    const eq = xl(R_SRC_EQ, sc_col)
    c(R_EQ_MULT, sc_col, null, `IF(${eq}=0,"",${xl(R_NET_EQ, sc_col)}/${eq})`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 77: REFINANCE ANALYSIS header
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_REFI_HEAD, C_LABEL, 'REFINANCE ANALYSIS (at stabilized NOI)')

  // ─────────────────────────────────────────────────────────────────────────────
  // ROWS 78–84: Refinance
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_REFI_CAP, C_LABEL, 'Refi Market Cap Rate')
  c(R_REFI_CAP, C_D, refiMarketCap)

  c(R_REFI_LTV, C_LABEL, 'Refi LTV')
  c(R_REFI_LTV, C_D, 0.70)

  c(R_REFI_STAB, C_LABEL, 'Stabilized Value (Opt NOI ÷ Refi Cap)')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_REFI_STAB, sc_col, null, `${xl(R_OPT_NOI, sc_col)}/${dRefiCap}`)
  }

  c(R_REFI_LOAN, C_LABEL, 'Refi Loan Amount')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_REFI_LOAN, sc_col, null, `${dRefiLtv}*${xl(R_REFI_STAB, sc_col)}`)
  }

  c(R_REFI_COST, C_LABEL, 'Refi Cost (1.5%)')
  c(R_REFI_COST, C_RATE, '1.50%')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_REFI_COST, sc_col, null, `-0.015*${xl(R_REFI_LOAN, sc_col)}`)
  }

  c(R_REFI_PAYOFF, C_LABEL, 'Loan Payoff')
  for (const sc_col of [C_E, C_F, C_G]) {
    // Same as exit loan payoff
    c(R_REFI_PAYOFF, sc_col, null, xl(R_LOAN_PAYOFF, sc_col))
  }

  c(R_REFI_NET, C_LABEL, 'Net Refi Proceeds')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_REFI_NET, sc_col, null,
      `${xl(R_REFI_LOAN, sc_col)}+${xl(R_REFI_COST, sc_col)}-${xl(R_REFI_PAYOFF, sc_col)}`,
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 86: PARTNER WATERFALL header
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_WATER_HEAD, C_LABEL, 'PARTNER WATERFALL')

  // ─────────────────────────────────────────────────────────────────────────────
  // ROWS 87–92: Partner Waterfall
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_PREF_RATE, C_LABEL, 'Preferred Return Rate')
  c(R_PREF_RATE, C_D, prefReturnRate)

  c(R_LP_SHARE, C_LABEL, 'LP Equity Share')
  c(R_LP_SHARE, C_D, lpShare)

  c(R_PREF_RET, C_LABEL, 'LP Pref Returns (hold period)')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_PREF_RET, sc_col, null,
      `${dPrefRate}*${xl(R_SRC_EQ, sc_col)}*(${dHold}/12)`,
    )
  }

  c(R_LP_EQ, C_LABEL, 'LP Equity Share at Exit')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_LP_EQ, sc_col, null, `${dLpShare}*${xl(R_EQ_CREATED, sc_col)}`)
  }

  c(R_LP_TOTAL, C_LABEL, 'Total LP Return')
  for (const sc_col of [C_E, C_F, C_G]) {
    c(R_LP_TOTAL, sc_col, null, `${xl(R_PREF_RET, sc_col)}+${xl(R_LP_EQ, sc_col)}`)
  }

  c(R_IRR, C_LABEL, 'IRR Proxy (annualized)')
  for (const sc_col of [C_E, C_F, C_G]) {
    const eq = xl(R_SRC_EQ, sc_col)
    const tot = xl(R_LP_TOTAL, sc_col)
    c(R_IRR, sc_col, null, `IF(${eq}=0,"",(${tot}/${eq})^(12/${dHold})-1)`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 94–95: Notes
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_NOTES_HEAD, C_LABEL, 'Notes')
  if (deal.notes) {
    c(R_NOTES_VAL, C_LABEL, deal.notes)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROW 97: Footer
  // ─────────────────────────────────────────────────────────────────────────────

  c(R_FOOTER, C_LABEL, FOOTER)

  // ─────────────────────────────────────────────────────────────────────────────
  // Right-side tables — starting col 11 (L)
  // ─────────────────────────────────────────────────────────────────────────────

  const C_R0 = 11  // L — right-side table start

  // ── Unit Mix Table ───────────────────────────────────────────────────────────

  let rr = 0  // right-side row index
  c(rr, C_R0, 'UNIT MIX TABLE')
  rr++

  // Headers
  c(rr, C_R0,     'Type')
  c(rr, C_R0 + 1, '# Units')
  c(rr, C_R0 + 2, 'Avg SF')
  c(rr, C_R0 + 3, 'Market Rent')
  c(rr, C_R0 + 4, 'Actual Rent')
  c(rr, C_R0 + 5, 'Mkt Monthly')
  c(rr, C_R0 + 6, 'Act Monthly')
  rr++

  const umDataStart = rr
  for (const u of unitMix) {
    c(rr, C_R0,     `${u.bed_count}BR/${u.bath_count}BA`)
    c(rr, C_R0 + 1, u.unit_count)
    c(rr, C_R0 + 2, u.avg_sf || 0)
    c(rr, C_R0 + 3, u.market_rent)
    c(rr, C_R0 + 4, u.actual_rent)
    c(rr, C_R0 + 5, u.unit_count * u.market_rent)
    c(rr, C_R0 + 6, u.unit_count * u.actual_rent)
    rr++
  }
  const umDataEnd = rr - 1

  // Totals row (SUMPRODUCT for weighted averages, SUM for counts)
  c(rr, C_R0,     'TOTAL')
  if (unitMix.length > 0) {
    const uStart = xl(umDataStart, C_R0 + 1)
    const uEnd   = xl(umDataEnd,   C_R0 + 1)
    const mStart = xl(umDataStart, C_R0 + 5)
    const mEnd   = xl(umDataEnd,   C_R0 + 5)
    const aStart = xl(umDataStart, C_R0 + 6)
    const aEnd   = xl(umDataEnd,   C_R0 + 6)
    c(rr, C_R0 + 1, null, `SUM(${uStart}:${uEnd})`)
    c(rr, C_R0 + 5, null, `SUM(${mStart}:${mEnd})`)
    c(rr, C_R0 + 6, null, `SUM(${aStart}:${aEnd})`)
  } else {
    c(rr, C_R0 + 1, units)
    c(rr, C_R0 + 5, Math.round(totalMktMonthly))
    c(rr, C_R0 + 6, Math.round(totalMktMonthly))
  }
  rr++

  // GPR annual
  const umTotalRow = rr - 1
  c(rr, C_R0, 'GPR (Annual)')
  c(rr, C_R0 + 5, null, `${xl(umTotalRow, C_R0 + 5)}*12`)
  rr++

  rr += 2  // gap

  // ── CapEx Detail Table ───────────────────────────────────────────────────────

  c(rr, C_R0, 'CAPEX BUDGET DETAIL')
  rr++
  c(rr, C_R0,     'CapEx Line Item')
  c(rr, C_R0 + 1, '$/Unit')
  c(rr, C_R0 + 2, '# Units')
  c(rr, C_R0 + 3, 'Amount')
  c(rr, C_R0 + 4, '% of Budget')
  rr++

  // CapEx line items (hard-coded reference template matching Crossroad Terrace model)
  const capexLines: Array<{ label: string; perUnit: number | null; count: number | null; amount: number | null }> = [
    { label: 'Interior Renovation (full)',  perUnit: 6000, count: units, amount: null },
    { label: 'Heavy Lift Units (7 units)',  perUnit: 7500, count: 7,     amount: null },
    { label: 'W/D Hookup Install',          perUnit: 2500, count: units, amount: null },
    { label: 'Exterior / Common Areas',     perUnit: 5000, count: units, amount: null },
  ]

  const capexStartRow = rr
  for (const line of capexLines) {
    c(rr, C_R0,     line.label)
    if (line.perUnit !== null) {
      c(rr, C_R0 + 1, line.perUnit)
      c(rr, C_R0 + 2, line.count ?? units)
      // Amount = $/unit × count
      c(rr, C_R0 + 3, null, `${xl(rr, C_R0 + 1)}*${xl(rr, C_R0 + 2)}`)
    }
    rr++
  }
  const capexSubtotalRow = rr - 1

  // Contingency 10%
  c(rr, C_R0, 'Contingency (10%)')
  const capexAmtStart = xl(capexStartRow, C_R0 + 3)
  const capexAmtEnd   = xl(capexSubtotalRow, C_R0 + 3)
  c(rr, C_R0 + 3, null, `SUM(${capexAmtStart}:${capexAmtEnd})*0.10`)
  rr++

  const capexContRow = rr - 1

  // Total capex
  c(rr, C_R0, 'TOTAL CAPEX BUDGET')
  c(rr, C_R0 + 3, null, `SUM(${capexAmtStart}:${xl(capexContRow, C_R0 + 3)})`)
  rr++
  const capexTotalRow = rr - 1

  // Back-fill % of Budget column (requires total row to be known)
  const capexTotalCell = xl(capexTotalRow, C_R0 + 3)
  for (let rowIdx = capexStartRow; rowIdx <= capexContRow; rowIdx++) {
    c(rowIdx, C_R0 + 4, null, `IF(${capexTotalCell}=0,0,${xl(rowIdx, C_R0 + 3)}/${capexTotalCell})`)
  }
  c(capexTotalRow, C_R0 + 4, 1)  // 100%

  rr += 2  // gap

  // ── Rent Comps Table ─────────────────────────────────────────────────────────

  c(rr, C_R0, 'RENT COMPS')
  rr++
  c(rr, C_R0,     'Property Name')
  c(rr, C_R0 + 1, 'Units')
  c(rr, C_R0 + 2, 'Occ %')
  c(rr, C_R0 + 3, 'Avg Rent')
  c(rr, C_R0 + 4, 'Avg SF')
  c(rr, C_R0 + 5, '$/SF')
  c(rr, C_R0 + 6, 'Notes')
  rr++

  const comps = marketData?.rent_comps ?? []
  if (comps.length > 0) {
    for (const comp of comps) {
      c(rr, C_R0,     comp.name)
      c(rr, C_R0 + 1, comp.units ?? 0)
      c(rr, C_R0 + 2, comp.occupancy_pct != null ? comp.occupancy_pct : '')
      c(rr, C_R0 + 3, comp.avg_rent)
      c(rr, C_R0 + 4, comp.avg_sf ?? 0)
      c(rr, C_R0 + 5, comp.rent_per_sf != null
        ? comp.rent_per_sf
        : comp.avg_sf && comp.avg_sf > 0
          ? Number((comp.avg_rent / comp.avg_sf).toFixed(2))
          : 0)
      c(rr, C_R0 + 6, comp.notes ?? '')
      rr++
    }
  } else {
    // placeholder rows
    for (const placeholder of ['Subject Property', 'Comp 1', 'Comp 2', 'Comp 3']) {
      c(rr, C_R0, placeholder)
      rr++
    }
  }

  rr += 2  // gap

  // ── Cap Rate Reference Table ─────────────────────────────────────────────────

  c(rr, C_R0, 'CAP RATE REFERENCE')
  rr++
  c(rr, C_R0,     'Segment')
  c(rr, C_R0 + 1, 'Min Cap')
  c(rr, C_R0 + 2, 'Max Cap')
  c(rr, C_R0 + 3, 'Notes')
  rr++

  const capSegs = marketData?.cap_rate_segments ?? [
    { segment: 'Class A Urban',     cap_rate_min: 0.0425, cap_rate_max: 0.0525 },
    { segment: 'Class B Urban',     cap_rate_min: 0.0500, cap_rate_max: 0.0600 },
    { segment: 'Class B Suburban',  cap_rate_min: 0.0550, cap_rate_max: 0.0650 },
    { segment: 'Class C Urban',     cap_rate_min: 0.0600, cap_rate_max: 0.0700 },
    { segment: 'Class C Suburban',  cap_rate_min: 0.0650, cap_rate_max: 0.0750 },
    { segment: 'Value-Add',         cap_rate_min: 0.0700, cap_rate_max: 0.0850 },
    { segment: 'Tertiary Markets',  cap_rate_min: 0.0750, cap_rate_max: 0.0900 },
  ]
  for (const seg of capSegs) {
    c(rr, C_R0,     seg.segment)
    c(rr, C_R0 + 1, seg.cap_rate_min)
    c(rr, C_R0 + 2, seg.cap_rate_max)
    c(rr, C_R0 + 3, ('notes' in seg && seg.notes) ? (seg as CapRateSegment).notes ?? '' : '')
    rr++
  }

  rr += 2  // gap

  // ── Forced Appreciation Summary Table ────────────────────────────────────────

  c(rr, C_R0,     'FORCED APPRECIATION SUMMARY')
  c(rr, C_R0 + 1, 'Conservative (7.5%)')
  c(rr, C_R0 + 2, 'Moderate (8.0%)')
  c(rr, C_R0 + 3, 'Aggressive (8.5%)')
  rr++

  const summaryRows: Array<{ label: string; eRef: number; fRef: number; gRef: number }> = [
    { label: 'Purchase Price (MAO)', eRef: R_MAO,       fRef: R_MAO,       gRef: R_MAO },
    { label: 'CapEx Budget',         eRef: R_CAPEX,     fRef: R_CAPEX,     gRef: R_CAPEX },
    { label: 'All-In Basis',         eRef: R_VALUE,     fRef: R_VALUE,     gRef: R_VALUE },
    { label: 'Exit Value',           eRef: R_EXIT_VAL,  fRef: R_EXIT_VAL,  gRef: R_EXIT_VAL },
    { label: 'Equity Created',       eRef: R_EQ_CREATED,fRef: R_EQ_CREATED,gRef: R_EQ_CREATED },
    { label: 'Equity Multiple',      eRef: R_EQ_MULT,   fRef: R_EQ_MULT,   gRef: R_EQ_MULT },
    { label: 'DSCR',                 eRef: R_DSCR,      fRef: R_DSCR,      gRef: R_DSCR },
    { label: 'Equity Required',      eRef: R_SRC_EQ,    fRef: R_SRC_EQ,    gRef: R_SRC_EQ },
    { label: 'IRR Proxy',            eRef: R_IRR,       fRef: R_IRR,       gRef: R_IRR },
  ]

  for (const row of summaryRows) {
    c(rr, C_R0,     row.label)
    c(rr, C_R0 + 1, null, xl(row.eRef, C_E))
    c(rr, C_R0 + 2, null, xl(row.fRef, C_F))
    c(rr, C_R0 + 3, null, xl(row.gRef, C_G))
    rr++
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Set worksheet range and column widths
  // ─────────────────────────────────────────────────────────────────────────────

  const finalRow = Math.max(maxRow, rr)
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: finalRow, c: MAX_COL } })
  ws['!cols'] = [
    { wch: 38 },  // A  Line Item
    { wch: 22 },  // B  Guidance
    { wch: 12 },  // C  Rate/Unit
    { wch: 16 },  // D  Expert Input
    { wch: 16 },  // E  Sc1 7.5%
    { wch: 18 },  // F  Sc2 8.0% BASE
    { wch: 16 },  // G  Sc3 8.5%
    { wch: 16 },  // H  T-12 Actuals
    { wch: 16 },  // I  Broker PF
    { wch: 2  },  // J  spacer
    { wch: 2  },  // K  spacer
    { wch: 26 },  // L  Right table col 0
    { wch: 10 },  // M
    { wch: 10 },  // N
    { wch: 14 },  // O
    { wch: 12 },  // P
    { wch: 12 },  // Q
    { wch: 20 },  // R  Notes
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Underwriting Model')

  // ── Notes sheet ──────────────────────────────────────────────────────────────

  const notesRows: Row[] = [
    ['LJM DEAL ANALYZER — MODEL NOTES'],
    [],
    ['COLUMN LAYOUT'],
    ['Col D (EXPERT INPUT)', 'Hard-coded inputs from deal data — yellow "expert" column. Change these to recalculate.'],
    ['Col E (Sc1 — 7.5%)',   'Conservative scenario: going-in cap = 7.5%, all formulas reference D-column inputs.'],
    ['Col F (Sc2 — 8.0%)',   'Moderate scenario (BASE): going-in cap = 8.0%. Primary scenario for offer decisions.'],
    ['Col G (Sc3 — 8.5%)',   'Aggressive scenario: going-in cap = 8.5%. Used for stretch/upside analysis.'],
    ['Col H (T-12 ACTUALS)', 'Hard-coded trailing-12-month actuals as reported by broker/seller.'],
    ['Col I (BROKER PF)',    'Hard-coded broker pro forma figures for comparison.'],
    [],
    ['KEY FORMULAS'],
    ['GPR',           '= Avg Market Rent (D8) × Units (D7) × 12'],
    ['EGI',           '= GPI − Loss-to-Lease − Vacancy − Bad Debt'],
    ['NOI',           '= EGI − Total Operating Expenses'],
    ['MAO',           '= NOI ÷ Cap Rate − CapEx Budget'],
    ['Total Uses',    '= MAO + CapEx + Acq Cost (2%) + OpEx Reserve (1.5%) + Acq Fee (4%)'],
    ['Loan Amount',   '= 70% × Total Uses'],
    ['Monthly DS',    '= PMT(rate/12, 360, −Loan)  — positive = outflow to lender'],
    ['Loan Payoff',   '= −FV(rate/12, hold_months, monthly_DS, −Loan)'],
    ['Equity Multiple','= Net Equity at Exit ÷ Equity Required'],
    ['IRR Proxy',     '= (Total LP Return ÷ Equity)^(12 ÷ hold_months) − 1'],
    [],
    ['ASSUMPTIONS'],
    ['Loss-to-Lease', `${pct(ltlPct)} of GPR`],
    ['Vacancy',       `${pct(vacPct)} of GPR`],
    ['Bad Debt',      `${pct(delinqPct)} of GPR`],
    ['LTC',           '70%'],
    ['Amortization',  '30 years (360 months)'],
    ['Exit NOI Growth','+30% forced appreciation uplift on stabilization'],
    ['Exit Cap Rate', 'Entry cap − 1.50% (compression from value-add execution)'],
    ['LP Share',      `${pct(lpShare)} of equity upside`],
    ['Pref Return',   `${pct(prefReturnRate)} annually on LP equity`],
    [],
    [FOOTER],
  ]

  const wsNotes = XLSX.utils.aoa_to_sheet(notesRows)
  wsNotes['!cols'] = [{ wch: 22 }, { wch: 80 }]
  XLSX.utils.book_append_sheet(wb, wsNotes, 'Model Notes')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(buf)
}

// ─── generateSynthesisXlsx ────────────────────────────────────────────────────

export async function generateSynthesisXlsx(
  deal: DealInput,
  analysis: AnalysisResult,
  marketData?: MarketData,
): Promise<Buffer> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  const ex = analysis.expert
  const sc = analysis.scenarios
  const t12 = analysis.t12
  const units = analysis.units
  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  // ── Tab 1: Deal Summary ──────────────────────────────────────────────────────

  const sumRows: Row[] = []
  sumRows.push(['LJM DEAL SUMMARY — EXECUTIVE SYNTHESIS'])
  sumRows.push([`Generated: ${dateStr}`])
  sumRows.push([])

  // Property
  sumRows.push(['PROPERTY'])
  sumRows.push(['Name',         deal.property_name || '—'])
  sumRows.push(['Address',      [deal.address, deal.city, deal.state, deal.zip_code].filter(Boolean).join(', ') || '—'])
  sumRows.push(['Units',        units])
  sumRows.push(['Year Built',   deal.year_built || '—'])
  sumRows.push(['Asking Price', deal.asking_price ? fmtMoney(deal.asking_price) : '(call for offers)'])
  sumRows.push(['Broker Cap Rate', deal.broker_cap_rate ? pct(deal.broker_cap_rate) : '—'])
  if (deal.renovation_status) sumRows.push(['Renovation Status', deal.renovation_status])
  if (deal.submarket)         sumRows.push(['Submarket', deal.submarket])
  sumRows.push([])

  // Verdict
  sumRows.push(['VERDICT', analysis.verdict.label])
  sumRows.push(['LJM Max Offer (Sc2 BASE)', fmtMoney(sc[1]?.mao ?? ex.max_offer)])
  sumRows.push(['Gap vs Asking', deal.asking_price ? fmtMoney(analysis.asking.gap_to_sc2_mao) : '—'])
  sumRows.push(['Gap %',         deal.asking_price ? pct(analysis.asking.gap_to_sc2_mao_pct) : '—'])
  sumRows.push([])

  // Expert Underwriting vs T-12
  sumRows.push(['EXPERT UNDERWRITING', 'LJM Expert', 'T-12 Actuals'])
  sumRows.push(['Gross Potential Income (GPI)', fmtMoney(ex.gpi), '—'])
  sumRows.push(['EGI',              fmtMoney(ex.egi),       fmtMoney(t12.egi)])
  sumRows.push(['Total OpEx',       fmtMoney(ex.total_opex), fmtMoney(t12.opex)])
  sumRows.push(['NOI',              fmtMoney(ex.noi),        fmtMoney(t12.noi)])
  sumRows.push(['Cap Rate',         pct(ex.cap_rate),        deal.broker_cap_rate ? pct(deal.broker_cap_rate) : '—'])
  sumRows.push(['Expense Ratio',    pct(ex.expense_ratio),   t12.egi > 0 ? pct(t12.opex / t12.egi) : '—'])
  sumRows.push([])

  // Financing
  sumRows.push(['FINANCING'])
  sumRows.push(['Interest Rate',            pct(deal.interest_rate ?? 0.068, 2)])
  sumRows.push(['Loan Amount (70% LTC)',    fmtMoney(ex.loan_amount_ltc)])
  sumRows.push(['Annual Debt Service',      fmtMoney(ex.annual_debt_service)])
  sumRows.push(['DSCR — Amort',             ex.dscr_amort.toFixed(2) + 'x'])
  sumRows.push(['DSCR — I/O',               ex.dscr_io.toFixed(2) + 'x'])
  sumRows.push(['Equity Required (LTC)',    fmtMoney(Math.max(0, ex.equity_required_ltc))])
  sumRows.push([])

  // Cash Flow
  sumRows.push(['CASH FLOW'])
  sumRows.push(['Current NOI Cash Flow (I/O)',      fmtMoney(ex.annual_cash_flow_current_io)])
  sumRows.push(['Pro-Forma Cash Flow (I/O)',         fmtMoney(ex.annual_cash_flow_proforma_io)])
  sumRows.push(['Pro-Forma Cash Flow (Amort)',       fmtMoney(ex.annual_cash_flow_proforma_amort)])
  sumRows.push(['Cash-on-Cash Return',               pct(ex.cash_on_cash)])
  sumRows.push([])

  // Exit Summary
  sumRows.push(['EXIT SUMMARY', 'Refinance', 'Sale'])
  sumRows.push(['Stabilized Value',   fmtMoney(ex.refi_value),        fmtMoney(ex.sale_value)])
  sumRows.push(['Net Proceeds',       fmtMoney(ex.refi_net_cash),     fmtMoney(ex.sale_net_proceeds)])
  sumRows.push(['Partner Total Return', '',                            fmtMoney(ex.partner_total_return)])
  sumRows.push(['Annualized Return',   '',                             pct(ex.annualized_return)])
  sumRows.push([])

  // Market context
  if (marketData) {
    sumRows.push(['MARKET CONTEXT — ' + marketData.location])
    if (marketData.demand_drivers?.length) {
      sumRows.push(['Demand Drivers', marketData.demand_drivers.join(' | ')])
    }
    if (marketData.market_vacancy_pct != null) {
      sumRows.push(['Market Vacancy', pct(marketData.market_vacancy_pct)])
    }
    if (marketData.sources?.length) {
      sumRows.push(['Sources', marketData.sources.join(', ')])
    }
    sumRows.push([])
  }

  sumRows.push([FOOTER])

  const wsSummary = XLSX.utils.aoa_to_sheet(sumRows)
  wsSummary['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 22 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Deal Summary')

  // ── Tab 2: Scenarios ─────────────────────────────────────────────────────────

  const s0 = sc[0]; const s1 = sc[1]; const s2 = sc[2]

  const scenRows: Row[] = [
    [`${deal.property_name || 'Property'} — Scenario Analysis`],
    [`Generated: ${dateStr}`],
    [],
    ['Metric', s0?.label ?? 'Conservative', s1?.label ?? 'Moderate (BASE)', s2?.label ?? 'Aggressive'],
    ['Entry Cap Rate',               pct(s0?.cap_rate ?? 0.075), pct(s1?.cap_rate ?? 0.08), pct(s2?.cap_rate ?? 0.085)],
    ['MAO',                          s0?.mao ?? 0,        s1?.mao ?? 0,        s2?.mao ?? 0],
    ['MAO per Unit',                 s0?.mao_per_unit ?? 0,  s1?.mao_per_unit ?? 0,  s2?.mao_per_unit ?? 0],
    ['CapEx Budget',                 s0?.capex_budget ?? 0,  s1?.capex_budget ?? 0,  s2?.capex_budget ?? 0],
    ['All-In Basis',                 s0?.all_in_basis ?? 0,  s1?.all_in_basis ?? 0,  s2?.all_in_basis ?? 0],
    ['Loan Amount',                  s0?.loan_amount ?? 0,   s1?.loan_amount ?? 0,   s2?.loan_amount ?? 0],
    ['Annual Debt Service',          s0?.annual_debt_service ?? 0, s1?.annual_debt_service ?? 0, s2?.annual_debt_service ?? 0],
    ['DSCR',                         (s0?.dscr ?? 0).toFixed(2) + 'x', (s1?.dscr ?? 0).toFixed(2) + 'x', (s2?.dscr ?? 0).toFixed(2) + 'x'],
    ['DSCR Pass (≥1.25x)',           s0?.dscr_pass ? 'PASS' : 'FAIL', s1?.dscr_pass ? 'PASS' : 'FAIL', s2?.dscr_pass ? 'PASS' : 'FAIL'],
    ['Equity Required',              s0?.equity_required ?? 0, s1?.equity_required ?? 0, s2?.equity_required ?? 0],
    [],
    ['EXIT ANALYSIS'],
    ['Exit Cap Rate (entry − 1.5%)', pct(s0?.exit_cap_rate ?? 0.06), pct(s1?.exit_cap_rate ?? 0.065), pct(s2?.exit_cap_rate ?? 0.07)],
    ['Post-Opt NOI (+30%)',          s0?.post_opt_noi ?? 0,  s1?.post_opt_noi ?? 0,  s2?.post_opt_noi ?? 0],
    ['Exit Sale Value',              s0?.exit_value ?? 0,    s1?.exit_value ?? 0,    s2?.exit_value ?? 0],
    ['Equity Created',               s0?.equity_created ?? 0, s1?.equity_created ?? 0, s2?.equity_created ?? 0],
    ['Equity Multiple',              ((s0?.equity_multiple ?? 0)).toFixed(2) + 'x', ((s1?.equity_multiple ?? 0)).toFixed(2) + 'x', ((s2?.equity_multiple ?? 0)).toFixed(2) + 'x'],
    [],
    ['GAP TO ASKING PRICE'],
    ['Asking Price',         analysis.asking.price > 0 ? analysis.asking.price : '(call for offers)'],
    ['LJM Max Offer (Sc2)',  s1?.mao ?? 0],
    ['Gap (Max Offer − Asking)', analysis.asking.price > 0 ? Math.round(analysis.asking.gap_to_sc2_mao) : '—'],
    ['Gap %',                analysis.asking.price > 0 ? pct(analysis.asking.gap_to_sc2_mao_pct) : '—'],
    ['Verdict',              analysis.verdict.label],
    [],
    [FOOTER],
  ]

  const wsScen = XLSX.utils.aoa_to_sheet(scenRows)
  wsScen['!cols'] = [{ wch: 34 }, { wch: 20 }, { wch: 20 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, wsScen, 'Scenarios')

  // ── Tab 3: Risk Register ─────────────────────────────────────────────────────

  const riskRows: Row[] = [
    ['#', 'Risk', 'Severity', 'Likelihood', 'Score', 'Level', 'Notes'],
  ]
  for (let i = 0; i < analysis.risk_register.length; i++) {
    const r = analysis.risk_register[i]
    const level = r.score >= 16 ? 'RED' : r.score >= 10 ? 'ORANGE' : r.score >= 5 ? 'YELLOW' : 'GREEN'
    riskRows.push([i + 1, r.risk, r.severity, r.likelihood, r.score, level, r.notes])
  }
  riskRows.push([])
  riskRows.push([FOOTER])

  const wsRisk = XLSX.utils.aoa_to_sheet(riskRows)
  wsRisk['!cols'] = [
    { wch: 4 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 60 },
  ]
  XLSX.utils.book_append_sheet(wb, wsRisk, 'Risk Register')

  // ── Tab 4: Rent Comps (if marketData provided) ────────────────────────────────

  if (marketData?.rent_comps?.length) {
    const compRows: Row[] = [
      [`Rent Comps — ${marketData.location}`],
      [`Generated: ${dateStr}`],
      [],
      ['Property Name', 'Units', 'Occ %', 'Avg Rent', 'Avg SF', '$/SF', 'Notes'],
    ]
    for (const comp of marketData.rent_comps) {
      const rentPerSf = comp.rent_per_sf ?? (comp.avg_sf && comp.avg_sf > 0 ? Number((comp.avg_rent / comp.avg_sf).toFixed(2)) : 0)
      compRows.push([
        comp.name,
        comp.units ?? 0,
        comp.occupancy_pct != null ? pct(comp.occupancy_pct) : '—',
        fmtMoney(comp.avg_rent),
        comp.avg_sf ?? 0,
        rentPerSf > 0 ? `$${rentPerSf.toFixed(2)}/sf` : '—',
        comp.notes ?? '',
      ])
    }

    if (marketData.demand_drivers?.length) {
      compRows.push([])
      compRows.push(['DEMAND DRIVERS'])
      for (const d of marketData.demand_drivers) {
        compRows.push(['', d])
      }
    }

    compRows.push([])
    compRows.push([FOOTER])

    const wsComps = XLSX.utils.aoa_to_sheet(compRows)
    wsComps['!cols'] = [
      { wch: 30 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 40 },
    ]
    XLSX.utils.book_append_sheet(wb, wsComps, 'Rent Comps')
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(buf)
}
