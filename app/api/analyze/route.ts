import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuid } from 'uuid'
import { storeJob, getJob } from '@/lib/blobStore'
import type { Job, DealInput } from '@/lib/types'
import { isSafeUrl } from '@/lib/utils'

// Rate limiting note: enforce per-IP limits via Vercel middleware or an upstream proxy.
const MAX_FILE_BYTES = 100 * 1024 * 1024  // 100 MB
const MAX_URL_LENGTH = 2048
const ALLOWED_EXTENSIONS = new Set(['pdf', 'xlsx', 'xls', 'csv', 'txt'])
const ALLOWED_EXTENSIONS_LIST = 'pdf, xlsx, xls, csv, txt'

const STEPS = ['ingest', 'extract', 'reconcile', 'compute', 'generate']

function makeSteps(activeIndex = 0) {
  return STEPS.map((step, i) => ({
    step,
    status:
      i < activeIndex
        ? ('complete' as const)
        : i === activeIndex
        ? ('in_progress' as const)
        : ('pending' as const),
  }))
}

/** Safe error message — never expose internal stack traces to the client */
function clientError(err: unknown): string {
  if (err instanceof Error) {
    // Strip file paths and stack frames
    return err.message.split('\n')[0].replace(/\(.*?\)/g, '').trim().slice(0, 200)
  }
  return 'An unexpected error occurred'
}

async function processJob(jobId: string, text: string | null, manualDeal: DealInput | null) {
  try {
    // Step 0: ingest complete
    const j0 = await getJob(jobId) as Job
    await storeJob({ ...j0, steps: makeSteps(1) })

    let deal: DealInput
    let isDemo = false
    let missing: string[] = []

    if (manualDeal) {
      deal = manualDeal
      const j1 = await getJob(jobId) as Job
      await storeJob({ ...j1, steps: makeSteps(2) })
    } else {
      // Step 1: extract — call AI
      const { parseDealFromText } = await import('@/lib/aiParser')
      const result = await parseDealFromText(text || '')
      deal = result.deal
      isDemo = result.isDemo
      missing = result.missing
      const j1 = await getJob(jobId) as Job
      await storeJob({ ...j1, steps: makeSteps(2) })

      // If critical fields missing → needs_manual
      if (missing.length > 0 && !isDemo) {
        const j2 = await getJob(jobId) as Job
        await storeJob({
          ...j2,
          status: 'needs_manual',
          steps: makeSteps(2),
          result: { deal, missing },
        })
        return
      }
    }

    // Step 2: reconcile
    const j2 = await getJob(jobId) as Job
    await storeJob({ ...j2, steps: makeSteps(3) })

    // Step 3: compute
    const { runDealEngine } = await import('@/lib/dealEngine')
    const analysis = runDealEngine(deal)
    const j3 = await getJob(jobId) as Job
    await storeJob({ ...j3, steps: makeSteps(4) })

    // Step 4: generate
    const j4 = await getJob(jobId) as Job
    await storeJob({ ...j4, steps: makeSteps(5) })

    // Complete
    const j5 = await getJob(jobId) as Job
    await storeJob({
      ...j5,
      status: 'complete',
      steps: STEPS.map((step) => ({ step, status: 'complete' as const })),
      result: { deal, analysis, missing },
    })

    // Sync to Airtable (fire-and-forget; never blocks or crashes the pipeline)
    const { syncDealToAirtable } = await import('@/lib/airtableSync')
    await syncDealToAirtable(deal, analysis, jobId).catch(() => {})
  } catch (err: unknown) {
    try {
      const jErr = await getJob(jobId)
      if (jErr) {
        await storeJob({ ...jErr, status: 'error', error: clientError(err) })
      }
    } catch {
      // If we can't even store the error, there's nothing more we can do
    }
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
      text = ''
    } else if (manualRaw) {
      // Parse and validate manual deal JSON
      let parsed: unknown
      try {
        parsed = JSON.parse(manualRaw as string)
      } catch {
        return NextResponse.json({ error: 'Invalid JSON in manual field' }, { status: 400 })
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json({ error: 'Invalid deal data' }, { status: 400 })
      }
      manualDeal = parsed as DealInput
    } else if (file) {
      // Enforce file size limit
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: 'File exceeds 100 MB limit' }, { status: 413 })
      }
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return NextResponse.json(
          { error: `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS_LIST}` },
          { status: 415 }
        )
      }

      const buffer = Buffer.from(await file.arrayBuffer())

      if (ext === 'pdf') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const pdfParse = require('pdf-parse')
          const data = await pdfParse(buffer)
          text = data.text
        } catch {
          text = `[PDF file: ${file.name}]`
        }
      } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
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
      // Validate URL length
      if (urlField.length > MAX_URL_LENGTH) {
        return NextResponse.json({ error: 'URL too long' }, { status: 400 })
      }

      // SSRF protection: block private IPs, loopback, metadata endpoints
      if (!isSafeUrl(urlField)) {
        await storeJob({
          ...initialJob,
          status: 'blocked',
          result: { error: 'URL is not permitted. Only public http/https URLs are allowed.' },
        })
        return NextResponse.json({ jobId })
      }

      try {
        const res = await fetch(urlField, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LJMDealAnalyzer/1.0)' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const html = await res.text()
        text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 50000)
      } catch {
        await storeJob({
          ...initialJob,
          status: 'blocked',
          result: {
            error: 'URL blocked by site — please download the OM PDF and upload it directly.',
          },
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
      processJob(jobId, text, manualDeal).catch(() => {})
    }

    return NextResponse.json({ jobId })
  } catch (err: unknown) {
    return NextResponse.json({ error: clientError(err) }, { status: 500 })
  }
}
