# Trackademia
## Setup
1. **Database**: `createdb trackademia` (PostgreSQL 14+).
2. **Google OAuth**: console.cloud.google.com → new project → enable *Google Calendar API* → OAuth consent screen (add scope `calendar.events`, add yourself as test user) → Credentials → OAuth client ID (Web). Authorized redirect URI: `http://localhost:4000/api/auth/google/callback`.
3. **Server**: `cd server && cp .env.example .env` (fill values; generate secrets with `openssl rand -hex 32`), then `npm i && npx prisma migrate dev --name init && npm run dev` (port 4000).
4. **Client**: `cd client && npm i && npm run dev` (port 5173, proxies /api to 4000). Open http://localhost:5173.
## Deploy
Build `npm run build` in each; run `node dist/server.js` with `NODE_ENV=production` behind HTTPS (cookies become `Secure`), set `FRONTEND_URL` to the client origin, serve `client/dist` from the same site (or a reverse proxy routing /api), add the production redirect URI in Google Console, and run `npx prisma migrate deploy`.
