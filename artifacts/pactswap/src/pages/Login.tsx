import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const { sbUser, sbLoading } = useSupabaseAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sbLoading && sbUser) {
      const next = new URLSearchParams(window.location.search).get("next");
      setLocation(next && next.startsWith("/") ? next : "/marketplace");
    }
  }, [sbLoading, sbUser, setLocation]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Logged in");
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card p-8 rounded-xl border border-border shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-muted-foreground text-sm">Log in with your email and password.</p>
        </div>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-background border-border" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="bg-background border-border" />
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-12">
            {busy && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            Log in
          </Button>
        </form>
        <div className="text-center text-sm text-muted-foreground mt-6 space-y-2">
          <p>
            Don't have an account?{" "}
            <Link href="/signup" className="text-primary hover:underline font-medium">Sign up</Link>
          </p>
          <p>
            <Link href="/login/wallet" className="text-primary hover:underline">Log in with wallet instead</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
