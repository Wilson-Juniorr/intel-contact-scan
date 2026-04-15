import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleInactivityLogout = useCallback(async () => {
    setShowTimeoutModal(true);
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (user) {
      timerRef.current = setTimeout(handleInactivityLogout, INACTIVITY_TIMEOUT_MS);
    }
  }, [user, handleInactivityLogout]);

  useEffect(() => {
    if (!user) return;

    const events = ["click", "keypress", "scroll", "mousemove", "touchstart"];
    const handler = () => resetTimer();

    events.forEach((evt) => window.addEventListener(evt, handler, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, resetTimer]);

  const confirmLogout = async () => {
    setShowTimeoutModal(false);
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
      {showTimeoutModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
          <div className="bg-card rounded-xl p-6 shadow-xl max-w-sm mx-4 space-y-4 text-center">
            <div className="text-4xl">⏰</div>
            <h2 className="text-lg font-bold text-foreground">Sessão expirada</h2>
            <p className="text-sm text-muted-foreground">
              Sua sessão expirou por inatividade. Faça login novamente para continuar.
            </p>
            <button
              onClick={confirmLogout}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition"
            >
              Fazer login
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
