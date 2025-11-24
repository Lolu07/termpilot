# TermPilot Backend (MVP)

Simple Express server that:
- accepts syllabus text or PDF upload
- parses assignments with a lightweight heuristic parser
- stores data in a local JSON file (no DB needed)
- exposes endpoints for the React front-end

## Run
```bash
cd backend
npm install
npm run dev
```

Server runs on http://localhost:4000