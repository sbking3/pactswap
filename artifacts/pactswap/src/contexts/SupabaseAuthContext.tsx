import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface SupabaseAuthType {
  sbUser: User | null;
  session: Session | null;
  /** username from profiles / signup metadata, falls back to null */
  username: string | null;
  sbLoading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SupabaseAuthType>({
  sbUser: null,
  session: null,
  username: null,
  sbLoading: true,
  signOut: async () => {},
});

export const useSupabaseAuth = () => useContext(Ctx);

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [sbLoading, setSbLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSbLoading(false);
    }).catch(() => setSbLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const u = session?.user;
    if (!u) { setUsername(null); return; }
    const meta = (u.user_metadata?.username as string | undefined) ?? null;
    setUsername(meta);
    supabase.from("profiles").select("username").eq("id", u.id).maybeSingle()
      .then(({ data }) => { if (data?.username) setUsername(data.username); });
  }, [session?.user?.id]);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <Ctx.Provider value={{ sbUser: session?.user ?? null, session, username, sbLoading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
