import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { ArrowLeft, Bold, Italic, Redo2, Save, Trash2, Underline as U, Undo2, X } from 'lucide-react';
import { api, errMsg, fmtLong, Note, tz } from '../services/api';
import { useAuth } from '../context/AuthContext';

const DateHighlight = Extension.create({
  name: 'dateHighlight', addStorage() { return { text: '' }; },
  addProseMirrorPlugins() { const st = this.storage; return [new Plugin({ props: { decorations(state) {
    if (!st.text) return null; const decos: Decoration[] = [];
    state.doc.descendants((node, pos) => { if (node.isText) { const i = node.text!.indexOf(st.text); if (i >= 0) decos.push(Decoration.inline(pos + i, pos + i + st.text.length, { class: 'date-hl' })); } });
    return DecorationSet.create(state.doc, decos); } } })]; },
});
interface Det { title: string; date: string; time: string; matchedText: string; timeAssumed: boolean }

export default function Editor() {
  const { id } = useParams(); const nav = useNavigate(); const { cats, refreshCats } = useAuth();
  const [note, setNote] = useState<Note | null>(null); const [title, setTitle] = useState(''); const [catId, setCatId] = useState<string>('');
  const [det, setDet] = useState<Det | null>(null); const [dismissed, setDismissed] = useState<string[]>([]); const [modal, setModal] = useState(false);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [saving, setSaving] = useState(false);
  const editor = useEditor({ extensions: [StarterKit, Underline, DateHighlight], content: '', onUpdate: () => schedule() });
  const timer = useRef<number>();
  const schedule = () => { clearTimeout(timer.current); timer.current = window.setTimeout(detect, 600); };
  const detect = async () => {
    if (!editor) return; const text = editor.getText();
    try { const d = (await api.post('/dates/detect', { content: text, timeZone: tz })).data.detected as Det | null;
      (editor.storage.dateHighlight as any).text = d?.matchedText ?? ''; editor.view.dispatch(editor.state.tr.setMeta('dh', 1)); setDet(d); } catch { /* detection is best-effort */ }
  };
  useEffect(() => { if (!editor) return; api.get(`/notes/${id}`).then(r => { setNote(r.data); setTitle(r.data.title); setCatId(r.data.categoryId ?? ''); editor.commands.setContent(r.data.content); setTimeout(detect, 0); }).catch(() => nav('/notes')); }, [id, editor]);
  const save = async () => { if (!editor) return; setSaving(true); setErr('');
    try { await api.put(`/notes/${id}`, { title, content: editor.getHTML(), categoryId: catId || null }); await refreshCats(); setMsg('Saved'); setTimeout(() => setMsg(''), 2000); } catch (e) { setErr(errMsg(e)); } finally { setSaving(false); } };
  const del = async () => { if (!confirm('Delete this note?')) return; await api.delete(`/notes/${id}`); await refreshCats(); nav('/notes'); };
  const T = ({ on, active, children, label }: any) => <button aria-label={label} onClick={on} className={`p-2 rounded ${active ? 'bg-soft' : 'hover:bg-soft/60'}`}>{children}</button>;
  const show = det && !dismissed.includes(det.matchedText) && !note?.reminders.some(r => r.date === det.date && r.time === det.time);
  return <div className="flex flex-col min-h-screen">
    <div className="bg-white flex items-center gap-1 px-4 py-2 pl-14 md:pl-4 flex-wrap">
      <T on={() => nav(-1)} label="Back"><ArrowLeft size={20} /></T>
      <T on={() => editor?.chain().focus().undo().run()} label="Undo"><Undo2 size={20} /></T><T on={() => editor?.chain().focus().redo().run()} label="Redo"><Redo2 size={20} /></T>
      <span className="w-px h-6 bg-line mx-1" />
      <T on={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive('bold')} label="Bold"><Bold size={20} /></T>
      <T on={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive('italic')} label="Italic"><Italic size={20} /></T>
      <T on={() => editor?.chain().focus().toggleUnderline().run()} active={editor?.isActive('underline')} label="Underline"><U size={20} /></T>
      <span className="flex-1" />
      <span className="text-sm text-muted" role="status">{msg}</span>
      <select value={catId} onChange={e => setCatId(e.target.value)} aria-label="Category" className="bg-black/10 rounded-lg px-2 py-1.5 text-sm"><option value="">No category</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <T on={del} label="Delete note"><Trash2 size={20} /></T>
      <button onClick={save} disabled={saving} className="btn bg-primary text-white flex items-center gap-1"><Save size={18} />Save</button>
    </div>
    <div className="flex-1 p-4 md:p-8"><div className="bg-white rounded-xl p-6 md:p-8 max-w-3xl mx-auto min-h-[70vh]">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Untitled" className="w-full text-2xl font-bold outline-none mb-4" />
      <EditorContent editor={editor} />
      {err && <p role="alert" className="text-red-600 text-sm mt-3">{err}</p>}
      {show && det && <div className="mt-4 border border-line rounded-lg p-3 w-72">
        <div className="flex items-center gap-3"><span className="h-10 w-10 rounded bg-primary/10 text-primary font-bold grid place-items-center">{Number(det.date.slice(8))}</span>
          <div><div className="font-medium">Add Reminder?</div><div className="text-xs text-muted">{fmtLong(det.date, det.time)}{det.timeAssumed && ' (time assumed)'}</div></div></div>
        <div className="flex gap-2 mt-3"><button onClick={() => setModal(true)} className="btn !py-1 !text-xs bg-primary text-white">Add to Google Calendar</button>
          <button onClick={() => setDismissed([...dismissed, det.matchedText])} className="btn !py-1 !text-xs border border-line">Dismiss</button></div></div>}
    </div></div>
    {modal && det && <ReminderModal det={det} noteId={id!} onClose={() => setModal(false)} onDone={async () => { setModal(false); setMsg('Added to Google Calendar'); setNote(await (await api.get(`/notes/${id}`)).data); }} />}
  </div>;
}
function ReminderModal({ det, noteId, onClose, onDone }: { det: Det; noteId: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ title: det.title, date: det.date, time: det.time }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); setErr('');
    if (!f.title.trim() || !f.date || !f.time) { setErr('Enter a title, date and time.'); return setBusy(false); }
    try { await api.post('/reminders', { ...f, timeZone: tz, noteId }); onDone(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } };
  const inp = 'w-full border border-line rounded-lg px-3 py-2';
  return <div className="fixed inset-0 bg-black/40 grid place-items-center z-30 p-4" role="dialog" aria-modal="true" aria-label="Add to Google Calendar"><div className="bg-white rounded-xl p-6 w-full max-w-md">
    <div className="flex justify-between mb-4"><h2 className="font-bold">Add to Google Calendar</h2><button aria-label="Close" onClick={onClose}><X size={18} /></button></div>
    <label className="text-sm">Title<input className={inp} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
    <div className="grid grid-cols-2 gap-3 mt-3"><label className="text-sm">Date<input type="date" className={inp} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
      <label className="text-sm">Time<input type="time" className={inp} value={f.time} onChange={e => setF({ ...f, time: e.target.value })} /></label></div>
    {err && <p role="alert" className="text-red-600 text-sm mt-3">{err}</p>}
    <div className="flex justify-end gap-3 mt-5"><button onClick={onClose} className="btn text-muted">Dismiss</button><button disabled={busy} onClick={submit} className="btn bg-primary text-white">Add to Google Calendar</button></div></div></div>;
}
