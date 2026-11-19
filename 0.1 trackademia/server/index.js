/** Production entry point: validate env, wire real integrations, start HTTP server. */
import { createApp, buildServices } from './app.js';
import { loadConfig } from './config/env.js';
import { createDatabase } from './config/database.js';
import { logger } from './utils/logger.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  logger.error('config_invalid', { message: error.message });
  process.exit(1);
}

const database = createDatabase(config);
if (!config.features.database) logger.warn('supabase_not_configured', { hint: 'Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.' });
if (!config.features.ai) logger.warn('openai_not_configured', { hint: 'Deterministic date parsing will be used.' });

const services = buildServices({ config, database, logger });
const app = createApp({ config, services, logger });

const server = app.listen(config.port, () => {
  logger.info('server_started', { port: config.port, env: config.env, cors: config.corsOrigins });
});

function shutdown(signal) {
  logger.info('server_stopping', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error('unhandled_rejection', { cause: reason }));
