# Trackademia
Notes with automatic date detection and a built-in real-time calendar (PostgreSQL + Server-Sent Events). Google is used for sign-in only: no Calendar scopes, no stored Google tokens.
## Setup
1. **Database**: `createdb trackademia` (PostgreSQL 14+).
2. **Google sign-in**: console.cloud.google.com → new project → OAuth consent screen (add yourself as a test user) → Credentials → OAuth client ID (Web). Redirect URI: `http://localhost:4000/api/auth/google/callback`. No Calendar API needed.
3. **Server**: `cd server && cp .env.example .env`. Fill `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `SESSION_SECRET` (`openssl rand -hex 32`). `ENCRYPTION_KEY` is unused. Then `npm i && npx prisma migrate dev --name init && npm run dev` (port 4000).
4. **Client**: `cd client && npm i && npm run dev`, then open http://localhost:5173.
## Real-time
`GET /api/calendar/stream` (SSE, cookie-authenticated, per-user). Events are saved first, then broadcast. The client reconnects automatically and refetches over REST. Duplicate saves are blocked by an idempotency key. Test: open the calendar in two tabs, add a reminder in one, and watch it appear in the other.
## Deploy
Build each package (`npm run build`), run `node dist/server.js` with `NODE_ENV=production` over HTTPS, serve `client/dist` from the same site, and make sure your proxy doesn't buffer `/api/calendar/stream`. Add the production redirect URI in Google Console, then `npx prisma migrate deploy`.
