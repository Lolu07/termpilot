# TermPilot – AI Syllabus-to-Schedule Planner (Easy MVP)

This is a simple, resume-ready MVP of **TermPilot**.

### What it does
1. You paste syllabus text (or extend to PDF upload later).
2. Backend parses lines with dates into structured tasks.
3. Frontend shows:
   - Multi-course dashboard
   - “Today's Focus”
   - Week calendar
   - 8-week workload chart
   - Task list per course

### Tech
- React + Vite + Recharts (front-end focus)
- Node.js + Express (API)
- Local JSON storage (no DB needed for MVP)

### Quick start
```bash
# 1) backend
cd backend
npm install
npm run dev

# 2) frontend (new terminal)
cd ../frontend
npm install
npm run dev
```

### Notes
- Parser is heuristic to keep the project easy.
- You can later swap `parseSyllabusText` with an LLM call if you want.

Good luck shipping!