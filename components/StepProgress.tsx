import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JobStep } from '@/lib/types'

const STEP_LABELS: Record<string, string> = {
  ingest: 'Ingesting documents',
  extract: 'Extracting deal data',
  reconcile: 'Reconciling fields',
  compute: 'Computing financials',
  generate: 'Generating report',
}

interface StepProgressProps {
  steps: JobStep[]
}

export function StepProgress({ steps }: StepProgressProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-3">
      <p className="text-sm font-medium text-muted-foreground">Analyzing deal…</p>
      <div className="space-y-2">
        {steps.map((s) => (
          <div key={s.step} className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-all',
                s.status === 'complete' && 'border-primary bg-primary text-primary-foreground',
                s.status === 'in_progress' && 'border-primary text-primary',
                s.status === 'pending' && 'border-border text-muted-foreground'
              )}
            >
              {s.status === 'complete' ? (
                <Check className="h-3.5 w-3.5" />
              ) : s.status === 'in_progress' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              )}
            </div>
            <span
              className={cn(
                'text-sm',
                s.status === 'complete' && 'text-foreground',
                s.status === 'in_progress' && 'text-primary font-medium',
                s.status === 'pending' && 'text-muted-foreground'
              )}
            >
              {STEP_LABELS[s.step] || s.step}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
