import type { Scenario } from '@/lib/types'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface ScenarioTableProps {
  scenarios: Scenario[]
}

type RowDef = [string, (s: Scenario) => string]

const ROWS: RowDef[] = [
  ['Entry Cap Rate', (s) => formatPercent(s.cap_rate, 1)],
  ['MAO', (s) => formatCurrency(s.mao)],
  ['MAO / Unit', (s) => formatCurrency(s.mao_per_unit)],
  ['CapEx Budget', (s) => formatCurrency(s.capex_budget)],
  ['All-in Basis', (s) => formatCurrency(s.all_in_basis)],
  ['Loan Amount (65% LTV)', (s) => formatCurrency(s.loan_amount)],
  ['Annual Debt Service', (s) => formatCurrency(s.annual_debt_service)],
  ['DSCR', (s) => s.dscr.toFixed(2) + 'x'],
  ['DSCR Min 1.25x', (s) => s.dscr_pass ? 'PASS' : 'FAIL'],
  ['Equity Required', (s) => formatCurrency(s.equity_required)],
  ['Exit Cap (−1.5%)', (s) => formatPercent(s.exit_cap_rate, 1)],
  ['Post-Opt NOI', (s) => formatCurrency(s.post_opt_noi)],
  ['Exit Sale Value', (s) => formatCurrency(s.exit_value)],
  ['Equity Created', (s) => formatCurrency(s.equity_created)],
]

export function ScenarioTable({ scenarios }: ScenarioTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2" />
            {scenarios.map((s, i) => (
              <th
                key={s.label}
                className={cn('text-right py-2', i === 1 ? 'text-primary' : 'text-muted-foreground')}
              >
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([label, fmt]) => (
            <tr key={label} className="border-b border-border/40">
              <td className="py-1.5 text-muted-foreground">{label}</td>
              {scenarios.map((s, i) => (
                <td
                  key={s.label}
                  className={cn(
                    'py-1.5 text-right',
                    i === 1 && 'font-medium',
                    label === 'DSCR Pass' && (s.dscr_pass ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold')
                  )}
                >
                  {fmt(s)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
