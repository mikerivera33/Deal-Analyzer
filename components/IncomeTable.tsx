import type { IncomeStatement, ExpertAnalysis } from '@/lib/types'
import { formatCurrency, formatPercent } from '@/lib/utils'

interface IncomeTableProps {
  t12: IncomeStatement
  pf: IncomeStatement
  expert: ExpertAnalysis
}

function Row({
  label,
  t12,
  pf,
  expert,
  bold,
}: {
  label: string
  t12: string
  pf: string
  expert: string
  bold?: boolean
}) {
  return (
    <tr className={bold ? 'font-semibold border-t border-border bg-primary/5' : ''}>
      <td className="py-1.5 text-muted-foreground">{label}</td>
      <td className="py-1.5 text-right">{t12}</td>
      <td className="py-1.5 text-right">{pf}</td>
      <td className="py-1.5 text-right text-primary">{expert}</td>
    </tr>
  )
}

export function IncomeTable({ t12, pf, expert }: IncomeTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2" />
            <th className="text-right py-2 text-muted-foreground">T-12 (Broker)</th>
            <th className="text-right py-2 text-muted-foreground">Pro-Forma (Broker)</th>
            <th className="text-right py-2 text-primary">Expert (LJM)</th>
          </tr>
        </thead>
        <tbody>
          <Row label="EGI" t12={formatCurrency(t12.egi)} pf={formatCurrency(pf.egi)} expert={formatCurrency(expert.egi)} />
          <Row label="OpEx" t12={formatCurrency(t12.opex)} pf={formatCurrency(pf.opex)} expert={formatCurrency(expert.total_opex)} />
          <Row label="NOI" t12={formatCurrency(t12.noi)} pf={formatCurrency(pf.noi)} expert={formatCurrency(expert.noi)} bold />
          <Row label="Expense ratio" t12="—" pf="—" expert={formatPercent(expert.expense_ratio)} />
        </tbody>
      </table>
    </div>
  )
}
