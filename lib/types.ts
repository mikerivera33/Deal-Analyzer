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
  asking_price?: number
  broker_cap_rate?: number
  sale_type?: string
  // T-12 Income (net of vacancy unless noted)
  gross_rental_income?: number
  utility_reimbursement?: number
  other_income?: number
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
  // Unit Mix
  unit_mix?: UnitMixRow[]
  notes?: string
}

export interface IncomeStatement {
  egi: number
  opex: number
  noi: number
}

export interface ExpertAnalysis {
  egi: number
  total_opex: number
  noi: number
  expense_ratio: number
  cap_rate: number
  mao: number
  mao_per_unit: number
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
  mao: number
  mao_per_unit: number
  dscr: number
  dscr_pass: boolean
  equity_required: number
  exit_value: number
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
  pf: IncomeStatement
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
