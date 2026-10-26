import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, onUnauthorized, tokens, type Realm } from './api';
import type { Account } from './types';

interface Admin {
  id: string;
  name: string;
  email: string;
}
interface SessionState<T> {
  user: T | null;
  loading: boolean;
  signIn: (token: string, user: T) => void;
  signOut: () => void;
}

/* One sign-in per realm (student portal, tracking panel): the token in this browser plus who it belongs to. */
function useRealmSession<T>(realm: Realm, mePath: string): SessionState<T> {
  const [user, setUser] = useState<T | null>(null);
  const [loading, setLoading] = useState(() => !!tokens.get(realm));
  useEffect(() => {
    onUnauthorized(realm, () => setUser(null));
    if (!tokens.get(realm)) return;
    api<T>(mePath, { realm })
      .then((r) => setUser(r.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    return () => onUnauthorized(realm, null);
  }, [realm, mePath]);
  /* Signed out in another tab (the token was removed from this browser): this tab follows. */
  useEffect(() => {
    const onStorage = () => {
      if (!tokens.get(realm)) setUser(null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [realm]);
  const signIn = useCallback(
    (token: string, u: T) => {
      tokens.set(realm, token);
      setUser(u);
    },
    [realm],
  );
  const signOut = useCallback(() => {
    tokens.clear(realm);
    setUser(null);
  }, [realm]);
  return useMemo(() => ({ user, loading, signIn, signOut }), [user, loading, signIn, signOut]);
}

const StudentCtx = createContext<SessionState<Account> | null>(null);
const ManageCtx = createContext<SessionState<Admin> | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const student = useRealmSession<Account>('student', '/me');
  const manage = useRealmSession<Admin>('manage', '/manage/me');
  return (
    <StudentCtx.Provider value={student}>
      <ManageCtx.Provider value={manage}>{children}</ManageCtx.Provider>
    </StudentCtx.Provider>
  );
}

export const useStudent = () => useContext(StudentCtx)!;
export const useManage = () => useContext(ManageCtx)!;

export function RequireStudent({ children }: { children: ReactNode }) {
  const { user, loading } = useStudent();
  const location = useLocation();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function RequireManage({ children }: { children: ReactNode }) {
  const { user, loading } = useManage();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/manage/login" replace />;
  return <>{children}</>;
}
