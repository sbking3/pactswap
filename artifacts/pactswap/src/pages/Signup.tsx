import { useState } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Signup() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      if (error) throw error;
      if (!data.user) throw new Error("Signup failed");

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: data.user.id,
        email,
        username,
        wallet_address: walletAddress || null,
      });
      if (profileError) {
        toast.error(`Account created, but saving profile failed: ${profileError.message}`);
      }

      if (data.session) {
        toast.success("Account created");
        setLocation("/marketplace");
      } else {
        toast.success("Account created. Check your email to confirm, then log in.");
        setLocation("/login");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Signup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card p-8 rounded-xl border border-border shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-muted-foreground text-sm">Join PACTSWAP to trade securely.</p>
        </div>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" required value={username} onChange={(e) => setUsername(e.target.value)} className="bg-background border-border" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-background border-border" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="bg-background border-border" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wallet">Wallet address</Label>
            <Input id="wallet" placeholder="0x…" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value.trim())} className="bg-background border-border font-mono" />
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-12">
            {busy && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            Sign up
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">Log in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
