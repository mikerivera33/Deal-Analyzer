import type { AnalysisResult, DealInput } from './types'

export async function generateAdvisoryPdf(
  deal: DealInput,
  analysis: AnalysisResult
): Promise<Buffer> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 48
  const contentW = pageW - margin * 2

  // Helpers
  const fmt$ = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
  const fmtPct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`

  // ── Header ───────────────────────────────────────────────
  doc.setFillColor(4, 120, 87) // teal primary
  doc.rect(0, 0, pageW, 72, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('LJM DEAL ANALYZER', margin, 30)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('LJM Homes LLC · Michael Rivera', margin, 48)
  doc.text(`Advisory Report  ·  ${new Date().toLocaleDateString()}`, margin, 62)

  // ── Property Title ──────────────────────────────────────
  let y = 96
  doc.setTextColor(20, 20, 20)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  const propTitle = deal.property_name || deal.address || 'Unnamed Property'
  doc.text(propTitle, margin, y)
  y += 18
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  const addrLine = [deal.address, deal.city, deal.state, deal.zip_code].filter(Boolean).join(', ')
  if (addrLine) { doc.text(addrLine, margin, y); y += 16 }
  doc.text(
    `${deal.units || '?'} units  ·  Built ${deal.year_built || '?'}  ·  ${deal.total_sf?.toLocaleString() || '?'} SF  ·  Asking ${fmt$(deal.asking_price || 0)}`,
    margin,
    y
  )
  y += 24

  // ── Verdict Banner ───────────────────────────────────────
  const verdictBg = analysis.verdict.label === 'ACQUIRE' ? [22, 163, 74]
    : analysis.verdict.label === 'NEGOTIATE' ? [217, 119, 6]
    : analysis.verdict.label === 'PASS' ? [234, 88, 12]
    : [220, 38, 38]
  doc.setFillColor(verdictBg[0], verdictBg[1], verdictBg[2])
  doc.roundedRect(margin, y, contentW, 36, 4, 4, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(
    `VERDICT: ${analysis.verdict.label}  ·  Gap to MAO: ${analysis.asking.gap_to_sc2_mao >= 0 ? '+' : ''}${fmt$(analysis.asking.gap_to_sc2_mao)} (${(analysis.asking.gap_to_sc2_mao_pct * 100).toFixed(1)}%)`,
    margin + 12,
    y + 22
  )
  y += 52

  // ── Key Metrics ──────────────────────────────────────────
  doc.setTextColor(20, 20, 20)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Key Metrics', margin, y)
  y += 6

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Metric', 'Value']],
    body: [
      ['Asking Price', fmt$(deal.asking_price || 0)],
      ['Expert NOI', fmt$(analysis.expert.noi)],
      ['Expert Cap Rate', fmtPct(analysis.expert.cap_rate, 2)],
      ['MAO (Base 8%)', fmt$(analysis.expert.mao)],
      ['DSCR', `${analysis.expert.dscr.toFixed(3)} (${analysis.expert.dscr_pass ? 'PASS' : 'FAIL'})`],
      ['Equity Required', fmt$(analysis.expert.equity_required)],
      ['Equity Multiple (Base)', `${analysis.expert.equity_multiple.toFixed(2)}x`],
      ['Exit Value (Base)', fmt$(analysis.expert.exit_value)],
      ['Expense Ratio', fmtPct(analysis.expert.expense_ratio)],
    ],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [4, 120, 87], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 20

  // ── Income Analysis ──────────────────────────────────────
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Income Analysis', margin, y)
  y += 6

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['', 'T-12 (Broker)', 'Pro-Forma (Broker)', 'Expert (LJM)']],
    body: [
      ['EGI', fmt$(analysis.t12.egi), fmt$(analysis.pf.egi), fmt$(analysis.expert.egi)],
      ['OpEx', fmt$(analysis.t12.opex), fmt$(analysis.pf.opex), fmt$(analysis.expert.total_opex)],
      ['NOI', fmt$(analysis.t12.noi), fmt$(analysis.pf.noi), fmt$(analysis.expert.noi)],
      ['Expense Ratio', '—', '—', fmtPct(analysis.expert.expense_ratio)],
    ],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [4, 120, 87], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 20

  // ── Scenarios ────────────────────────────────────────────
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Bear / Base / Bull Scenarios', margin, y)
  y += 6

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Metric', 'Bear (9%)', 'Base (8%)', 'Bull (7.5%)']],
    body: [
      ['MAO', ...analysis.scenarios.map((s) => fmt$(s.mao))],
      ['DSCR', ...analysis.scenarios.map((s) => `${s.dscr.toFixed(3)} ${s.dscr_pass ? '✓' : '✗'}`)],
      ['Equity Req.', ...analysis.scenarios.map((s) => fmt$(s.equity_required))],
      ['Exit Value', ...analysis.scenarios.map((s) => fmt$(s.exit_value))],
      ['Equity Multiple', ...analysis.scenarios.map((s) => `${s.equity_multiple.toFixed(2)}x`)],
    ],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [4, 120, 87], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 2: { fontStyle: 'bold' } },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 20

  // ── Risk Register ─────────────────────────────────────────
  if (y > 640) { doc.addPage(); y = 60 }
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Risk Register', margin, y)
  y += 6

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Risk', 'Sev', 'Lik', 'Score', 'Notes']],
    body: analysis.risk_register.map((r) => [r.risk, r.severity, r.likelihood, r.score, r.notes]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [4, 120, 87], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center', fontStyle: 'bold' }, 4: { cellWidth: 'auto' } },
    didParseCell: (data) => {
      if (data.column.index === 3 && data.section === 'body') {
        const score = Number(data.cell.raw)
        if (score > 15) data.cell.styles.fillColor = [254, 202, 202]
        else if (score > 9) data.cell.styles.fillColor = [254, 215, 170]
        else if (score > 4) data.cell.styles.fillColor = [254, 240, 138]
        else data.cell.styles.fillColor = [187, 247, 208]
      }
    },
  })

  // ── Disclaimer ───────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 24
  if (y > 700) { doc.addPage(); y = 60 }
  doc.setFontSize(7)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(120, 120, 120)
  doc.text(
    'Disclaimer: This report is prepared by LJM Homes LLC for internal underwriting purposes only. It does not constitute financial, legal, or investment advice. All projections are estimates based on provided data and standard LJM assumptions. Verify all figures with licensed professionals before making investment decisions.',
    margin,
    y,
    { maxWidth: contentW }
  )

  return Buffer.from(doc.output('arraybuffer'))
}
