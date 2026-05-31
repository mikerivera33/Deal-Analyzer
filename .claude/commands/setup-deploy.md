# Setup Deploy — Environment Check, Build, Push & PR

Validate environment, run production build, commit all changes, push to branch, and ensure PR is open.

## Steps

1. **Environment check** — verify required env vars in `.env.local` (never commit this file):
   ```bash
   grep -E "^(GEMINI|ANTHROPIC|OPENAI|BLOB)_" .env.local | sed 's/=.*/=***/'
   ```
   Required for production: at least one of `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
   Required for Vercel: `BLOB_READ_WRITE_TOKEN`
   
   If a key is missing, warn but don't block — the app falls back to DEMO_DEAL.

2. **Check `.env.example`** — ensure all key names (but not values) are listed:
   ```
   OPENAI_API_KEY=
   ANTHROPIC_API_KEY=
   GEMINI_API_KEY=
   BLOB_READ_WRITE_TOKEN=
   ```

3. **Install dependencies**:
   ```bash
   npm install 2>&1 | tail -5
   ```

4. **TypeScript check**:
   ```bash
   npx tsc --noEmit 2>&1 | head -30
   ```
   Fix any errors before continuing.

5. **Production build**:
   ```bash
   npm run build 2>&1 | tail -20
   ```
   Must succeed before pushing.

6. **Git status & commit**:
   ```bash
   git status --short
   git diff --stat HEAD
   ```
   Stage all changed source files (not .env.local, not node_modules):
   ```bash
   git add app/ lib/ components/ .claude/commands/ *.ts *.mjs *.json vercel.json
   git commit -m "feat: rebuild pipeline with live-formula XLSX, 5-page PDF, market research integration"
   ```

7. **Push to development branch**:
   ```bash
   git push -u origin claude/cool-brown-SdssO
   ```
   Retry up to 4× with exponential backoff on network failure.

8. **Ensure PR exists** — use GitHub MCP tools to check for open PR on `claude/cool-brown-SdssO`.
   If no PR exists, create one as ready-for-review (not draft).

9. **Report final status**:
   ```
   Branch:   claude/cool-brown-SdssO
   Build:    ✓ PASS
   Push:     ✓ SUCCESS
   PR:       ✓ OPEN (or created)
   ```

## Notes
- Target branch: `claude/cool-brown-SdssO`
- Never push to main/master
- The `.env.local` file is gitignored — never commit it
- `vercel.json` must have `maxDuration: 60` for API routes
