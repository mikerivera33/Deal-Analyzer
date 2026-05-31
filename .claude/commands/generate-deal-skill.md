# Generate Deal Skill — Create a New Claude Command for Deal Analysis

Use this command to scaffold a new `.claude/commands/` skill file for a custom deal analysis workflow.

## Usage

`/generate-deal-skill <name> <description>`

Example: `/generate-deal-skill comp-check "Compare two deals side by side"`

## Steps

1. **Parse arguments** — extract the skill name (kebab-case) and description from $ARGUMENTS.

2. **Determine scope** — ask the user one clarifying question if needed:
   - Does this skill read deal data (read-only) or modify/generate files?
   - Should it operate on the current job ID, a file path, or prompt for input?

3. **Scaffold the skill file** at `.claude/commands/{name}.md` with this template:

```markdown
# {Name} — {Description}

## Usage
/{name} [jobId|file-path|arguments]

## Steps

1. [First step]
2. [Second step]
3. ...

## Notes
- References: lib/dealEngine.ts (financial formulas), lib/generateXlsx.ts (XLSX output), lib/generatePdf.ts (PDF output)
- Job data is stored in Vercel Blob (production) or /tmp/ljm-jobs/ (local dev)
- API base: http://localhost:3000 (dev) or https://your-domain.vercel.app (prod)
```

4. **Confirm** — print the file path and first 20 lines of the created skill.

## Available Hooks for New Skills

| Hook Point | What It Accesses |
|---|---|
| GET /api/jobs/{jobId} | Full job result with deal + analysis |
| GET /api/jobs/{jobId}/download/{type} | advisory_pdf, underwriting_xlsx, synthesis_xlsx, deal_json |
| POST /api/analyze | Submit new deal (file upload, URL, manual JSON, or demo) |
| POST /api/jobs/{jobId}/edit | Re-run analysis with edited deal JSON |
| lib/dealEngine.ts | runDealEngine(deal) → AnalysisResult |
| lib/generateXlsx.ts | generateUnderwritingXlsx, generateSynthesisXlsx |
| lib/generatePdf.ts | generateAdvisoryPdf |
