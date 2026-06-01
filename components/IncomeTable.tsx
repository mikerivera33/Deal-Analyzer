import type { IncomeStatement } from '@/lib/types'
import { formatCurrency, formatPercent } from '@/lib/utils'

interface IncomeTableProps {
  t12: IncomeStatement
  broker_t2: IncomeStatement
  pf: IncomeStatement
  expert_income: IncomeStatement
}

function Row({
  label,
  t12,
  t2,
  pf,
  expert,
  bold,
  dim,
}: {
  label: string
  t12: string
  t2: string
  pf: string
  expert: string
  bold?: boolean
  dim?: boolean
}) {
  return (
    <tr className={bold ? 'font-semibold border-t border-border bg-primary/5' : dim ? 'opacity-60' : ''}>
      <td className="py-1.5 text-muted-foreground">{label}</td>
      <td className="py-1.5 text-right">{t12}</td>
      <td className="py-1.5 text-right">{t2}</td>
      <td className="py-1.5 text-right">{pf}</td>
      <td className="py-1.5 text-right text-primary">{expert}</td>
    </tr>
  )
}

function dash(v: number, fmt: (n: number) => string, ifZero = '—') {
  return v === 0 ? ifZero : fmt(v)
}

export function IncomeTable({ t12, broker_t2, pf, expert_income }: IncomeTableProps) {
  const hasT2 = broker_t2.gpi > 0

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 text-muted-foreground">Line Item</th>
            <th className="text-right py-2 text-muted-foreground">T-12 Actuals</th>
            <th className="text-right py-2 text-muted-foreground">Broker T-2</th>
            <th className="text-right py-2 text-muted-foreground">Broker PF</th>
            <th className="text-right py-2 text-primary font-semibold">Expert UW</th>
          </tr>
        </thead>
        <tbody>
          <Row label="Gross Rental Income"
            t12={formatCurrency(t12.gross_rental_income)}
            t2={dash(broker_t2.gross_rental_income, formatCurrency)}
            pf={formatCurrency(pf.gross_rental_income)}
            expert={formatCurrency(expert_income.gross_rental_income)}
          />
          <Row label="Utility Reimbursement"
            t12={dash(t12.utility_reimbursement, formatCurrency)}
            t2={dash(broker_t2.utility_reimbursement, formatCurrency)}
            pf={dash(pf.utility_reimbursement, formatCurrency)}
            expert={dash(expert_income.utility_reimbursement, formatCurrency)}
          />
          <Row label="Other Income"
            t12={dash(t12.other_income, formatCurrency)}
            t2={dash(broker_t2.other_income, formatCurrency)}
            pf={dash(pf.other_income, formatCurrency)}
            expert={dash(expert_income.other_income, formatCurrency)}
          />
          <Row label="GPI"
            t12={formatCurrency(t12.gpi)}
            t2={dash(broker_t2.gpi, formatCurrency)}
            pf={formatCurrency(pf.gpi)}
            expert={formatCurrency(expert_income.gpi)}
            bold
          />
          <Row label="Vacancy + Bad Debt"
            t12={t12.vacancy_bad_debt !== 0 ? formatCurrency(t12.vacancy_bad_debt) : '(baked in)'}
            t2="—"
            pf={dash(pf.vacancy_bad_debt, formatCurrency)}
            expert={formatCurrency(expert_income.vacancy_bad_debt)}
            dim
          />
          <Row label="EGI"
            t12={formatCurrency(t12.egi)}
            t2={dash(broker_t2.egi, formatCurrency)}
            pf={formatCurrency(pf.egi)}
            expert={formatCurrency(expert_income.egi)}
            bold
          />
          <Row label="Total OpEx"
            t12={formatCurrency(t12.opex)}
            t2={dash(broker_t2.opex, formatCurrency)}
            pf={formatCurrency(pf.opex)}
            expert={formatCurrency(expert_income.opex)}
          />
          <Row label="NOI"
            t12={formatCurrency(t12.noi)}
            t2={dash(broker_t2.noi, formatCurrency)}
            pf={formatCurrency(pf.noi)}
            expert={formatCurrency(expert_income.noi)}
            bold
          />
          <Row label="Expense Ratio"
            t12={formatPercent(t12.expense_ratio)}
            t2={hasT2 ? formatPercent(broker_t2.expense_ratio) : '—'}
            pf={formatPercent(pf.expense_ratio)}
            expert={formatPercent(expert_income.expense_ratio)}
          />
        </tbody>
      </table>
    </div>
  )
}
