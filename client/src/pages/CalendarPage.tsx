import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../services/api';
interface R { id: string; title: string; date: string; time: string; note?: { id: string; category?: { color: string } | null } | null }
const p2 = (n: number) => String(n).padStart(2, '0');
export default function CalendarPage() {
  const nav = useNavigate(); const [cur, setCur] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [rs, setRs] = useState<R[]>([]); const [sel, setSel] = useState<R | null>(null);
  const y = cur.getFullYear(), m = cur.getMonth(), first = cur.getDay(), days = new Date(y, m + 1, 0).getDate(), rows = Math.ceil((first + days) / 7);
  useEffect(() => { api.get('/reminders', { params: { from: `${y}-${p2(m + 1)}-01`, to: `${y}-${p2(m + 1)}-31` } }).then(r => setRs(r.data)); }, [y, m]);
  const now = new Date(); const isToday = (d: number) => now.getFullYear() === y && now.getMonth() === m && now.getDate() === d;
  const B = 'rounded-lg border border-line bg-white/60 px-3 py-1.5';
  return <div>
    <header className="flex items-center gap-2 mb-6"><h1 className="text-3xl font-bold flex-1">{cur.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h1>
      <button aria-label="Previous month" className={B} onClick={() => setCur(new Date(y, m - 1, 1))}><ChevronLeft size={18} /></button>
      <button className={B} onClick={() => setCur(new Date(now.getFullYear(), now.getMonth(), 1))}>Today</button>
      <button aria-label="Next month" className={B} onClick={() => setCur(new Date(y, m + 1, 1))}><ChevronRight size={18} /></button></header>
    <div className="bg-white rounded-xl overflow-hidden border border-line overflow-x-auto"><div className="min-w-[560px]">
      <div className="grid grid-cols-7 bg-soft text-center font-medium py-3">{['Sun', 'Mon', 'Tues', 'Weds', 'Thurs', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}</div>
      <div className="grid grid-cols-7" style={{ gridTemplateRows: `repeat(${rows}, minmax(90px, 1fr))` }}>
        {Array.from({ length: rows * 7 }, (_, i) => { const d = i - first + 1, ok = d >= 1 && d <= days; const key = `${y}-${p2(m + 1)}-${p2(d)}`;
          return <div key={i} className="border-t border-l border-line p-1.5 text-sm">{ok && <><span className={isToday(d) ? 'bg-primary text-white rounded-full px-1.5' : ''}>{d}</span>
            {rs.filter(r => r.date === key).map(r => <button key={r.id} onClick={() => setSel(r)} className="block w-full truncate rounded bg-soft text-left text-xs font-medium px-1 mt-1">{r.title}</button>)}</>}</div>; })}</div></div></div>
    {sel && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-30" onClick={() => setSel(null)}><div className="bg-white rounded-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
      <h2 className="font-bold text-lg">{sel.title}</h2><p className="text-muted mt-1">{new Date(`${sel.date}T${sel.time}`).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</p>
      <div className="flex justify-end gap-3 mt-5">{sel.note && <button className="btn bg-primary text-white" onClick={() => nav(`/note/${sel.note!.id}`)}>Open note</button>}<button className="btn text-muted" onClick={() => setSel(null)}>Close</button></div></div></div>}
  </div>;
}
