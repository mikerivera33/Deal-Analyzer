import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuid } from 'uuid'
import { storeJob, getJob } from '@/lib/blobStore'
import type { Job, DealInput, MarketData } from '@/lib/types'
import { isSafeUrl } from '@/lib/utils'

// Rate limiting note: enforce per-IP limits via Vercel middleware or an upstream proxy.
const MAX_FILE_BYTES = 100 * 1024 * 1024  // 100 MB
const MAX_URL_LENGTH = 2048
const ALLOWED_EXTENSIONS = new Set(['pdf', 'xlsx', 'xls', 'csv', 'txt'])
const ALLOWED_EXTENSIONS_LIST = Array.from(ALLOWED_EXTENSIONS).join(', ')

const STEPS = ['ingest', 'extract', 'research', 'reconcile', 'compute', 'generate']

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

async function advanceStep(jobId: string, stepIndex: number, patch: Partial<Job> = {}) {
  const current = await getJob(jobId)
  if (!current) throw new Error(`Job not found in store: ${jobId}`)
  await storeJob({ ...current, steps: makeSteps(stepIndex), ...patch })
}

async function processJob(jobId: string, text: string | null, manualDeal: DealInput | null) {
  try {
    // ingest done, move to extract
    await advanceStep(jobId, 1)

    let deal: DealInput
    let missing: string[] = []
    let market_data: MarketData | undefined

    if (manualDeal) {
      deal = manualDeal
      await advanceStep(jobId, 3)  // skip extract + research for manual input
    } else {
      const { parseDealFromText } = await import('@/lib/aiParser')
      const result = await parseDealFromText(text || '')
      deal = result.deal
      missing = result.missing

      if (missing.length > 0 && !result.isDemo) {
        await advanceStep(jobId, 1, { status: 'needs_manual', result: { deal, missing } })
        return
      }

      await advanceStep(jobId, 2)
      if (deal.city && deal.state) {
        try {
          const { fetchMarketData } = await import('@/lib/marketResearch')
          const avgRent = deal.unit_mix?.length
            ? deal.unit_mix.reduce((s, u) => s + u.market_rent, 0) / deal.unit_mix.length
            : undefined
          market_data = await fetchMarketData(deal.city, deal.state, deal.units ?? 0, avgRent)
        } catch {
          // market research failure never blocks the pipeline
        }
      }
      await advanceStep(jobId, 3)  // research done, reconcile in_progress
    }

    await advanceStep(jobId, 4)  // compute
    const { runDealEngine } = await import('@/lib/dealEngine')
    const analysis = runDealEngine(deal)
    await advanceStep(jobId, 5)  // generate
    await advanceStep(jobId, STEPS.length, {
      status: 'complete',
      result: { deal, analysis, missing, market_data },
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
      // Use DEMO_DEAL directly — bypasses AI so empty text doesn't trigger needs_manual
      const { DEMO_DEAL } = await import('@/lib/aiParser')
      manualDeal = DEMO_DEAL
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
