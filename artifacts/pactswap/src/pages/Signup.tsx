import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Wallet, ArrowRight, ShieldCheck, AlertTriangle, RefreshCw } from "lucide-react";

// Direct fetch helpers — new signup-specific endpoints
const API = (path: string) => path; // relative paths work via Replit routing

async function apiPost(path: string, body: object) {
  const token = localStorage.getItem("pactswap_token");
  const res = await fetch(API(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data?.error ?? "Request failed"), { data });
  return data;
}

export default function Signup() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [walletAddress, setWalletAddress] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<Date | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const handleConnectWallet = async () => {
    try {
      if (!window.ethereum) {
        toast.error("MetaMask or Web3 wallet not detected. Please install a wallet extension.");
        return;
      }
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accounts?.[0]) {
        setWalletAddress(accounts[0]);
        toast.success("Wallet connected!");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to connect wallet.");
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress || !email || !name) {
      toast.error("Please fill in all fields.");
      return;
    }
    setSendLoading(true);
    try {
      const data = await apiPost("/api/auth/send-signup-otp", { email, walletAddress, name });
      if (data?.devCode) {
        setDevCode(data.devCode);
        setOtp(data.devCode);
        toast.info("Code pre-filled — Resend not configured in this environment.");
      } else {
        toast.success("Verification code sent! Check your inbox.");
      }
      setAttemptsLeft(3);
      setBlockedUntil(null);
      setStep(2);
    } catch (err: any) {
      toast.error(err?.data?.error ?? err.message ?? "Failed to send code.");
    } finally {
      setSendLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      toast.error("Please enter the 6-digit code.");
      return;
    }
    if (blockedUntil && new Date() < blockedUntil) {
      const secs = Math.ceil((blockedUntil.getTime() - Date.now()) / 1000);
      toast.error(`Too many wrong attempts. Try again in ${secs}s.`);
      return;
    }
    setVerifyLoading(true);
    try {
      const data = await apiPost("/api/auth/verify-signup-otp", {
        email,
        code: otp,
        walletAddress,
        name,
      });
      toast.success("Account created! Welcome to PACTSWAP.");
      login(data.token, data.user.walletAddress);
      setLocation("/dashboard");
    } catch (err: any) {
      const errData = err?.data;
      if (errData?.attemptsLeft !== undefined) {
        setAttemptsLeft(errData.attemptsLeft);
        if (errData.attemptsLeft === 0) {
          const until = new Date(Date.now() + 5 * 60 * 1000);
          setBlockedUntil(until);
          toast.error("Too many wrong attempts. Blocked for 5 minutes.");
        } else {
          toast.error(`Wrong code. ${errData.attemptsLeft} attempt${errData.attemptsLeft === 1 ? "" : "s"} remaining.`);
        }
      } else if (errData?.blockedUntil) {
        const until = new Date(errData.blockedUntil);
        setBlockedUntil(until);
        const mins = Math.ceil((until.getTime() - Date.now()) / 60000);
        toast.error(`Account temporarily blocked. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
      } else {
        toast.error(errData?.error ?? err.message ?? "Verification failed.");
      }
    } finally {
      setVerifyLoading(false);
    }
  };

  const isBlocked = blockedUntil !== null && new Date() < blockedUntil;
  const blockedMins = blockedUntil ? Math.ceil((blockedUntil.getTime() - Date.now()) / 60000) : 0;

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card p-8 rounded-xl border border-border shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-muted-foreground text-sm">Join PACTSWAP to trade securely.</p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleSendOtp} className="space-y-5">
            {/* Wallet */}
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

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Full Name (must match bank account)</Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={name}
                onChange={e => setName(e.target.value)}
                className="bg-background border-border"
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="bg-background border-border"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-12 mt-2"
              disabled={sendLoading || !walletAddress || !name || !email}
            >
              {sendLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Send Verification Code <ArrowRight className="ml-2 h-5 w-5" />
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">Log in</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            {/* Header */}
            <div className="space-y-2 text-center mb-2">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-3">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <p className="font-semibold text-white">Enter Verification Code</p>
              <p className="text-xs text-muted-foreground mt-1">
                {devCode
                  ? <>Code pre-filled — <span className="text-yellow-400 font-mono font-bold">{devCode}</span></>
                  : <>Sent via Resend to <span className="text-white font-medium">{email}</span></>
                }
              </p>
            </div>

            {/* Blocked warning */}
            {isBlocked && (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-md p-3 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                Too many wrong attempts. Blocked for {blockedMins} more minute{blockedMins === 1 ? "" : "s"}.
              </div>
            )}

            {/* Attempts warning */}
            {!isBlocked && attemptsLeft !== null && attemptsLeft <= 2 && (
              <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-md p-3 text-yellow-400 text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} remaining before 5-minute block.
              </div>
            )}

            {/* OTP input */}
            <Input
              id="otp"
              placeholder="123456"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="bg-background border-border text-center text-2xl tracking-[0.5em] font-mono h-14"
              maxLength={6}
              disabled={isBlocked}
              autoComplete="one-time-code"
            />

            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-12"
              disabled={verifyLoading || otp.length !== 6 || isBlocked}
            >
              {verifyLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Verify & Create Account
            </Button>

            {/* Resend code */}
            <div className="flex items-center justify-between text-sm">
              <Button type="button" variant="link" onClick={() => setStep(1)} className="text-muted-foreground hover:text-primary p-0 h-auto">
                ← Back
              </Button>
              <Button
                type="button"
                variant="link"
                onClick={handleSendOtp}
                disabled={sendLoading || isBlocked}
                className="text-muted-foreground hover:text-primary p-0 h-auto"
              >
                {sendLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                Resend code
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
