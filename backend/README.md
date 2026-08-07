# TermPilot backend

Express API for authenticated PDF extraction, Groq-based syllabus parsing, deterministic fallback parsing, editable import previews, due-date-first prioritization, and per-user Supabase Postgres storage.

```bash
cp .env.example .env
npm ci
npm run dev
```

Apply the Supabase migration and fill the required Supabase and origin values in `.env` before starting the server. `GROQ_API_KEY` is optional for deterministic fallback parsing, but required for AI extraction. Only `/api/health` is public; all other routes require a verified Supabase bearer token and execute with the caller's RLS context.

The server runs at `http://localhost:4000`. Run `npm test` for Auth, ownership, API, repository, parser, PDF-layout, validation, and priority regression tests. See the [project README](../README.md) for the complete setup.
