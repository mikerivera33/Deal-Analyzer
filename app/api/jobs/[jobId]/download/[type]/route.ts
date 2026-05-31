import { NextRequest, NextResponse } from 'next/server'
import { getJob } from '@/lib/blobStore'
import { isValidUUID } from '@/lib/utils'

const ALLOWED_TYPES = new Set(['advisory_pdf', 'deal_json', 'underwriting_xlsx', 'synthesis_xlsx'])

export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string; type: string } }
) {
  if (!isValidUUID(params.jobId)) {
    return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(params.type)) {
    return NextResponse.json({ error: 'Unknown download type' }, { status: 400 })
  }

  const job = await getJob(params.jobId)
  if (!job || job.status !== 'complete' || !job.result?.analysis || !job.result?.deal) {
    return NextResponse.json({ error: 'Job not ready' }, { status: 404 })
  }

  const { deal, analysis, market_data } = job.result

  switch (params.type) {
    case 'deal_json': {
      const json = JSON.stringify({ deal, analysis, market_data }, null, 2)
      return new NextResponse(json, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="deal-${params.jobId}.json"`,
        },
      })
    }

    case 'advisory_pdf': {
      const { generateAdvisoryPdf } = await import('@/lib/generatePdf')
      const buf = await generateAdvisoryPdf(deal, analysis, market_data)
      const propName = deal.property_name || deal.address || 'deal'
      const slug = propName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="advisory-${slug}.pdf"`,
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    case 'underwriting_xlsx': {
      const { generateUnderwritingXlsx } = await import('@/lib/generateXlsx')
      const buf = await generateUnderwritingXlsx(deal, analysis, market_data)
      const propName = deal.property_name || deal.address || 'deal'
      const slug = propName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="underwriting-${slug}.xlsx"`,
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    case 'synthesis_xlsx': {
      const { generateSynthesisXlsx } = await import('@/lib/generateXlsx')
      const buf = await generateSynthesisXlsx(deal, analysis, market_data)
      const propName = deal.property_name || deal.address || 'deal'
      const slug = propName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="synthesis-${slug}.xlsx"`,
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    default:
      return NextResponse.json({ error: 'Unknown download type' }, { status: 400 })
  }
}
