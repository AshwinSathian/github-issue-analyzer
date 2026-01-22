# GitHub Issue Analyzer

Minimal TypeScript/Fastify foundation for future epics that will cache GitHub issues, scan repositories, and summarize them with an LLM (Ollama by default).

## Requirements
- Node.js 24 LTS (Node ≥ 20 is supported)
- npm 10+

## Quick start
1. `npm install`
2. `npm run dev`
3. Open `http://localhost:3000/health` to see `{"ok":true,"uptimeSeconds":<number>}`

## Build & run
- `npm run build`
- `npm start`

## Configuration
- Environment variables are loaded via `dotenv` and validated at startup.
- Copy `.env.example` and adjust overrides as needed.

## Upcoming epics
- SQLite-backed caching/data storage under `data/`
- `/scan` and `/analyze` endpoints
- Ollama (default) LLM provider with token/context budgeting
