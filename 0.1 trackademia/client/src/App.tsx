import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Landing from './pages/Landing'; import AppLayout from './layouts/AppLayout'; import NotesList from './pages/NotesList';
import Editor from './pages/Editor'; import CalendarPage from './pages/CalendarPage'; import Settings from './pages/Settings';
export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-muted">Loading…</div>;
  return <Routes>
    <Route path="/" element={user ? <Navigate to="/notes" /> : <Landing />} />
    <Route element={user ? <AppLayout /> : <Navigate to="/" />}>
      <Route path="/notes" element={<NotesList />} /><Route path="/category/:id" element={<NotesList />} />
      <Route path="/calendar" element={<CalendarPage />} /><Route path="/settings" element={<Settings />} />
    </Route>
    <Route path="/note/:id" element={user ? <AppLayout editor /> : <Navigate to="/" />}><Route index element={<Editor />} /></Route>
    <Route path="*" element={<Navigate to="/" />} />
  </Routes>;
}
