/**
 * Loads and validates environment configuration once at startup.
 * Core variables are required in production; optional OpenAI is reported as
 * disabled when absent so local development still runs.
 */
import 'dotenv/config';
import { z } from 'zod';

const optionalString = z.string().trim().optional().transform((value) => value || undefined);
const optionalUrl = z.string().trim().url().optional().or(z.literal('')).transform((value) => value || undefined);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  APP_URL: z.string().trim().url().default('http://localhost:5173'),
  API_URL: z.string().trim().url().default('http://localhost:8787'),
  CORS_ORIGINS: optionalString,
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  SUPABASE_URL: optionalUrl,
  SUPABASE_ANON_KEY: optionalString,
  VITE_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,

  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().trim().default('gpt-4o-mini'),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),
});

export function loadConfig(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const env = parsed.data;
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

  const config = {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    appUrl: env.APP_URL.replace(/\/$/, ''),
    apiUrl: env.API_URL.replace(/\/$/, ''),
    corsOrigins: (env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',') : [env.APP_URL]).map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
    trustProxy: env.TRUST_PROXY,
    supabase: { url: env.SUPABASE_URL, anonKey, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY },
    openai: { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL, timeoutMs: env.OPENAI_TIMEOUT_MS },
  };

  config.features = {
    database: Boolean(config.supabase.url && config.supabase.anonKey && config.supabase.serviceRoleKey),
    ai: Boolean(config.openai.apiKey),
  };

  if (config.isProduction) {
    const missing = [];
    if (!config.features.database) missing.push('SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
    if (missing.length) throw new Error(`Missing required production configuration: ${missing.join('; ')}`);
  }
  return config;
}
