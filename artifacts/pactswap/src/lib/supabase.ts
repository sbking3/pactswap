import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

if (!supabaseConfigured) {
  console.warn("Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time.");
}

// Placeholder values keep the app rendering when the vars are missing;
// auth calls will fail with a clear error instead of crashing at import.
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key",
);
