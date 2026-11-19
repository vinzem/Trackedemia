import { useEffect, useRef, useState } from 'react';
export const rtEnabled = () => localStorage.getItem('rt') !== 'off';
export const setRt = (on: boolean) => { localStorage.setItem('rt', on ? 'on' : 'off'); window.dispatchEvent(new Event('rt-toggle')); };
export type RtStatus = 'connected' | 'reconnecting' | 'off';
// Opens one SSE stream; calls onChange for every server push and after every reconnect (REST refetch fallback).
export function useRealtime(onChange: () => void): RtStatus {
  const [status, setStatus] = useState<RtStatus>(rtEnabled() ? 'reconnecting' : 'off'); const cb = useRef(onChange); cb.current = onChange;
  useEffect(() => {
    let es: EventSource | null = null, opened = false;
    const start = () => { es?.close(); es = null; if (!rtEnabled()) return setStatus('off');
      setStatus('reconnecting'); es = new EventSource('/api/calendar/stream', { withCredentials: true });
      es.onopen = () => { setStatus('connected'); if (opened) cb.current(); opened = true; };
      es.onerror = () => setStatus('reconnecting'); es.addEventListener('calendar', () => cb.current()); };
    start(); window.addEventListener('rt-toggle', start);
    return () => { window.removeEventListener('rt-toggle', start); es?.close(); };
  }, []);
  return status;
}
