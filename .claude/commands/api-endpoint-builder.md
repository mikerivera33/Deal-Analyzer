# API Endpoint Builder — Audit, Validate & Document All API Routes

Audit every route in `app/api/`, enforce security headers, validate request handling, and output a complete endpoint map.

## Steps

1. **Discover all routes** — `find app/api -name "route.ts" | sort`

2. **For each route, check**:
   - Input validation (file size limits, UUID checks, JSON parse try/catch)
   - SSRF protection on URL inputs
   - Error responses never leak stack traces (`err.message.split('\n')[0]`)
   - `Content-Type` header set on all responses
   - No API keys logged or returned in error bodies
   - Path traversal protection on any `[param]` used in blob keys

3. **Validate API contract** — run `curl -s -X POST http://localhost:3000/api/analyze -F demo=1` and confirm `{ jobId }` is returned.

4. **Check each download type** — confirm `/api/jobs/[id]/download/[type]` returns correct MIME types:
   - `advisory_pdf` → `application/pdf`
   - `underwriting_xlsx` → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
   - `synthesis_xlsx` → same as above
   - `deal_json` → `application/json`

5. **Output endpoint map**:
```
METHOD  PATH                                    AUTH  VALIDATES  BACKGROUND
POST    /api/analyze                           no    ✓          waitUntil
GET     /api/jobs/[jobId]                      no    uuid       -
POST    /api/jobs/[jobId]/edit                 no    uuid+json  waitUntil
GET     /api/jobs/[jobId]/download/[type]      no    uuid+type  -
```

6. **Self-fix any missing validations** — add UUID regex check if `[jobId]` is used directly in blob key without validation.

## Notes
- API routes: `app/api/analyze/route.ts`, `app/api/jobs/[jobId]/route.ts`, `app/api/jobs/[jobId]/edit/route.ts`, `app/api/jobs/[jobId]/download/[type]/route.ts`
- Blob key pattern: `jobs/${jobId}.json` — validate UUID before use
- UUID regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`
