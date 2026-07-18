import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Wallet, ArrowRight, ShieldCheck } from "lucide-react";

export default function Signup() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [walletAddress, setWalletAddress] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleConnectWallet = async () => {
    try {
      if (!window.ethereum) {
        toast.error("MetaMask or Web3 wallet not detected. Please install a wallet extension.");
        return;
      }
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accounts && accounts[0]) {
        setWalletAddress(accounts[0]);
        toast.success("Wallet connected!");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to connect wallet.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress || !name || !email) {
      toast.error("Please fill in all fields and connect your wallet.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, name, email }),
      });
      const data = await res.json();
      if (!res.ok) throw { data };
      login(data.token, data.user.walletAddress);
      toast.success("Account created! Welcome to PACTSWAP.");
      setLocation("/dashboard");
    } catch (error: any) {
      const msg = error?.data?.error || error?.message || "Registration failed.";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card p-8 rounded-xl border border-border shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-muted-foreground text-sm">Join PACTSWAP to trade securely.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>Web3 Wallet</Label>
            {walletAddress ? (
              <div className="flex items-center justify-between p-3 border border-primary/50 bg-primary/5 rounded-md text-sm font-mono text-primary">
                <span className="truncate mr-2">{walletAddress}</span>
                <ShieldCheck className="h-5 w-5 flex-shrink-0" />
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full border-border border-dashed hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-all h-12"
                onClick={handleConnectWallet}
              >
                <Wallet className="mr-2 h-5 w-5" /> Connect Wallet
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              placeholder="John Doe"
              value={name}
              onChange={e => setName(e.target.value)}
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="bg-background border-border"
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-12 mt-2"
            disabled={isLoading || !walletAddress || !name || !email}
          >
            {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
            Create Account <ArrowRight className="ml-2 h-5 w-5" />
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
