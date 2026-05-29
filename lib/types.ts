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
