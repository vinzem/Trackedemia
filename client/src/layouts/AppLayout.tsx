import { NavLink, Outlet } from 'react-router-dom';
import { Calendar, ClipboardList, Settings, User, Menu } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
export const Logo = () => <div className="logo text-2xl leading-none text-center">Trackademia</div>;
export default function AppLayout({ editor }: { editor?: boolean }) {
  const { user, cats } = useAuth(); const [open, setOpen] = useState(false);
  const item = ({ isActive }: { isActive: boolean }) => `flex items-center gap-3 rounded-lg px-3 py-2 ${isActive ? 'bg-soft text-ink font-medium' : 'text-muted hover:bg-soft/50'}`;
  return <div className="flex min-h-screen">
    <button aria-label="Menu" className="md:hidden fixed top-3 left-3 z-20 bg-white rounded-lg p-2" onClick={() => setOpen(!open)}><Menu size={20} /></button>
    <aside className={`${open ? 'flex' : 'hidden'} md:flex fixed md:sticky top-0 z-10 h-screen w-64 shrink-0 flex-col bg-side border-r border-line`}>
      <div className="p-6"><Logo /></div>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto" onClick={() => setOpen(false)}>
        <NavLink to="/notes" end className={item}><ClipboardList size={20} />All Notes</NavLink>
        {cats.map(c => <NavLink key={c.id} to={`/category/${c.id}`} className={item}><span className="ml-1 mr-1 h-2 w-2 rounded-full" style={{ background: c.color }} /><span className="flex-1">{c.name}</span><span className="text-xs text-muted">{c.noteCount}</span></NavLink>)}
        <NavLink to="/calendar" className={item}><Calendar size={20} />Calendar</NavLink>
        <NavLink to="/settings" className={item}><Settings size={20} />Settings</NavLink>
      </nav>
      <div className="border-t border-line p-4 flex items-center gap-3">
        {user?.image ? <img src={user.image} className="h-9 w-9 rounded-full" referrerPolicy="no-referrer" /> : <span className="h-9 w-9 rounded-full bg-soft grid place-items-center"><User size={18} className="text-primary" /></span>}
        <div className="min-w-0"><div className="font-medium truncate">{user?.name}</div><div className="text-xs text-muted truncate">{user?.email}</div></div>
      </div>
    </aside>
    <main className={`flex-1 min-w-0 ${editor ? '' : 'p-6 pt-14 md:p-8'}`}><Outlet /></main>
  </div>;
}
