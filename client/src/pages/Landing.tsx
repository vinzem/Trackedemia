import { CalendarDays, ClipboardList, WandSparkles } from 'lucide-react';
const F = [[WandSparkles, 'Smart date detection', 'Phrases like “next Saturday at 9am” get highlighted.'], [CalendarDays, 'Auto-sync to Google Calendar', 'Add a reminder in one tap.'], [ClipboardList, 'Distraction-free notes', 'A clean editor and quick search.']] as const;
export default function Landing() {
  const failed = new URLSearchParams(location.search).get('error');
  return <div className="min-h-screen bg-soft flex flex-col items-center justify-center px-4 py-12 text-center">
    <h1 className="logo text-5xl md:text-6xl">Trackademia</h1>
    <h2 className="mt-8 text-2xl font-bold max-w-xs">Type naturally. We do the rest.</h2>
    <p className="mt-4 text-muted max-w-sm">Write your notes the way you think. Trackademia spots dates and turns them into reminders.</p>
    <a href="/api/auth/google" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 font-medium shadow-sm hover:shadow">
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 010-9.4l-7.9-6.1a24 24 0 000 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>Continue with Google</a>
    {failed && <p role="alert" className="mt-3 text-sm text-red-600">Google sign-in failed. Try again.</p>}
    <div className="mt-12 grid gap-4 sm:grid-cols-3 max-w-3xl w-full">{F.map(([I, t, d]) => <div key={t} className="bg-white rounded-xl p-5 flex flex-col items-center">
      <span className="h-12 w-12 rounded-lg bg-soft grid place-items-center mb-3"><I className="text-primary" /></span><h3 className="font-medium">{t}</h3><p className="text-sm text-muted mt-2">{d}</p></div>)}</div>
  </div>;
}
