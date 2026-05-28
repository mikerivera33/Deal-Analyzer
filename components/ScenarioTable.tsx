import type { Scenario } from '@/lib/types'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface ScenarioTableProps {
  scenarios: Scenario[]
}

type RowDef = [string, (s: Scenario) => string]

const ROWS: RowDef[] = [
  ['Cap Rate', (s) => formatPercent(s.cap_rate, 2)],
  ['MAO', (s) => formatCurrency(s.mao)],
  ['MAO / Unit', (s) => formatCurrency(s.mao_per_unit)],
  ['DSCR', (s) => s.dscr.toFixed(3)],
  ['DSCR Pass', (s) => s.dscr_pass ? 'PASS' : 'FAIL'],
  ['Equity Required', (s) => formatCurrency(s.equity_required)],
  ['Exit Value', (s) => formatCurrency(s.exit_value)],
  ['Equity Multiple', (s) => s.equity_multiple.toFixed(2) + 'x'],
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
