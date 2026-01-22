# GitHub Issue Analyzer

Fastify + TypeScript service that caches GitHub issues locally (SQLite) and lets you analyze the cached data with a local LLM (Ollama by default), keeping the stack zero-cost by default.

## Overview

- `POST /scan`: fetch open issues for `owner/repo`, strip pull requests, and cache them in SQLite with simple upserts so repeated scans keep all repos synchronized.
- `POST /analyze`: run prompt-driven LLM summarization over cached issues. The analysis task uses map-reduce-style chunking to stay within configured budgets.
- Local-first design: issue storage lives in `./data/cache.db` (or another `STORAGE_PATH`), and the default LLM provider targets a locally hosted Ollama instance (`LLM_PROVIDER=ollama`), so you can run the service without cloud costs.

## Tech stack

- Node.js + TypeScript + Fastify HTTP framework
- SQLite (via `better-sqlite3`) for durable, inspectable caching
- LLM provider abstraction with Ollama as the default backing model (configurable via environment variables)

## Setup & Run

1. Install Node 24 LTS (Node ≥ 20 should work) and npm 10+.
2. `npm install`
3. Copy `.env.example` to `.env` and adjust any overrides (see the Configuration section below).
4. `npm run dev` to start the Fastify dev server and watch for changes. Health lives at `http://localhost:3000/health`.
5. For production-style runs: `npm run build && npm start`
6. Ensure the Ollama service is running locally (or point `LLM_PROVIDER`/`OLLAMA_BASE_URL` to another provider) before hitting `/analyze`.

## Configuration

Environment variables are validated with `zod` at startup, so the server fails fast on missing or malformed values.

- `PORT`: HTTP port (default `3000`).
- `LOG_LEVEL`: Fastify/Pino log level (`trace|debug|info|warn|error|fatal`).
- `GITHUB_TOKEN`: Optional GitHub PAT to raise rate limits while scanning.
- `STORAGE_PATH`: Path to the SQLite file (`./data/cache.db` by default).
- `LLM_PROVIDER`: Provider identifier (`ollama` by default, but pluggable adapters can honor other values).
- `OLLAMA_BASE_URL`: Target URL when using the Ollama provider (`http://localhost:11434` default).
- `OLLAMA_MODEL`: Ollama model to send prompts to (default `llama3.1:8b`).
- `LLM_TEMPERATURE`: Sampling temperature (0..2, default `0.2`).
- `LLM_MAX_OUTPUT_TOKENS`: Maximum token budget for a single LLM output (default `900`).
- `CONTEXT_MAX_TOKENS`: Total token budget for the prompt context (`8192` default).
- `PROMPT_MAX_CHARS`: Maximum characters of prompt text before truncation (`8000` default).
- `ANALYZE_MAX_ISSUES`: Max number of cached issues the analyzer will accept (`200` default).
- `ISSUE_BODY_MAX_CHARS`: Cap on characters pulled from each issue body before budgeting (`4000` default).

## Endpoints

### `POST /scan`

```jsonc
POST http://localhost:3000/scan
{
  "repo": "vercel/turbo"
}
```

Responses look like:

```json
{
  "repo": "vercel/turbo",
  "issues_fetched": 42,
  "cached_successfully": true
}
```

- `repo` must be `owner/name` (single slash, no spaces); invalid formats return `400 INVALID_REPO`.
- GitHub pagination happens behind the scenes, and pull requests are filtered out before caching (`filterPullRequests` ensures only issues remain).
- All fetched issues are upserted into the SQLite cache, and the repository metadata stores the last scan time plus open count for the repo.
- Cache data powers `/analyze`, so run a scan once per repo before analyzing.
- Optional `GITHUB_TOKEN` helps avoid rate limits; `/scan` returns `429 GITHUB_RATE_LIMIT` if unauthenticated requests trigger GitHub rate throttling.

### `POST /analyze`

```jsonc
POST http://localhost:3000/analyze
{
  "repo": "vercel/turbo",
  "prompt": "Summarize the top blockers and quick wins for this repo."
}
```

```json
{
  "analysis": "..."
}
```

- Works only against cached issues. Hitting `/analyze` before `/scan` returns `404 REPO_NOT_SCANNED`.
- `runAnalysis` builds a budget plan (`buildBudgetPlan`) based on `CONTEXT_MAX_TOKENS`, `ANALYZE_MAX_ISSUES`, `ISSUE_BODY_MAX_CHARS`, and `PROMPT_MAX_CHARS`. When issues overflow the budget, the endpoint switches to map-reduce chunking (Log metadata includes `mode` and `chunkCount`).
- If your request exceeds configured bounds, the endpoint returns `400` with `PromptTooLongError` or `ContextBudgetError` messages and suggests lowering `ANALYZE_MAX_ISSUES`, `ISSUE_BODY_MAX_CHARS`, or increasing `CONTEXT_MAX_TOKENS`.
- LLM availability errors surface as `503` (`LLMConnectionError`/`LLMModelError`) or `502` (`LLMResponseError`); ensure Ollama is running and the specified model is pulled locally.
- Final analysis is purely the LLM response (`analysis` string). The service does not call GitHub again during `/analyze`.
- Responses default to JSON, and the `analysis` string escapes line breaks as `\n`. Add `?format=text` or send `Accept: text/plain` to get a CLI-friendly `text/plain` response with actual newlines (plus a trailing newline for terminal readability).

## Why SQLite

- Durable storage that survives server restarts without extra services.
- Simple file (`./data/cache.db` by default), easy to inspect with CLI tools when debugging.
- `issueRepository` performs batched upserts, so re-scanning repositories replaces stale issue data cleanly.
- Single local database can hold data for many repos, keeping the demo focused on zero-cost development.

## Demo

Use `scripts/demo.sh` to exercise the service end-to-end.

```bash
bash scripts/demo.sh
```

The script hits `/health`, `/scan` (defaulting to `vercel/turbo`), and `/analyze` (asking for top blockers). You can override the base URL, repo, and prompt via `BASE_URL`, `REPO`, and `PROMPT` environment variables or positional arguments.

Manual commands (copy-paste):

```bash
curl -sSf http://localhost:3000/health

curl -sSf http://localhost:3000/scan \
  -H "Content-Type: application/json" \
  -d '{"repo":"nestjs/nest"}'

curl -sSf http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{"repo":"nestjs/nest","prompt":"Summarize blockers and quick wins."}'

curl -sSf "http://localhost:3000/analyze?format=text" \
  -H "Content-Type: application/json" \
  -H "Accept: text/plain" \
  -d '{"repo":"nestjs/nest","prompt":"Summarize blockers and quick wins."}'
```

## Prompt log

### Build prompts sent to AI tools

1. “Act as a senior TypeScript Fastify engineer: design a `/scan` endpoint that fetches open GitHub issues, filters out PRs, and caches results in a local SQLite database while storing repo metadata.”
2. “Help me design context budgeting logic that keeps LLM prompts under token and character limits by selectively truncating issue bodies and switching to map-reduce when necessary.”
3. “Describe how to structure the `/analyze` analysis pipeline so it feeds the same prompt and cached data into a reusable `runAnalysis` helper with clear logging.”

### Debug prompts

1. “Why does `/scan` still store pull requests even though GitHub returns both issues and PRs? Suggest how to reuse the existing `filterPullRequests` helper before persisting.”
2. “The `/analyze` endpoint fails with `ContextBudgetError` when a repo has many issues; what knobs (env vars or data transformations) can I expose so the budget plan has more headroom?”
3. “The Ollama response occasionally looks malformed and the route returns `502`; what timeout and error handling patterns should wrap `llmProvider.generate` to surface `LLMResponseError` with actionable guidance?”

### Final `/analyze` LLM prompts used in code

System message (combined instructions):

```text
You are a senior engineering/product maintainer assistant. Respond in clear markdown-style text. Ground recommendations in the provided issues and include issue URLs when referencing evidence. If information is missing, explain what additional context is required.
```

Map user message template:

```text
USER PROMPT:
<user prompt text here>

ISSUES:
<formatted issues block>

TASK: Summarize the findings that are most relevant to the USER PROMPT. Cover themes, top actionable items, evidence URLs, and identify duplicates or related issues when seen.
```

Reduce user message template:

```text
USER PROMPT:
<user prompt text here>

CHUNK SUMMARIES:
<map chunk summaries>

TASK: Produce a final consolidated answer that includes prioritized recommendations (P0/P1/P2), quick wins, risks/unknowns, and an evidence list (URLs).
```
