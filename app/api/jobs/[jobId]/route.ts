import { NextRequest, NextResponse } from 'next/server'
import { getJob } from '@/lib/blobStore'
import { isValidUUID } from '@/lib/utils'

export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  if (!isValidUUID(params.jobId)) {
    return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 })
  }
  const job = await getJob(params.jobId)
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  return NextResponse.json(job, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
