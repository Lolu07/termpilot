# Supabase migration guide

TermPilot now uses Supabase Auth and Postgres for private, persistent user
workspaces. The application will not start without Supabase runtime variables,
and the authenticated routes require this migration to be applied first.

## What the migration creates

- `profiles`: optional user-facing name and avatar data linked to `auth.users`
- `courses`: one user's courses and the latest sanitized parse metadata
- `items`: validated coursework rows owned by the same user as their course
- `course_imports`: immutable audit records for confirmed imports
- Ownership and due-date indexes
- Row Level Security (RLS) for every user-data table
- `updated_at` triggers for mutable records
- `import_reviewed_course(...)`, an atomic reviewed-import RPC

The database deliberately does not store uploaded PDFs or raw syllabus text.
`parse_info` is capped at 16 KB and rejects common raw-content field names.

## Design assumptions

1. Supabase Auth is the identity source; `auth.uid()` is the tenant boundary.
2. Express remains the only application API. It uses
   `@supabase/supabase-js` directly: each bearer token is verified with
   `supabase.auth.getClaims(token)`, then create a caller-scoped client using
   the `accessToken` option so database calls retain the user's RLS context.
3. Normal runtime requests use a Supabase publishable key, not a secret or
   legacy `service_role` key.
4. Course names are case-insensitively unique per user. A same-name import is
   rejected unless the user explicitly approves replacement.
5. Confirmed imports replace all items in that course. The RPC performs the
   course change, item replacement, and audit insert in one transaction.
6. `priority_score` is not persisted because it changes as the due date gets
   closer; Express should continue calculating it when serializing items.
7. `course_imports` is append-only through normal client privileges. Deleting a
   course or Auth user cascades to its related items and import history.
8. Parser provenance is useful product metadata, not an authorization signal.

## 1. Create and configure the Supabase project

Create a project in the desired production region. Keep the database password,
CLI access token, and any secret key out of source control and screenshots.

In **Authentication → URL Configuration**, set:

```text
Site URL: https://termpilot.vercel.app
Additional redirect URL: http://localhost:5173/**
```

Add the exact Vercel preview pattern only if preview deployments need Auth.
Email sign-in can create a user on the first successful link. The interactive
product demo also requires **Authentication → Sign In / Providers → Allow
anonymous sign-ins** to be enabled. Anonymous visitors still use the
`authenticated` Postgres role, and the existing owner-scoped RLS policies give
each visitor an isolated temporary workspace.

Google OAuth can complement the existing magic-link and anonymous demo paths,
but it requires a Google OAuth client ID and secret.

## 2. Apply the migration

The migration is:

```text
supabase/migrations/20260805000100_auth_and_persistence.sql
```

Preferred CLI workflow:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Alternatively, paste the migration into the Supabase SQL Editor and run it as
one statement. Use a development project first. The migration is transactional,
so a failure rolls back its changes.

Commit future schema changes as additional timestamped migration files; do not
edit a migration after it has been applied to production.

## 3. Verify RLS before production cutover

The SQL Editor commonly runs with elevated privileges, so it is not sufficient
for testing RLS. Create two test Auth users and exercise the Data API with each
user's access token.

Verify all of the following:

- An unauthenticated request cannot read any of the four tables.
- User A cannot read or change User B's profile, courses, items, or import
  history.
- A task cannot reference a course owned by a different user.
- Updating `user_id` to another user is rejected.
- Deleting a course cascades to its items and import audit rows.
- Duplicate case-insensitive course names are rejected for the same user.
- The same course name is allowed for two different users.
- Authenticated clients cannot update or directly delete import audit rows.

Supabase's Security Advisor should show no unprotected tables from this package.

## 4. Exercise the atomic import RPC

Call the function with an authenticated Supabase client:

```js
const { data, error } = await supabase.rpc("import_reviewed_course", {
  p_course_name: "CS 3450",
  p_items: [
    {
      title: "Homework 1",
      due_date: "2026-09-08",
      item_type: "Homework",
      weight: 4,
      estimated_effort_hours: 2
    }
  ],
  p_parse_info: {
    engine: "groq",
    input_type: "pdf",
    item_count: 1,
    pages: 2,
    filename: "cs-3450-syllabus.pdf",
    request_id: "a1b2c3d4"
  },
  p_replace_existing: false
});
```

The function ignores client-supplied IDs, ownership, completion, and priority
fields. Database constraints reject malformed dates, unsupported item types,
out-of-range values, and duplicate title/date pairs. Any failure rolls back the
entire import. A duplicate course raises SQLSTATE `23505`; the API maps that to
HTTP `409` and requests explicit replacement confirmation.

## 5. Runtime environment variables

Render backend:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
ALLOWED_ORIGINS=https://termpilot.vercel.app,http://localhost:5173
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
```

Vercel frontend:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_API_URL=https://term-pilot.onrender.com/api
```

On Render, set the repository root directory to `backend`, build command to
`npm ci`, and start command to `npm start`. On Vercel, set the root directory to
`frontend`, build command to `npm run build`, and output directory to `dist`.
The Groq values are optional for fallback-only parsing; production AI parsing
requires a valid `GROQ_API_KEY`.

Publishable keys are expected to be visible in browser bundles. Their safety
depends on correct RLS. Never put a Supabase secret key, legacy service-role
key, database password, or `GROQ_API_KEY` in a `VITE_` variable.

The backend does not need a secret key for normal user requests. Reserve a
secret key for narrowly scoped, audited administration or one-time migration
scripts, and never commit it.

## 6. Implemented runtime architecture

1. React restores the Supabase browser session and listens for Auth changes.
2. Email magic-link sign-in creates or restores a private workspace.
3. One-click demo entry creates a unique Supabase anonymous session and seeds
   two dynamically dated showcase courses through the same protected API.
4. Every API request carries `Authorization: Bearer <access token>`.
5. Express verifies the token with `supabase.auth.getClaims(token)` and creates
   a request-scoped client using `accessToken: async () => token`.
6. `/api/health` remains public; every parsing and data route requires Auth.
7. Demo bootstrap/reset also require the verified boolean `is_anonymous` claim.
8. Course and item mutations use UUIDs rather than course names.
9. Reviewed confirmation uses the atomic `import_reviewed_course(...)` RPC.
10. `DELETE /api/account/data` deletes only the verified user's courses.
11. Parse metadata is reduced to an explicit allowlist before persistence.
12. `priority_score` is calculated when items are serialized, so deadlines
    automatically become more urgent without database updates.

## 7. Existing JSON data

The previous JSON store was shared and has no reliable owner IDs. It is no
longer used by the runtime. The safest production migration is to start
Supabase accounts empty.

The live product demo does not reuse this old JSON data or a shared demo user.
Every visitor receives a separate anonymous Auth user and fresh showcase data.

## 8. Production cutover checklist

1. Back up any JSON data that must be retained.
2. Apply and verify the migration in development.
3. Test the RPC and RLS with two users.
4. Configure Auth providers, Site URL, and redirects.
5. Enable anonymous sign-ins and test that two browser profiles receive different demo workspaces.
6. Add every Render and Vercel environment variable listed above.
7. Deploy the authenticated backend before the Auth-enabled frontend when
   coordinating the first production cutover.
8. Deploy the Auth-enabled frontend.
9. Confirm that raw document text is absent from database rows and logs.
10. Confirm no secret key appears in the Vite production bundle.
11. Sign out, sign in again, and verify the same account retains its data while
    a second account receives an empty, isolated workspace.
