/** Builds the real Express app wired to in-memory Supabase and Google fakes. */
import { buildServices, createApp } from '../../server/app.js';
import { loadConfig } from '../../server/config/env.js';
import { unauthorized } from '../../server/utils/errors.js';
import { createLogger } from '../../server/utils/logger.js';
import { createFakeGoogle } from './fake-google.js';
import { createFakeSupabase } from './fake-supabase.js';

export const TEST_ENCRYPTION_KEY = 'a'.repeat(64);

export function createTestContext({ openai, withGoogle = true, withOpenAI = Boolean(openai), rateLimit = false } = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    APP_URL: 'http://localhost:5173',
    API_URL: 'http://localhost:8787',
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    ...(withGoogle ? { GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret' } : {}),
    ...(withOpenAI ? { OPENAI_API_KEY: 'sk-test' } : {}),
  });
  const supabase = createFakeSupabase();
  const google = createFakeGoogle({ openai });
  const users = new Map();

  const authService = {
    async verifyAccessToken(token) {
      const user = users.get(token);
      if (!user) throw unauthorized('Invalid session.', 'invalid_session');
      return user;
    },
    userDb(token) {
      return supabase.forUserId(users.get(token).id);
    },
  };

  const logger = createLogger({ level: 'silent' });
  const services = buildServices({ config, database: { admin: supabase.admin }, fetchImpl: google.fetch, logger, authService });
  const app = createApp({ config, services, logger, rateLimit });

  function addUser({ id, email = `${id}@example.com`, name = 'Test User' }) {
    const token = `test-token-${id}-xxxxxxxxxxxxxxxx`;
    users.set(token, { id, email, name, emailConfirmed: true, provider: 'email' });
    return { id, token, auth: { Authorization: `Bearer ${token}` } };
  }

  return { app, config, services, supabase, google, addUser };
}
