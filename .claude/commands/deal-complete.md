# Deal Complete — Full Pipeline Verification

Run the complete LJM Deal Analyzer end-to-end pipeline check and produce all four output documents for the current deal or the demo deal.

## Steps

1. **TypeScript check** — run `npx tsc --noEmit` and report any errors. Stop here if there are type errors.

2. **Build check** — run `npm run build` to ensure Next.js compiles cleanly.

3. **Start dev server** — run `npm run dev` in the background. Wait 5 seconds for it to come up.

4. **Submit demo deal** — POST to `http://localhost:3000/api/analyze` with `{ "demo": "1" }` as form data. Capture the `jobId`.

5. **Poll until complete** — GET `http://localhost:3000/api/jobs/{jobId}` every 2 seconds until status is `complete` or `error`. If error, report it and stop.

6. **Verify all 4 downloads** — for each of the four download types, send a GET request and confirm a non-empty response body:
   - `advisory_pdf` — expect Content-Type: application/pdf
   - `underwriting_xlsx` — expect .xlsx content (Pro-Forma Analysis + Unit Mix + Scenarios + Risk Register sheets)
   - `synthesis_xlsx` — expect .xlsx content (Deal Summary sheet)
   - `deal_json` — expect valid JSON with `deal` and `analysis` keys

7. **Verify XLSX sheets** — confirm the underwriting XLSX has all four tabs: Pro-Forma Analysis, Unit Mix, Scenarios, Risk Register.

8. **Report** — print a checklist:
   - [ ] TypeScript: clean
   - [ ] Build: clean
   - [ ] Demo analysis: complete
   - [ ] Advisory PDF: ✓/✗
   - [ ] Underwriting XLSX (4 sheets): ✓/✗
   - [ ] Synthesis XLSX: ✓/✗
   - [ ] Deal JSON: ✓/✗
   - [ ] Airtable sync: check if AIRTABLE_API_KEY + AIRTABLE_BASE_ID env vars are set

9. **Kill dev server** when done.

## Notes

- If an argument is provided (e.g. `/deal-complete path/to/file.pdf`), upload that file instead of using the demo deal.
- The Gemini API key is in `.env.local` (gitignored). OpenAI and Anthropic keys are optional.
- All financial formulas live in `lib/dealEngine.ts`. XLSX generation in `lib/generateXlsx.ts`. PDF in `lib/generatePdf.ts`.
