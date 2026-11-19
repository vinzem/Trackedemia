import { google } from 'googleapis';
import { env } from '../config/env';
// Sign-in only: identity scopes, no calendar access, no token storage.
export const oauth = () => new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_CALLBACK_URL);
export const authUrl = () => oauth().generateAuthUrl({ scope: ['openid', 'email', 'profile'], prompt: 'select_account' });
