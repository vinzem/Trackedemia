import axios from 'axios';
export const api = axios.create({ baseURL: '/api', withCredentials: true, headers: { 'X-Requested-With': 'trackademia' } });
export const errMsg = (e: any) => e?.response?.data?.error || 'Something went wrong. Try again.';
export const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
export interface Category { id: string; name: string; color: string; noteCount: number }
export interface Note { id: string; title: string; content: string; categoryId: string | null; category: Category | null; updatedAt: string; createdAt: string; reminders: { id: string; date: string; time: string }[] }
export const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
export const fmt = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const fmtLong = (date: string, time: string) => new Date(`${date}T${time}`).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(',', ',').replace(/, (\d)/, ' at $1').replace(/^(\w+), (\w+ \d+)/, '$1, $2');
