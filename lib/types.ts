export interface UnitMixRow {
  bed_count: number
  bath_count: number
  unit_count: number
  avg_sf: number
  market_rent: number
  actual_rent: number
}

export interface DealInput {
  // Property
  property_name?: string
  address?: string
  city?: string
  state?: string
  zip_code?: string
  year_built?: number
  units?: number
  total_sf?: number
  occupancy_pct?: number
  occupied_pct?: number   // alias for display (decimal 0-1)
  asking_price?: number
  broker_cap_rate?: number
  sale_type?: string
  submarket?: string
  msa?: string
  renovation_status?: string
  // T-12 Income (actuals as reported — vacancy already baked in)
  gross_rental_income?: number
  utility_reimbursement?: number
  other_income?: number
  // Broker T-2 Income (trailing 2 months annualized — optional)
  t2_gross_rental?: number
  t2_utility_reimb?: number
  t2_other_income?: number
  // Broker Pro-Forma Income
  pf_gross_rental?: number
  pf_other_income?: number
  pf_utility_reimb?: number
  // T-12 Expenses
  property_taxes?: number
  insurance?: number
  management_fee?: number
  utilities?: number
  reserves?: number
  // Additional expense categories
  payroll?: number              // annual $
  repairs_maintenance?: number  // annual $ (R&M)
  admin_fees?: number           // annual $ (General & Admin)
  // Financing overrides (defaults: 65% LTV, 6.8% rate)
  ltv?: number
  interest_rate?: number
  // CapEx
  capex_per_unit?: number         // default 10000
  // Post-optimization NOI override (else computed as expert_noi * 1.30)
  post_opt_noi_override?: number
  // Unit Mix
  unit_mix?: UnitMixRow[]
  notes?: string
  // Deal structure
  desired_cap_rate?: number     // desired all-in cap rate (default 0.09)
  seller_carry?: number         // assumable/seller carry loan amount
  io_months?: number            // interest-only months remaining
  // Income loss assumptions (overrides for defaults: 3% LTL, 4% vac, 2% delinq)
  loss_to_lease_pct?: number
  vacancy_pct?: number
  delinquency_pct?: number
  // Partner / return assumptions
  pref_return_rate?: number        // default 0.07
  equity_share_pct?: number        // default 0.20
  time_to_proforma_months?: number // default 24
  market_cap_rate?: number         // for refi, default 0.06
  refi_ltv?: number                // default 0.75
  refi_cost_pct?: number           // default 0.015
  sale_cap_rate?: number           // default 0.065
  sales_cost_pct?: number          // default 0.02
  other_income_per_unit?: number   // $/unit for potential other income (default 200)
}

export interface IncomeStatement {
  gross_rental_income: number
  utility_reimbursement: number
  other_income: number
  gpi: number
  vacancy_bad_debt: number   // stored as a negative number
  egi: number
  opex: number
  noi: number
  expense_ratio: number
}

export interface ExpertAnalysis {
  egi: number
  total_opex: number
  noi: number
  expense_ratio: number
  cap_rate: number
  mao: number
  mao_per_unit: number
  capex_budget: number
  all_in_basis: number
  post_opt_noi: number
  dscr: number
  dscr_pass: boolean
  equity_required: number
  exit_value: number
  equity_multiple: number
  annual_cash_flow: number
  cash_on_cash: number
  loan_amount: number
  annual_debt_service: number
  // New fields for XLSX display
  gross_collected_income: number
  loss_to_lease: number          // $ amount (negative)
  vacancy_loss: number           // $ amount (negative)
  delinquency_loss: number       // $ amount (negative)
  gpi: number
  max_offer: number
  all_in_cost: number
  total_capex: number
  cost_per_door: number
  // Uses
  purchase_price: number
  acquisition_cost: number
  opex_cash_reserve: number
  acquisition_fee: number
  total_uses: number
  // Sources
  loan_amount_ltc: number
  equity_required_ltc: number
  // Debt
  annual_debt_service_io: number
  dscr_io: number
  annual_cash_flow_io: number
  annual_cash_flow_amort: number
  dscr_amort: number
  // Current income (actual rents with waterfall)
  current_gpr: number
  current_gci: number
  current_noi: number
  dscr_current_io: number
  annual_cash_flow_current_io: number
  annual_cash_flow_proforma_io: number
  annual_cash_flow_proforma_amort: number
  // Partner equity & pref return
  pref_return_rate: number
  annual_pref_return: number
  partner_equity: number
  // Refinance analysis
  refi_market_cap: number
  refi_value: number
  refi_loan: number
  refi_cost_amount: number
  refi_loan_payoff: number
  refi_net_proceeds: number
  refi_investor_capital_return: number
  refi_investor_remaining: number
  refi_net_cash: number
  // Sale analysis
  sale_cap: number
  sale_value: number
  sale_cost_amount: number
  sale_loan_payoff: number
  sale_net_proceeds: number
  partner_capital_return: number
  projected_gain: number
  // Partner return on sale
  equity_share_pct: number
  equity_distributions: number
  partner_pref_returns_total: number
  partner_total_return: number
  annualized_return: number
}

export interface Scenario {
  label: string
  cap_rate: number
  exit_cap_rate: number
  mao: number
  mao_per_unit: number
  capex_budget: number
  all_in_basis: number
  loan_amount: number
  annual_debt_service: number
  dscr: number
  dscr_pass: boolean
  equity_required: number
  post_opt_noi: number
  exit_value: number
  equity_created: number
  equity_multiple: number
}

export interface RiskRow {
  risk: string
  severity: number
  likelihood: number
  score: number
  notes: string
}

export interface AnalysisResult {
  verdict: { label: string; bg: string; fg: string }
  asking: { price: number; gap_to_sc2_mao: number; gap_to_sc2_mao_pct: number }
  property: Record<string, string>
  t12: IncomeStatement
  broker_t2: IncomeStatement
  pf: IncomeStatement
  expert_income: IncomeStatement
  expert: ExpertAnalysis
  scenarios: Scenario[]
  risk_register: RiskRow[]
  units: number
}

export interface JobStep {
  step: string
  status: 'pending' | 'in_progress' | 'complete'
}

export type JobStatus = 'running' | 'blocked' | 'needs_manual' | 'error' | 'complete'

export interface JobResult {
  deal?: DealInput
  missing?: string[]
  error?: string
  analysis?: AnalysisResult
}

export interface Job {
  id: string
  status: JobStatus
  steps: JobStep[]
  msg?: string
  error?: string
  result?: JobResult
}
