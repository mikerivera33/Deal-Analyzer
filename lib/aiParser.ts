import type { DealInput } from './types'

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
  asking_price: 1440000,
  broker_cap_rate: 0.065,
  sale_type: 'Listed',
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
  "state": string (2-letter),
  "zip_code": string,
  "year_built": number,
  "units": number (total unit count),
  "total_sf": number (total sq ft),
  "occupancy_pct": number (0–1),
  "asking_price": number (dollars),
  "broker_cap_rate": number (0–1, e.g. 0.065 for 6.5%),
  "sale_type": string,
  "gross_rental_income": number (annual, net of vacancy),
  "utility_reimbursement": number (annual),
  "other_income": number (annual),
  "pf_gross_rental": number (pro-forma annual gross rent),
  "pf_other_income": number (pro-forma),
  "pf_utility_reimb": number (pro-forma),
  "property_taxes": number (annual),
  "insurance": number (annual),
  "management_fee": number (annual),
  "utilities": number (annual),
  "reserves": number (annual),
  "unit_mix": [{ "bed_count": number, "bath_count": number, "unit_count": number, "avg_sf": number, "market_rent": number, "actual_rent": number }],
  "notes": string
}

Return ONLY valid JSON with no markdown fences, no commentary.`

async function callOpenAI(text: string): Promise<DealInput | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  try {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey: key })
    const resp = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text.slice(0, 50000) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    })
    const raw = resp.choices[0].message.content || '{}'
    return JSON.parse(raw)
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
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text.slice(0, 50000) }],
    })
    const raw = msg.content.find((b) => b.type === 'text')?.text || '{}'
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null
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
      model: 'gemini-1.5-pro',
      generationConfig: { responseMimeType: 'application/json' },
    })
    const prompt = `${SYSTEM_PROMPT}\n\nDocument text:\n${text.slice(0, 50000)}`
    const result = await model.generateContent(prompt)
    const raw = result.response.text()
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function cleanDeal(raw: Partial<DealInput>): DealInput {
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

export { DEMO_DEAL }
