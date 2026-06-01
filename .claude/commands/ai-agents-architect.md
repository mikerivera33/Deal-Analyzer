# AI Agents Architect — Validate & Improve the Multi-Provider AI Pipeline

Review and harden the LJM Deal Analyzer's AI agent pipeline: extraction, fallback chain, market research, and structured output.

## Steps

1. **Audit `lib/aiParser.ts`**:
   - Confirm provider fallback order: OpenAI → Anthropic → Gemini → DEMO_DEAL
   - Confirm `claude-opus-4-8` with `thinking: { type: 'adaptive' }` is used for Anthropic
   - Confirm `AbortController` timeout (≤30s) wraps every AI call
   - Confirm all 25+ `DealInput` fields are listed in the system prompt
   - Confirm JSON parse is wrapped in try/catch with schema validation
   - Confirm no API keys appear in any log or error message

2. **Audit `app/api/analyze/route.ts` processJob()**:
   - Steps flow: ingest → (research) → extract → reconcile → compute → generate → complete
   - Error catch stores `status: 'error'` without leaking internals
   - `waitUntil` is used for background processing (not blocking response)
   - Market research step runs after ingest, before extract

3. **Validate market research integration** (`lib/marketResearch.ts`):
   - Function `fetchMarketData(city, state, units)` exists and returns `MarketData`
   - Fallback to estimated data if AI/search fails (never throws)
   - Results stored in job result as `market_data`

4. **Check streaming + adaptive thinking**:
   - Anthropic calls use `.stream()` + `.finalMessage()` pattern
   - No `budget_tokens` used (deprecated for claude-opus-4-8)
   - Timeout via `AbortController` not `signal` option on SDK

5. **Output architecture diagram** in markdown:
```
User Upload (PDF/XLSX/URL/Manual)
       ↓
POST /api/analyze → jobId (immediate)
       ↓ [background via waitUntil]
  [ingest]    → extract text from files
  [research]  → fetchMarketData(city, state) → MarketData
  [extract]   → AI parse → DealInput JSON
  [reconcile] → fill defaults, validate schema
  [compute]   → runDealEngine(deal) → AnalysisResult
  [generate]  → store complete result in Blob
       ↓
GET /api/jobs/{id} → poll until complete
       ↓
GET /api/jobs/{id}/download/{type} → generate file on-demand
```

6. **Self-fix any missing pieces** — if market research step is absent from processJob, add it. If streaming is missing from aiParser Anthropic branch, add it.

## References
- `lib/aiParser.ts` — AI extraction, provider fallback, DEMO_DEAL
- `lib/marketResearch.ts` — live market data fetching
- `lib/dealEngine.ts` — financial calculations
- `app/api/analyze/route.ts` — background processing pipeline
