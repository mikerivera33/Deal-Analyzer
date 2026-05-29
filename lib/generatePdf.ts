import type { AnalysisResult, DealInput } from './types'
import { sanitizeString } from './utils'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEAL: [number, number, number] = [4, 120, 87]
const WHITE: [number, number, number] = [255, 255, 255]
const DARK: [number, number, number] = [20, 20, 20]
const GRAY: [number, number, number] = [100, 100, 100]
const LIGHT_GRAY: [number, number, number] = [245, 245, 245]

function fmt$(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtPct(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`
}

function fmtDscr(n: number): string {
  return `${n.toFixed(2)}x`
}

function riskLevel(score: number): { text: string; color: [number, number, number] } {
  if (score >= 16) return { text: 'RED', color: [220, 38, 38] }
  if (score >= 10) return { text: 'ORANGE', color: [234, 88, 12] }
  if (score >= 5) return { text: 'YELLOW', color: [202, 138, 4] }
  return { text: 'GREEN', color: [22, 163, 74] }
}

// ─── Page 1: Property Snapshot & Unit Mix ────────────────────────────────────

async function renderPage1(
  doc: import('jspdf').jsPDF,
  autoTable: (doc: import('jspdf').jsPDF, options: Record<string, unknown>) => void,
  deal: DealInput,
  analysis: AnalysisResult,
  pageW: number,
  margin: number,
  contentW: number,
): Promise<void> {
  const propName = sanitizeString(deal.property_name || deal.address) || 'Unnamed Property'
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const addrLine = [deal.address, deal.city, deal.state, deal.zip_code]
    .filter(Boolean).map(sanitizeString).join(', ')

  // Header band
  doc.setFillColor(...TEAL)
  doc.rect(0, 0, pageW, 80, 'F')
  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text(propName, margin, 32)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(dateStr, margin, 48)
  if (addrLine) doc.text(addrLine, margin, 62)

  // Stats row
  let y = 96
  const occupancyDisplay = deal.occupied_pct != null
    ? fmtPct(deal.occupied_pct)
    : deal.occupancy_pct != null
    ? fmtPct(deal.occupancy_pct)
    : '—'
  const brokerCapDisplay = deal.broker_cap_rate != null ? fmtPct(deal.broker_cap_rate, 2) : '—'
  const askingPerUnit = deal.units && deal.asking_price
    ? fmt$(deal.asking_price / deal.units)
    : '—'

  const statsLabels = ['Asking Price', 'Units', 'Occupied %', '$/Unit', 'Broker Cap', 'Year Built']
  const statsValues = [
    fmt$(deal.asking_price || 0),
    String(deal.units || '—'),
    occupancyDisplay,
    askingPerUnit,
    brokerCapDisplay,
    String(deal.year_built || '—'),
  ]
  const colW = contentW / 6
  doc.setFillColor(240, 250, 246)
  doc.rect(margin, y, contentW, 36, 'F')
  doc.setDrawColor(200, 200, 200)
  doc.rect(margin, y, contentW, 36, 'S')
  for (let i = 0; i < 6; i++) {
    const x = margin + i * colW + colW / 2
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text(statsLabels[i], x, y + 12, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...DARK)
    doc.text(statsValues[i], x, y + 26, { align: 'center' })
  }
  y += 52

  // Two-column: Property Snapshot (left) | Unit Mix (right)
  const halfW = (contentW - 12) / 2
  const leftX = margin
  const rightX = margin + halfW + 12

  // Property Snapshot table (left)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...TEAL)
  doc.text('Property Snapshot', leftX, y)

  autoTable(doc, {
    startY: y + 6,
    margin: { left: leftX, right: rightX + halfW - margin },
    tableWidth: halfW,
    head: [['Field', 'Value']],
    body: [
      ['Year Built', String(deal.year_built || '—')],
      ['Renovation', sanitizeString(deal.renovation_status) || '—'],
      ['Submarket', sanitizeString(deal.submarket) || '—'],
      ['MSA', sanitizeString(deal.msa) || '—'],
      ['Sale Type', sanitizeString(deal.sale_type) || '—'],
      ['Total SF', deal.total_sf ? deal.total_sf.toLocaleString() + ' sf' : '—'],
    ],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leftEndY = (doc as any).lastAutoTable.finalY

  // Unit Mix table (right)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...TEAL)
  doc.text('Unit Mix', rightX, y)

  const unitMix = deal.unit_mix || []
  const unitBody = unitMix.length > 0
    ? unitMix.map((u) => [
        `${u.bed_count}BR/${u.bath_count}BA`,
        String(u.unit_count),
        u.avg_sf ? u.avg_sf.toLocaleString() + ' sf' : '—',
        fmt$(u.market_rent),
      ])
    : [['—', '—', '—', '—']]

  autoTable(doc, {
    startY: y + 6,
    margin: { left: rightX, right: margin },
    tableWidth: halfW,
    head: [['Type', 'Units', 'SF', 'Mkt Rent']],
    body: unitBody,
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rightEndY = (doc as any).lastAutoTable.finalY

  y = Math.max(leftEndY, rightEndY) + 20

  // Footnote
  doc.setFontSize(7)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...GRAY)
  doc.text(
    'Source: Offering Memorandum, broker disclosures, and county tax records.',
    margin,
    y
  )
}

// ─── Page 2: Financial Analysis — 4 Scenarios Compared ───────────────────────

async function renderPage2(
  doc: import('jspdf').jsPDF,
  autoTable: (doc: import('jspdf').jsPDF, options: Record<string, unknown>) => void,
  deal: DealInput,
  analysis: AnalysisResult,
  pageW: number,
  margin: number,
  contentW: number,
): Promise<void> {
  let y = 48

  // Page title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...TEAL)
  doc.text('Financial Analysis — 4 Scenarios Compared', margin, y)
  y += 18

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text(
    'Side-by-side comparison of T-12 actuals, T-2 trailing analysis, broker pro forma, and our independent expert underwriting.',
    margin,
    y,
    { maxWidth: contentW }
  )
  y += 20

  // Determine if T-2 data exists
  const hasT2 = analysis.broker_t2.gpi > 0

  // Income analysis table
  const t12 = analysis.t12
  const t2 = analysis.broker_t2
  const pf = analysis.pf
  const ex = analysis.expert
  const exi = analysis.expert_income

  function fmtCell(n: number, isZero = false): string {
    if (isZero || n === 0) return '—'
    return fmt$(n)
  }
  function fmtCellNeg(n: number, isZero = false): string {
    if (isZero || n === 0) return '—'
    return fmt$(n)
  }

  const t2Zero = !hasT2

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Line Item', 'T-12 Actuals', 'Broker T-2', 'Broker PF', 'Expert UW']],
    body: [
      ['Gross Rental Income', fmt$(t12.gross_rental_income), fmtCell(t2.gross_rental_income, t2Zero), fmt$(pf.gross_rental_income), fmt$(exi.gross_rental_income)],
      ['Utility Reimbursement', fmt$(t12.utility_reimbursement), fmtCell(t2.utility_reimbursement, t2Zero), fmt$(pf.utility_reimbursement), fmt$(exi.utility_reimbursement)],
      ['Other Income', fmt$(t12.other_income), fmtCell(t2.other_income, t2Zero), fmt$(pf.other_income), fmt$(exi.other_income)],
      ['GPI', fmt$(t12.gpi), fmtCell(t2.gpi, t2Zero), fmt$(pf.gpi), fmt$(exi.gpi)],
      ['Vacancy + Bad Debt', t12.vacancy_bad_debt !== 0 ? fmt$(t12.vacancy_bad_debt) : '(baked in)', fmtCellNeg(t2.vacancy_bad_debt, t2Zero), fmt$(pf.vacancy_bad_debt), fmt$(exi.vacancy_bad_debt)],
      ['EGI', fmt$(t12.egi), fmtCell(t2.egi, t2Zero), fmt$(pf.egi), fmt$(ex.egi)],
      ['Total OpEx', fmt$(t12.opex), fmtCell(t2.opex, t2Zero), fmt$(pf.opex), fmt$(ex.total_opex)],
      ['NOI', fmt$(t12.noi), fmtCell(t2.noi, t2Zero), fmt$(pf.noi), fmt$(ex.noi)],
      ['Expense Ratio', t12.opex > 0 && t12.egi > 0 ? fmtPct(t12.opex / t12.egi) : '—', '—', pf.opex > 0 && pf.egi > 0 ? fmtPct(pf.opex / pf.egi) : '—', fmtPct(ex.expense_ratio)],
    ],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 130 },
      4: { fontStyle: 'bold' },
    },
    didParseCell: (data: Record<string, unknown>) => {
      const d = data as { section: string; row: { index: number }; column: { index: number }; cell: { styles: Record<string, unknown> } }
      if (d.section === 'body' && d.row.index === 7 && d.column.index === 4) {
        // NOI row Expert column — teal background
        d.cell.styles.fillColor = [209, 250, 229]
      }
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 16

  // Key finding callout box
  const expertNoi = ex.noi
  const t12Noi = t12.noi
  const diff = expertNoi - t12Noi
  const calloutText = `Expert NOI of ${fmt$(expertNoi)} vs broker T-12 NOI of ${fmt$(t12Noi)} — a difference of ${diff >= 0 ? '+' : ''}${fmt$(diff)}. LJM applies 9% vacancy + bad debt and market-rate management and reserve assumptions.`

  // Left-border callout box
  doc.setFillColor(236, 253, 245)
  doc.rect(margin, y, contentW, 48, 'F')
  doc.setFillColor(...TEAL)
  doc.rect(margin, y, 4, 48, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...TEAL)
  doc.text('Key Finding', margin + 12, y + 14)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK)
  doc.text(calloutText, margin + 12, y + 26, { maxWidth: contentW - 20 })
}

// ─── Page 3: MAO — 3 Scenarios ───────────────────────────────────────────────

async function renderPage3(
  doc: import('jspdf').jsPDF,
  autoTable: (doc: import('jspdf').jsPDF, options: Record<string, unknown>) => void,
  deal: DealInput,
  analysis: AnalysisResult,
  pageW: number,
  margin: number,
  contentW: number,
): Promise<void> {
  let y = 48
  const sc = analysis.scenarios
  const expertNoi = analysis.expert.noi

  // Page title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...TEAL)
  doc.text('Maximum Allowable Offer (MAO) — 3 Scenarios', margin, y)
  y += 18

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  const subtitle = `Built from Expert NOI of ${fmt$(expertNoi)}. Per Michael’s framework, never acquire below 7.5% cap rate. All scenarios use 65% LTV, 6.8% rate, 30-year amortization.`
  doc.text(subtitle, margin, y, { maxWidth: contentW })
  y += 24

  // MAO table
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Metric', sc[0].label, sc[1].label, sc[2].label]],
    body: [
      ['Entry Cap Rate', fmtPct(sc[0].cap_rate, 1), fmtPct(sc[1].cap_rate, 1), fmtPct(sc[2].cap_rate, 1)],
      ['MAO', fmt$(sc[0].mao), fmt$(sc[1].mao), fmt$(sc[2].mao)],
      ['MAO per Unit', fmt$(sc[0].mao_per_unit), fmt$(sc[1].mao_per_unit), fmt$(sc[2].mao_per_unit)],
      ['CapEx Budget', fmt$(sc[0].capex_budget), fmt$(sc[1].capex_budget), fmt$(sc[2].capex_budget)],
      ['All-in Basis', fmt$(sc[0].all_in_basis), fmt$(sc[1].all_in_basis), fmt$(sc[2].all_in_basis)],
      ['Loan Amount (65% LTV)', fmt$(sc[0].loan_amount), fmt$(sc[1].loan_amount), fmt$(sc[2].loan_amount)],
      ['Annual Debt Service', fmt$(sc[0].annual_debt_service), fmt$(sc[1].annual_debt_service), fmt$(sc[2].annual_debt_service)],
      ['DSCR', fmtDscr(sc[0].dscr), fmtDscr(sc[1].dscr), fmtDscr(sc[2].dscr)],
      ['DSCR Min 1.25x', sc[0].dscr_pass ? 'PASS' : 'FAIL', sc[1].dscr_pass ? 'PASS' : 'FAIL', sc[2].dscr_pass ? 'PASS' : 'FAIL'],
      ['Equity Required', fmt$(sc[0].equity_required), fmt$(sc[1].equity_required), fmt$(sc[2].equity_required)],
    ],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 150 },
      2: { fontStyle: 'bold' }, // Sc2 is the main MAO
    },
    didParseCell: (data: Record<string, unknown>) => {
      const d = data as { section: string; row: { index: number }; column: { index: number }; cell: { styles: Record<string, unknown>; raw: unknown } }
      if (d.section === 'body' && d.row.index === 8) {
        // DSCR Min row
        const val = String(d.cell.raw)
        if (val === 'PASS') d.cell.styles.fillColor = [209, 250, 229]
        else if (val === 'FAIL') d.cell.styles.fillColor = [254, 202, 202]
      }
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 24

  // Forced Appreciation sub-section
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text('Forced Appreciation at Sale (24-Month Optimization)', margin, y)
  y += 10

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Metric', 'Sc1', 'Sc2', 'Sc3']],
    body: [
      ['Post-Optimization NOI', fmt$(sc[0].post_opt_noi), fmt$(sc[1].post_opt_noi), fmt$(sc[2].post_opt_noi)],
      ['Exit Cap (1.5% compression)', fmtPct(sc[0].exit_cap_rate, 1), fmtPct(sc[1].exit_cap_rate, 1), fmtPct(sc[2].exit_cap_rate, 1)],
      ['Exit Sale Value', fmt$(sc[0].exit_value), fmt$(sc[1].exit_value), fmt$(sc[2].exit_value)],
      ['Equity Created', fmt$(sc[0].equity_created), fmt$(sc[1].equity_created), fmt$(sc[2].equity_created)],
    ],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [30, 60, 50], textColor: WHITE, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 150 },
      2: { fontStyle: 'bold' },
    },
  })
}

// ─── Page 4: Risk Register ────────────────────────────────────────────────────

async function renderPage4(
  doc: import('jspdf').jsPDF,
  autoTable: (doc: import('jspdf').jsPDF, options: Record<string, unknown>) => void,
  deal: DealInput,
  analysis: AnalysisResult,
  pageW: number,
  margin: number,
  contentW: number,
): Promise<void> {
  let y = 48

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...TEAL)
  doc.text('Risk Register', margin, y)
  y += 18

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text('Each risk is scored Severity (1–5) × Likelihood (1–5). Color reflects total score.', margin, y)
  y += 18

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['#', 'Risk', 'Sev', 'Like', 'Score', 'Level']],
    body: analysis.risk_register.map((r, i) => {
      const lvl = riskLevel(r.score)
      return [String(i + 1), r.risk, String(r.severity), String(r.likelihood), String(r.score), lvl.text]
    }),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    columnStyles: {
      0: { cellWidth: 24, halign: 'center' },
      1: { cellWidth: 160 },
      2: { cellWidth: 30, halign: 'center' },
      3: { cellWidth: 30, halign: 'center' },
      4: { cellWidth: 40, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 60, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (data: Record<string, unknown>) => {
      const d = data as { section: string; column: { index: number }; row: { index: number }; cell: { styles: Record<string, unknown>; raw: unknown } }
      if (d.section === 'body' && d.column.index === 5) {
        const score = analysis.risk_register[d.row.index]?.score || 0
        const lvl = riskLevel(score)
        if (lvl.text === 'RED') {
          d.cell.styles.fillColor = [254, 202, 202]
          d.cell.styles.textColor = [185, 28, 28]
        } else if (lvl.text === 'ORANGE') {
          d.cell.styles.fillColor = [254, 215, 170]
          d.cell.styles.textColor = [154, 52, 18]
        } else if (lvl.text === 'YELLOW') {
          d.cell.styles.fillColor = [254, 240, 138]
          d.cell.styles.textColor = [113, 63, 18]
        } else {
          d.cell.styles.fillColor = [187, 247, 208]
          d.cell.styles.textColor = [20, 83, 45]
        }
      }
    },
  })
}

// ─── Page 5: Verdict & Action Items ──────────────────────────────────────────

async function renderPage5(
  doc: import('jspdf').jsPDF,
  autoTable: (doc: import('jspdf').jsPDF, options: Record<string, unknown>) => void,
  deal: DealInput,
  analysis: AnalysisResult,
  pageW: number,
  margin: number,
  contentW: number,
): Promise<void> {
  let y = 48

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...TEAL)
  doc.text('Verdict & Action Items', margin, y)
  y += 24

  // Verdict banner
  const verdictLabel = analysis.verdict.label
  const verdictBg: [number, number, number] =
    verdictLabel === 'PROCEED' ? [22, 163, 74]
    : verdictLabel === 'NEGOTIATE' ? [217, 119, 6]
    : verdictLabel === 'PASS' ? [234, 88, 12]
    : [220, 38, 38]

  doc.setFillColor(...verdictBg)
  doc.roundedRect(margin, y, contentW, 52, 6, 6, 'F')
  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text(verdictLabel, pageW / 2, y + 28, { align: 'center' })
  y += 64

  // Gap text
  const askingPrice = analysis.asking.price
  const sc2Mao = analysis.scenarios[1].mao
  const gap = analysis.asking.gap_to_sc2_mao
  const gapPct = analysis.asking.gap_to_sc2_mao_pct
  const aboveBelow = gap >= 0 ? 'below' : 'above'
  const overUnder = gap >= 0 ? 'under' : 'over'

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  const gapText = `Asking price of ${fmt$(askingPrice)} is ${fmt$(Math.abs(gap))} ${aboveBelow} the LJM Sc2 MAO of ${fmt$(sc2Mao)} — ${Math.abs(gapPct * 100).toFixed(1)}% ${overUnder} our maximum.`
  doc.text(gapText, margin, y, { maxWidth: contentW })
  y += 30

  // Action Items table — always same 12 standard items
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text('Action Items', margin, y)
  y += 10

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['This Week', 'Within 30 Days', 'Before Closing']],
    body: [
      ['Request full T-12 P&L', 'Order Phase I ESA', 'Lender term sheet'],
      ['Request current rent roll', 'Property Condition Assessment', 'Title commitment review'],
      ['Verify unit count on-site', 'Insurance quote (binding)', 'Survey'],
      ['Site visit', 'Tax assessor consult', 'PPM (if syndicating)'],
    ],
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 24

  // Disclaimer
  doc.setFontSize(7)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...GRAY)
  doc.text(
    'Disclaimer: This report is prepared by LJM Homes LLC for internal underwriting purposes only. It does not constitute financial, legal, or investment advice. All projections are estimates based on provided data and standard LJM underwriting assumptions. Verify all figures with licensed professionals before making investment decisions. © LJM Homes LLC',
    margin,
    y,
    { maxWidth: contentW }
  )
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export async function generateAdvisoryPdf(
  deal: DealInput,
  analysis: AnalysisResult
): Promise<Buffer> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTablePlugin } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 48
  const contentW = pageW - margin * 2

  // Wrap autoTable to match expected signature
  const autoTable = (d: import('jspdf').jsPDF, opts: Record<string, unknown>) => {
    autoTablePlugin(d, opts as Parameters<typeof autoTablePlugin>[1])
  }

  // Page 1
  await renderPage1(doc, autoTable, deal, analysis, pageW, margin, contentW)

  // Page 2
  doc.addPage()
  await renderPage2(doc, autoTable, deal, analysis, pageW, margin, contentW)

  // Page 3
  doc.addPage()
  await renderPage3(doc, autoTable, deal, analysis, pageW, margin, contentW)

  // Page 4
  doc.addPage()
  await renderPage4(doc, autoTable, deal, analysis, pageW, margin, contentW)

  // Page 5
  doc.addPage()
  await renderPage5(doc, autoTable, deal, analysis, pageW, margin, contentW)

  return Buffer.from(doc.output('arraybuffer'))
}
