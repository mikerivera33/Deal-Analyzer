import { NextRequest, NextResponse } from 'next/server'
import { getJob } from '@/lib/blobStore'

export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const job = await getJob(params.jobId)
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  return NextResponse.json(job, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
