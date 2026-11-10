import { useEffect, useState } from 'react';
import { CalendarDays, LogOut, User } from 'lucide-react';
import { api, errMsg } from '../services/api';
import { useAuth } from '../context/AuthContext';
export default function Settings() {
  const { user, logout } = useAuth(); const [on, setOn] = useState<boolean | null>(null); const [err, setErr] = useState('');
  useEffect(() => { api.get('/calendar/status').then(r => setOn(r.data.connected)); }, []);
  const connect = async () => { try { location.href = (await api.post('/calendar/connect')).data.url; } catch (e) { setErr(errMsg(e)); } };
  const disconnect = async () => { await api.post('/calendar/disconnect'); setOn(false); };
  return <div className="max-w-xl"><h1 className="text-3xl font-bold mb-6">Settings</h1>
    <section className="bg-white rounded-xl p-4 mb-6"><p className="text-xs text-muted">Profile</p><div className="flex items-center gap-3 mt-1">
      {user?.image ? <img src={user.image} className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" /> : <span className="h-10 w-10 rounded-full bg-soft grid place-items-center"><User size={20} className="text-primary" /></span>}
      <div><div className="text-lg font-medium">{user?.name}</div><div className="text-xs text-muted">{user?.email}</div></div></div></section>
    <section className="bg-white rounded-xl p-4 mb-4"><p className="text-xs text-muted">Connected accounts</p><div className="flex items-center gap-3 mt-1 flex-wrap">
      <CalendarDays size={36} className="text-primary" /><div className="flex-1"><div className="text-lg font-medium">Google Calendar</div>
        <span className={`text-xs rounded px-2 py-0.5 ${on ? 'bg-green-200' : 'bg-black/10'}`}>{on === null ? '…' : on ? 'Connected' : 'Not connected'}</span></div>
      {on ? <button onClick={disconnect} className="btn border border-red-300 text-red-600 !py-1 !text-xs">Disconnect</button> : <button onClick={connect} className="btn bg-primary text-white !py-1 !text-xs">Connect Google Calendar</button>}</div>
      {err && <p role="alert" className="text-red-600 text-sm mt-2">{err}</p>}</section>
    <button onClick={logout} className="btn bg-white flex items-center gap-2 !text-xs"><LogOut size={14} />Log out</button></div>;
}
