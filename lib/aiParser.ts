import type { DealInput } from './types'
import { safeNum } from './utils'

const AI_TIMEOUT_MS = 25_000

const DEMO_DEAL: DealInput = {
  property_name: 'Oak Street Apartments',
  address: '1234 Oak Street',
  city: 'Atlanta',
  state: 'GA',
  zip_code: '30305',
  year_built: 1985,
  units: 12,
  total_sf: 9600,
  occupancy_pct: 0.95,
  occupied_pct: 0.95,
  asking_price: 1440000,
  broker_cap_rate: 0.065,
  sale_type: 'Listed',
  submarket: 'Midtown / Buckhead',
  msa: 'Atlanta-Sandy Springs-Roswell',
  renovation_status: 'Light value-add',
  capex_per_unit: 10000,
  gross_rental_income: 132240,
  utility_reimbursement: 3600,
  other_income: 2400,
  pf_gross_rental: 144000,
  pf_other_income: 2400,
  pf_utility_reimb: 3600,
  property_taxes: 18000,
  insurance: 9600,
  management_fee: 11000,
  utilities: 7200,
  reserves: 1800,
  unit_mix: [
    { bed_count: 1, bath_count: 1, unit_count: 6, avg_sf: 700, market_rent: 950, actual_rent: 920 },
    { bed_count: 2, bath_count: 1, unit_count: 4, avg_sf: 900, market_rent: 1150, actual_rent: 1100 },
    { bed_count: 3, bath_count: 2, unit_count: 2, avg_sf: 1200, market_rent: 1350, actual_rent: 1300 },
  ],
  notes: 'Demo deal — replace by uploading a real OM or T-12.',
}

const SYSTEM_PROMPT = `You are a commercial real estate underwriting assistant for LJM Homes LLC.
Extract structured deal data from the provided document text and return a SINGLE JSON object.
Map to this exact schema (all fields optional, use null if not found):

{
  "property_name": string,
  "address": string,
  "city": string,
  "state": string (2-letter abbreviation, e.g. "GA"),
  "zip_code": string,
  "year_built": number (integer, e.g. 1985),
  "units": number (total unit count, integer),
  "total_sf": number (total square feet),
  "occupancy_pct": number (decimal 0–1, e.g. 0.95 for 95%),
  "occupied_pct": number (decimal 0–1, alias for occupancy if labeled "occupied"),
  "asking_price": number (dollars, no commas or symbols),
  "broker_cap_rate": number (decimal 0–1, e.g. 0.065 for 6.5%),
  "sale_type": string (e.g. "Listed", "Off-Market", "Free-and-clear"),
  "submarket": string (submarket / neighborhood, e.g. "Telecom Corridor"),
  "msa": string (metro statistical area, e.g. "Dallas-Fort Worth-Arlington"),
  "renovation_status": string (renovation notes, e.g. "No (heavy reno needed)"),
  "gross_rental_income": number (T-12 actual annual gross rent, dollars),
  "utility_reimbursement": number (T-12 annual dollars),
  "other_income": number (T-12 annual dollars),
  "t2_gross_rental": number (Broker T-2 trailing-2-month annualized gross rent; null if not present),
  "t2_utility_reimb": number (Broker T-2 annual utility reimbursement; null if not present),
  "t2_other_income": number (Broker T-2 annual other income; null if not present),
  "pf_gross_rental": number (pro-forma annual gross rent, dollars),
  "pf_other_income": number (pro-forma annual other income, dollars),
  "pf_utility_reimb": number (pro-forma annual utility reimbursement, dollars),
  "capex_per_unit": number (renovation/CapEx budget per unit in dollars; default 10000 if value-add),
  "property_taxes": number (annual dollars),
  "insurance": number (annual dollars),
  "management_fee": number (annual dollars),
  "utilities": number (annual dollars),
  "reserves": number (annual dollars),
  "payroll": number (annual payroll/staff expenses, dollars),
  "repairs_maintenance": number (annual repairs & maintenance expenses, dollars),
  "admin_fees": number (annual general & administrative expenses, dollars),
  "desired_cap_rate": number (desired all-in cap rate e.g. 0.09 for 9%; null if not stated),
  "seller_carry": number (assumable or seller carry loan amount, dollars; null if none),
  "io_months": number (interest-only months remaining on assumable loan; null if none),
  "loss_to_lease_pct": number (loss-to-lease as decimal 0–1, e.g. 0.03 for 3%; null if not stated),
  "vacancy_pct": number (vacancy rate as decimal 0–1, e.g. 0.07 for 7%; null if not stated),
  "delinquency_pct": number (delinquency/bad-debt rate as decimal 0–1; null if not stated),
  "pref_return_rate": number (preferred return rate as decimal 0–1, e.g. 0.07 for 7%; null if not stated),
  "equity_share_pct": number (GP equity share as decimal 0–1, e.g. 0.20 for 20%; null if not stated),
  "time_to_proforma_months": number (months to reach pro-forma rents, e.g. 24; null if not stated),
  "other_income_per_unit": number (other income per unit per year in dollars, e.g. 200; null if not stated),
  "unit_mix": [{ "bed_count": number, "bath_count": number, "unit_count": number, "avg_sf": number, "market_rent": number, "actual_rent": number }],
  "notes": string
}

IMPORTANT: All numeric fields must be plain numbers (no "$", no commas). Percentages as decimals (6.5% → 0.065).
Return ONLY valid JSON with no markdown fences, no commentary.`

/** Parse a JSON string safely; return null on any parse error */
function safeParseJSON(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Validate and coerce AI output to DealInput, ensuring numeric fields are numbers */
function coerceDealInput(raw: unknown): DealInput | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>

  const deal: DealInput = {}

  // String fields — take as-is if string, else ignore
  const strFields = ['property_name', 'address', 'city', 'state', 'zip_code', 'sale_type', 'submarket', 'msa', 'renovation_status', 'notes'] as const
  for (const f of strFields) {
    const v = obj[f]
    if (v != null && v !== '') deal[f] = String(v).slice(0, 500)
  }

  // Numeric fields — coerce through safeNum
  const numFields = [
    'year_built', 'units', 'total_sf', 'occupancy_pct', 'occupied_pct', 'asking_price', 'broker_cap_rate',
    'gross_rental_income', 'utility_reimbursement', 'other_income',
    't2_gross_rental', 't2_utility_reimb', 't2_other_income',
    'pf_gross_rental', 'pf_other_income', 'pf_utility_reimb',
    'capex_per_unit',
    'property_taxes', 'insurance', 'management_fee', 'utilities', 'reserves',
    'payroll', 'repairs_maintenance', 'admin_fees',
    'desired_cap_rate', 'seller_carry', 'io_months',
    'loss_to_lease_pct', 'vacancy_pct', 'delinquency_pct',
    'pref_return_rate', 'equity_share_pct', 'time_to_proforma_months', 'other_income_per_unit',
  ] as const
  for (const f of numFields) {
    const n = safeNum(obj[f])
    if (n > 0) deal[f] = n
  }

  // unit_mix — validate each row
  if (Array.isArray(obj.unit_mix)) {
    const mix = obj.unit_mix
      .filter((u): u is Record<string, unknown> => u != null && typeof u === 'object')
      .map((u) => ({
        bed_count: Math.max(0, Math.round(safeNum(u.bed_count))),
        bath_count: Math.max(0, safeNum(u.bath_count)),
        unit_count: Math.max(0, Math.round(safeNum(u.unit_count))),
        avg_sf: safeNum(u.avg_sf),
        market_rent: safeNum(u.market_rent),
        actual_rent: safeNum(u.actual_rent),
      }))
      .filter((u) => u.unit_count > 0)
    if (mix.length > 0) deal.unit_mix = mix
  }

  return deal
}

async function callOpenAI(text: string): Promise<DealInput | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  try {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey: key })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
    try {
      const resp = await client.chat.completions.create(
        {
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: text.slice(0, 50000) },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
        },
        { signal: controller.signal }
      )
      const raw = resp.choices[0]?.message?.content || '{}'
      return coerceDealInput(safeParseJSON(raw))
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

async function callAnthropic(text: string): Promise<DealInput | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: key })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
    try {
      const stream = client.messages.stream(
        {
          model: 'claude-opus-4-8',
          max_tokens: 8192,
          thinking: { type: 'adaptive' },
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: text.slice(0, 50000) }],
        },
        { signal: controller.signal }
      )
      const resp = await stream.finalMessage()
      const raw = resp.content.find((b) => b.type === 'text')?.text ?? '{}'
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      return jsonMatch ? coerceDealInput(safeParseJSON(jsonMatch[0])) : null
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

async function callGemini(text: string): Promise<DealInput | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(key)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    })
    const prompt = `${SYSTEM_PROMPT}\n\nDocument text:\n${text.slice(0, 50000)}`
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout')), AI_TIMEOUT_MS)
      ),
    ])
    const raw = result.response.text()
    return coerceDealInput(safeParseJSON(raw))
  } catch {
    return null
  }
}

function cleanDeal(raw: DealInput): DealInput {
  const clean: DealInput = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v !== null && v !== undefined && v !== '') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(clean as any)[k] = v
    }
  }
  return clean
}

export async function parseDealFromText(text: string): Promise<{
  deal: DealInput
  isDemo: boolean
  missing: string[]
}> {
  let raw: DealInput | null = null

  raw = await callOpenAI(text)
  if (!raw) raw = await callAnthropic(text)
  if (!raw) raw = await callGemini(text)

  if (!raw) {
    return { deal: DEMO_DEAL, isDemo: true, missing: [] }
  }

  const deal = cleanDeal(raw)
  const missing: string[] = []
  const required = ['asking_price', 'units', 'gross_rental_income'] as const
  for (const field of required) {
    if (!deal[field]) missing.push(field)
  }

  return { deal, isDemo: false, missing }
}

export { DEMO_DEAL, coerceDealInput }
