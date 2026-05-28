import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuid } from 'uuid'
import { storeJob, getJob } from '@/lib/blobStore'
import type { Job, DealInput } from '@/lib/types'

const STEPS = ['ingest', 'extract', 'reconcile', 'compute', 'generate']

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { deal } = await request.json() as { deal: DealInput }
    if (!deal) {
      return NextResponse.json({ error: 'deal required' }, { status: 400 })
    }

    const newJobId = uuid()
    const job: Job = {
      id: newJobId,
      status: 'running',
      steps: STEPS.map((step) => ({ step, status: 'pending' as const })),
    }
    await storeJob(job)

    // Run computation
    const { runDealEngine } = await import('@/lib/dealEngine')
    const analysis = runDealEngine(deal)

    await storeJob({
      ...job,
      status: 'complete',
      steps: STEPS.map((step) => ({ step, status: 'complete' as const })),
      result: { deal, analysis },
    })

    return NextResponse.json({ jobId: newJobId })
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
