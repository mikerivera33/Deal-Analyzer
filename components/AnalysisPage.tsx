'use client'
import { useState } from 'react'
import type { JobResult } from '@/lib/types'
import { MetricCard } from './MetricCard'
import { IncomeTable } from './IncomeTable'
import { ScenarioTable } from './ScenarioTable'
import { RiskTable } from './RiskTable'
import { PropertyPanel } from './PropertyPanel'
import { DownloadsPanel } from './DownloadsPanel'
import { DealJsonEditor } from './DealJsonEditor'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { Button } from './ui/button'
import { Pencil } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface AnalysisPageProps {
  jobId: string
  result: JobResult
  onNewJob: (newJobId: string) => void
}

export function AnalysisPage({ jobId, result, onNewJob }: AnalysisPageProps) {
  const [editorOpen, setEditorOpen] = useState(false)
  const { analysis } = result

  if (!analysis) return null

  const { verdict, asking, expert, scenarios, risk_register, t12, broker_t2, pf, expert_income, property, units } = analysis

  const verdictLabel = verdict.label
  const gapSign = asking.gap_to_sc2_mao >= 0 ? '+' : ''
  const gapDisplay = `${gapSign}${formatCurrency(asking.gap_to_sc2_mao)} (${gapSign}${(asking.gap_to_sc2_mao_pct * 100).toFixed(1)}%)`

  return (
    <div className="space-y-6">
      {/* Verdict ribbon */}
      <div
        className="rounded-lg px-5 py-3 flex items-center justify-between"
        style={{ background: verdict.bg, color: verdict.fg }}
        data-testid="verdict-ribbon"
      >
        <span className="font-bold text-lg tracking-wide">VERDICT: {verdictLabel}</span>
        <span className="text-sm opacity-90">
          {units} units · Asking {formatCurrency(asking.price)}
        </span>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Asking" value={formatCurrency(asking.price)} />
        <MetricCard
          label="Sc2 MAO (8.0%)"
          value={formatCurrency(expert.mao)}
          accent
        />
        <MetricCard
          label="Gap to MAO"
          value={gapDisplay}
          className={cn(
            asking.gap_to_sc2_mao >= 0
              ? 'border-green-400/40 bg-green-50/50 dark:bg-green-950/20'
              : 'border-red-400/40 bg-red-50/50 dark:bg-red-950/20'
          )}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="math">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="math">The Math</TabsTrigger>
            <TabsTrigger value="unit-mix">Unit Mix</TabsTrigger>
            <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
            <TabsTrigger value="risk">Risk Register</TabsTrigger>
            <TabsTrigger value="property">Property</TabsTrigger>
            <TabsTrigger value="downloads">Downloads</TabsTrigger>
          </TabsList>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditorOpen(true)}
            data-testid="button-edit-inputs"
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit Inputs (Deal JSON)
          </Button>
        </div>

        <TabsContent value="math">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">Income &amp; Expense Analysis</h3>
            <IncomeTable t12={t12} broker_t2={broker_t2} pf={pf} expert_income={expert_income} />
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard label="NOI" value={formatCurrency(expert.noi)} />
              <MetricCard label="Cap Rate" value={`${(expert.cap_rate * 100).toFixed(2)}%`} />
              <MetricCard label="DSCR" value={expert.dscr.toFixed(3)} />
              <MetricCard label="EGI" value={formatCurrency(expert.egi)} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="unit-mix">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">Unit Mix</h3>
            {result.deal?.unit_mix && result.deal.unit_mix.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2">Beds</th>
                      <th className="text-left py-2">Baths</th>
                      <th className="text-right py-2">Units</th>
                      <th className="text-right py-2">Avg SF</th>
                      <th className="text-right py-2">Market Rent</th>
                      <th className="text-right py-2">Actual Rent</th>
                      <th className="text-right py-2">Mo. Income</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.deal.unit_mix.map((u, i) => (
                      <tr key={i} className="border-b border-border/40">
                        <td className="py-1.5">{u.bed_count}BR</td>
                        <td className="py-1.5">{u.bath_count}BA</td>
                        <td className="py-1.5 text-right">{u.unit_count}</td>
                        <td className="py-1.5 text-right">{u.avg_sf?.toLocaleString()}</td>
                        <td className="py-1.5 text-right">${u.market_rent?.toLocaleString()}</td>
                        <td className="py-1.5 text-right">${u.actual_rent?.toLocaleString()}</td>
                        <td className="py-1.5 text-right">
                          ${(u.unit_count * u.actual_rent)?.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold border-t border-border bg-primary/5">
                      <td colSpan={2} className="py-1.5">Total</td>
                      <td className="py-1.5 text-right">{units}</td>
                      <td />
                      <td />
                      <td />
                      <td className="py-1.5 text-right">
                        ${result.deal.unit_mix
                          .reduce((s, u) => s + u.unit_count * u.actual_rent, 0)
                          .toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No unit mix data available.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="scenarios">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">Conservative / Moderate / Aggressive Scenarios</h3>
            <ScenarioTable scenarios={scenarios} />
          </div>
        </TabsContent>

        <TabsContent value="risk">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">Risk Register</h3>
            <RiskTable rows={risk_register} />
          </div>
        </TabsContent>

        <TabsContent value="property">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">Property</h3>
            <PropertyPanel property={property} />
          </div>
        </TabsContent>

        <TabsContent value="downloads">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">Downloads</h3>
            <DownloadsPanel jobId={jobId} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Editor modal */}
      {result.deal && (
        <DealJsonEditor
          deal={result.deal}
          jobId={jobId}
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          onNewJob={onNewJob}
        />
      )}
    </div>
  )
}
