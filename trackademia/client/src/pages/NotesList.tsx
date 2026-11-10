import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, Plus, Search } from 'lucide-react';
import { api, errMsg, fmt, Note, plain } from '../services/api';
import { useAuth } from '../context/AuthContext';
export default function NotesList() {
  const { id } = useParams(); const nav = useNavigate(); const { cats, refreshCats } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]); const [total, setTotal] = useState(0); const [q, setQ] = useState(''); const [err, setErr] = useState('');
  const cat = cats.find(c => c.id === id);
  const load = useCallback(() => api.get('/notes', { params: { q: q || undefined, categoryId: id } }).then(r => { setNotes(r.data.notes); setTotal(r.data.total); }).catch(e => setErr(errMsg(e))), [q, id]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const create = async () => { const r = await api.post('/notes', { title: '', content: '', categoryId: id ?? null }); await refreshCats(); nav(`/note/${r.data.id}`); };
  const Badge = ({ n }: { n: Note }) => n.category ? <span className="rounded-lg bg-black/10 px-3 py-1 text-sm inline-flex items-center gap-1.5 whitespace-nowrap"><i className="h-2 w-2 rounded-full" style={{ background: n.category.color }} />{n.category.name}</span> : null;
  return <div>
    <header className="flex flex-wrap items-end gap-3 mb-6">
      <div className="flex-1 min-w-40"><h1 className="text-3xl font-bold flex items-center gap-2">{cat && <i className="h-2.5 w-2.5 rounded-full" style={{ background: cat.color }} />}{cat?.name ?? 'All Notes'}</h1><p className="text-sm text-muted">{total} {total === 1 ? 'note' : 'notes'}</p></div>
      <label className="flex items-center gap-2 bg-white rounded-lg px-3 py-2"><Search size={18} className="text-muted" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search notes" className="outline-none bg-transparent w-40" /></label>
      <button onClick={create} className="btn bg-primary text-white flex items-center gap-1"><Plus size={18} />New Note</button>
    </header>
    {err && <p role="alert" className="text-red-600 mb-3">{err}</p>}
    {!notes.length && <p className="text-muted">{q ? 'No notes match your search.' : 'No notes yet. Select New Note to start.'}</p>}
    {id ? <div className="grid gap-4 sm:grid-cols-2">{notes.map(n => <Link key={n.id} to={`/note/${n.id}`} className="bg-white rounded-lg p-4 block">
      <div className="flex justify-between"><h3 className="font-bold text-sm">{n.title || 'Untitled'}</h3>{n.reminders.length > 0 && <CalendarDays size={18} className="text-primary" />}</div>
      <p className="text-sm text-muted mt-2 line-clamp-2">{plain(n.content)}</p><p className="text-xs text-muted mt-3">{new Date(n.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p></Link>)}</div>
    : <div className="space-y-2">{notes.map(n => <Link key={n.id} to={`/note/${n.id}`} className="bg-white rounded-lg px-4 py-3 flex items-center gap-3">
      <span className="w-40 shrink-0 truncate">{n.title || 'Untitled'}</span><span className="flex-1 truncate text-muted text-sm hidden sm:block">{plain(n.content)}</span>
      <Badge n={n} />{n.reminders.length > 0 ? <CalendarDays size={20} className="text-primary" /> : <span className="w-5" />}<span className="w-14 text-right text-sm text-muted">{fmt(n.updatedAt)}</span></Link>)}</div>}
  </div>;
}
