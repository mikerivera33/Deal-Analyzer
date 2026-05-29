import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuid } from 'uuid'
import { storeJob } from '@/lib/blobStore'
import type { Job, DealInput } from '@/lib/types'
import { isValidUUID } from '@/lib/utils'

const STEPS = ['ingest', 'extract', 'reconcile', 'compute', 'generate']

function clientError(err: unknown): string {
  if (err instanceof Error) {
    return err.message.split('\n')[0].replace(/\(.*?\)/g, '').trim().slice(0, 200)
  }
  return 'An unexpected error occurred'
}

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  if (!isValidUUID(params.jobId)) {
    return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 })
  }

  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { deal } = body as { deal?: DealInput }
    if (!deal || typeof deal !== 'object' || Array.isArray(deal)) {
      return NextResponse.json({ error: 'deal required' }, { status: 400 })
    }

    const newJobId = uuid()
    const job: Job = {
      id: newJobId,
      status: 'running',
      steps: STEPS.map((step) => ({ step, status: 'pending' as const })),
    }
    await storeJob(job)

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
    return NextResponse.json({ error: clientError(err) }, { status: 500 })
  }
}
