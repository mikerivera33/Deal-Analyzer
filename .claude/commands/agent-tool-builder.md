# Agent Tool Builder — Scaffold & Validate Analysis Tools

Build, validate, and test the core analysis tools (dealEngine, aiParser, generators) that the LJM pipeline uses as its agent tools.

## Steps

1. **Inventory all tools in the pipeline**:
   | Tool | File | Input | Output |
   |------|------|-------|--------|
   | AI Parser | `lib/aiParser.ts` | raw text | `DealInput` JSON |
   | Deal Engine | `lib/dealEngine.ts` | `DealInput` | `AnalysisResult` |
   | Market Research | `lib/marketResearch.ts` | city, state, units | `MarketData` |
   | PDF Generator | `lib/generatePdf.ts` | deal + analysis + market | PDF Buffer |
   | XLSX Generator | `lib/generateXlsx.ts` | deal + analysis + market | XLSX Buffer |
   | Blob Store | `lib/blobStore.ts` | job data | stored/retrieved |

2. **Validate each tool's interface**:
   - `parseDealFromText(text: string): Promise<{ deal: DealInput, isDemo: boolean, missing: string[] }>`
   - `runDealEngine(deal: DealInput): AnalysisResult`
   - `fetchMarketData(city: string, state: string, units: number): Promise<MarketData>`
   - `generateAdvisoryPdf(deal: DealInput, analysis: AnalysisResult, marketData?: MarketData): Promise<Buffer>`
   - `generateUnderwritingXlsx(deal: DealInput, analysis: AnalysisResult, marketData?: MarketData): Promise<Buffer>`
   - `generateSynthesisXlsx(deal: DealInput, analysis: AnalysisResult, marketData?: MarketData): Promise<Buffer>`

3. **Test deal engine with demo data**:
   Run a quick sanity check by importing and running `runDealEngine` with the DEMO_DEAL constant:
   ```typescript
   // In a test script or via the /api/analyze?demo=1 endpoint:
   // POST /api/analyze with { demo: 1 }
   // GET /api/jobs/{id}  (poll until complete)
   // Verify analysis.expert.noi > 0
   // Verify analysis.scenarios.length === 3
   // Verify analysis.risk_register.length >= 3
   ```

4. **Validate mathematical accuracy** — for the demo deal (12 units, $139,200 GRI):
   - Expert NOI should be between $40,000–$80,000
   - DSCR should be between 0.8x and 2.0x
   - Scenarios[1] MAO should equal NOI / 0.08
   - Gap% should be negative if asking_price > MAO

5. **Check all download types work**:
   After a demo job completes, test each download:
   - `GET /api/jobs/{id}/download/advisory_pdf` → 200 + application/pdf
   - `GET /api/jobs/{id}/download/underwriting_xlsx` → 200 + xlsx content-type
   - `GET /api/jobs/{id}/download/synthesis_xlsx` → 200 + xlsx content-type
   - `GET /api/jobs/{id}/download/deal_json` → 200 + application/json

6. **Self-fix any tool mismatches** — if a tool's exported function signature doesn't match what the download route or processJob expects, fix the mismatch.

7. **Create/update `lib/marketResearch.ts`** if it doesn't exist:
   - Must export `fetchMarketData(city, state, units) → Promise<MarketData>`
   - Must return fallback DFW data if AI/search fails
   - Must not throw (wrap everything in try/catch)

8. **Report tool status**:
   ```
   AI Parser:        ✓ function signature valid
   Deal Engine:      ✓ produces correct AnalysisResult
   Market Research:  ✓ returns MarketData with fallback
   PDF Generator:    ✓ accepts 3rd marketData param
   XLSX Generator:   ✓ accepts 3rd marketData param
   Blob Store:       ✓ storeJob / getJob functional
   ```

## Notes
- All tools are server-side only (no browser imports)
- Tools are invoked in sequence by `processJob()` in `app/api/analyze/route.ts`
- The download route generates files on-demand (not cached in blob)
