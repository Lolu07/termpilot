# TermPilot backend

Express API for PDF extraction, Groq-based syllabus parsing, deterministic fallback parsing, editable import previews, server-validated course imports, task prioritization, and course storage.

```bash
cp .env.example .env
npm ci
npm run dev
```

The server runs at `http://localhost:4000`. Run `npm test` for parser, PDF-layout, validation, and priority regression tests. See the [project README](../README.md) for architecture, API documentation, environment variables, and current limitations.
