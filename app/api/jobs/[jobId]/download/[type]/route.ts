import { NextRequest, NextResponse } from 'next/server'
import { getJob } from '@/lib/blobStore'

export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string; type: string } }
) {
  const job = await getJob(params.jobId)
  if (!job || job.status !== 'complete' || !job.result?.analysis || !job.result?.deal) {
    return NextResponse.json({ error: 'Job not ready' }, { status: 404 })
  }

  const { deal, analysis } = job.result

  switch (params.type) {
    case 'deal_json': {
      const json = JSON.stringify({ deal, analysis }, null, 2)
      return new NextResponse(json, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="deal-${params.jobId}.json"`,
        },
      })
    }

    case 'advisory_pdf': {
      const { generateAdvisoryPdf } = await import('@/lib/generatePdf')
      const buf = await generateAdvisoryPdf(deal, analysis)
      const propName = deal.property_name || deal.address || 'deal'
      const slug = propName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="advisory-${slug}.pdf"`,
        },
      })
    }

    case 'underwriting_xlsx': {
      const { generateUnderwritingXlsx } = await import('@/lib/generateXlsx')
      const buf = await generateUnderwritingXlsx(deal, analysis)
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="underwriting-${params.jobId}.xlsx"`,
        },
      })
    }

    case 'synthesis_xlsx': {
      const { generateSynthesisXlsx } = await import('@/lib/generateXlsx')
      const buf = await generateSynthesisXlsx(deal, analysis)
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="synthesis-${params.jobId}.xlsx"`,
        },
      })
    }

    default:
      return NextResponse.json({ error: 'Unknown download type' }, { status: 400 })
  }
}
