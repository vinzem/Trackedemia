# Trackademia

Trackademia turns dates in your notes into events in a first-party calendar. Saving a note automatically adds detected future events; changing or removing a detected date updates or removes its linked calendar event. Events are stored with your account and do not require Google Calendar access or sync.

## Setup

1. Use Node.js 20.10 or later and create a Supabase project.
2. Run [`supabase/migrations/20261103000000_initial_schema.sql`](./supabase/migrations/20261103000000_initial_schema.sql) in the Supabase SQL editor.
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. `OPENAI_API_KEY` is optional.
4. From this folder, run `npm install` and `npm run dev`, then open http://localhost:5173.

The app's sign-in screen uses email and password. Trackademia does not connect to Google Calendar or create, update, or delete events in a Google account.

## Checks

- `npm test` runs unit and API tests.
- `npm run build` builds the web app.
- `npm run test:e2e` runs browser tests (requires Playwright Chromium).
