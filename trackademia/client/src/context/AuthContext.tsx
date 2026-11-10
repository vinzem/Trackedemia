import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, Category } from '../services/api';
interface User { id: string; name: string; email: string; image?: string }
const Ctx = createContext<{ user: User | null; loading: boolean; cats: Category[]; refreshCats: () => Promise<void>; logout: () => Promise<void> }>(null as any);
export const useAuth = () => useContext(Ctx);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true); const [cats, setCats] = useState<Category[]>([]);
  const refreshCats = async () => setCats((await api.get('/categories')).data);
  useEffect(() => { api.get('/auth/me').then(async r => { setUser(r.data); await refreshCats(); }).catch(() => setUser(null)).finally(() => setLoading(false)); }, []);
  const logout = async () => { await api.post('/auth/logout'); setUser(null); setCats([]); };
  return <Ctx.Provider value={{ user, loading, cats, refreshCats, logout }}>{children}</Ctx.Provider>;
}
