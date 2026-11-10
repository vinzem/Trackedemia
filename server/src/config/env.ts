import 'dotenv/config';
const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`Missing env ${k}`); return v; };
export const env = {
  DATABASE_URL: need('DATABASE_URL'), GOOGLE_CLIENT_ID: need('GOOGLE_CLIENT_ID'), GOOGLE_CLIENT_SECRET: need('GOOGLE_CLIENT_SECRET'),
  GOOGLE_CALLBACK_URL: need('GOOGLE_CALLBACK_URL'), SESSION_SECRET: need('SESSION_SECRET'),
  FRONTEND_URL: need('FRONTEND_URL'), BACKEND_URL: need('BACKEND_URL'), ENCRYPTION_KEY: need('ENCRYPTION_KEY'),
  prod: process.env.NODE_ENV === 'production',
};
