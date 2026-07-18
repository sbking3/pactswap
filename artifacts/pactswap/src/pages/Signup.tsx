import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useSendEmailOtp, useVerifyEmailOtp } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Wallet, ArrowRight, ShieldCheck } from "lucide-react";

export default function Signup() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  
  const [step, setStep] = useState<1 | 2>(1);
  const [walletAddress, setWalletAddress] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  
  const sendOtpMutation = useSendEmailOtp();
  const verifyOtpMutation = useVerifyEmailOtp();

  const handleConnectWallet = async () => {
    try {
      if (!window.ethereum) {
        toast.error("MetaMask or Web3 wallet not detected. Please install a wallet extension.");
        return;
      }
      
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts[0]) {
        setWalletAddress(accounts[0]);
        toast.success("Wallet connected!");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to connect wallet.");
    }
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress || !email || !name) {
      toast.error("Please fill in all fields.");
      return;
    }
    
    sendOtpMutation.mutate({
      data: { email, walletAddress, name }
    }, {
      onSuccess: () => {
        toast.success("OTP sent to your email!");
        setStep(2);
      },
      onError: (error) => {
        toast.error(error.error || "Failed to send OTP.");
      }
    });
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP.");
      return;
    }

    verifyOtpMutation.mutate({
      data: { email, code: otp, walletAddress, name }
    }, {
      onSuccess: (data) => {
        toast.success("Account created successfully!");
        login(data.token, data.user.walletAddress);
        setLocation("/dashboard");
      },
      onError: (error) => {
        toast.error(error.error || "Invalid OTP.");
      }
    });
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card p-8 rounded-xl border border-border shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-muted-foreground text-sm">Join PACTSWAP to trade securely.</p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleSendOtp} className="space-y-6">
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
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-12 mt-4"
              disabled={sendOtpMutation.isPending || !walletAddress || !name || !email}
            >
              {sendOtpMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Continue <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div className="space-y-2 text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <Label>Enter Verification Code</Label>
              <p className="text-xs text-muted-foreground mt-1">We sent a 6-digit code to <span className="text-white font-medium">{email}</span></p>
            </div>

            <div className="space-y-2">
              <Input 
                id="otp" 
                placeholder="123456" 
                value={otp} 
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} 
                className="bg-background border-border text-center text-2xl tracking-[0.5em] font-mono h-14"
                maxLength={6}
              />
            </div>

            <Button 
              type="submit" 
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-12"
              disabled={verifyOtpMutation.isPending || otp.length !== 6}
            >
              {verifyOtpMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Verify & Create Account
            </Button>
            
            <div className="text-center mt-4">
              <Button type="button" variant="link" onClick={() => setStep(1)} className="text-sm text-muted-foreground hover:text-primary">
                Back
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}