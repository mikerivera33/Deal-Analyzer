'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Job } from '@/lib/types'
import { StepProgress } from '@/components/StepProgress'
import { AnalysisPage } from '@/components/AnalysisPage'
import { ManualInputForm } from '@/components/ManualInputForm'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { ArrowLeft, AlertTriangle, XCircle } from 'lucide-react'
import type { DealInput } from '@/lib/types'

export default function AnalyzePage() {
  const { jobId } = useParams<{ jobId: string }>()
  const router = useRouter()
  const [job, setJob] = useState<Job | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [currentJobId, setCurrentJobId] = useState(jobId)
  const [manualLoading, setManualLoading] = useState(false)

  useEffect(() => {
    let active = true

    async function poll() {
      try {
        const res = await fetch(`/api/jobs/${currentJobId}`)
        if (!res.ok) throw new Error(`Job ${currentJobId} not found.`)
        const data: Job = await res.json()
        if (!active) return
        setJob(data)
        if (data.status === 'running') {
          setTimeout(poll, 700)
        }
      } catch (e: unknown) {
        if (!active) return
        setFetchError((e as Error).message)
      }
    }

    setJob(null)
    setFetchError(null)
    poll()
    return () => { active = false }
  }, [currentJobId])

  function handleNewJob(newJobId: string) {
    setCurrentJobId(newJobId)
    router.replace(`/analyze/${newJobId}`)
  }

  async function handleManualSubmit(deal: DealInput) {
    setManualLoading(true)
    try {
      const res = await fetch(`/api/jobs/${currentJobId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal }),
      })
      const data = await res.json()
      if (data.jobId) handleNewJob(data.jobId)
    } finally {
      setManualLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/')}
              data-testid="link-home"
              className="gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to upload
            </Button>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-foreground">LJM Deal Analyzer</h1>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {fetchError && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {fetchError}
          </div>
        )}

        {!job && !fetchError && (
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-24 bg-muted rounded" />
          </div>
        )}

        {job && (
          <div className="space-y-6">
            {/* Step progress while running */}
            {(job.status === 'running' || job.steps.some((s) => s.status !== 'complete')) && job.status !== 'complete' && job.status !== 'error' && job.status !== 'blocked' && job.status !== 'needs_manual' && (
              <StepProgress steps={job.steps} />
            )}

            {/* Blocked (URL could not be scraped) */}
            {job.status === 'blocked' && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-4">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">URL ingestion blocked</p>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    {job.result?.error || 'URL blocked by site — please download the OM PDF and upload it directly.'}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => router.push('/')}>
                    Back to upload
                  </Button>
                </div>
              </div>
            )}

            {/* Needs manual input */}
            {job.status === 'needs_manual' && (
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm font-medium mb-4">
                  AI extracted partial data. Please fill in the missing fields and run analysis.
                </p>
                <ManualInputForm
                  initialDeal={job.result?.deal || {}}
                  missing={job.result?.missing || []}
                  onSubmit={handleManualSubmit}
                  loading={manualLoading}
                />
              </div>
            )}

            {/* Error */}
            {job.status === 'error' && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive">Analysis failed</p>
                  <p className="text-sm text-muted-foreground mt-1">{job.error || 'Unknown error'}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push('/')}>
                    Back to upload
                  </Button>
                </div>
              </div>
            )}

            {/* Complete */}
            {job.status === 'complete' && job.result && (
              <AnalysisPage jobId={currentJobId} result={job.result} onNewJob={handleNewJob} />
            )}
          </div>
        )}
      </main>
    </div>
  )
}
