import type { AnalysisResult, DealInput, MarketData, RentComp } from './types'
import { sanitizeString } from './utils'

// ─── Design System ────────────────────────────────────────────────────────────

const TEAL: [number, number, number] = [4, 120, 87]
const TEAL_LIGHT: [number, number, number] = [209, 250, 229]
const TEAL_DARK: [number, number, number] = [2, 80, 58]
const WHITE: [number, number, number] = [255, 255, 255]
const DARK: [number, number, number] = [20, 20, 20]
const GRAY: [number, number, number] = [100, 100, 100]
const LIGHT_GRAY: [number, number, number] = [245, 245, 245]
const WARM_OFF_WHITE: [number, number, number] = [250, 249, 246]
const RED_BG: [number, number, number] = [254, 202, 202]
const RED_TEXT: [number, number, number] = [185, 28, 28]
const AMBER_BG: [number, number, number] = [254, 243, 199]
const AMBER_TEXT: [number, number, number] = [92, 59, 0]
const GREEN_BG: [number, number, number] = [187, 247, 208]
const GREEN_TEXT: [number, number, number] = [20, 83, 45]

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function safeDiv(a: number, b: number, fallback = 0): number {
  return b === 0 ? fallback : a / b
}

function getY(doc: import('jspdf').jsPDF): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable?.finalY ?? 0
}

function autoTable(
  d: import('jspdf').jsPDF,
  opts: Record<string, unknown>,
  plugin: (d: import('jspdf').jsPDF, o: unknown) => void,
): void {
  plugin(d, opts)
}

// ─── Page Footer ──────────────────────────────────────────────────────────────

function drawFooter(
  doc: import('jspdf').jsPDF,
  pageNum: number,
  pageW: number,
  margin: number,
  pageH: number,
): void {
  const footerY = pageH - 20
  doc.setDrawColor(...TEAL)
  doc.setLineWidth(0.5)
  doc.line(margin, footerY - 6, pageW - margin, footerY - 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...GRAY)
  doc.text(
    `LJM Homes LLC  |  Investment Advisory  |  Confidential — For Internal Use Only  |  Page ${pageNum} of 5`,
    pageW / 2,
    footerY,
    { align: 'center' },
  )
}

// ─── Mini Page Header (pages 2-5) ─────────────────────────────────────────────

function addPageHeader(
  doc: import('jspdf').jsPDF,
  title: string,
  pageW: number,
  margin: number,
): void {
  doc.setFillColor(...TEAL)
  doc.rect(0, 0, pageW, 36, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...WHITE)
  doc.text(title, margin, 23)
}

// ─── Callout Box Helper ────────────────────────────────────────────────────────

function drawCalloutBox(
  doc: import('jspdf').jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  bgColor: [number, number, number],
  borderColor: [number, number, number],
  accentColor: [number, number, number],
  title: string,
  body: string,
): void {
  doc.setFillColor(...bgColor)
  doc.roundedRect(x, y, w, h, 3, 3, 'F')
  doc.setFillColor(...accentColor)
  doc.rect(x, y, 4, h, 'F')
  doc.setDrawColor(...borderColor)
  doc.setLineWidth(0.5)
  doc.roundedRect(x, y, w, h, 3, 3, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...borderColor)
  doc.text(title, x + 12, y + 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...DARK)
  doc.text(body, x + 12, y + 26, { maxWidth: w - 20 })
}

// ─── PAGE 1: PROPERTY OVERVIEW ────────────────────────────────────────────────

function renderPage1(
  doc: import('jspdf').jsPDF,
  at: (d: import('jspdf').jsPDF, o: Record<string, unknown>) => void,
  deal: DealInput,
  analysis: AnalysisResult,
  pageW: number,
  pageH: number,
  margin: number,
  contentW: number,
): void {
  const propName = sanitizeString(deal.property_name || deal.address) || 'Unnamed Property'
  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const addrLine = [deal.address, deal.city, deal.state, deal.zip_code]
    .filter(Boolean)
    .map(sanitizeString)
    .join(', ')

  // ── Header Band ───────────────────────────────────────────────────────────
  doc.setFillColor(...TEAL)
  doc.rect(0, 0, pageW, 90, 'F')
  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text(propName, margin, 35)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('INVESTMENT ADVISORY  |  LJM HOMES LLC  |  MICHAEL RIVERA, ADVISOR', margin, 52)
  doc.setFontSize(8)
  doc.text(`Prepared: ${dateStr}`, margin, 64)
  if (addrLine) doc.text(addrLine, margin, 76)

  // ── Stats Bar ─────────────────────────────────────────────────────────────
  const units = analysis.units || deal.units || 1
  const unitMix = deal.unit_mix || []

  let avgInPlaceRent = 0
  let avgMarketRent = 0
  if (unitMix.length > 0) {
    const totalUnits = unitMix.reduce((s, u) => s + u.unit_count, 0)
    avgInPlaceRent = totalUnits > 0
      ? unitMix.reduce((s, u) => s + u.unit_count * u.actual_rent, 0) / totalUnits
      : 0
    avgMarketRent = totalUnits > 0
      ? unitMix.reduce((s, u) => s + u.unit_count * u.market_rent, 0) / totalUnits
      : avgInPlaceRent * 1.10
  } else {
    avgInPlaceRent = safeDiv(deal.gross_rental_income ?? 0, 12 * units)
    avgMarketRent = avgInPlaceRent * 1.10
  }
  const rentUpside = avgMarketRent - avgInPlaceRent

  const occupancyPct = deal.occupancy_pct ?? deal.occupied_pct ?? 0
  const statsLabels = [
    'UNITS',
    'OCCUPIED',
    'IN-PLACE AVG RENT',
    'RENT UPSIDE/UNIT',
    'YEAR BUILT',
    'ASKING PRICE',
  ]
  const statsValues = [
    String(units),
    occupancyPct > 0 ? fmtPct(occupancyPct) : '—',
    avgInPlaceRent > 0 ? fmt$(avgInPlaceRent) : '—',
    rentUpside > 0 ? fmt$(rentUpside) : '—',
    String(deal.year_built || '—'),
    deal.asking_price ? fmt$(deal.asking_price) : '—',
  ]

  const colW = contentW / 6
  const statY = 95
  doc.setFillColor(...TEAL_LIGHT)
  doc.rect(margin, statY, contentW, 38, 'F')
  doc.setDrawColor(180, 220, 200)
  doc.setLineWidth(0.5)
  doc.rect(margin, statY, contentW, 38, 'S')

  for (let i = 0; i < 6; i++) {
    const cx = margin + i * colW + colW / 2
    // Divider
    if (i > 0) {
      doc.setDrawColor(160, 210, 190)
      doc.line(margin + i * colW, statY + 4, margin + i * colW, statY + 34)
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...GRAY)
    doc.text(statsLabels[i], cx, statY + 13, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...DARK)
    doc.text(statsValues[i], cx, statY + 28, { align: 'center' })
  }

  // ── Unit Mix Table ────────────────────────────────────────────────────────
  let y = 140
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...TEAL)
  doc.text('UNIT MIX ANALYSIS', margin, y)
  y += 6

  if (unitMix.length > 0) {
    const totalUnitsAll = unitMix.reduce((s, u) => s + u.unit_count, 0)
    const totalMonthlyGap = unitMix.reduce(
      (s, u) => s + (u.market_rent - u.actual_rent) * u.unit_count,
      0,
    )
    const totalAnnualGap = totalMonthlyGap * 12
    const wtAvgSf = unitMix.reduce((s, u) => s + u.unit_count * (u.avg_sf || 0), 0) / (totalUnitsAll || 1)
    const wtAvgMkt = unitMix.reduce((s, u) => s + u.unit_count * u.market_rent, 0) / (totalUnitsAll || 1)
    const wtAvgActual = unitMix.reduce((s, u) => s + u.unit_count * u.actual_rent, 0) / (totalUnitsAll || 1)
    const avgMonthlyGap = wtAvgMkt - wtAvgActual

    const unitBody = unitMix.map(u => {
      const gap = u.market_rent - u.actual_rent
      const annGap = gap * u.unit_count * 12
      return [
        `${u.bed_count}BR/${u.bath_count}BA`,
        String(u.unit_count),
        u.avg_sf ? u.avg_sf.toLocaleString() : '—',
        fmt$(u.market_rent),
        fmt$(u.actual_rent),
        fmt$(gap),
        fmt$(annGap),
      ]
    })
    unitBody.push([
      'TOTAL / WEIGHTED AVG',
      String(totalUnitsAll),
      wtAvgSf > 0 ? Math.round(wtAvgSf).toLocaleString() : '—',
      fmt$(wtAvgMkt),
      fmt$(wtAvgActual),
      fmt$(avgMonthlyGap),
      fmt$(totalAnnualGap),
    ])

    at(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Type', '# Units', 'Avg SF', 'Market Rent', 'In-Place Rent', 'Mo. Gap', 'Annual Gap']],
      body: unitBody,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: LIGHT_GRAY },
      columnStyles: {
        0: { fontStyle: 'bold' },
        5: { textColor: RED_TEXT },
      },
      didParseCell: (data: Record<string, unknown>) => {
        const d = data as {
          section: string
          row: { index: number }
          column: { index: number }
          cell: { styles: Record<string, unknown>; raw: unknown }
        }
        const isTotal = d.row.index === unitBody.length - 1
        if (isTotal && d.section === 'body') {
          d.cell.styles.fontStyle = 'bold'
          d.cell.styles.fillColor = TEAL_LIGHT
        }
      },
    })
    y = getY(doc) + 12
  } else {
    // No unit mix — skip table, just advance y
    y += 10
  }

  // ── Key Highlights (two columns) ──────────────────────────────────────────
  const halfW = (contentW - 12) / 2
  const leftX = margin
  const rightX = margin + halfW + 12

  const sc2 = analysis.scenarios[1]
  const asking = deal.asking_price ?? 0
  const askPerUnit = safeDiv(asking, units)

  const strengths: string[] = []
  if (askPerUnit > 0 && askPerUnit < 75_000) {
    strengths.push(`Below-market entry at ${fmt$(askPerUnit)}/door`)
  }
  if (sc2.dscr >= 1.25) {
    strengths.push(`DSCR clears 1.25x threshold at ${sc2.dscr.toFixed(2)}x`)
  }
  if (rentUpside > 100) {
    strengths.push(`${fmt$(rentUpside)}/unit/mo rent upside to market`)
  }
  if (deal.year_built && deal.year_built > 1980) {
    strengths.push(`Newer vintage (${deal.year_built}) — lower deferred maintenance risk`)
  }
  strengths.push('Value-add opportunity in growing submarket')

  const watchItems: string[] = []
  if (asking > 0 && asking > sc2.mao) {
    watchItems.push(
      `Asking price ${fmt$(asking)} exceeds Sc2 MAO ${fmt$(sc2.mao)} by ${fmt$(asking - sc2.mao)}`,
    )
  }
  if (analysis.expert.expense_ratio > 0.50) {
    watchItems.push(`High expense ratio at ${fmtPct(analysis.expert.expense_ratio)} — verify T-12 line items`)
  }
  watchItems.push('Verify utility billing structure (RUBS vs. direct metering)')
  if (occupancyPct > 0 && occupancyPct < 0.90) {
    watchItems.push(`Occupancy at ${fmtPct(occupancyPct)} — identify vacant unit causes`)
  }

  const hlStartY = y
  const hlH = Math.max(strengths.length, watchItems.length) * 14 + 28

  // Left highlight box
  doc.setFillColor(...WARM_OFF_WHITE)
  doc.rect(leftX, hlStartY, halfW, hlH, 'F')
  doc.setDrawColor(...TEAL)
  doc.setLineWidth(1)
  doc.line(leftX, hlStartY, leftX, hlStartY + hlH)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...TEAL)
  doc.text('KEY HIGHLIGHTS', leftX + 8, hlStartY + 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...DARK)
  strengths.forEach((s, i) => {
    doc.text(`[+] ${s}`, leftX + 8, hlStartY + 26 + i * 13, { maxWidth: halfW - 16 })
  })

  // Right highlight box
  doc.setFillColor(...WARM_OFF_WHITE)
  doc.rect(rightX, hlStartY, halfW, hlH, 'F')
  doc.setDrawColor(234, 88, 12)
  doc.setLineWidth(1)
  doc.line(rightX, hlStartY, rightX, hlStartY + hlH)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(234, 88, 12)
  doc.text('WATCH ITEMS', rightX + 8, hlStartY + 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...DARK)
  watchItems.forEach((w, i) => {
    doc.text(`[!] ${w}`, rightX + 8, hlStartY + 26 + i * 13, { maxWidth: halfW - 16 })
  })

  y = hlStartY + hlH + 10

  // ── Property Details & Broker Info (two-column tables) ────────────────────
  const avgSf = units > 0 && (deal.total_sf ?? 0) > 0
    ? Math.round((deal.total_sf ?? 0) / units)
    : 0

  at(doc, {
    startY: y,
    margin: { left: leftX, right: rightX + halfW - margin },
    tableWidth: halfW,
    head: [['PROPERTY DETAILS', '']],
    body: [
      ['Year Built', String(deal.year_built || '—')],
      ['Total Units', String(units)],
      ['Total SF', deal.total_sf ? deal.total_sf.toLocaleString() + ' sf' : '—'],
      ['Avg Unit SF', avgSf > 0 ? avgSf.toLocaleString() + ' sf' : '—'],
      ['Sale Type', sanitizeString(deal.sale_type) || '—'],
      ['Submarket', sanitizeString(deal.submarket) || '—'],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: TEAL_DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 } },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
  })
  const leftTableEndY = getY(doc)

  const gapToMao = analysis.asking.gap_to_sc2_mao

  at(doc, {
    startY: y,
    margin: { left: rightX, right: margin },
    tableWidth: halfW,
    head: [['BROKER / LISTING INFO', '']],
    body: [
      ['Asking Price', fmt$(asking)],
      ['Broker Cap Rate', deal.broker_cap_rate ? fmtPct(deal.broker_cap_rate, 2) : '—'],
      ['Price / Unit', asking > 0 ? fmt$(safeDiv(asking, units)) : '—'],
      ['LJM Expert NOI', fmt$(analysis.expert.noi)],
      ['LJM Sc2 MAO', fmt$(sc2.mao)],
      ['Gap to MAO', (gapToMao >= 0 ? '+' : '') + fmt$(gapToMao)],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: TEAL_DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 } },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    didParseCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string
        row: { index: number }
        cell: { styles: Record<string, unknown> }
      }
      if (d.section === 'body' && d.row.index === 5) {
        d.cell.styles.textColor = gapToMao >= 0 ? GREEN_TEXT : RED_TEXT
        d.cell.styles.fontStyle = 'bold'
      }
    },
  })
  const rightTableEndY = getY(doc)

  y = Math.max(leftTableEndY, rightTableEndY) + 10

  // ── Value-Add Callout Box ─────────────────────────────────────────────────
  const remainingH = pageH - y - 40
  const boxH = Math.min(remainingH - 4, 52)
  if (boxH > 24) {
    const totalCapex = analysis.expert.total_capex
    const capexPerDoor = safeDiv(totalCapex, units)
    const calloutBody =
      `Opportunity to close ${fmt$(rentUpside)}/unit/month rent gap through strategic capital investment ` +
      `of ${fmt$(totalCapex)} (${fmt$(capexPerDoor)}/door). Expert NOI of ${fmt$(analysis.expert.noi)} ` +
      `supports ${fmtPct(sc2.cap_rate)} going-in cap at Sc2 MAO.`
    drawCalloutBox(
      doc,
      margin, y, contentW, boxH,
      GREEN_BG, GREEN_TEXT, TEAL,
      'VALUE-ADD POTENTIAL',
      calloutBody,
    )
  }

  drawFooter(doc, 1, pageW, margin, pageH)
}

// ─── PAGE 2: FINANCIAL ANALYSIS ───────────────────────────────────────────────

function renderPage2(
  doc: import('jspdf').jsPDF,
  at: (d: import('jspdf').jsPDF, o: Record<string, unknown>) => void,
  deal: DealInput,
  analysis: AnalysisResult,
  pageW: number,
  pageH: number,
  margin: number,
  contentW: number,
): void {
  addPageHeader(doc, 'FINANCIAL ANALYSIS — INCOME & EXPENSE REVIEW', pageW, margin)

  const t12 = analysis.t12
  const pf = analysis.pf
  const ex = analysis.expert
  const units = analysis.units || 1

  const leftW = contentW * 0.44
  const rightW = contentW * 0.52
  const gap = contentW - leftW - rightW
  const leftX = margin
  const rightX = margin + leftW + gap

  let leftY = 44
  let rightY = 44

  // ── Left: T-12 Income Statement ──────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TEAL)
  doc.text('T-12 INCOME STATEMENT', leftX, leftY)
  leftY += 6

  at(doc, {
    startY: leftY,
    margin: { left: leftX, right: rightX + rightW - margin },
    tableWidth: leftW,
    head: [['Line Item', 'Annual', '$/Unit/Mo']],
    body: [
      [
        'Gross Potential Rent',
        fmt$(t12.gross_rental_income),
        fmt$(safeDiv(t12.gross_rental_income, 12 * units)),
      ],
      [
        'RUBS / Utility Reimb.',
        fmt$(t12.utility_reimbursement),
        fmt$(safeDiv(t12.utility_reimbursement, 12 * units)),
      ],
      [
        'Other Income',
        fmt$(t12.other_income),
        fmt$(safeDiv(t12.other_income, 12 * units)),
      ],
      [
        'Effective Gross Income',
        fmt$(t12.egi),
        fmt$(safeDiv(t12.egi, 12 * units)),
      ],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 0: { cellWidth: 110 } },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    didParseCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string
        row: { index: number }
        cell: { styles: Record<string, unknown> }
      }
      if (d.section === 'body' && d.row.index === 3) {
        d.cell.styles.fontStyle = 'bold'
        d.cell.styles.fillColor = TEAL_LIGHT
      }
    },
  })
  const leftIncomeEndY = getY(doc)

  // ── Right: T-12 Expense Statement ────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TEAL)
  doc.text('T-12 EXPENSE STATEMENT', rightX, rightY)
  rightY += 6

  const rm = deal.repairs_maintenance ?? 0
  const payroll = deal.payroll ?? 0
  const reserves = deal.reserves ?? 0
  const admin = deal.admin_fees ?? 0
  const propTax = deal.property_taxes ?? 0
  const insurance = deal.insurance ?? 0
  const utilities = deal.utilities ?? 0
  const mgmtFee = deal.management_fee ?? 0

  at(doc, {
    startY: rightY,
    margin: { left: rightX, right: margin },
    tableWidth: rightW,
    head: [['Line Item', 'Annual', '$/Unit']],
    body: [
      ['Property Taxes', fmt$(propTax), fmt$(safeDiv(propTax, units))],
      ['Insurance', fmt$(insurance), fmt$(safeDiv(insurance, units))],
      ['Utilities', fmt$(utilities), fmt$(safeDiv(utilities, units))],
      ['Repairs & Maintenance', fmt$(rm), fmt$(safeDiv(rm, units))],
      ['Management Fee', fmt$(mgmtFee), fmt$(safeDiv(mgmtFee, units))],
      ['Payroll', fmt$(payroll), fmt$(safeDiv(payroll, units))],
      ['Reserves', fmt$(reserves), fmt$(safeDiv(reserves, units))],
      ['G&A / Admin', fmt$(admin), fmt$(safeDiv(admin, units))],
      ['Total Expenses', fmt$(t12.opex), fmt$(safeDiv(t12.opex, units))],
      ['NOI', fmt$(t12.noi), fmt$(safeDiv(t12.noi, units))],
      ['Expense Ratio', '', fmtPct(t12.expense_ratio)],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 0: { cellWidth: 120 } },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    didParseCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string
        row: { index: number }
        cell: { styles: Record<string, unknown> }
      }
      if (d.section === 'body' && (d.row.index === 8 || d.row.index === 9 || d.row.index === 10)) {
        d.cell.styles.fontStyle = 'bold'
        d.cell.styles.fillColor = TEAL_LIGHT
      }
    },
  })
  const rightExpenseEndY = getY(doc)

  let y = Math.max(leftIncomeEndY, rightExpenseEndY) + 14

  // ── Pro Forma Comparison Table ────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text('PRO FORMA COMPARISON', margin, y)
  y += 8

  const gpi = ex.gpi
  const egi = ex.egi
  const vacancyDollar = gpi - egi
  const vacancyPct = gpi > 0 ? safeDiv(vacancyDollar, gpi) : 0
  const asking = deal.asking_price ?? 1

  at(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Metric', 'T-12 Actuals', 'LJM Expert UW', 'Broker Pro Forma']],
    body: [
      [
        'Gross Rental Income',
        fmt$(t12.gross_rental_income),
        fmt$(gpi),
        fmt$(pf.gross_rental_income),
      ],
      [
        'Vacancy & Credit Loss',
        '(baked in)',
        `${fmt$(vacancyDollar)} (${fmtPct(vacancyPct)})`,
        fmt$(Math.abs(pf.vacancy_bad_debt)),
      ],
      [
        'Effective Gross Income',
        fmt$(t12.egi),
        fmt$(egi),
        fmt$(pf.egi),
      ],
      [
        'Total Operating Expenses',
        fmt$(t12.opex),
        fmt$(ex.total_opex),
        fmt$(pf.opex),
      ],
      [
        'Net Operating Income',
        fmt$(t12.noi),
        fmt$(ex.noi),
        fmt$(pf.noi),
      ],
      [
        'Expense Ratio',
        fmtPct(t12.expense_ratio),
        fmtPct(ex.expense_ratio),
        pf.egi > 0 ? fmtPct(safeDiv(pf.opex, pf.egi)) : '—',
      ],
      [
        'Cap Rate (at Asking)',
        asking > 1 && t12.noi > 0 ? fmtPct(safeDiv(t12.noi, asking)) : '—',
        asking > 1 ? fmtPct(safeDiv(ex.noi, asking)) : '—',
        asking > 1 && pf.noi > 0 ? fmtPct(safeDiv(pf.noi, asking)) : '—',
      ],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 140 },
      2: { fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    didParseCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string
        column: { index: number }
        row: { index: number }
        cell: { styles: Record<string, unknown> }
      }
      if (d.section === 'body' && d.column.index === 2) {
        d.cell.styles.fillColor = TEAL_LIGHT
        d.cell.styles.fontStyle = 'bold'
      }
    },
  })

  y = getY(doc) + 12

  // ── Finding Callout ───────────────────────────────────────────────────────
  const diff = ex.noi - t12.noi
  const isWarning = ex.noi < t12.noi * 0.90
  const remainingH = pageH - y - 40
  const calloutH = Math.min(remainingH - 4, 56)

  if (calloutH > 24) {
    if (isWarning) {
      const body =
        `Expert NOI of ${fmt$(ex.noi)} is ${fmt$(t12.noi - ex.noi)} below T-12 reported NOI of ${fmt$(t12.noi)}. ` +
        `LJM applies conservative vacancy (10%), bad debt (2%), and market-rate management. ` +
        `Broker figures may understate operating costs.`
      drawCalloutBox(
        doc,
        margin, y, contentW, calloutH,
        AMBER_BG, AMBER_TEXT, [217, 119, 6],
        'UNDERWRITING VARIANCE',
        body,
      )
    } else {
      const dir = diff >= 0 ? 'additional' : 'conservative'
      const body =
        `Expert underwriting validates the T-12 income with ${dir} adjustments. ` +
        `LJM vacancy and expense assumptions represent institutional-grade underwriting standards.`
      drawCalloutBox(
        doc,
        margin, y, contentW, calloutH,
        GREEN_BG, GREEN_TEXT, TEAL,
        'KEY FINDING',
        body,
      )
    }
  }

  drawFooter(doc, 2, pageW, margin, pageH)
}

// ─── PAGE 3: MAO ANALYSIS ────────────────────────────────────────────────────

function renderPage3(
  doc: import('jspdf').jsPDF,
  at: (d: import('jspdf').jsPDF, o: Record<string, unknown>) => void,
  deal: DealInput,
  analysis: AnalysisResult,
  pageW: number,
  pageH: number,
  margin: number,
  contentW: number,
): void {
  addPageHeader(doc, 'MAO ANALYSIS — MAXIMUM ALLOWABLE OFFER', pageW, margin)

  let y = 44
  const sc = analysis.scenarios   // [0]=8.5% Sc1, [1]=8.0% Sc2, [2]=7.5% Sc3
  const ex = analysis.expert
  const units = analysis.units || 1
  const asking = deal.asking_price ?? 0

  // ── MAO Scenarios Table ───────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text('GOING-IN OFFER SCENARIOS', margin, y)
  y += 8

  // Map: sc[2]=Conservative 7.5%, sc[1]=Moderate 8.0%, sc[0]=Aggressive 8.5%
  const conservative = sc[2]
  const moderate = sc[1]
  const aggressive = sc[0]

  const dscrCell = (sc: typeof conservative) => ({
    val: `${sc.dscr.toFixed(2)}x`,
    pass: sc.dscr_pass,
  })

  const gapRow = (scenario: typeof conservative) => {
    const gap = asking - scenario.mao
    return asking > 0
      ? `${gap > 0 ? '-' : '+'}${fmt$(Math.abs(gap))}`
      : '—'
  }
  const gapPctRow = (scenario: typeof conservative) => {
    if (asking <= 0) return '—'
    const pct = safeDiv(asking - scenario.mao, scenario.mao)
    return `${pct > 0 ? '-' : '+'}${fmtPct(Math.abs(pct))}`
  }

  at(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      ['Metric', 'Conservative\n7.5% Cap', 'Moderate\n8.0% Cap', 'Aggressive\n8.5% Cap'],
    ],
    body: [
      ['Expert NOI', fmt$(ex.noi), fmt$(ex.noi), fmt$(ex.noi)],
      ['Going-In Cap Rate', '7.50%', '8.00%', '8.50%'],
      [
        'MAX ALLOWABLE OFFER',
        fmt$(conservative.mao),
        fmt$(moderate.mao),
        fmt$(aggressive.mao),
      ],
      [
        'MAO per Unit',
        fmt$(safeDiv(conservative.mao, units)),
        fmt$(safeDiv(moderate.mao, units)),
        fmt$(safeDiv(aggressive.mao, units)),
      ],
      [
        'Less: CapEx Budget',
        `(${fmt$(conservative.capex_budget)})`,
        `(${fmt$(moderate.capex_budget)})`,
        `(${fmt$(aggressive.capex_budget)})`,
      ],
      [
        'All-In Basis',
        fmt$(conservative.all_in_basis),
        fmt$(moderate.all_in_basis),
        fmt$(aggressive.all_in_basis),
      ],
      [
        'Loan Amount (70% LTC)',
        fmt$(conservative.loan_amount),
        fmt$(moderate.loan_amount),
        fmt$(aggressive.loan_amount),
      ],
      [
        'Annual Debt Service',
        fmt$(conservative.annual_debt_service),
        fmt$(moderate.annual_debt_service),
        fmt$(aggressive.annual_debt_service),
      ],
      [
        'DSCR',
        dscrCell(conservative).val,
        dscrCell(moderate).val,
        dscrCell(aggressive).val,
      ],
      [
        'DSCR (Pass ≥ 1.25x)',
        conservative.dscr_pass ? 'PASS' : 'FAIL',
        moderate.dscr_pass ? 'PASS' : 'FAIL',
        aggressive.dscr_pass ? 'PASS' : 'FAIL',
      ],
      [
        'Equity Required',
        fmt$(conservative.equity_required),
        fmt$(moderate.equity_required),
        fmt$(aggressive.equity_required),
      ],
      ['Asking Price', asking > 0 ? fmt$(asking) : '—', asking > 0 ? fmt$(asking) : '—', asking > 0 ? fmt$(asking) : '—'],
      ['Gap to MAO', gapRow(conservative), gapRow(moderate), gapRow(aggressive)],
      ['Gap %', gapPctRow(conservative), gapPctRow(moderate), gapPctRow(aggressive)],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 140 },
      2: { fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    didParseCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string
        row: { index: number }
        column: { index: number }
        cell: { styles: Record<string, unknown>; raw: unknown }
      }
      if (d.section === 'body') {
        // Highlight moderate column
        if (d.column.index === 2) {
          d.cell.styles.fillColor = TEAL_LIGHT
        }
        // MAO row bold
        if (d.row.index === 2) {
          d.cell.styles.fontStyle = 'bold'
        }
        // DSCR pass/fail colors
        if (d.row.index === 9) {
          const val = String(d.cell.raw)
          if (val === 'PASS') {
            d.cell.styles.fillColor = GREEN_BG
            d.cell.styles.textColor = GREEN_TEXT
          } else if (val === 'FAIL') {
            d.cell.styles.fillColor = RED_BG
            d.cell.styles.textColor = RED_TEXT
          }
        }
        // Gap rows coloring
        if (d.row.index === 12 || d.row.index === 13) {
          const raw = String(d.cell.raw)
          if (raw.startsWith('-')) {
            d.cell.styles.textColor = RED_TEXT
          } else if (raw.startsWith('+')) {
            d.cell.styles.textColor = GREEN_TEXT
          }
        }
      }
    },
  })

  y = getY(doc) + 14

  // ── CapEx Budget Table ────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text('CAPEX BUDGET BREAKDOWN', margin, y)
  y += 8

  const totalCapex = ex.total_capex
  const capexPerUnit = deal.capex_per_unit ?? 10_000

  // Distribute capex across line items proportionally
  const heavy20 = Math.round(units * 0.2)
  let interior: number, mechanical: number, exterior: number, common: number

  if (capexPerUnit >= 12_000) {
    interior = Math.round(totalCapex * 0.40)
    mechanical = Math.round(totalCapex * 0.27)
    exterior = Math.round(totalCapex * 0.20)
    common = totalCapex - interior - mechanical - exterior
  } else {
    interior = Math.round(totalCapex * 0.50)
    mechanical = Math.round(totalCapex * 0.20)
    exterior = Math.round(totalCapex * 0.18)
    common = totalCapex - interior - mechanical - exterior
  }

  const interiorPerUnit = Math.round(safeDiv(interior, units))
  const mechPerUnit = Math.round(safeDiv(mechanical, units))
  const extPerUnit = Math.round(safeDiv(exterior, units))
  const commonPerUnit = Math.round(safeDiv(common, units))

  const pctOf = (n: number) => `${((n / totalCapex) * 100).toFixed(0)}%`

  at(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Line Item', '$/Unit', '# Units', 'Total Budget', '% Budget']],
    body: [
      ['Interior Renovation', fmt$(interiorPerUnit), String(units), fmt$(interior), pctOf(interior)],
      [`Heavy-Lift Units (${heavy20} units, 20%)`, fmt$(mechPerUnit), String(heavy20), fmt$(mechanical), pctOf(mechanical)],
      ['Exterior / Curb Appeal', fmt$(extPerUnit), String(units), fmt$(exterior), pctOf(exterior)],
      ['Common Areas & Amenities', fmt$(commonPerUnit), String(units), fmt$(common), pctOf(common)],
      ['TOTAL CAPEX BUDGET', fmt$(capexPerUnit), String(units), fmt$(totalCapex), '100%'],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: TEAL_DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    didParseCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string
        row: { index: number }
        cell: { styles: Record<string, unknown> }
      }
      if (d.section === 'body' && d.row.index === 4) {
        d.cell.styles.fontStyle = 'bold'
        d.cell.styles.fillColor = TEAL_LIGHT
      }
    },
  })

  y = getY(doc) + 14

  // ── Forced Appreciation Table ──────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text('FORCED APPRECIATION AT EXIT (3-YEAR HORIZON)', margin, y)
  y += 8

  at(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Metric', 'Conservative (7.5%)', 'Moderate (8.0%)', 'Aggressive (8.5%)']],
    body: [
      [
        'Purchase Price (MAO)',
        fmt$(conservative.mao),
        fmt$(moderate.mao),
        fmt$(aggressive.mao),
      ],
      [
        'CapEx Investment',
        fmt$(conservative.capex_budget),
        fmt$(moderate.capex_budget),
        fmt$(aggressive.capex_budget),
      ],
      [
        'All-In Basis',
        fmt$(conservative.all_in_basis),
        fmt$(moderate.all_in_basis),
        fmt$(aggressive.all_in_basis),
      ],
      [
        'Optimized NOI (+30%)',
        fmt$(conservative.post_opt_noi),
        fmt$(moderate.post_opt_noi),
        fmt$(aggressive.post_opt_noi),
      ],
      [
        'Exit Cap (Entry − 1.5%)',
        fmtPct(conservative.exit_cap_rate),
        fmtPct(moderate.exit_cap_rate),
        fmtPct(aggressive.exit_cap_rate),
      ],
      [
        'Exit Value',
        fmt$(conservative.exit_value),
        fmt$(moderate.exit_value),
        fmt$(aggressive.exit_value),
      ],
      [
        'Equity Created',
        fmt$(conservative.equity_created),
        fmt$(moderate.equity_created),
        fmt$(aggressive.equity_created),
      ],
      [
        'Equity Multiple',
        `${conservative.equity_multiple.toFixed(2)}x`,
        `${moderate.equity_multiple.toFixed(2)}x`,
        `${aggressive.equity_multiple.toFixed(2)}x`,
      ],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 140 },
      2: { fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    didParseCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string
        row: { index: number }
        column: { index: number }
        cell: { styles: Record<string, unknown> }
      }
      if (d.section === 'body' && d.column.index === 2) {
        d.cell.styles.fillColor = TEAL_LIGHT
      }
      if (d.section === 'body' && (d.row.index === 5 || d.row.index === 6 || d.row.index === 7)) {
        d.cell.styles.fontStyle = 'bold'
      }
    },
  })

  y = getY(doc) + 12

  // ── Plain English Callout ─────────────────────────────────────────────────
  const remainingH = pageH - y - 40
  const calloutH = Math.min(remainingH - 4, 54)
  if (calloutH > 24) {
    const body =
      `At the Moderate scenario (8.0% cap), LJM's maximum offer is ${fmt$(moderate.mao)} (${fmt$(safeDiv(moderate.mao, units))}/door). ` +
      `After investing ${fmt$(moderate.capex_budget)} in capital improvements, the property exits at ` +
      `${fmt$(moderate.exit_value)} in 3 years — creating ${fmt$(moderate.equity_created)} in equity.`
    drawCalloutBox(
      doc,
      margin, y, contentW, calloutH,
      TEAL_LIGHT, TEAL, TEAL_DARK,
      'PLAIN ENGLISH',
      body,
    )
  }

  drawFooter(doc, 3, pageW, margin, pageH)
}

// ─── PAGE 4: MARKET ANALYSIS & RISK ──────────────────────────────────────────

function renderPage4(
  doc: import('jspdf').jsPDF,
  at: (d: import('jspdf').jsPDF, o: Record<string, unknown>) => void,
  deal: DealInput,
  analysis: AnalysisResult,
  marketData: MarketData | undefined,
  pageW: number,
  pageH: number,
  margin: number,
  contentW: number,
): void {
  addPageHeader(doc, 'MARKET ANALYSIS & RISK ASSESSMENT', pageW, margin)

  const leftW = contentW * 0.48
  const rightW = contentW * 0.48
  const gapW = contentW - leftW - rightW
  const leftX = margin
  const rightX = margin + leftW + gapW
  const units = analysis.units || 1
  const sc2 = analysis.scenarios[1]

  let leftY = 44
  let rightY = 44

  // ── LEFT: DFW Cap Rate Reference ─────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TEAL)
  doc.text('MARKET CAP RATE REFERENCE', leftX, leftY)
  leftY += 6

  const defaultCapRates = [
    { segment: 'Class A Urban', cap_rate_min: 0.0425, cap_rate_max: 0.0525, notes: 'Core/Gateway markets' },
    { segment: 'Class B Urban', cap_rate_min: 0.050, cap_rate_max: 0.060, notes: 'Strong suburban cores' },
    { segment: 'Class B Suburban', cap_rate_min: 0.055, cap_rate_max: 0.065, notes: 'Growth suburbs' },
    { segment: 'Class C Urban', cap_rate_min: 0.060, cap_rate_max: 0.070, notes: 'Value-add urban' },
    { segment: 'Class C Suburban', cap_rate_min: 0.065, cap_rate_max: 0.075, notes: 'Value-add suburban' },
    { segment: 'Value-Add / Distressed', cap_rate_min: 0.070, cap_rate_max: 0.085, notes: 'Repositioning' },
    { segment: 'Tertiary Markets', cap_rate_min: 0.075, cap_rate_max: 0.095, notes: 'Rural/small market' },
  ]
  const capRateSegments = marketData?.cap_rate_segments?.length
    ? marketData.cap_rate_segments
    : defaultCapRates

  const capRateBody = capRateSegments.map((seg, idx) => {
    const isSuburbanC = idx === 4 // highlight Class C Suburban
    return [
      seg.segment,
      `${fmtPct(seg.cap_rate_min, 2)}–${fmtPct(seg.cap_rate_max, 2)}`,
      seg.notes || '',
      isSuburbanC,
    ]
  })

  // Add subject property row
  capRateBody.push([
    'THIS PROPERTY (LJM Sc2)',
    fmtPct(sc2.cap_rate, 2),
    'LJM Expert Underwriting',
    false,
  ])

  at(doc, {
    startY: leftY,
    margin: { left: leftX, right: rightX + rightW - margin },
    tableWidth: leftW,
    head: [['Asset Class', 'Cap Rate Range', 'Notes']],
    body: capRateBody.map(r => [r[0], r[1], r[2]]),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    columnStyles: {
      0: { cellWidth: 90, fontStyle: 'bold' },
      1: { cellWidth: 60 },
    },
    didParseCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string
        row: { index: number }
        cell: { styles: Record<string, unknown> }
      }
      if (d.section === 'body') {
        // Class C Suburban row
        if (d.row.index === 4) {
          d.cell.styles.fillColor = TEAL_LIGHT
        }
        // Subject property row
        if (d.row.index === capRateBody.length - 1) {
          d.cell.styles.fillColor = TEAL
          d.cell.styles.textColor = WHITE
          d.cell.styles.fontStyle = 'bold'
        }
      }
    },
  })
  leftY = getY(doc) + 10

  // ── LEFT: Market Demand Drivers ───────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TEAL)
  doc.text('MARKET DEMAND DRIVERS', leftX, leftY)
  leftY += 6

  const defaultDrivers = [
    'Strong DFW metro employment growth',
    'Healthcare / manufacturing job corridor',
    'Population migration to North Texas suburbs',
    'Limited new multifamily supply in this submarket',
    'Collin County growth hub — new employers relocating',
    'Favorable landlord-tenant laws (Texas)',
  ]
  const drivers = marketData?.demand_drivers?.length ? marketData.demand_drivers : defaultDrivers

  at(doc, {
    startY: leftY,
    margin: { left: leftX, right: rightX + rightW - margin },
    tableWidth: leftW,
    head: [['Market Demand Drivers']],
    body: drivers.map(d => [`• ${d}`]),
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: TEAL_DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
  })
  leftY = getY(doc)

  // ── RIGHT: Rent Comparable Analysis ──────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TEAL)
  doc.text('RENT COMPARABLE ANALYSIS', rightX, rightY)
  rightY += 6

  const city = sanitizeString(deal.city) || 'Local'
  const defaultComps: RentComp[] = [
    { name: `${city} Garden Apts`, units: 48, occupancy_pct: 0.94, avg_rent: avgInPlaceRentCalc(deal, analysis) * 1.08, avg_sf: 720, notes: '0.5 mi' },
    { name: `${city} Oaks`, units: 36, occupancy_pct: 0.97, avg_rent: avgInPlaceRentCalc(deal, analysis) * 1.12, avg_sf: 780, notes: '1.2 mi' },
    { name: `${city} Pines`, units: 60, occupancy_pct: 0.91, avg_rent: avgInPlaceRentCalc(deal, analysis) * 1.05, avg_sf: 695, notes: '0.9 mi' },
    { name: 'Meadowbrook Apts', units: 24, occupancy_pct: 0.92, avg_rent: avgInPlaceRentCalc(deal, analysis) * 1.15, avg_sf: 810, notes: '1.8 mi' },
  ]
  const comps = marketData?.rent_comps?.length ? marketData.rent_comps : defaultComps

  const compBody = comps.map(c => [
    sanitizeString(c.name),
    c.units ? String(c.units) : '—',
    c.occupancy_pct ? fmtPct(c.occupancy_pct) : '—',
    fmt$(c.avg_rent),
    c.avg_sf ? `${c.avg_sf}` : '—',
    sanitizeString(c.notes) || '',
  ])

  // Subject row
  const avgInPlace = avgInPlaceRentCalc(deal, analysis)
  const avgMkt = avgMarketRentCalc(deal, analysis)
  compBody.push([
    'SUBJECT PROPERTY',
    String(units),
    deal.occupancy_pct ? fmtPct(deal.occupancy_pct) : '—',
    `${fmt$(avgInPlace)} / ${fmt$(avgMkt)} mkt`,
    deal.total_sf && units ? String(Math.round(safeDiv(deal.total_sf, units))) : '—',
    'In-place / Market',
  ])

  at(doc, {
    startY: rightY,
    margin: { left: rightX, right: margin },
    tableWidth: rightW,
    head: [['Property', 'Units', 'Occ%', 'Avg Rent', 'SF', 'Notes']],
    body: compBody,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 26, halign: 'center' },
      2: { cellWidth: 28, halign: 'center' },
      3: { cellWidth: 50 },
      4: { cellWidth: 22, halign: 'center' },
    },
    didParseCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string
        row: { index: number }
        cell: { styles: Record<string, unknown> }
      }
      if (d.section === 'body' && d.row.index === compBody.length - 1) {
        d.cell.styles.fillColor = TEAL
        d.cell.styles.textColor = WHITE
        d.cell.styles.fontStyle = 'bold'
      }
    },
  })
  rightY = getY(doc) + 10

  // ── RIGHT: Risk Assessment Boxes ─────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TEAL)
  doc.text('RISK ASSESSMENT SUMMARY', rightX, rightY)
  rightY += 8

  const riskReg = analysis.risk_register

  const highRisks = riskReg.filter(r => r.score >= 12).map(r => r.risk)
  const medRisks = riskReg.filter(r => r.score >= 8 && r.score < 12).map(r => r.risk)
  const lowRisks = riskReg.filter(r => r.score < 8).map(r => r.risk)

  if (highRisks.length === 0) highRisks.push('Deferred maintenance — verify unit conditions')
  if (medRisks.length === 0) medRisks.push('Interest rate risk on floating rate debt')
  if (lowRisks.length === 0) lowRisks.push('Strong Texas landlord-tenant environment')

  const riskBoxW = rightW
  const riskBoxX = rightX

  const drawRiskBox = (
    items: string[],
    bgColor: [number, number, number],
    borderColor: [number, number, number],
    title: string,
    startY: number,
  ): number => {
    const boxH = items.length * 14 + 24
    doc.setFillColor(...bgColor)
    doc.roundedRect(riskBoxX, startY, riskBoxW, boxH, 3, 3, 'F')
    doc.setDrawColor(...borderColor)
    doc.setLineWidth(0.5)
    doc.roundedRect(riskBoxX, startY, riskBoxW, boxH, 3, 3, 'S')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...borderColor)
    doc.text(title, riskBoxX + 8, startY + 13)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...DARK)
    items.forEach((item, i) => {
      doc.text(`• ${item}`, riskBoxX + 8, startY + 24 + i * 13, { maxWidth: riskBoxW - 16 })
    })
    return startY + boxH + 6
  }

  rightY = drawRiskBox(highRisks.slice(0, 3), RED_BG, RED_TEXT, 'HIGH RISK', rightY)
  rightY = drawRiskBox(medRisks.slice(0, 3), AMBER_BG, AMBER_TEXT, 'MODERATE RISK', rightY)
  drawRiskBox(lowRisks.slice(0, 3), GREEN_BG, GREEN_TEXT, 'LOW RISK', rightY)

  drawFooter(doc, 4, pageW, margin, pageH)
}

// Helper functions for avg rent calc
function avgInPlaceRentCalc(deal: DealInput, analysis: AnalysisResult): number {
  const units = analysis.units || deal.units || 1
  const unitMix = deal.unit_mix || []
  if (unitMix.length > 0) {
    const totalU = unitMix.reduce((s, u) => s + u.unit_count, 0)
    return totalU > 0 ? unitMix.reduce((s, u) => s + u.unit_count * u.actual_rent, 0) / totalU : 0
  }
  return safeDiv(deal.gross_rental_income ?? 0, 12 * units)
}

function avgMarketRentCalc(deal: DealInput, analysis: AnalysisResult): number {
  const unitMix = deal.unit_mix || []
  if (unitMix.length > 0) {
    const totalU = unitMix.reduce((s, u) => s + u.unit_count, 0)
    return totalU > 0
      ? unitMix.reduce((s, u) => s + u.unit_count * u.market_rent, 0) / totalU
      : avgInPlaceRentCalc(deal, analysis) * 1.10
  }
  return avgInPlaceRentCalc(deal, analysis) * 1.10
}

// ─── PAGE 5: VERDICT & RECOMMENDATIONS ───────────────────────────────────────

function renderPage5(
  doc: import('jspdf').jsPDF,
  at: (d: import('jspdf').jsPDF, o: Record<string, unknown>) => void,
  deal: DealInput,
  analysis: AnalysisResult,
  pageW: number,
  pageH: number,
  margin: number,
  contentW: number,
): void {
  addPageHeader(doc, 'INVESTMENT VERDICT & RECOMMENDED ACTIONS', pageW, margin)

  let y = 44
  const units = analysis.units || 1
  const sc = analysis.scenarios
  const asking = deal.asking_price ?? 0
  const gap = analysis.asking.gap_to_sc2_mao
  const gapPct = analysis.asking.gap_to_sc2_mao_pct
  const verdictLabel = analysis.verdict.label

  // ── Verdict Box ──────────────────────────────────────────────────────────
  let verdictBg: [number, number, number]
  if (verdictLabel === 'PROCEED') {
    verdictBg = [22, 163, 74]
  } else if (verdictLabel === 'NEGOTIATE') {
    verdictBg = [217, 119, 6]
  } else if (verdictLabel === 'PASS') {
    verdictBg = [234, 88, 12]
  } else {
    verdictBg = [220, 38, 38]
  }

  doc.setFillColor(...verdictBg)
  doc.roundedRect(margin, y, contentW, 80, 6, 6, 'F')
  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.text(verdictLabel, pageW / 2, y + 42, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const gapLine = gap >= 0
    ? `Asking price is ${fmt$(Math.abs(gap))} below LJM Sc2 MAO — within range`
    : `Asking price is ${fmt$(Math.abs(gap))} above LJM Sc2 MAO — negotiate required`
  doc.text(gapLine, pageW / 2, y + 62, { align: 'center' })
  y += 90

  // Price summary line
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  doc.text(
    `Asking Price: ${fmt$(asking)}   |   LJM Sc2 MAO: ${fmt$(sc[1].mao)}   |   Gap: ${gap >= 0 ? '+' : ''}${fmt$(gap)} (${Math.abs(gapPct * 100).toFixed(1)}% ${gap >= 0 ? 'under' : 'over'} MAO)`,
    pageW / 2,
    y,
    { align: 'center' },
  )
  y += 14

  // ── Recommended Offer Range Table ─────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text('RECOMMENDED OFFER RANGE', margin, y)
  y += 8

  const askingVerdictCell = (mao: number) => {
    if (asking <= 0) return '—'
    if (asking <= mao) return 'PROCEED'
    if (asking <= mao * 1.05) return 'NEGOTIATE'
    return 'PASS'
  }

  const sc0 = sc[0] // 8.5%
  const sc1 = sc[1] // 8.0%
  const sc2 = sc[2] // 7.5%

  at(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Scenario', 'Cap Rate', 'MAO', '$/Door', 'DSCR', 'Verdict']],
    body: [
      [
        'Sc1 — Conservative (7.5%)',
        '7.50%',
        fmt$(sc2.mao),
        fmt$(safeDiv(sc2.mao, units)),
        `${sc2.dscr.toFixed(2)}x`,
        sc2.dscr_pass ? 'PASS' : 'FAIL',
      ],
      [
        'Sc2 — Moderate (8.0%) ★',
        '8.00%',
        fmt$(sc1.mao),
        fmt$(safeDiv(sc1.mao, units)),
        `${sc1.dscr.toFixed(2)}x`,
        sc1.dscr_pass ? 'PASS' : 'FAIL',
      ],
      [
        'Sc3 — Aggressive (8.5%)',
        '8.50%',
        fmt$(sc0.mao),
        fmt$(safeDiv(sc0.mao, units)),
        `${sc0.dscr.toFixed(2)}x`,
        sc0.dscr_pass ? 'PASS' : 'FAIL',
      ],
      [
        'Asking Price',
        deal.broker_cap_rate ? fmtPct(deal.broker_cap_rate, 2) : '—',
        fmt$(asking),
        asking > 0 ? fmt$(safeDiv(asking, units)) : '—',
        '—',
        askingVerdictCell(sc1.mao),
      ],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 160 } },
    didParseCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string
        row: { index: number }
        column: { index: number }
        cell: { styles: Record<string, unknown>; raw: unknown }
      }
      if (d.section === 'body') {
        // Highlight moderate row
        if (d.row.index === 1) {
          d.cell.styles.fillColor = TEAL_LIGHT
          d.cell.styles.fontStyle = 'bold'
        }
        // Asking price row coloring
        if (d.row.index === 3) {
          d.cell.styles.fillColor = asking > sc1.mao ? RED_BG : GREEN_BG
          if (d.column.index === 0) d.cell.styles.fontStyle = 'bold'
        }
        // Verdict column
        if (d.column.index === 5) {
          const val = String(d.cell.raw)
          if (val === 'PASS' || val === 'PROCEED') {
            d.cell.styles.fillColor = GREEN_BG
            d.cell.styles.textColor = GREEN_TEXT
            d.cell.styles.fontStyle = 'bold'
          } else if (val === 'NEGOTIATE') {
            d.cell.styles.fillColor = AMBER_BG
            d.cell.styles.textColor = AMBER_TEXT
            d.cell.styles.fontStyle = 'bold'
          } else if (val === 'FAIL' || val === 'PASS') {
            d.cell.styles.fillColor = RED_BG
            d.cell.styles.textColor = RED_TEXT
            d.cell.styles.fontStyle = 'bold'
          }
        }
      }
    },
  })

  y = getY(doc) + 12

  // ── Due Diligence Checklist (two columns) ─────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text('DUE DILIGENCE PRIORITIES', margin, y)
  y += 8

  const halfW = (contentW - 12) / 2
  const ddLeft = [
    '[ ] Full T-12 P&L (rent roll by unit)',
    '[ ] All leases (current + recent renewals)',
    '[ ] 3-Year tax history (county assessor)',
    '[ ] Insurance loss runs (3 years)',
  ]
  const ddRight = [
    '[ ] Phase I Environmental Assessment',
    '[ ] Property Condition Assessment (PCA)',
    '[ ] Utility billing documentation (RUBS setup)',
    '[ ] Verify unit count on-site',
  ]

  const ddH = Math.max(ddLeft.length, ddRight.length) * 13 + 8
  doc.setFillColor(...LIGHT_GRAY)
  doc.rect(margin, y, contentW, ddH, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...DARK)
  ddLeft.forEach((item, i) => {
    doc.text(item, margin + 8, y + 10 + i * 13)
  })
  ddRight.forEach((item, i) => {
    doc.text(item, margin + halfW + 12 + 8, y + 10 + i * 13)
  })
  y += ddH + 12

  // ── Action Plan Table ──────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text('ACTION PLAN', margin, y)
  y += 8

  at(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['THIS WEEK', 'WITHIN 30 DAYS', 'PRE-CLOSING']],
    body: [
      ['Request full T-12 P&L', 'Order Phase I ESA', 'Lender term sheet review'],
      ['Tour property + all units', 'Property Condition Assessment', 'Title commitment review'],
      ['Verify unit count & mix', 'Insurance quote (binding)', 'Survey completion'],
      ['Meet property manager', 'County tax assessor consult', 'PPM (if syndicating)'],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
  })

  y = getY(doc) + 12

  // ── Key Contract Terms ────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text('KEY CONTRACT TERMS TO NEGOTIATE', margin, y)
  y += 8

  const em1Pct = asking > 0 ? fmt$(Math.round(asking * 0.01)) : '$X'
  const deferredCredit = asking > 0 ? fmt$(Math.round(asking * 0.005)) : '$X'

  at(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Term', 'Recommendation']],
    body: [
      ['Inspection Period', '15–21 business days minimum'],
      ['Financing Contingency', '30–45 days with extension option'],
      ['Earnest Money', `1% (${em1Pct}) refundable during inspection`],
      ['Price Reduction Clause', 'Right to renegotiate if NOI variance >10% vs. disclosed T-12'],
      ['Seller Concessions', `Request ${deferredCredit} credit for deferred maintenance items found in PCA`],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: TEAL_DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 130 } },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
  })

  y = getY(doc) + 12

  // ── Disclaimer ────────────────────────────────────────────────────────────
  const remainingH = pageH - y - 30
  if (remainingH > 0) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...GRAY)
    doc.text(
      'This report is prepared by LJM Homes LLC for internal underwriting purposes only. All projections are estimates based on provided data and standard LJM underwriting assumptions. Not financial, legal, or investment advice. Verify all figures with licensed professionals before making investment decisions. © LJM Homes LLC — Confidential',
      margin,
      y,
      { maxWidth: contentW },
    )
  }

  drawFooter(doc, 5, pageW, margin, pageH)
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function generateAdvisoryPdf(
  deal: DealInput,
  analysis: AnalysisResult,
  marketData?: MarketData,
): Promise<Buffer> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTablePlugin } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const pageW = 612
  const pageH = 792
  const margin = 40
  const contentW = pageW - margin * 2  // 532

  const at = (d: import('jspdf').jsPDF, opts: Record<string, unknown>) => {
    autoTable(d, opts, autoTablePlugin as (d: import('jspdf').jsPDF, o: unknown) => void)
  }

  // Page 1: Property Overview
  renderPage1(doc, at, deal, analysis, pageW, pageH, margin, contentW)

  // Page 2: Financial Analysis
  doc.addPage()
  renderPage2(doc, at, deal, analysis, pageW, pageH, margin, contentW)

  // Page 3: MAO Analysis
  doc.addPage()
  renderPage3(doc, at, deal, analysis, pageW, pageH, margin, contentW)

  // Page 4: Market Analysis & Risk
  doc.addPage()
  renderPage4(doc, at, deal, analysis, marketData, pageW, pageH, margin, contentW)

  // Page 5: Verdict & Recommendations
  doc.addPage()
  renderPage5(doc, at, deal, analysis, pageW, pageH, margin, contentW)

  return Buffer.from(doc.output('arraybuffer'))
}
