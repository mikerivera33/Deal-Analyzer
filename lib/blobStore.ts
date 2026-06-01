import type { Job } from './types'
import { mkdir, writeFile, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { isValidUUID } from './utils'

const isVercel = process.env.VERCEL === '1'

function assertValidJobId(jobId: string): void {
  if (!isValidUUID(jobId)) {
    throw new Error('Invalid job ID format')
  }
}

function localPath(jobId: string) {
  return join(tmpdir(), 'ljm-jobs', `${jobId}.json`)
}

function getBlobUrl(jobId: string): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN || ''
  const match = token.match(/^vercel_blob_rw_([^_]+)/)
  if (!match) throw new Error('BLOB_READ_WRITE_TOKEN missing or malformed')
  return `https://${match[1]}.public.blob.vercel-storage.com/jobs/${jobId}.json`
}

export async function storeJob(job: Job): Promise<void> {
  assertValidJobId(job.id)
  const data = JSON.stringify(job)
  if (isVercel) {
    const { put } = await import('@vercel/blob')
    await put(`jobs/${job.id}.json`, data, {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
    })
  } else {
    const dir = join(tmpdir(), 'ljm-jobs')
    await mkdir(dir, { recursive: true })
    await writeFile(localPath(job.id), data, 'utf-8')
  }
}

export async function getJob(jobId: string): Promise<Job | null> {
  if (!isValidUUID(jobId)) return null
  try {
    if (isVercel) {
      const url = getBlobUrl(jobId)
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) return null
      const text = await res.text()
      try {
        return JSON.parse(text) as Job
      } catch {
        return null
      }
    } else {
      const data = await readFile(localPath(jobId), 'utf-8')
      return JSON.parse(data) as Job
    }
  } catch {
    return null
  }
}
