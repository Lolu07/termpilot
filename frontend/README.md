# TermPilot frontend

React and Vite interface for Supabase magic-link authentication, private course workspaces, syllabus upload, editable review-before-save, due-date prioritization, and workload visualization.

```bash
cp .env.example .env
npm ci
npm run dev
```

Fill `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_API_URL` before starting. The app runs at `http://localhost:5173`. Use `npm test` for API/Auth/date validation and `npm run build` for a production build. See the [project README](../README.md) for full setup and architecture details.
