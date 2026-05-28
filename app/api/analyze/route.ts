import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuid } from 'uuid'
import { storeJob, getJob } from '@/lib/blobStore'
import type { Job, DealInput } from '@/lib/types'

const STEPS = ['ingest', 'extract', 'reconcile', 'compute', 'generate']

function makeSteps(activeIndex = 0) {
  return STEPS.map((step, i) => ({
    step,
    status: i < activeIndex ? 'complete' as const : i === activeIndex ? 'in_progress' as const : 'pending' as const,
  }))
}

async function updateJob(id: string, partial: Partial<Job>) {
  const existing = (await getJob(id)) as Job | null
  if (!existing) return
  await storeJob({ ...existing, ...partial })
}

async function processJob(jobId: string, text: string | null, manualDeal: DealInput | null) {
  try {
    // Step 0: ingest complete
    await storeJob({ ...(await getJob(jobId) as Job), steps: makeSteps(1) })

    let deal: DealInput
    let isDemo = false
    let missing: string[] = []

    if (manualDeal) {
      deal = manualDeal
      await storeJob({ ...(await getJob(jobId) as Job), steps: makeSteps(2) })
    } else {
      // Step 1: extract — call AI
      const { parseDealFromText } = await import('@/lib/aiParser')
      const result = await parseDealFromText(text || '')
      deal = result.deal
      isDemo = result.isDemo
      missing = result.missing
      await storeJob({ ...(await getJob(jobId) as Job), steps: makeSteps(2) })

      // If critical fields missing → needs_manual
      if (missing.length > 0 && !isDemo) {
        await storeJob({
          ...(await getJob(jobId) as Job),
          status: 'needs_manual',
          steps: makeSteps(2),
          result: { deal, missing },
        })
        return
      }
    }

    // Step 2: reconcile
    await storeJob({ ...(await getJob(jobId) as Job), steps: makeSteps(3) })

    // Step 3: compute
    const { runDealEngine } = await import('@/lib/dealEngine')
    const analysis = runDealEngine(deal)
    await storeJob({ ...(await getJob(jobId) as Job), steps: makeSteps(4) })

    // Step 4: generate
    await storeJob({ ...(await getJob(jobId) as Job), steps: makeSteps(5) })

    // Complete
    await storeJob({
      ...(await getJob(jobId) as Job),
      status: 'complete',
      steps: STEPS.map((step) => ({ step, status: 'complete' as const })),
      result: { deal, analysis, missing },
    })
  } catch (err: unknown) {
    await storeJob({
      ...(await getJob(jobId) as Job),
      status: 'error',
      error: (err as Error).message,
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const jobId = uuid()

    const initialJob: Job = {
      id: jobId,
      status: 'running',
      steps: makeSteps(0),
    }
    await storeJob(initialJob)

    const formData = await request.formData()
    const demo = formData.get('demo')
    const manualRaw = formData.get('manual')
    const urlField = formData.get('url') as string | null
    const file = formData.get('file') as File | null

    let text: string | null = null
    let manualDeal: DealInput | null = null

    if (demo) {
      // Demo mode — no text extraction needed
      text = ''
    } else if (manualRaw) {
      // Manual form submission
      manualDeal = JSON.parse(manualRaw as string) as DealInput
    } else if (file) {
      // File upload — extract text
      const buffer = Buffer.from(await file.arrayBuffer())
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext === 'pdf') {
        try {
          const pdfParse = require('pdf-parse')
          const data = await pdfParse(buffer)
          text = data.text
        } catch {
          text = `[PDF file: ${file.name}]`
        }
      } else if (['xlsx', 'xls', 'csv'].includes(ext || '')) {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(buffer, { type: 'buffer' })
        const lines: string[] = []
        wb.SheetNames.forEach((name) => {
          const ws = wb.Sheets[name]
          lines.push(`=== Sheet: ${name} ===`)
          lines.push(XLSX.utils.sheet_to_csv(ws))
        })
        text = lines.join('\n')
      } else {
        text = buffer.toString('utf-8').slice(0, 50000)
      }
    } else if (urlField) {
      // URL ingestion — attempt to fetch
      try {
        const res = await fetch(urlField, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LJMDealAnalyzer/1.0)' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const html = await res.text()
        text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 50000)
      } catch {
        // Mark as blocked
        await storeJob({
          ...initialJob,
          status: 'blocked',
          result: { error: 'URL blocked by site — please download the OM PDF and upload it directly.' },
        })
        return NextResponse.json({ jobId })
      }
    } else {
      text = ''
    }

    // Use waitUntil for background processing if available (Vercel)
    try {
      const { waitUntil } = await import('@vercel/functions')
      waitUntil(processJob(jobId, text, manualDeal))
    } catch {
      // waitUntil not available (local dev or non-Vercel) — run inline
      // Fire and forget in local dev
      processJob(jobId, text, manualDeal).catch(console.error)
    }

    return NextResponse.json({ jobId })
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
