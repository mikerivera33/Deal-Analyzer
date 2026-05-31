# AI Dev Jobs MCP — Job Store Health Check & Pipeline Metrics

Validate the job processing infrastructure (Vercel Blob store + state machine) and report job pipeline health.

## Steps

1. **Validate blob store configuration** (`lib/blobStore.ts`):
   - `BLOB_READ_WRITE_TOKEN` env var is required for Vercel Blob in production
   - Local dev falls back to `/tmp/ljm-jobs/` directory if `@vercel/blob` is unavailable
   - `storeJob(job)` — confirm it does `put(key, JSON.stringify(job), { access: 'public', addRandomSuffix: false })`
   - `getJob(id)` — confirm it fetches by URL and handles 404 gracefully (returns null, not throws)

2. **Validate job state machine** — check all valid transitions:
   ```
   initial (running) → ingest → extract → reconcile → compute → generate → complete
   any step          → error (on exception)
   extract           → needs_manual (if critical fields missing)
   URL ingest        → blocked (if SSRF blocked or site blocks scrape)
   ```

3. **Confirm step names match UI** — steps array must be exactly:
   `['ingest', 'research', 'extract', 'reconcile', 'compute', 'generate']`
   (or `['ingest', 'extract', 'reconcile', 'compute', 'generate']` if research not yet added)
   These must match what `StepProgress.tsx` component expects.

4. **Check job result structure** — `JobResult` must contain:
   - `deal?: DealInput` — always present on success
   - `analysis?: AnalysisResult` — present on complete
   - `market_data?: MarketData` — present if research ran
   - `missing?: string[]` — fields the AI couldn't extract
   - `error?: string` — safe client-facing error message

5. **Validate download route** (`app/api/jobs/[jobId]/download/[type]/route.ts`):
   - Reads job from blob store
   - Calls appropriate generator with `(job.result.deal, job.result.analysis, job.result.market_data)`
   - Returns with correct Content-Type and Content-Disposition headers
   - Handles `market_data` as optional (doesn't crash if undefined)

6. **MCP integration note** — This project uses Vercel Blob as job store.
   For MCP server integration with external tools, the job API endpoints serve as the interface:
   - `GET /api/jobs/{id}` → poll job status
   - `GET /api/jobs/{id}/download/{type}` → download artifacts

7. **Self-fix** — If `getJob` throws on 404 instead of returning null, fix it. If step names don't match StepProgress, align them.

## References
- `lib/blobStore.ts` — Vercel Blob helpers
- `app/api/jobs/[jobId]/route.ts` — job polling endpoint
- `app/api/jobs/[jobId]/download/[type]/route.ts` — download endpoint
- `components/StepProgress.tsx` — progress UI
- `lib/types.ts` — Job, JobResult, JobStatus types
