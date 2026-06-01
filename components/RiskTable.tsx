import type { RiskRow } from '@/lib/types'
import { cn } from '@/lib/utils'

function scoreColor(score: number) {
  if (score <= 4) return 'bg-green-50 dark:bg-green-950/20'
  if (score <= 9) return 'bg-amber-50 dark:bg-amber-950/20'
  if (score <= 15) return 'bg-orange-50 dark:bg-orange-950/20'
  return 'bg-red-50 dark:bg-red-950/20'
}

export function RiskTable({ rows }: { rows: RiskRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2">Risk</th>
            <th className="text-center py-2 w-12">Sev</th>
            <th className="text-center py-2 w-12">Lik</th>
            <th className="text-center py-2 w-14">Score</th>
            <th className="text-left py-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={cn(scoreColor(r.score), 'border-b border-border/40')}>
              <td className="py-1.5 font-medium">{r.risk}</td>
              <td className="text-center">{r.severity}</td>
              <td className="text-center">{r.likelihood}</td>
              <td className="text-center font-semibold">{r.score}</td>
              <td className="py-1.5 text-xs text-muted-foreground">{r.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
