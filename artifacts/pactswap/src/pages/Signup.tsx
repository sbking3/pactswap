import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Wallet, ArrowRight, ShieldCheck, AlertTriangle, RefreshCw } from "lucide-react";

async function apiPost(path: string, body: object) {
  const token = localStorage.getItem("pactswap_token");
  const res = await fetch(path, {
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

const RESEND_COOLDOWN = 60; // seconds

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

  // Resend cooldown
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

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

  // Core send logic — shared by first-send and resend
  const sendOtp = async () => {
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
        toast.info(`Dev mode — code pre-filled: ${data.devCode}`);
      } else {
        toast.success("Verification code sent! Check your inbox.");
      }
      setAttemptsLeft(3);
      setBlockedUntil(null);
      setOtp("");
      startCooldown();
      setStep(2);
    } catch (err: any) {
      toast.error(err?.data?.error ?? err.message ?? "Failed to send code.");
    } finally {
      setSendLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendOtp();
  };

  const handleResend = async () => {
    if (cooldown > 0 || sendLoading) return;
    setSendLoading(true);
    try {
      const data = await apiPost("/api/auth/send-signup-otp", { email, walletAddress, name });
      if (data?.devCode) {
        setDevCode(data.devCode);
        setOtp(data.devCode);
        toast.info(`Dev mode — new code pre-filled: ${data.devCode}`);
      } else {
        toast.success("New code sent! Check your inbox.");
      }
      setAttemptsLeft(3);
      setBlockedUntil(null);
      setOtp("");
      startCooldown();
    } catch (err: any) {
      toast.error(err?.data?.error ?? err.message ?? "Failed to resend code.");
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
        email, code: otp, walletAddress, name,
      });
      toast.success("Account created! Welcome to PACTSWAP.");
      login(data.token, data.user.walletAddress);
      setLocation("/dashboard");
    } catch (err: any) {
      const errData = err?.data;
      if (errData?.attemptsLeft !== undefined) {
        setAttemptsLeft(errData.attemptsLeft);
        if (errData.attemptsLeft === 0) {
          setBlockedUntil(new Date(Date.now() + 5 * 60 * 1000));
          toast.error("Too many wrong attempts. Blocked for 5 minutes.");
        } else {
          toast.error(`Wrong code — ${errData.attemptsLeft} attempt${errData.attemptsLeft === 1 ? "" : "s"} remaining.`);
        }
      } else if (errData?.blockedUntil) {
        const until = new Date(errData.blockedUntil);
        setBlockedUntil(until);
        const mins = Math.ceil((until.getTime() - Date.now()) / 60000);
        toast.error(`Blocked. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
      } else {
        toast.error(errData?.error ?? err.message ?? "Verification failed.");
      }
    } finally {
      setVerifyLoading(false);
    }
  };

  const isBlocked = !!blockedUntil && new Date() < blockedUntil;
  const blockedMins = blockedUntil ? Math.ceil((blockedUntil.getTime() - Date.now()) / 60000) : 0;

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card p-8 rounded-xl border border-border shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-muted-foreground text-sm">Join PACTSWAP to trade securely.</p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleFormSubmit} className="space-y-5">
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
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            {/* Header */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-3">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <p className="font-semibold text-white">Enter Verification Code</p>
              <p className="text-xs text-muted-foreground mt-1">
                {devCode
                  ? <>Dev mode — code: <span className="text-yellow-400 font-mono font-bold">{devCode}</span></>
                  : <>Sent to <span className="text-white font-medium">{email}</span></>
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
              placeholder="123456"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="bg-background border-border text-center text-2xl tracking-[0.5em] font-mono h-14"
              maxLength={6}
              disabled={isBlocked}
              autoComplete="one-time-code"
              inputMode="numeric"
            />

            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-12"
              disabled={verifyLoading || otp.length !== 6 || isBlocked}
            >
              {verifyLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Verify &amp; Create Account
            </Button>

            {/* Resend + Back row */}
            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setStep(1); setOtp(""); setDevCode(null); }}
                className="text-muted-foreground hover:text-white px-0"
              >
                ← Back
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResend}
                disabled={sendLoading || cooldown > 0 || isBlocked}
                className="gap-2 border-border hover:border-primary/50 hover:text-primary"
              >
                {sendLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />
                }
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
