import { Response } from 'express';
// Per-user SSE hub: a user's events are only ever written to that user's own connections.
const clients = new Map<string, Set<Response>>();
export const subscribe = (userId: string, res: Response) => {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);
  return () => { const s = clients.get(userId); s?.delete(res); if (s && !s.size) clients.delete(userId); };
};
export const connections = (userId: string) => clients.get(userId)?.size ?? 0;
export const broadcast = (userId: string, type: 'created' | 'updated' | 'deleted' | 'refresh', data: object = {}) => {
  const msg = `event: calendar\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  clients.get(userId)?.forEach(r => r.write(msg));
};
