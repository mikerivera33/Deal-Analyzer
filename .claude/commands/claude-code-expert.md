# Claude Code Expert — TypeScript Build, Type Check & Quality Audit

Run full TypeScript compilation, build validation, and expert code quality checks for the LJM Deal Analyzer.

## Steps

1. **TypeScript type check**:
   ```bash
   npx tsc --noEmit 2>&1 | head -60
   ```
   Fix any errors before proceeding. Common issues:
   - Missing properties on `AnalysisResult` or `ExpertAnalysis` interfaces
   - `marketData` parameter type not imported in PDF/XLSX generators
   - `MarketData` not exported from `lib/types.ts`

2. **Next.js build**:
   ```bash
   npm run build 2>&1 | tail -40
   ```
   Fix any build errors. Common issues:
   - `pdf-parse` needs webpack externals in `next.config.ts`
   - `@vercel/blob` and `@vercel/functions` need to be in dependencies (not devDeps)
   - Dynamic imports must be used for server-only packages

3. **Lint check**:
   ```bash
   npm run lint 2>&1 | head -40
   ```
   Fix any ESLint errors (not warnings).

4. **Verify all exports are correct**:
   - `lib/types.ts` exports: `DealInput`, `AnalysisResult`, `JobResult`, `Job`, `MarketData`, `RentComp`, `CapRateSegment`
   - `lib/generateXlsx.ts` exports: `generateUnderwritingXlsx(deal, analysis, marketData?)`, `generateSynthesisXlsx(deal, analysis, marketData?)`
   - `lib/generatePdf.ts` exports: `generateAdvisoryPdf(deal, analysis, marketData?)`
   - `lib/marketResearch.ts` exports: `fetchMarketData(city, state, units)`, default export optional
   - `lib/dealEngine.ts` exports: `runDealEngine(deal)` → `AnalysisResult`

5. **Check download route wiring** — confirm `app/api/jobs/[jobId]/download/[type]/route.ts`:
   - Imports `generateAdvisoryPdf` with correct 3-arg signature
   - Imports `generateUnderwritingXlsx` with correct 3-arg signature
   - Passes `job.result?.market_data` as third arg (or undefined)

6. **Self-fix all type errors** — don't just report, fix them. After fixing, re-run `npx tsc --noEmit` to confirm clean.

7. **Report final status**:
   ```
   TypeScript: ✓ CLEAN (0 errors)
   Build:      ✓ PASS
   Lint:       ✓ CLEAN
   Exports:    ✓ ALL CORRECT
   ```

## Notes
- This project uses `@anthropic-ai/sdk ^0.100.1` — ensure it's installed
- `next.config.ts` must have `serverExternalPackages: ['pdf-parse']`
- All API routes have `export const maxDuration = 60` for Vercel timeout
