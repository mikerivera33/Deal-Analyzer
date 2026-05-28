import { cn } from '@/lib/utils'

interface MetricCardProps {
  label: string
  value: string
  accent?: boolean
  className?: string
}

export function MetricCard({ label, value, accent, className }: MetricCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-4 flex flex-col gap-1',
        accent && 'border-primary/40 bg-primary/5',
        className
      )}
    >
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className={cn('text-xl font-semibold tabular-nums', accent && 'text-primary')}>
        {value}
      </span>
    </div>
  )
}
