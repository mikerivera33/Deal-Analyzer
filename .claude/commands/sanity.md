# Sanity Check — LJM Deal Analyzer Health

Run a fast sanity check across all layers of the Deal Analyzer stack. This is a read-only diagnostic — it does not modify files.

## Checks to Run

### 1. TypeScript
```
npx tsc --noEmit
```
Report: PASS (0 errors) or list all errors.

### 2. Dependencies
- Confirm `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`, `@vercel/blob`, `xlsx`, `jspdf`, `pdf-parse` are all in `node_modules/`.
- Report any missing packages.

### 3. Environment Variables
Check which AI and storage keys are present in `.env.local` (never print the values):
- [ ] OPENAI_API_KEY
- [ ] ANTHROPIC_API_KEY
- [ ] GEMINI_API_KEY
- [ ] BLOB_READ_WRITE_TOKEN
- [ ] AIRTABLE_API_KEY
- [ ] AIRTABLE_BASE_ID

### 4. File Completeness
Verify these files exist:
- `lib/dealEngine.ts`
- `lib/aiParser.ts`
- `lib/generateXlsx.ts` (must export `generateUnderwritingXlsx` and `generateSynthesisXlsx`)
- `lib/generatePdf.ts` (must export `generateAdvisoryPdf`)
- `lib/blobStore.ts`
- `lib/airtableSync.ts`
- `lib/utils.ts`
- `lib/types.ts`
- `app/api/analyze/route.ts`
- `app/api/jobs/[jobId]/route.ts`
- `app/api/jobs/[jobId]/edit/route.ts`
- `app/api/jobs/[jobId]/download/[type]/route.ts`

### 5. Download Route Coverage
Confirm `ALLOWED_TYPES` in the download route includes all four: `advisory_pdf`, `underwriting_xlsx`, `synthesis_xlsx`, `deal_json`.

### 6. XLSX Sheet Coverage
Confirm `generateUnderwritingXlsx` appends sheets: `Pro-Forma Analysis`, `Unit Mix`, `Scenarios`, `Risk Register` (grep for `book_append_sheet`).

### 7. AI Provider Chain
Confirm `lib/aiParser.ts` calls providers in order: OpenAI → Anthropic (`claude-opus-4-8` with adaptive thinking) → Gemini → Demo fallback.

### 8. Security Checks
- `isSafeUrl` is called before any URL fetch in the analyze route.
- JobId is validated as UUID before use in blobStore.
- Error responses do not expose stack traces (`clientError` strips them).

## Output Format
Print a compact checklist with PASS/FAIL for each check. On any FAIL, describe what's wrong and how to fix it in one sentence.
