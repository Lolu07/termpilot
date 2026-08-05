# Supabase migration guide

This package prepares TermPilot for per-user Supabase Auth and persistent
Postgres storage. Applying the SQL migration alone does **not** change the
current application: Express continues using `backend/src/data/db.json` until a
later runtime cutover.

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
2. Express remains the only application API. The first runtime cutover should
   use `@supabase/supabase-js` directly: verify each bearer token with
   `supabase.auth.getClaims(token)`, then create a caller-scoped client using
   the `accessToken` option so database calls retain the user's RLS context.
   Supabase currently recommends `@supabase/server` for header-based runtimes,
   but it has no first-party Express adapter; reassess it when implementing the
   cutover instead of forcing an unsupported adapter into this app.
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
Choose the initial login method before the runtime work begins:

- Email magic link is the smallest first release.
- Google OAuth is lower-friction for recruiters but requires a Google OAuth
  client ID and secret.
- A public, static read-only sample workspace can demonstrate the product
  without giving unauthenticated visitors database or Groq access.

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

## 3. Verify RLS before application cutover

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
entire import. A duplicate course raises SQLSTATE `23505`; the API should map
that to HTTP `409` and request explicit replacement confirmation.

## 5. Runtime environment variables for the later cutover

These are placeholders for the future code change; the migration does not read
them.

Render backend:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Vercel frontend:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Publishable keys are expected to be visible in browser bundles. Their safety
depends on correct RLS. Never put a Supabase secret key, legacy service-role
key, database password, or `GROQ_API_KEY` in a `VITE_` variable.

The backend does not need a secret key for normal user requests. Reserve a
secret key for narrowly scoped, audited administration or one-time migration
scripts, and never commit it.

## 6. Application cutover map

Implement the runtime migration in a separate change:

1. Add Supabase Auth session handling to the React app.
2. Attach the current access token as `Authorization: Bearer <token>` in
   `frontend/src/api.js`.
3. Add Express authentication middleware that extracts the bearer token,
   verifies it with `supabase.auth.getClaims(token)`, and creates a new
   `@supabase/supabase-js` client for that request using
   `accessToken: async () => token`. Do not use the older global custom
   `Authorization` header pattern, and never mutate one global client with
   different users' sessions. Revisit `@supabase/server` if it adds a suitable
   Express integration before this cutover ships.
4. Replace synchronous functions in `backend/src/storage.js` with async
   Postgres repository functions that accept the request-scoped client.
5. Keep `/api/health` public; require Auth for parsing and every data route.
6. Change course routes and React selection state from course names to UUIDs.
7. Route reviewed confirmation through `import_reviewed_course(...)`.
8. Replace the global `/api/reset` with an authenticated “delete my data” route
   that deletes only rows where `user_id` equals the verified user.
9. Whitelist parse metadata before calling the RPC: engine, input type, counts,
   page count, filename, request ID, warning, and reviewed status only.
10. Calculate `priority_score` after reading items so it remains current.
11. Keep the old JSON API temporarily under a versioned route if a zero-downtime
    frontend/backend rollout is required, then remove it after verification.

## 7. Existing JSON data

The current JSON store is shared and has no reliable owner IDs. The safest
production migration is to start Supabase accounts empty.

If the sample data must be retained, first create a dedicated demo Auth user,
then run a one-time local admin script that assigns every imported course and
item to that user's UUID. Do not attribute shared records to a real user, and do
not deploy the admin key or migration script as part of the web application.

## 8. Production cutover checklist

1. Back up any JSON data that must be retained.
2. Apply and verify the migration in development.
3. Test the RPC and RLS with two users.
4. Configure Auth providers, Site URL, and redirects.
5. Add Render and Vercel environment variables.
6. Deploy the authenticated backend routes before pointing the frontend at
   them, or use parallel versioned APIs.
7. Deploy the Auth-enabled frontend.
8. Confirm that raw document text is absent from database rows and logs.
9. Confirm no secret key appears in the Vite production bundle.
10. Retire `db.json` and the shared reset endpoint only after the new path is
    stable.
